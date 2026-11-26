import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { EnvHttpProxyAgent } from 'undici'
import {
  createWebSlackClient,
  mapSlackError,
  normalizeChannelInput,
  normalizeHistoryTimestamp,
  assertReactionName,
  extractFallbackMessageText,
  parseMessageEvent,
  startSocketModeClient,
  buildHealthTool,
  buildHistoryTool,
  buildReactTool,
} from '../lib/index.js'
import { createSocketModeProxyDispatcher, createTransportFetch } from '../lib/transport.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 零依赖解析简单缩进型 YAML（仅用于校验 slack-app-manifest.yaml）。 */
function parseSimpleYaml(source) {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*#.*$/, ''))
    .filter((line) => line.trim() !== '')

  function parseScalar(raw) {
    const trimmed = raw.trim()
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1)
    }
    return trimmed
  }

  let index = 0
  function parseBlock(minIndent) {
    let result = null
    while (index < lines.length) {
      const line = lines[index]
      const indent = line.length - line.trimStart().length
      if (indent < minIndent) break
      const trimmed = line.trim()

      if (trimmed.startsWith('- ')) {
        if (result === null) result = []
        assert.ok(Array.isArray(result), `unexpected list item at: ${line}`)
        result.push(parseScalar(trimmed.slice(2)))
        index += 1
        continue
      }

      const colonIdx = trimmed.indexOf(':')
      assert.ok(colonIdx > 0, `expected key: value at: ${line}`)
      if (result === null) result = {}
      assert.ok(!Array.isArray(result), `unexpected mapping key inside array at: ${line}`)
      const key = trimmed.slice(0, colonIdx).trim()
      const rest = trimmed.slice(colonIdx + 1).trim()
      index += 1
      if (rest !== '') {
        result[key] = parseScalar(rest)
      } else {
        const nextLine = lines[index]
        const nextIndent = nextLine ? nextLine.length - nextLine.trimStart().length : -1
        result[key] = nextIndent > indent ? parseBlock(nextIndent) : null
      }
    }
    return result
  }

  return parseBlock(0)
}

function startLocalServer(t, handler) {
  const server = createServer(handler)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      t.after(() => {
        server.closeAllConnections()
        return new Promise((done) => server.close(done))
      })
      resolve(`http://127.0.0.1:${server.address().port}/`)
    })
  })
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

test('slack-app-manifest.yaml 满足 Slack 官方规范、全部 9 工具权限与事件-权限一致性，且纳入 npm 发布清单', async () => {
  const [manifestRaw, pkgRaw] = await Promise.all([
    readFile(new URL('../slack-app-manifest.yaml', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ])
  const pkg = JSON.parse(pkgRaw)
  assert.ok(pkg.files.includes('slack-app-manifest.yaml'), 'package.json files 应包含 slack-app-manifest.yaml')
  assert.equal(pkg.exports['./slack-app-manifest.yaml'], './slack-app-manifest.yaml')

  const manifest = parseSimpleYaml(manifestRaw)
  assert.ok(manifest && typeof manifest === 'object')

  // Slack Manifest 字段长度与格式上限校验
  const display = manifest.display_information
  assert.ok(typeof display.name === 'string' && display.name.length >= 1 && display.name.length <= 35)
  assert.ok(typeof display.description === 'string' && display.description.length >= 1 && display.description.length <= 140)
  assert.match(display.background_color, /^#[0-9a-fA-F]{6}$/)

  // App Home：关闭空白 Home tab，开启可写 Messages tab（否则用户无法给机器人发私信）
  assert.equal(manifest.features.app_home.home_tab_enabled, false)
  assert.equal(manifest.features.app_home.messages_tab_enabled, true)
  assert.equal(manifest.features.app_home.messages_tab_read_only_enabled, false)
  assert.ok(typeof manifest.features.bot_user.display_name === 'string' && manifest.features.bot_user.display_name.length <= 35)
  assert.equal(manifest.features.bot_user.always_online, true)

  // Socket Mode 与基础设置
  assert.equal(manifest.settings.socket_mode_enabled, true)
  assert.equal(manifest.settings.org_deploy_enabled, false)
  assert.equal(manifest.settings.token_rotation_enabled, false)
  assert.equal(manifest.settings.interactivity.is_enabled, false)

  // Bot Scopes 无重复、覆盖全部工具且不包含 App-Level Token 专属 scope（connections:write）
  const scopes = manifest.oauth_config.scopes.bot
  const events = manifest.settings.event_subscriptions.bot_events
  assert.ok(Array.isArray(scopes) && scopes.length > 0)
  assert.ok(Array.isArray(events) && events.length > 0)
  assert.equal(new Set(scopes).size, scopes.length, 'Bot Scopes 不应重复')
  assert.equal(new Set(events).size, events.length, 'Bot Events 不应重复')
  assert.equal(scopes.includes('connections:write'), false, 'connections:write 是 App-Level Token 权限，不能放进 oauth_config.scopes.bot')

  // Slack 平台强制要求：每个订阅事件都必须有对应的 Bot Scope，否则导入 Manifest 会校验报错
  const requiredScopeByEvent = {
    app_mention: 'app_mentions:read',
    'message.channels': 'channels:history',
    'message.groups': 'groups:history',
    'message.im': 'im:history',
    'message.mpim': 'mpim:history',
  }
  for (const [eventName, scopeName] of Object.entries(requiredScopeByEvent)) {
    assert.ok(events.includes(eventName), `Manifest 应订阅事件 ${eventName}`)
    assert.ok(scopes.includes(scopeName), `订阅 ${eventName} 必须同时授予 ${scopeName}`)
  }

  for (const toolScope of ['chat:write', 'channels:read', 'groups:read', 'im:read', 'mpim:read', 'files:write', 'reactions:write', 'users:read']) {
    assert.ok(scopes.includes(toolScope), `Manifest 缺少工具所需权限 ${toolScope}`)
  }
})

test('真实 SocketModeClient 收到 app_rate_limited 无 event 控制包不崩溃且回复 ACK，收到 num_connections>1 告警并记录并发数', () => {
  const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', `
    import http from 'node:http'
    import { createHash } from 'node:crypto'
    import { startSocketModeClient } from './lib/socket.js'

    function wsTextFrame(text) {
      const payload = Buffer.from(text, 'utf8')
      if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload])
      const header = Buffer.alloc(4)
      header[0] = 0x81
      header[1] = 126
      header.writeUInt16BE(payload.length, 2)
      return Buffer.concat([header, payload])
    }

    const ackedEnvelopes = []
    const receivedMessages = []
    const warnings = []
    let wsSocket = null

    const server = http.createServer((req, res) => {
      req.resume()
      if (req.url === '/api/apps.connections.open') {
        const port = server.address().port
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, url: 'ws://127.0.0.1:' + port + '/ws' }))
        return
      }
      res.writeHead(404).end()
    })

    server.on('upgrade', (req, socket) => {
      wsSocket = socket
      let buf = Buffer.alloc(0)
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk])
        while (buf.length >= 2) {
          const opcode = buf[0] & 0x0f
          const masked = (buf[1] & 0x80) !== 0
          let len = buf[1] & 0x7f
          let offset = 2
          if (len === 126) {
            if (buf.length < 4) break
            len = buf.readUInt16BE(2)
            offset = 4
          } else if (len === 127) {
            if (buf.length < 10) break
            len = Number(buf.readBigUInt64BE(2))
            offset = 10
          }
          const maskLen = masked ? 4 : 0
          if (buf.length < offset + maskLen + len) break
          const payload = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + len))
          if (masked) {
            const mask = buf.subarray(offset, offset + 4)
            for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]
          }
          buf = buf.subarray(offset + maskLen + len)
          if (opcode === 0x01) {
            try {
              const parsed = JSON.parse(payload.toString('utf8'))
              if (parsed.envelope_id) ackedEnvelopes.push(parsed.envelope_id)
            } catch {}
          } else if (opcode === 0x08) {
            socket.end(Buffer.from([0x88, 0x02, 0x03, 0xe8]))
            return
          }
        }
      })

      const key = req.headers['sec-websocket-key']
      const accept = createHash('sha1').update(String(key) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
      socket.write(
        'HTTP/1.1 101 Switching Protocols\\r\\n'
        + 'Upgrade: websocket\\r\\n'
        + 'Connection: Upgrade\\r\\n'
        + 'Sec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n',
      )
      socket.write(wsTextFrame(JSON.stringify({
        type: 'hello',
        num_connections: 2,
        connection_info: { app_id: 'A01234567' },
      })))
    })

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    const dispose = startSocketModeClient(
      'xapp-1-A01234567-test',
      { onMessage(msg) { receivedMessages.push(msg) } },
      (msg) => warnings.push(msg),
      { slackApiUrl: 'http://127.0.0.1:' + port + '/api/' },
    )

    const waitUntil = async (fn, ms = 3000) => {
      const end = Date.now() + ms
      while (Date.now() < end) {
        if (fn()) return
        await new Promise((r) => setTimeout(r, 15))
      }
      throw new Error('timeout waiting')
    }

    await waitUntil(() => dispose.status().state === 'connected' && wsSocket !== null)
    const connectedStatus = dispose.status()

    // 1. 下发真实的 app_rate_limited 控制包（无 payload.event）
    wsSocket.write(wsTextFrame(JSON.stringify({
      type: 'events_api',
      envelope_id: 'env-rate-limit',
      payload: {
        type: 'app_rate_limited',
        team_id: 'T001',
        minute_rate_limited: 1700000000,
        api_app_id: 'A01234567',
      },
    })))

    // 2. 紧接着下发普通业务消息，确认连接仍健康工作
    wsSocket.write(wsTextFrame(JSON.stringify({
      type: 'events_api',
      envelope_id: 'env-real-msg',
      payload: {
        event: {
          type: 'message',
          channel: 'C01234567',
          user: 'U001',
          ts: '1700000001.000100',
          text: 'still alive after app_rate_limited',
        },
      },
    })))

    await waitUntil(() => ackedEnvelopes.includes('env-rate-limit') && ackedEnvelopes.includes('env-real-msg') && receivedMessages.length === 1)
    let socketClosed = false
    wsSocket.once('close', () => { socketClosed = true })
    dispose()
    await waitUntil(() => socketClosed, 1000).catch(() => {})
    wsSocket.destroy()
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
    console.log(JSON.stringify({ connectedStatus, ackedEnvelopes, receivedMessages, warnings }))
  `], {
    cwd: REPO_ROOT,
    env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(?:https?|all|no)_proxy$/i.test(k))),
    encoding: 'utf8',
    timeout: 8000,
  })

  assert.equal(child.status, 0, child.stderr)
  const out = JSON.parse(child.stdout.trim())
  assert.equal(out.connectedStatus.state, 'connected')
  assert.equal(out.connectedStatus.activeConnections, 2)
  assert.deepEqual(out.ackedEnvelopes, ['env-rate-limit', 'env-real-msg'])
  assert.equal(out.receivedMessages.length, 1)
  assert.equal(out.receivedMessages[0].text, 'still alive after app_rate_limited')
  assert.ok(out.warnings.some((w) => /2 个并发/.test(w)), out.warnings.join('\n'))
  assert.ok(out.warnings.some((w) => /app_rate_limited/.test(w)), out.warnings.join('\n'))
})

test('Socket Mode 默认 clientPingTimeout 为 15000ms，且新增企业/令牌永久认证错误立即停止重试', async () => {
  let capturedConfig = null
  const disposePing = startSocketModeClient('xapp-ping', { onMessage() {} }, () => {}, {
    createClient(config) {
      capturedConfig = config
      const emitter = new EventEmitter()
      emitter.start = () => new Promise(() => {})
      emitter.disconnect = async () => {}
      return emitter
    },
  })
  disposePing()
  assert.equal(capturedConfig.clientPingTimeout, 15000)

  for (const code of ['org_login_required', 'team_access_not_granted', 'cannot_find_service', 'invalid_token']) {
    const client = new EventEmitter()
    let attempts = 0
    client.start = async () => { attempts += 1; throw { data: { error: code } } }
    client.disconnect = async () => { client.emit('disconnected') }
    const dispose = startSocketModeClient('xapp-perm', { onMessage() {} }, () => {}, {
      retryBaseMs: 1,
      jitter: false,
      createClient: () => client,
    })
    try {
      await new Promise((r) => setTimeout(r, 10))
      assert.equal(dispose.status().state, 'auth_failed', code)
      assert.equal(dispose.status().error, code)
      assert.equal(attempts, 1, code)
    } finally {
      dispose()
    }
  }
})

test('createTransportFetch 剥离无参 POST 的空字符串 body（防止 HTTP/2 挂起），createSocketModeProxyDispatcher 匹配代理环境', async (t) => {
  const originalFetch = globalThis.fetch
  const capturedInits = []
  globalThis.fetch = async (_input, init) => {
    capturedInits.push(init)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const transportFetch = createTransportFetch(undefined, {})
  await transportFetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: '',
  })
  await transportFetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'channel=C1&text=hi',
  })

  assert.equal('body' in capturedInits[0], false, '空字符串 body 应被剥离')
  assert.equal(capturedInits[0].headers['Content-Type'], 'application/x-www-form-urlencoded')
  assert.equal(capturedInits[1].body, 'channel=C1&text=hi')

  assert.equal(createSocketModeProxyDispatcher({}), undefined)
  const smDispatcher = createSocketModeProxyDispatcher({ HTTPS_PROXY: 'http://127.0.0.1:8888' })
  assert.ok(smDispatcher instanceof EnvHttpProxyAgent)
  await smDispatcher.close()
})

test('Block-only 与 Attachment-only 消息在 slack_inbox 与 slack_history/slack_thread 中提取可读文本，且解析 bot 显示名', async (t) => {
  // 1. 纯函数覆盖各类 Block Kit 与 legacy attachments
  assert.equal(
    extractFallbackMessageText([
      { type: 'header', text: { type: 'plain_text', text: '发布告警' } },
      { type: 'section', text: { type: 'mrkdwn', text: '*服务*：`api-gateway`' }, fields: [{ type: 'mrkdwn', text: '状态：异常' }] },
      { type: 'context', elements: [{ type: 'plain_text', text: 'region=us-east-1' }] },
    ], undefined),
    '发布告警\n*服务*：`api-gateway`\n状态：异常\nregion=us-east-1',
  )

  assert.equal(
    extractFallbackMessageText([
      {
        type: 'rich_text',
        elements: [
          {
            type: 'rich_text_section',
            elements: [
              { type: 'user', user_id: 'U123' },
              { type: 'text', text: ' 请看 ' },
              { type: 'link', url: 'https://example.com/pr/1', text: 'PR #1' },
              { type: 'text', text: ' ' },
              { type: 'emoji', name: 'rocket' },
            ],
          },
          {
            type: 'rich_text_list',
            style: 'bullet',
            elements: [
              { type: 'rich_text_section', elements: [{ type: 'text', text: '修复超时' }] },
            ],
          },
        ],
      },
    ], undefined),
    '<@U123> 请看 PR #1 (https://example.com/pr/1) :rocket:\n- 修复超时',
  )

  assert.equal(
    extractFallbackMessageText([
      {
        type: 'table',
        rows: [
          [{ raw_text: 'Service' }, { raw_text: 'Status' }],
          [{ raw_text: 'API' }, { raw_text: 'OK' }],
        ],
      },
    ], undefined),
    'Service | Status\nAPI | OK',
  )

  assert.equal(
    extractFallbackMessageText(undefined, [
      { is_msg_unfurl: true, fallback: 'unfurl-ignored-when-primary-exists' },
      {
        pretext: 'Sentry Alert',
        title: 'TypeError in worker',
        text: 'Cannot read property id',
        fields: [{ title: 'Env', value: 'prod' }],
      },
    ]),
    'Sentry Alert\nTypeError in worker\nCannot read property id\nEnv: prod',
  )

  // 全部都是转发 unfurl 时仍兜底提取，不丢失转发消息内容
  assert.equal(
    extractFallbackMessageText(undefined, [
      { is_msg_unfurl: true, text: '被转发的真实消息正文' },
    ]),
    '被转发的真实消息正文',
  )

  // 循环引用的嵌套块受 MAX_TRAVERSE_DEPTH 保护，不会栈溢出
  const circularNode = { type: 'rich_text', elements: [] }
  circularNode.elements.push(circularNode)
  assert.equal(extractFallbackMessageText([circularNode], undefined), '')

  // 2. parseMessageEvent 不再静默丢弃 text="" 但 blocks/attachments 有内容的真实消息
  const blockOnlyEvent = parseMessageEvent({
    type: 'message',
    ts: '1700.1',
    channel: 'C01234567',
    user: 'U001',
    text: '',
    blocks: [{ type: 'markdown', text: '**构建完成**' }],
  })
  assert.deepEqual(blockOnlyEvent, {
    ts: '1700.1',
    channel: 'C01234567',
    user: 'U001',
    text: '**构建完成**',
  })

  const attachmentOnlyEvent = parseMessageEvent({
    type: 'message',
    ts: '1700.2',
    channel: 'C01234567',
    user: 'U001',
    text: '',
    attachments: [{ fallback: '转发的历史消息' }],
  })
  assert.equal(attachmentOnlyEvent.text, '转发的历史消息')

  // 既无正文也无 blocks/attachments/files 依然返回 null
  assert.equal(parseMessageEvent({ type: 'message', ts: '1700.3', channel: 'C01234567', user: 'U001', text: '   ', blocks: [] }), null)

  // 3. getHistory 提取 Block-only / Attachment-only 告警并读取 bot_profile.name / username，普通消息不重复拼接
  const apiUrl = await startLocalServer(t, async (req, res) => {
    if (req.url.includes('conversations.history')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        has_more: false,
        messages: [
          {
            ts: '1700.3',
            bot_id: 'B_GITHUB',
            bot_profile: { name: 'GitHub' },
            text: '',
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'PR #42 merged' } }],
          },
          {
            ts: '1700.2',
            bot_id: 'B_ALERT',
            username: 'PagerDuty',
            text: '',
            attachments: [{ title: 'Incident #99', text: 'CPU > 95%' }],
          },
          {
            ts: '1700.1',
            user: 'U1',
            text: '原始正文',
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '原始正文' } }],
          },
        ],
      }))
      return
    }
    if (req.url.includes('users.info')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'missing_scope', needed: 'users:read' }))
      return
    }
    res.writeHead(404).end('{}')
  })

  const client = createWebSlackClient('xoxb-test', apiUrl)
  const history = await client.getHistory({ channel: 'C01234567' })
  assert.equal(history.messages[0].userName, 'GitHub')
  assert.equal(history.messages[0].text, 'PR #42 merged')
  assert.equal(history.messages[1].userName, 'PagerDuty')
  assert.equal(history.messages[1].text, 'Incident #99\nCPU > 95%')
  assert.equal(history.messages[2].text, '原始正文')
})

test('normalizeChannelInput、Z 开头企业频道 ID、listChannels 兼容字段与 postMessage 私密频道按名回退解析', async (t) => {
  assert.equal(normalizeChannelInput('<#C01234567|general>'), 'C01234567')
  assert.equal(normalizeChannelInput('<#g01234567>'), 'G01234567')
  assert.equal(normalizeChannelInput('channel:z01234567'), 'Z01234567')
  assert.equal(normalizeChannelInput('  #ops-secret  '), '#ops-secret')

  const postCalls = []
  const listCalls = []
  const apiUrl = await startLocalServer(t, async (req, res) => {
    const body = (await readBody(req)).toString('utf8')
    const params = Object.fromEntries(new URLSearchParams(body))
    if (req.url.includes('users.conversations')) {
      listCalls.push(params)
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        channels: [
          { id: 'G01234567', name_normalized: 'ops-secret', is_group: true, is_member: true },
        ],
      }))
      return
    }
    if (req.url.includes('conversations.list')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, channels: [] }))
      return
    }
    if (req.url.includes('chat.postMessage')) {
      postCalls.push(params.channel)
      // 模拟真实 Slack：私密频道按 #name 直发返回 channel_not_found，按 G... ID 发送成功
      if (params.channel === '#ops-secret' || params.channel === '#missing-room') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'channel_not_found' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        ts: '1700.1',
        channel: params.channel,
      }))
      return
    }
    res.writeHead(404).end('{}')
  })

  const client = createWebSlackClient('xoxb-test', apiUrl)

  // 1. Z... 企业共享频道 ID 直接透传，零网络请求
  assert.equal(await client.resolveChannelId('Z01234567'), 'Z01234567')
  assert.equal(listCalls.length, 0)

  // 2. listChannels 兼容 legacy is_group + name_normalized
  const channels = await client.listChannels()
  assert.deepEqual(channels, [{ id: 'G01234567', name: 'ops-secret', is_private: true, is_member: true }])

  // 3. postMessage 接收 <#C...|name> 直接规整为 ID 发送（单次请求）
  const mentionSent = await client.postMessage({ channel: '<#C01234567|general>', text: 'hi' })
  assert.equal(mentionSent.channel, 'C01234567')
  assert.equal(postCalls.at(-1), 'C01234567')

  // 4. postMessage 对 #ops-secret 遇 channel_not_found 时自动解析 G01234567 并成功重发一次
  const privateSent = await client.postMessage({ channel: '#ops-secret', text: 'secret update' })
  assert.equal(privateSent.channel, 'G01234567')
  assert.deepEqual(postCalls.slice(-2), ['#ops-secret', 'G01234567'])

  // 5. 真正不存在的频道仍原样抛出 channel_not_found
  await assert.rejects(
    () => client.postMessage({ channel: '#missing-room', text: 'nope' }),
    (err) => err?.data?.error === 'channel_not_found',
  )
})

test('assertReactionName 与 slack_react 自动将常见 Unicode 表情（含肤色修饰符）转为 Slack 短码', async (t) => {
  assert.equal(assertReactionName('✅'), 'white_check_mark')
  assert.equal(assertReactionName('👍'), 'thumbsup')
  assert.equal(assertReactionName('👍🏽'), 'thumbsup::skin-tone-4')
  assert.equal(assertReactionName('❤️'), 'heart')
  assert.equal(assertReactionName('⚠️'), 'warning')
  assert.equal(assertReactionName(':👀:'), 'eyes')
  assert.equal(assertReactionName('🚀'), 'rocket')
  assert.equal(assertReactionName('👍🏻'), 'thumbsup::skin-tone-2')
  assert.equal(assertReactionName(':ThumbsUp:'), 'thumbsup')
  assert.equal(assertReactionName('White_Check_Mark'), 'white_check_mark')
  assert.equal(assertReactionName(':+1:'), '+1')
  assert.equal(assertReactionName('custom_emoji_name'), 'custom_emoji_name')
  assert.throws(() => assertReactionName('👍 extra'), /name 参数错误/)

  let sentName = null
  const apiUrl = await startLocalServer(t, async (req, res) => {
    const params = Object.fromEntries(new URLSearchParams((await readBody(req)).toString('utf8')))
    if (req.url.includes('reactions.add')) {
      sentName = params.name
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }))
      return
    }
    res.writeHead(404).end('{}')
  })

  const client = createWebSlackClient('xoxb-test', apiUrl)
  const tool = buildReactTool({
    clientProvider: () => client,
    configProvider: () => ({ token: 'xoxb-test', defaultChannel: '', appToken: '' }),
    inboxProvider: () => ({ drain: () => [], list: () => [], size: 0 }),
  })
  const result = await tool.execute({ channel: 'C01234567', timestamp: '1700.1', name: '✅' })
  assert.equal(sentName, 'white_check_mark')
  assert.equal(result.name, 'white_check_mark')
})

test('normalizeHistoryTimestamp 与 slack_history 支持 Slack ts 与 ISO-8601 时间边界，拒绝非法日期', async () => {
  assert.equal(normalizeHistoryTimestamp('1700000000.000100', 'oldest'), '1700000000.000100')
  assert.equal(normalizeHistoryTimestamp('2026-11-26T00:00:00Z', 'oldest'), '1795651200')
  assert.equal(normalizeHistoryTimestamp('2026-11-26T08:00:00+08:00', 'oldest'), '1795651200')
  assert.equal(normalizeHistoryTimestamp('2026-11-26', 'oldest'), '1795651200')
  assert.equal(normalizeHistoryTimestamp('2026-11-26T00:00:00.250Z', 'latest'), '1795651200.25')
  assert.equal(normalizeHistoryTimestamp('2024-02-29T00:00:00Z', 'oldest'), '1709164800')
  assert.equal(normalizeHistoryTimestamp('2026-11-26t00:00:00z', 'oldest'), '1795651200')
  assert.equal(normalizeHistoryTimestamp('2026-11-26 08:00+0800', 'oldest'), '1795651200')

  assert.throws(() => normalizeHistoryTimestamp('2026-02-30', 'oldest'), /日期.*无效/)
  assert.throws(() => normalizeHistoryTimestamp('2026-02-29T00:00:00Z', 'oldest'), /oldest 参数错误/)
  assert.throws(() => normalizeHistoryTimestamp('2026-11-26T24:00:00Z', 'oldest'), /oldest 参数错误/)
  assert.throws(() => normalizeHistoryTimestamp('1969-12-31T23:59:59Z', 'oldest'), /oldest 参数错误/)
  assert.throws(() => normalizeHistoryTimestamp('2026-11-26T00:00:00', 'oldest'), /oldest 参数错误/)
  assert.throws(() => normalizeHistoryTimestamp('yesterday', 'latest'), /latest 参数错误/)

  let captured = null
  const tool = buildHistoryTool({
    clientProvider: () => ({
      async getHistory(params) {
        captured = params
        return { channel: 'C01234567', messages: [], has_more: false }
      },
    }),
    configProvider: () => ({ token: 'xoxb-test', defaultChannel: '', appToken: '' }),
    inboxProvider: () => ({ drain: () => [], list: () => [], size: 0 }),
  })
  await tool.execute({ channel: 'C01234567', oldest: '2026-11-26T00:00:00Z', latest: '2026-11-26T08:00:00+08:00' })
  assert.equal(captured.oldest, '1795651200')
  assert.equal(captured.latest, '1795651200')
  await assert.rejects(() => tool.execute({ channel: 'C01234567', oldest: 'not-a-timestamp' }), /oldest 参数错误/)
})

test('mapSlackError 提取 response_metadata 诊断并覆盖线上错误码，slack_health 提示多连接分流', async () => {
  // missing_scope 回退 response_metadata.acceptedScopes 与 scopes
  const scopeFromMeta = mapSlackError({
    data: {
      error: 'missing_scope',
      response_metadata: {
        acceptedScopes: ['channels:history', 'groups:history'],
        scopes: ['chat:write', 'channels:read'],
      },
    },
  })
  assert.match(scopeFromMeta, /channels:history, groups:history/)
  assert.match(scopeFromMeta, /chat:write, channels:read/)

  // invalid_blocks 带出 response_metadata.messages 诊断
  const invalidBlocks = mapSlackError({
    data: {
      error: 'invalid_blocks',
      response_metadata: { messages: ['[ERROR] must be less than 12000 characters'] },
    },
  })
  assert.match(invalidBlocks, /must be less than 12000 characters/)

  assert.match(mapSlackError({ data: { error: 'messages_tab_disabled' } }), /Messages Tab/)
  assert.match(mapSlackError({ data: { error: 'channel_is_archived' } }), /归档/)
  assert.match(mapSlackError({ data: { error: 'org_login_required' } }), /组织|企业/)
  assert.match(mapSlackError({ data: { error: 'team_access_not_granted' } }), /授权/)
  assert.match(mapSlackError({ data: { error: 'invalid_ts_oldest' } }), /ISO-8601/)
  assert.match(mapSlackError({ data: { error: 'markdown_text_conflict' } }), /冲突/)
  assert.match(mapSlackError({ data: { error: 'restricted_action' } }), /策略限制/)
  assert.match(mapSlackError({ data: { error: 'too_many_reactions' } }), /上限/)

  // slack_health 展示并发 Socket Mode 连接提示且不误判为故障
  const health = buildHealthTool({
    configProvider: () => ({ token: 'xoxb-1', appToken: 'xapp-1', defaultChannel: '#general' }),
    clientProvider: () => { throw new Error('unused') },
    inboxProvider: () => ({ drain: () => [], list: () => [], size: 0 }),
    socketStatusProvider: () => ({ state: 'connected', attempts: 1, activeConnections: 2 }),
  })
  const value = await health.execute({})
  assert.equal(value.ok, true)
  const socketCheck = value.checks.find((c) => c.name === 'Socket Mode')
  assert.equal(socketCheck.ok, true)
  assert.match(String(socketCheck.detail), /2 个并发连接/)
})

test('回归修复：空 URLSearchParams 剥离、真实 CONNECT 代理承载 Socket Mode、disconnect(link_disabled) 告警与动态 hello 并发数更新', async () => {
  // 1. createTransportFetch 同样剥离空 URLSearchParams（Undici #5645 第二触发路径）
  const originalFetch = globalThis.fetch
  const capturedInits = []
  globalThis.fetch = async (_input, init) => {
    capturedInits.push(init)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const transportFetch = createTransportFetch(undefined, {})
    await transportFetch('https://slack.com/api/auth.test', { method: 'POST', body: new URLSearchParams() })
    await transportFetch('https://slack.com/api/chat.postMessage', { method: 'POST', body: new URLSearchParams({ channel: 'C1' }) })
    assert.equal('body' in capturedInits[0], false, '空 URLSearchParams body 应被剥离')
    assert.ok(capturedInits[1].body instanceof URLSearchParams)
  } finally {
    globalThis.fetch = originalFetch
  }

  // 2. 真实 SocketModeClient 经由 HTTP CONNECT 代理完成 apps.connections.open 与 WebSocket 握手，
  //    并验证 disconnect(link_disabled) 告警与连接中 hello 刷新 activeConnections
  const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', `
    import http from 'node:http'
    import net from 'node:net'
    import { createHash } from 'node:crypto'
    import { startSocketModeClient } from './lib/socket.js'

    function wsTextFrame(text) {
      const payload = Buffer.from(text, 'utf8')
      if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload])
      const header = Buffer.alloc(4)
      header[0] = 0x81
      header[1] = 126
      header.writeUInt16BE(payload.length, 2)
      return Buffer.concat([header, payload])
    }

    const connects = []
    const warnings = []
    let wsSocket = null

    const slackServer = http.createServer((req, res) => {
      req.resume()
      if (req.url === '/api/apps.connections.open') {
        const port = slackServer.address().port
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, url: 'ws://slack.invalid:' + port + '/ws' }))
        return
      }
      res.writeHead(404).end()
    })
    slackServer.on('upgrade', (req, socket) => {
      wsSocket = socket
      const key = req.headers['sec-websocket-key']
      const accept = createHash('sha1').update(String(key) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
      socket.write(
        'HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n',
      )
      socket.write(wsTextFrame(JSON.stringify({ type: 'hello', num_connections: 1 })))
    })

    const proxyServer = http.createServer((_req, res) => { res.writeHead(502).end() })
    proxyServer.on('connect', (req, clientSocket, head) => {
      connects.push(req.url)
      const upstream = net.connect(slackServer.address().port, '127.0.0.1', () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\\r\\n\\r\\n')
        if (head?.length) upstream.write(head)
        upstream.pipe(clientSocket)
        clientSocket.pipe(upstream)
      })
      upstream.on('error', () => clientSocket.destroy())
      clientSocket.on('error', () => upstream.destroy())
    })

    await new Promise((r) => slackServer.listen(0, '127.0.0.1', r))
    await new Promise((r) => proxyServer.listen(0, '127.0.0.1', r))
    const slackPort = slackServer.address().port
    const proxyPort = proxyServer.address().port

    for (const k of Object.keys(process.env)) {
      if (/proxy/i.test(k)) delete process.env[k]
    }
    process.env.HTTP_PROXY = 'http://127.0.0.1:' + proxyPort

    const dispose = startSocketModeClient(
      'xapp-1-proxy-test',
      { onMessage() {} },
      (msg) => warnings.push(msg),
      { slackApiUrl: 'http://slack.invalid:' + slackPort + '/api/', retryBaseMs: 5000, jitter: false },
    )

    const waitUntil = async (fn, ms = 3000) => {
      const end = Date.now() + ms
      while (Date.now() < end) {
        if (fn()) return
        await new Promise((r) => setTimeout(r, 15))
      }
      throw new Error('timeout')
    }

    await waitUntil(() => dispose.status().state === 'connected' && wsSocket !== null)
    // 模拟已连接后收到 num_connections 变化的 hello，随后收到 disconnect(link_disabled)
    wsSocket.write(wsTextFrame(JSON.stringify({ type: 'hello', num_connections: 3 })))
    await waitUntil(() => dispose.status().activeConnections === 3)
    const afterSecondHello = dispose.status()

    wsSocket.write(wsTextFrame(JSON.stringify({ type: 'disconnect', reason: 'link_disabled' })))
    await waitUntil(() => warnings.some((w) => w.includes('link_disabled')))
    dispose()
    console.log(JSON.stringify({ connects, afterSecondHello, warnings }))
    process.exit(0)
  `], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 8000,
  })

  assert.equal(child.status, 0, child.stderr)
  const out = JSON.parse(child.stdout.trim())
  assert.equal(out.connects.length, 2, 'HTTP apps.connections.open 与 WebSocket 握手均应通过代理 CONNECT 隧道')
  assert.equal(out.afterSecondHello.activeConnections, 3)
  assert.ok(out.warnings.some((w) => /link_disabled/.test(w)))
})

test('回归修复：extractFallbackMessageText 保留顶层 blocks 与主业务卡片 attachments、去重嵌套块并覆盖完整 Block Kit 结构', () => {
  // 1. 顶层 blocks + 非 unfurl 告警卡片（如 PagerDuty / Grafana 彩色侧栏）：两者皆保留，但忽略同行链接预览 unfurl
  assert.equal(
    extractFallbackMessageText(
      [{ type: 'header', text: { type: 'plain_text', text: 'Production Alert' } }],
      [
        { is_app_unfurl: true, title: 'Noisy link preview' },
        { color: '#d00000', title: 'API 5xx Spike', text: 'Error rate 12%' },
      ],
    ),
    'Production Alert\nAPI 5xx Spike\nError rate 12%',
  )

  // 2. attachment 同时含 text 与相同内容的 blocks 时不重复拼接
  assert.equal(
    extractFallbackMessageText(undefined, [
      {
        text: 'Deploy succeeded',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Deploy succeeded' } }],
      },
    ]),
    'Deploy succeeded',
  )

  // 3. rich_text_list 有序列表跳过空元素并尊重 offset、rich_text_quote 多行逐行前缀、date 无 fallback 回退 ISO、
  //    table raw_number 与 video / task_card / plan 块
  assert.equal(
    extractFallbackMessageText([
      {
        type: 'rich_text',
        elements: [
          {
            type: 'rich_text_list',
            style: 'ordered',
            offset: 2,
            elements: [
              { type: 'rich_text_section', elements: [{ type: 'text', text: '   ' }] },
              { type: 'rich_text_section', elements: [{ type: 'text', text: '第三项' }] },
              { type: 'rich_text_section', elements: [{ type: 'date', timestamp: 1795651200 }] },
            ],
          },
          {
            type: 'rich_text_quote',
            elements: [{ type: 'text', text: '第一行\n第二行' }],
          },
        ],
      },
      {
        type: 'table',
        rows: [[{ type: 'raw_text', text: 'Errors' }, { type: 'raw_number', value: 42 }]],
      },
      {
        type: 'video',
        title: { type: 'plain_text', text: 'Release Demo' },
        description: { type: 'plain_text', text: 'Walkthrough video' },
      },
      {
        type: 'plan',
        title: 'Rollout Plan',
        tasks: [
          { type: 'task_card', title: 'Run smoke tests', status: 'complete' },
        ],
      },
    ], undefined),
    '3. 第三项\n4. 2026-11-26T00:00:00.000Z\n> 第一行\n> 第二行\nErrors | 42\nRelease Demo\nWalkthrough video\nRollout Plan\nRun smoke tests',
  )
})

test('回归修复：微秒级 ISO-8601 时间戳精度保留、表情肤色与常见短码修复、双 user+bot_profile 昵称兜底、无 needed 的 groups:read 降级与 postMessage 规范频道回退', async (t) => {
  // 1. normalizeHistoryTimestamp 保留 Slack 6 位微秒精度并严格处理早期/边界年份
  assert.equal(normalizeHistoryTimestamp('2026-11-26T00:00:00.000100Z', 'oldest'), '1795651200.0001')
  assert.equal(normalizeHistoryTimestamp('2026-11-26T00:00:00.123456Z', 'oldest'), '1795651200.123456')
  assert.equal(normalizeHistoryTimestamp('2026-11-26T00:00:00.123456789Z', 'oldest'), '1795651200.123456')
  assert.equal(normalizeHistoryTimestamp('2026-11-26T00:00:00.000000Z', 'oldest'), '1795651200')
  assert.throws(() => normalizeHistoryTimestamp('1969-12-31T23:59:59.999999Z', 'oldest'), /oldest 参数错误/)
  assert.throws(() => normalizeHistoryTimestamp('0099-01-01', 'oldest'), /日期.*无效/)

  // 2. assertReactionName 修复无 ZWJ 👩💻、非肤色表情过滤非法肤色、重复肤色修饰符清洗与高频表情覆盖
  assert.equal(assertReactionName('👩💻'), 'female-technologist')
  assert.equal(assertReactionName('✅🏽'), 'white_check_mark')
  assert.equal(assertReactionName('👍🏻🏽'), 'thumbsup::skin-tone-2')
  assert.equal(assertReactionName('🙌'), 'raised_hands')
  assert.equal(assertReactionName('✨'), 'sparkles')
  assert.equal(assertReactionName('✔️'), 'heavy_check_mark')
  assert.equal(assertReactionName('☑️'), 'ballot_box_with_check')
  assert.equal(assertReactionName('👋🏽'), 'wave::skin-tone-4')
  assert.equal(assertReactionName('🤖'), 'robot_face')
  assert.equal(assertReactionName('🟢'), 'large_green_circle')
  assert.equal(assertReactionName('🔴'), 'red_circle')
  assert.equal(assertReactionName('🏆'), 'trophy')
  assert.equal(assertReactionName('🥳'), 'partying_face')

  // 3. enrichMessages 双 user + bot_profile、listChannels 无 needed 时降级 private_channel、
  //    postMessage 回退 G... ID 后响应省略 channel 仍返回规范 ID
  const apiUrl = await startLocalServer(t, async (req, res) => {
    const params = Object.fromEntries(new URLSearchParams((await readBody(req)).toString('utf8')))
    if (req.url.includes('users.conversations')) {
      if (params.types === 'private_channel') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
          ok: true,
          channels: [{ id: 'G01234567', name: 'ops-secret', is_private: true, is_member: true }],
        }))
        return
      }
      // 模拟无 needed 字段的 missing_scope（仅授予 groups:read）
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: false,
        error: 'missing_scope',
      }))
      return
    }
    if (req.url.includes('chat.postMessage')) {
      if (params.channel === '#ops-secret') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'channel_not_found' }))
        return
      }
      // 故意省略响应 channel 字段，验证返回已解析的 G01234567 而非 #ops-secret
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, ts: '1700.9' }))
      return
    }
    if (req.url.includes('conversations.history')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        has_more: false,
        messages: [
          {
            ts: '1700.5',
            user: 'U_APP_BOT',
            bot_id: 'B_GH',
            bot_profile: { name: 'GitHub' },
            text: '',
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Checks passed' } }],
          },
        ],
      }))
      return
    }
    if (req.url.includes('users.info')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'missing_scope', needed: 'users:read' }))
      return
    }
    res.writeHead(404).end('{}')
  })

  const client = createWebSlackClient('xoxb-test', apiUrl)
  const privateList = await client.listChannels()
  assert.deepEqual(privateList, [{ id: 'G01234567', name: 'ops-secret', is_private: true, is_member: true }])

  const posted = await client.postMessage({ channel: '#ops-secret', text: 'hello' })
  assert.deepEqual(posted, { ts: '1700.9', channel: 'G01234567' })

  const history = await client.getHistory({ channel: 'G01234567' })
  assert.equal(history.messages[0].user, 'U_APP_BOT')
  assert.equal(history.messages[0].userName, 'GitHub')
  assert.equal(history.messages[0].text, 'Checks passed')
})

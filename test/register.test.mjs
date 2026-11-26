import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import {
  apply,
  Config,
  buildHealthTool,
  buildHistoryTool,
  buildThreadTool,
  buildUploadTool,
  buildReactTool,
} from '../lib/index.js'

const ALL_TOOL_NAMES = [
  'slack_channels',
  'slack_health',
  'slack_history',
  'slack_inbox',
  'slack_notify',
  'slack_react',
  'slack_reply',
  'slack_thread',
  'slack_upload',
]

function mockContext() {
  const registered = []
  const warnings = []
  const disposers = []
  return {
    tools: { register: (def) => { registered.push(def); return () => {} } },
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d) },
    logger: { warn: (...args) => { warnings.push(args.join(' ')) } },
    registered,
    warnings,
    dispose() { for (const d of disposers) d() },
  }
}

function wsTextFrame(text) {
  const payload = Buffer.from(text, 'utf8')
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload])
  const header = Buffer.alloc(4)
  header[0] = 0x81
  header[1] = 126
  header.writeUInt16BE(payload.length, 2)
  return Buffer.concat([header, payload])
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((r) => setTimeout(r, 15))
  }
  throw new Error('waitFor timed out')
}

test('apply 注册全部九个工具', () => {
  const ctx = mockContext()
  apply(ctx, { token: 'xoxb-test', defaultChannel: '#general' })
  const names = ctx.registered.map((t) => t.name).sort()
  assert.deepEqual(names, ALL_TOOL_NAMES)
})

test('apply 在配置缺失时不抛错（懒加载），仍注册全部九个工具', () => {
  const ctx = mockContext()
  assert.doesNotThrow(() => apply(ctx, undefined))
  assert.equal(ctx.registered.length, 9)
})

test('全部九个工具的 parameters 都是已编译的 object JSON Schema 且导出新构建器', () => {
  const ctx = mockContext()
  apply(ctx, { token: 'xoxb-test', defaultChannel: '#general' })
  for (const tool of ctx.registered) {
    assert.equal(tool.parameters.type, 'object', tool.name)
    assert.equal(typeof tool.parameters.properties, 'object', tool.name)
    assert.ok(Array.isArray(tool.parameters.required) || tool.parameters.required === undefined, tool.name)
    assert.equal(tool.output.schema.type, 'object', tool.name)
  }

  const byName = new Map(ctx.registered.map((t) => [t.name, t]))
  assert.deepEqual(byName.get('slack_notify').parameters.required, ['text'])
  assert.deepEqual(byName.get('slack_channels').parameters.properties.scope.enum, ['joined', 'all'])
  assert.equal(byName.get('slack_health').parameters.properties.verify.type, 'boolean')
  assert.deepEqual(byName.get('slack_history').parameters.required, ['channel'])
  assert.deepEqual(byName.get('slack_thread').parameters.required, ['channel', 'thread_ts'])
  assert.deepEqual(byName.get('slack_upload').parameters.required, ['filename'])
  assert.deepEqual(byName.get('slack_react').parameters.required, ['channel', 'timestamp', 'name'])

  assert.equal(byName.get('slack_health').isConcurrencySafe(), true)
  assert.equal(byName.get('slack_channels').isConcurrencySafe(), true)
  assert.equal(byName.get('slack_history').isConcurrencySafe(), true)
  assert.equal(byName.get('slack_thread').isConcurrencySafe(), true)
  assert.equal(byName.get('slack_inbox').isConcurrencySafe({ markRead: false }), true)
  assert.equal(byName.get('slack_inbox').isConcurrencySafe({ markRead: true }), false)

  assert.doesNotMatch(byName.get('slack_notify').parameters.properties.channel.description, /当前默认：#general/)

  assert.equal(typeof buildHealthTool, 'function')
  assert.equal(typeof buildHistoryTool, 'function')
  assert.equal(typeof buildThreadTool, 'function')
  assert.equal(typeof buildUploadTool, 'function')
  assert.equal(typeof buildReactTool, 'function')
})

test('配置缺失时 execute 抛中文 token 错误', async () => {
  delete process.env.DSH_SLACK_TOKEN
  const ctx = mockContext()
  apply(ctx, undefined)
  const notify = ctx.registered.find((t) => t.name === 'slack_notify')
  await assert.rejects(() => notify.execute({ channel: '#general', text: 'hi' }), /token 未配置/)
})

test('全部九个工具对 undefined / null 参数均安全处理（不抛原始 TypeError）', async () => {
  const ctx = mockContext()
  apply(ctx, { token: 'xoxb-test', defaultChannel: '' })
  const byName = new Map(ctx.registered.map((t) => [t.name, t]))

  const healthVal = await byName.get('slack_health').execute(undefined)
  assert.equal(healthVal.ok, true)
  const inboxVal = await byName.get('slack_inbox').execute(null)
  assert.deepEqual(inboxVal, { messages: [], remaining: 0 })

  for (const name of ['slack_notify', 'slack_reply', 'slack_history', 'slack_thread', 'slack_upload', 'slack_react']) {
    for (const badArgs of [undefined, null]) {
      await assert.rejects(
        () => byName.get(name).execute(badArgs),
        (err) => {
          assert.ok(err instanceof Error, `${name} should reject with Error`)
          assert.equal(err instanceof TypeError, false, `${name} must not throw raw TypeError: ${err.message}`)
          assert.match(err.message, /参数错误/, `${name} error message: ${err.message}`)
          return true
        },
      )
    }
  }
})

test('apply 对错误 token 前缀（xapp-）与非法 slackApiUrl 输出清晰警告', () => {
  const ctx = mockContext()
  apply(ctx, { token: 'xapp-wrong-slot', slackApiUrl: 'not-a-url' })
  assert.ok(ctx.warnings.some((w) => /token 格式异常/.test(w) && /xapp-/.test(w)), ctx.warnings.join('\n'))
  assert.ok(ctx.warnings.some((w) => /slackApiUrl 格式无效/.test(w)), ctx.warnings.join('\n'))
})

test('apply 在非法/不支持协议的 HTTPS_PROXY 下不崩溃，完整注册 9 个工具且不泄露代理凭据', (t) => {
  const saved = {
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    https_proxy: process.env.https_proxy,
    HTTP_PROXY: process.env.HTTP_PROXY,
    http_proxy: process.env.http_proxy,
  }
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  for (const badProxy of ['127.0.0.1:7890', 'socks5h://alice:super-secret-pass@127.0.0.1:1080', 'ftp://127.0.0.1:21']) {
    delete process.env.https_proxy
    delete process.env.HTTP_PROXY
    delete process.env.http_proxy
    process.env.HTTPS_PROXY = badProxy
    const ctx = mockContext()
    try {
      assert.doesNotThrow(() => apply(ctx, { token: 'xoxb-test', defaultChannel: '#general' }), badProxy)
      assert.equal(ctx.registered.length, 9, badProxy)
      assert.ok(ctx.warnings.some((w) => /代理环境变量/.test(w)), `expected proxy warning for ${badProxy}`)
      assert.ok(ctx.warnings.every((w) => !w.includes('super-secret-pass')), 'proxy credentials must never be logged')
    } finally {
      ctx.dispose()
    }
  }
})

test('apply 在 slackApiUrl 非法时跳过 Socket Mode 启动且不向公共 slack.com 发起任何请求', async (t) => {
  const originalFetch = globalThis.fetch
  const fetchCalls = []
  globalThis.fetch = async (url, ...rest) => {
    fetchCalls.push(String(url))
    return originalFetch(url, ...rest)
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const ctx = mockContext()
  t.after(() => ctx.dispose())
  apply(ctx, {
    token: 'xoxb-enterprise-secret',
    appToken: 'xapp-enterprise-secret',
    slackApiUrl: 'htps://enterprise.slack.com/api/',
  })
  await new Promise((r) => setTimeout(r, 60))

  assert.equal(ctx.registered.length, 9)
  assert.equal(fetchCalls.length, 0, `unexpected network calls: ${fetchCalls.join(', ')}`)
  assert.ok(ctx.warnings.some((w) => /已跳过 Socket Mode 启动/.test(w)), ctx.warnings.join('\n'))

  const health = ctx.registered.find((tool) => tool.name === 'slack_health')
  const result = await health.execute({})
  assert.equal(result.ok, false)
  const socketCheck = result.checks.find((c) => c.name === 'Socket Mode')
  assert.ok(socketCheck)
  assert.equal(socketCheck.ok, false)
  assert.match(String(socketCheck.detail), /slackApiUrl 格式无效/)
})

test('resolvedBotUserId 在首次离线失败后随 Socket Mode 连接自动恢复，并在 volatile 热换 token 后刷新', async (t) => {
  let authAttempts = 0
  let wsSocket = null
  const openSockets = new Set()

  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const url = req.url ?? ''
      const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
      const port = server.address().port

      if (url.includes('/auth.test')) {
        authAttempts += 1
        if (authAttempts === 1) {
          // 模拟插件刚启动时的临时离线失败
          res.writeHead(503, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'service_unavailable' }))
          return
        }
        const userId = token === 'xoxb-second' ? 'UBOT2' : 'UBOT1'
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, user_id: userId, bot_id: 'B1', team: 'LocalTest', user: 'bot' }))
        return
      }

      if (url.includes('/apps.connections.open')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, url: `ws://127.0.0.1:${port}/ws` }))
        return
      }

      if (url.includes('/chat.postMessage')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, ts: '1700.9', channel: 'C001' }))
        return
      }

      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'unknown_method' }))
    })
  })

  server.on('upgrade', (req, socket) => {
    openSockets.add(socket)
    socket.on('close', () => openSockets.delete(socket))
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
        const total = offset + (masked ? 4 : 0) + len
        if (buf.length < total) break
        buf = buf.subarray(total)
        if (opcode === 0x08) {
          socket.end(Buffer.from([0x88, 0x02, 0x03, 0xe8]))
          return
        }
      }
    })
    const key = req.headers['sec-websocket-key']
    const accept = createHash('sha1').update(String(key) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n'
      + 'Upgrade: websocket\r\n'
      + 'Connection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    wsSocket = socket
    socket.write(wsTextFrame(JSON.stringify({
      type: 'hello',
      num_connections: 1,
      debug_info: { host: 'local-test' },
      connection_info: { app_id: 'A001' },
    })))
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  const apiUrl = `http://127.0.0.1:${server.address().port}/api/`
  const parsed = Config({
    token: 'xoxb-first',
    appToken: 'xapp-1-local-test',
    defaultChannel: '#general',
    slackApiUrl: apiUrl,
  })
  const ctx = mockContext()
  t.after(async () => {
    ctx.dispose()
    const deadline = Date.now() + 1000
    while (openSockets.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10))
    }
    for (const sock of openSockets) sock.destroy()
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  })
  apply(ctx, parsed)

  const byName = new Map(ctx.registered.map((tool) => [tool.name, tool]))
  const inbox = byName.get('slack_inbox')
  const notify = byName.get('slack_notify')
  const health = byName.get('slack_health')

  // 等待 Socket Mode 连接并触发 onConnected -> 第 2 次 auth.test 恢复 UBOT1
  await waitFor(async () => wsSocket !== null && authAttempts >= 2 && (await health.execute({})).socket?.state === 'connected')
  await new Promise((r) => setTimeout(r, 40))

  // 推送 UBOT1（应过滤）与 UHUMAN（应保留）
  wsSocket.write(wsTextFrame(JSON.stringify({
    envelope_id: 'env-1',
    type: 'events_api',
    accepts_response_payload: false,
    payload: { event: { type: 'message', channel: 'C001', user: 'UBOT1', ts: '1700.1', text: 'bot1 self' } },
  })))
  wsSocket.write(wsTextFrame(JSON.stringify({
    envelope_id: 'env-2',
    type: 'events_api',
    accepts_response_payload: false,
    payload: { event: { type: 'message', channel: 'C001', user: 'UHUMAN', ts: '1700.2', text: 'human hi' } },
  })))

  await waitFor(async () => (await inbox.execute({ markRead: false })).messages.length >= 1)
  const firstRead = await inbox.execute({ markRead: true })
  assert.deepEqual(firstRead.messages.map((m) => m.user), ['UHUMAN'])

  // 通过 volatile 热更新 token -> 触发新 auth.test 刷新为 UBOT2
  const writeSym = Symbol.for('cosmokit.volatile.write')
  parsed.token[writeSym]('xoxb-second')
  const beforeHotSwapAuth = authAttempts
  await notify.execute({ text: 'trigger client rebuild' })
  await waitFor(() => authAttempts > beforeHotSwapAuth)
  await new Promise((r) => setTimeout(r, 40))

  // 推送 UBOT2（现在是自身，应过滤）与 UBOT1（不再是自身，应保留）
  wsSocket.write(wsTextFrame(JSON.stringify({
    envelope_id: 'env-3',
    type: 'events_api',
    accepts_response_payload: false,
    payload: { event: { type: 'message', channel: 'C001', user: 'UBOT2', ts: '1700.3', text: 'bot2 self' } },
  })))
  wsSocket.write(wsTextFrame(JSON.stringify({
    envelope_id: 'env-4',
    type: 'events_api',
    accepts_response_payload: false,
    payload: { event: { type: 'message', channel: 'C001', user: 'UBOT1', ts: '1700.4', text: 'old bot msg' } },
  })))

  await waitFor(async () => (await inbox.execute({ markRead: false })).messages.length >= 1)
  const secondRead = await inbox.execute({ markRead: true })
  assert.deepEqual(secondRead.messages.map((m) => m.user), ['UBOT1'])
})

test('Cordis 4 ctx.effect 卸载时清理全部已注册工具', () => {
  const active = new Set()
  const effects = []
  apply({
    tools: { register: (def) => { active.add(def.name); return () => active.delete(def.name) } },
    effect: (fn) => { effects.push(fn()) },
    logger: { warn() {} },
  }, { token: 'xoxb-test', defaultChannel: '#general' })
  assert.equal(active.size, 9)
  for (const dispose of effects) dispose?.()
  assert.equal(active.size, 0)
})

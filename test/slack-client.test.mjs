import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { connect as connectSocket } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  WebAPIHTTPError,
  WebAPIPlatformError,
  WebAPIRateLimitedError,
  WebAPIRequestError,
} from '@slack/web-api'
import {
  createWebSlackClient,
  assertTimestamp,
  assertReactionName,
} from '../lib/slack-client.js'
import { buildNotifyTool, buildChannelsTool, mapSlackError, assertChannel, assertText } from '../lib/index.js'

const CFG = () => ({ token: 'xoxb-test', defaultChannel: '#general' })
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])

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

test('createWebSlackClient 校验非法 slackApiUrl 并直接抛出中文错误', () => {
  assert.throws(() => createWebSlackClient('xoxb-1', 'not-a-url'), /slackApiUrl/)
  assert.throws(() => createWebSlackClient('xoxb-1', 'ftp://slack.com/api/'), /http:\/\/ 或 https:\/\//)
  assert.doesNotThrow(() => createWebSlackClient('xoxb-1', 'https://slack.com/api/'))
  assert.doesNotThrow(() => createWebSlackClient('xoxb-1', ''))
  assert.doesNotThrow(() => createWebSlackClient('xoxb-1', undefined))
})

test('真实 WebClient 不自动重试限流或服务端失败，缺失回执不会假报成功', async (t) => {
  let requests = 0, status = 503, payload = { ok: false, error: 'fixture_failure' }
  const apiUrl = await startLocalServer(t, (_req, res) => {
    requests++
    res.writeHead(status, { 'content-type': 'application/json', 'retry-after': '0' })
    res.end(JSON.stringify(payload))
  })
  const client = createWebSlackClient('synthetic-token', apiUrl)
  for (const code of [503, 429]) {
    status = code
    const before = requests
    await assert.rejects(client.postMessage({ channel: 'C1', text: 'local fixture only' }))
    assert.equal(requests - before, 1)
  }
  status = 200
  payload = { ok: true }
  await assert.rejects(client.postMessage({ channel: 'C1', text: 'local fixture only' }), /无法确认提交结果/)
})

test('postMessage：<=12000 字符发送 markdown block + 代理对安全截断兜底 text，invalid_blocks 自动回退纯文本，>12000 退回纯文本，并返回规范 channel', async (t) => {
  const received = []
  let replyChannel = 'C01234567'
  let rejectBlocksOnce = false
  const apiUrl = await startLocalServer(t, async (req, res) => {
    const body = (await readBody(req)).toString('utf8')
    const params = Object.fromEntries(new URLSearchParams(body))
    received.push(params)
    if (rejectBlocksOnce && 'blocks' in params) {
      rejectBlocksOnce = false
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: false,
        error: 'invalid_blocks',
      }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      ok: true,
      ts: `1700.${received.length}`,
      ...(replyChannel ? { channel: replyChannel } : {}),
    }))
  })
  const client = createWebSlackClient('xoxb-test', apiUrl)

  // 1. 短消息（<=3000）：携带 markdown block 与原样 text，返回 Slack 规范频道 ID
  const shortRes = await client.postMessage({ channel: '#general', text: '**你好** Slack' })
  assert.deepEqual(shortRes, { ts: '1700.1', channel: 'C01234567' })
  assert.equal(received[0].text, '**你好** Slack')
  assert.deepEqual(JSON.parse(received[0].blocks), [{ type: 'markdown', text: '**你好** Slack' }])

  // 2. 中等长度且 emoji 跨 2998-2999 边界：fallback text 不劈裂 UTF-16 代理对且 <= 3000
  const emojiText = 'a'.repeat(2998) + '🚀' + 'b'.repeat(100)
  await client.postMessage({ channel: '#general', text: emojiText })
  assert.ok(received[1].text.length <= 3000)
  assert.equal(received[1].text.isWellFormed(), true)
  assert.ok(received[1].text.endsWith('…'))
  assert.deepEqual(JSON.parse(received[1].blocks), [{ type: 'markdown', text: emojiText }])

  // 3. Slack 返回 invalid_blocks 时自动回退纯文本重试一次并成功
  rejectBlocksOnce = true
  const fallbackRes = await client.postMessage({ channel: '#general', text: '| col1 | col2 |' })
  assert.equal(fallbackRes.channel, 'C01234567')
  assert.ok('blocks' in received[2])
  assert.equal('blocks' in received[3], false)
  assert.equal(received[3].text, '| col1 | col2 |')

  // 4. 超长消息（>12000）：不发送 blocks，直接发送纯 text 避免 msg_blocks_too_long
  replyChannel = ''
  const longText = 'L'.repeat(12500)
  const longRes = await client.postMessage({ channel: '#general', text: longText })
  assert.deepEqual(longRes, { ts: '1700.5', channel: '#general' })
  assert.equal('blocks' in received[4], false)
  assert.equal(received[4].text, longText)
})

test('channel pagination requests full pages and cannot silently return a truncated inventory', async (t) => {
  const requests = []
  const urls = []
  let mode = 'complete'
  const apiUrl = await startLocalServer(t, async (request, response) => {
    urls.push(request.url ?? '')
    const body = (await readBody(request)).toString('utf8')
    const params = Object.fromEntries(new URLSearchParams(body))
    requests.push(params)
    const cursor = params.cursor ?? ''
    const next = mode === 'complete' ? (cursor ? '' : 'next') : mode === 'repeat' ? 'cycle' : 'page-' + requests.length
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      ok: true,
      channels: [{ id: cursor || 'first', name: 'channel' }],
      response_metadata: { next_cursor: next },
    }))
  })
  const client = createWebSlackClient('synthetic', apiUrl)
  assert.equal((await client.listChannels()).length, 2)
  assert.match(urls[0], /users\.conversations/)
  assert.equal(requests[0].limit, '200')
  assert.equal(requests[0].exclude_archived, 'true')
  mode = 'repeat'
  requests.length = 0
  await assert.rejects(client.listChannels(), /分页|完整/)
  assert.equal(requests.length, 2)
  mode = 'limit'
  requests.length = 0
  await assert.rejects(client.listChannels(), /分页|完整/)
  assert.equal(requests.length, 20)
})

test('listChannels 支持 joined/all、扩展字段及 missing_scope 双向降级（仅 channels:read 与仅 groups:read）', async (t) => {
  const calls = []
  let botScopes = new Set(['channels:read'])
  const apiUrl = await startLocalServer(t, async (req, res) => {
    const body = (await readBody(req)).toString('utf8')
    const params = Object.fromEntries(new URLSearchParams(body))
    calls.push({ url: req.url, params })
    const requested = (params.types ?? '').split(',').filter(Boolean)
    const missing = []
    if (requested.includes('public_channel') && !botScopes.has('channels:read')) missing.push('channels:read')
    if (requested.includes('private_channel') && !botScopes.has('groups:read')) missing.push('groups:read')
    if (missing.length > 0) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: false,
        error: 'missing_scope',
        needed: missing.join(','),
        provided: [...botScopes].join(','),
      }))
      return
    }
    const channels = []
    if (requested.includes('public_channel')) {
      channels.push({ id: 'C01234567', name: 'general', is_private: false, is_member: true, num_members: 12 })
    }
    if (requested.includes('private_channel')) {
      channels.push({ id: 'G01234567', name: 'ops-secret', is_private: true, is_member: true, num_members: 3 })
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, channels }))
  })

  const client = createWebSlackClient('xoxb-test', apiUrl)

  // 1. 仅有 channels:read：自动降级为 public_channel（2 次请求）
  const publicOnly = await client.listChannels()
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /users\.conversations/)
  assert.equal(calls[0].params.types, 'public_channel,private_channel')
  assert.equal(calls[1].params.types, 'public_channel')
  assert.deepEqual(publicOnly, [
    { id: 'C01234567', name: 'general', is_private: false, is_member: true, num_members: 12 },
  ])

  // 2. 仅有 groups:read：自动降级为 private_channel（2 次请求，不浪费 public_channel 重试）
  botScopes = new Set(['groups:read'])
  calls.length = 0
  const privateOnly = await client.listChannels()
  assert.equal(calls.length, 2)
  assert.equal(calls[0].params.types, 'public_channel,private_channel')
  assert.equal(calls[1].params.types, 'private_channel')
  assert.deepEqual(privateOnly, [
    { id: 'G01234567', name: 'ops-secret', is_private: true, is_member: true, num_members: 3 },
  ])

  // 3. 两个权限都缺：直接抛出 missing_scope，不做无意义重试（仅 1 次请求）
  botScopes = new Set([])
  calls.length = 0
  await assert.rejects(() => client.listChannels(), /missing_scope/)
  assert.equal(calls.length, 1)

  // 4. 两个权限齐全 + scope: 'all'（conversations.list）
  botScopes = new Set(['channels:read', 'groups:read'])
  calls.length = 0
  const allList = await client.listChannels(undefined, { scope: 'all' })
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /conversations\.list/)
  assert.equal(allList.length, 2)
  assert.equal(allList[1].is_private, true)
  assert.equal(allList[1].num_members, 3)
})

test('authTest 返回身份与 x-oauth-scopes 权限清单', async (t) => {
  const apiUrl = await startLocalServer(t, async (_req, res) => {
    res.writeHead(200, {
      'content-type': 'application/json',
      'x-oauth-scopes': 'chat:write, channels:read, groups:read, ',
    }).end(JSON.stringify({
      ok: true,
      url: 'https://acme.slack.com/',
      team: 'Acme',
      user: 'dsh-bot',
      team_id: 'T01234567',
      user_id: 'U01234567',
      bot_id: 'B01234567',
    }))
  })
  const client = createWebSlackClient('xoxb-test', apiUrl)
  const info = await client.authTest()
  assert.deepEqual(info, {
    ok: true,
    url: 'https://acme.slack.com/',
    team: 'Acme',
    user: 'dsh-bot',
    team_id: 'T01234567',
    user_id: 'U01234567',
    bot_id: 'B01234567',
    scopes: ['chat:write', 'channels:read', 'groups:read'],
  })
})

test('resolveChannelId 规范 ID 直通（排除 W* 与全字母名）、按名解析 + TTL 缓存与未找到报错', async (t) => {
  const calls = []
  const apiUrl = await startLocalServer(t, async (req, res) => {
    calls.push(req.url)
    if (req.url.includes('users.conversations')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        channels: [{ id: 'C01234567', name: 'general' }],
      }))
      return
    }
    if (req.url.includes('conversations.list')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        channels: [
          { id: 'C01234567', name: 'general' },
          { id: 'C09876543', name: 'announcements' },
        ],
      }))
      return
    }
    res.writeHead(404).end('{}')
  })
  const client = createWebSlackClient('xoxb-test', apiUrl)

  // 1. 合法 Slack 频道 ID（C/G/D 开头、含数字、8+ 字符）直接返回，不发起任何请求
  assert.equal(await client.resolveChannelId('C01234567'), 'C01234567')
  assert.equal(await client.resolveChannelId('G0ABCDEF1'), 'G0ABCDEF1')
  assert.equal(await client.resolveChannelId('D01234567'), 'D01234567')
  assert.equal(calls.length, 0)

  // 2. P2：全字母名（GENERAL / WARNINGS）与企业用户 ID（W12345678）绝不误判为频道 ID 而跳过 API
  assert.equal(await client.resolveChannelId('GENERAL'), 'C01234567')
  assert.equal(calls.length, 1)
  await assert.rejects(() => client.resolveChannelId('WARNINGS'), /未找到频道/)
  await assert.rejects(() => client.resolveChannelId('W12345678'), /未找到频道/)

  // 3. #general / general 命中缓存不再请求
  const beforeCached = calls.length
  assert.equal(await client.resolveChannelId('#general'), 'C01234567')
  assert.equal(await client.resolveChannelId('general'), 'C01234567')
  assert.equal(calls.length, beforeCached)

  // 4. 未加入的公开频道回退 conversations.list 解析并缓存
  assert.equal(await client.resolveChannelId('#announcements'), 'C09876543')
  const afterAll = calls.length
  assert.equal(await client.resolveChannelId('#announcements'), 'C09876543')
  assert.equal(calls.length, afterAll)
})

test('getHistory / getThread / resolveUserName：频道解析、用户名 TTL 缓存与 missing_scope 静默降级', async (t) => {
  const userInfoCalls = []
  const historyParams = []
  const repliesParams = []
  let failUsersScope = false

  const apiUrl = await startLocalServer(t, async (req, res) => {
    const body = (await readBody(req)).toString('utf8')
    const params = Object.fromEntries(new URLSearchParams(body))
    if (req.url.includes('users.conversations')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        channels: [{ id: 'C01234567', name: 'general' }],
      }))
      return
    }
    if (req.url.includes('conversations.history')) {
      historyParams.push(params)
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        has_more: true,
        messages: [
          {
            ts: '1700.2',
            user: 'U100',
            text: '最新消息',
            thread_ts: '1700.1',
            reply_count: 2,
            files: [{ name: 'spec.pdf', mimetype: 'application/pdf', size: 1024 }],
          },
          { ts: '1700.1', user: 'U100', text: '首条消息' },
          { ts: '1700.0', bot_id: 'B1', text: '机器人播报' },
        ],
      }))
      return
    }
    if (req.url.includes('conversations.replies')) {
      repliesParams.push(params)
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        has_more: false,
        messages: [
          { ts: '1700.1', user: 'U100', text: '主楼' },
          { ts: '1700.2', user: 'U200', text: '回复', thread_ts: '1700.1' },
        ],
      }))
      return
    }
    if (req.url.includes('users.info')) {
      userInfoCalls.push(params.user)
      if (failUsersScope) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
          ok: false,
          error: 'missing_scope',
          needed: 'users:read',
        }))
        return
      }
      const directory = {
        U100: { profile: { display_name: 'Alice', real_name: 'Alice Wang' }, name: 'alice' },
        U200: { profile: { display_name: '', real_name: 'Bob Li' }, name: 'bob' },
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        user: directory[params.user] ?? { name: 'fallback-user' },
      }))
      return
    }
    res.writeHead(404).end('{}')
  })

  const client = createWebSlackClient('xoxb-test', apiUrl)
  const history = await client.getHistory({ channel: '#general', limit: 999, oldest: '1700.0', latest: '1700.9' })
  assert.equal(history.channel, 'C01234567')
  assert.equal(history.has_more, true)
  assert.equal(historyParams[0].limit, '100')
  assert.equal(historyParams[0].oldest, '1700.0')
  assert.equal(historyParams[0].latest, '1700.9')
  assert.equal(history.messages[0].userName, 'Alice')
  assert.equal(history.messages[0].reply_count, 2)
  assert.deepEqual(history.messages[0].files, [{ name: 'spec.pdf', mimetype: 'application/pdf', size: 1024 }])
  assert.equal(history.messages[1].userName, 'Alice')
  assert.equal(history.messages[2].bot_id, 'B1')
  assert.deepEqual(userInfoCalls, ['U100'])

  const thread = await client.getThread({ channel: 'C01234567', thread_ts: '1700.1', limit: 10 })
  assert.equal(repliesParams[0].ts, '1700.1')
  assert.equal(repliesParams[0].limit, '10')
  assert.equal(thread.messages[0].userName, 'Alice')
  assert.equal(thread.messages[1].userName, 'Bob Li')
  assert.deepEqual(userInfoCalls, ['U100', 'U200'])

  failUsersScope = true
  assert.equal(await client.resolveUserName('U300'), undefined)
  assert.equal(await client.resolveUserName('U400'), undefined)
  assert.deepEqual(userInfoCalls, ['U100', 'U200', 'U300'])
})

test('uploadFile 支持 content / file_path、规范频道解析、校验顺序与本地错误洁净映射', async (t) => {
  const uploadedPayloads = []
  let completePayload = null
  const apiUrl = await startLocalServer(t, async (req, res) => {
    const raw = await readBody(req)
    const body = raw.toString('utf8')
    if (req.url.includes('users.conversations')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        channels: [{ id: 'C01234567', name: 'general' }],
      }))
      return
    }
    if (req.url.includes('files.getUploadURLExternal')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        upload_url: `${apiUrl}upload-target`,
        file_id: 'F01234567',
      }))
      return
    }
    if (req.url.includes('upload-target')) {
      uploadedPayloads.push(raw)
      res.writeHead(200, { 'content-type': 'text/plain' }).end('OK')
      return
    }
    if (req.url.includes('files.completeUploadExternal')) {
      completePayload = Object.fromEntries(new URLSearchParams(body))
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        files: [{ id: 'F01234567', name: 'report.md', permalink: 'https://acme.slack.com/files/F01234567' }],
      }))
      return
    }
    res.writeHead(404).end('{}')
  })

  const client = createWebSlackClient('xoxb-test', apiUrl)

  // 1. content 上传（保留 initial_comment 原始缩进，允许空白 file_path）
  const res1 = await client.uploadFile({
    channel: '#general',
    filename: 'report.md',
    content: '# Hello Report',
    file_path: '   ',
    title: '日报',
    initial_comment: '  - 请查收',
    thread_ts: '1700.1',
  })
  assert.deepEqual(res1, {
    ok: true,
    channel: 'C01234567',
    filename: 'report.md',
    file_id: 'F01234567',
    permalink: 'https://acme.slack.com/files/F01234567',
  })
  assert.equal(completePayload.channel_id, 'C01234567')
  assert.equal(completePayload.thread_ts, '1700.1')
  assert.equal(completePayload.initial_comment, '  - 请查收')
  assert.ok(uploadedPayloads[0].toString('utf8').includes('# Hello Report'))

  // 2. file_path 上传本地文件（同时允许 content: '' 不报冲突）
  const dir = await mkdtemp(join(tmpdir(), 'dsh-slack-upload-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const localFile = join(dir, 'notes.txt')
  await writeFile(localFile, 'local file body', 'utf8')
  const res2 = await client.uploadFile({ channel: 'C01234567', filename: 'notes.txt', content: '', file_path: localFile })
  assert.equal(res2.ok, true)
  assert.equal(res2.file_id, 'F01234567')
  assert.ok(uploadedPayloads[1].toString('utf8').includes('local file body'))

  // 3. 参数校验先于读盘：非法 channel / 非法 thread_ts / 非字符串 file_path 直接报错（不先报文件不存在）
  await assert.rejects(() => client.uploadFile({ channel: '', filename: 'a.txt', file_path: join(dir, 'missing.txt') }), /channel 参数错误/)
  await assert.rejects(() => client.uploadFile({ channel: 'C01234567', filename: 'a.txt', thread_ts: 12345, file_path: join(dir, 'missing.txt') }), /thread_ts 参数错误/)
  await assert.rejects(() => client.uploadFile({ channel: 'C01234567', filename: 'a.txt', file_path: 42 }), /file_path 参数错误/)
  await assert.rejects(() => client.uploadFile({ channel: 'C01234567', filename: 'a.txt' }), /content.*file_path/)
  await assert.rejects(() => client.uploadFile({ channel: 'C01234567', filename: 'a.txt', content: 'x', file_path: localFile }), /不能同时提供/)
  await assert.rejects(() => client.uploadFile({ channel: 'C01234567', filename: 'a.txt', content: '' }), /0 字节/)
  await assert.rejects(() => client.uploadFile({ channel: 'C01234567', filename: 'a.txt', file_path: dir }), /目录/)

  // 4. 本地文件错误经 mapSlackError 不加 "Slack API 调用失败：" 前缀
  try {
    await client.uploadFile({ channel: 'C01234567', filename: 'a.txt', file_path: join(dir, 'missing.txt') })
    assert.fail('应抛错')
  } catch (err) {
    const mapped = mapSlackError(err)
    assert.match(mapped, /^文件不存在：/)
    assert.doesNotMatch(mapped, /Slack API 调用失败/)
  }
})

test('uploadFile 在 HTTP_PROXY 与 HTTP_PROXY+NO_PROXY="*" 下上传二进制 PNG 保持精确字节与 multipart/form-data', async (t) => {
  const capturedUploads = []
  const trackedSockets = new Set()
  const dir = await mkdtemp(join(tmpdir(), 'dsh-slack-png-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const pngPath = join(dir, 'chart.png')
  await writeFile(pngPath, PNG_BYTES)

  let apiBaseForUpload = ''
  const targetServer = createServer(async (req, res) => {
    const raw = await readBody(req)
    if (req.url?.includes('files.getUploadURLExternal')) {
      res.writeHead(200, { 'content-type': 'application/json', connection: 'close' }).end(JSON.stringify({
        ok: true,
        upload_url: `${apiBaseForUpload}upload-bin`,
        file_id: 'F999',
      }))
      return
    }
    if (req.url?.includes('upload-bin')) {
      capturedUploads.push({
        contentType: String(req.headers['content-type'] ?? ''),
        raw,
      })
      res.writeHead(200, { 'content-type': 'text/plain', connection: 'close' }).end('OK')
      return
    }
    if (req.url?.includes('files.completeUploadExternal')) {
      res.writeHead(200, { 'content-type': 'application/json', connection: 'close' }).end(JSON.stringify({
        ok: true,
        files: [{ id: 'F999', name: 'chart.png', permalink: 'https://acme.slack.com/files/F999' }],
      }))
      return
    }
    res.writeHead(404, { connection: 'close' }).end('{}')
  })
  await new Promise((resolve) => targetServer.listen(0, '127.0.0.1', resolve))
  const targetPort = targetServer.address().port

  const proxyServer = createServer((req, res) => {
    res.writeHead(502, { connection: 'close' }).end('unexpected plain http proxy')
  })
  proxyServer.on('connect', (_req, clientSocket, head) => {
    trackedSockets.add(clientSocket)
    const upstream = connectSocket(targetPort, '127.0.0.1', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head && head.length > 0) upstream.write(head)
      upstream.pipe(clientSocket)
      clientSocket.pipe(upstream)
    })
    trackedSockets.add(upstream)
    const cleanup = () => {
      trackedSockets.delete(clientSocket)
      trackedSockets.delete(upstream)
      clientSocket.destroy()
      upstream.destroy()
    }
    clientSocket.on('error', cleanup)
    clientSocket.on('close', cleanup)
    upstream.on('error', cleanup)
    upstream.on('close', cleanup)
  })
  await new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', resolve))

  const savedEnv = {
    HTTP_PROXY: process.env.HTTP_PROXY,
    http_proxy: process.env.http_proxy,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    https_proxy: process.env.https_proxy,
    NO_PROXY: process.env.NO_PROXY,
    no_proxy: process.env.no_proxy,
  }
  t.after(async () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    for (const s of trackedSockets) s.destroy()
    trackedSockets.clear()
    proxyServer.closeAllConnections()
    targetServer.closeAllConnections()
    await Promise.all([
      new Promise((resolve) => proxyServer.close(resolve)),
      new Promise((resolve) => targetServer.close(resolve)),
    ])
  })

  const proxyUrl = `http://127.0.0.1:${proxyServer.address().port}`
  delete process.env.http_proxy
  delete process.env.HTTPS_PROXY
  delete process.env.https_proxy
  delete process.env.no_proxy

  // 1. 走 HTTP_PROXY 隧道上传二进制 PNG
  process.env.HTTP_PROXY = proxyUrl
  delete process.env.NO_PROXY
  apiBaseForUpload = 'http://slack.invalid/api/'
  const clientProxied = createWebSlackClient('xoxb-test', apiBaseForUpload)
  const r1 = await clientProxied.uploadFile({ channel: 'C01234567', filename: 'chart.png', file_path: pngPath })
  assert.equal(r1.ok, true)

  // 2. HTTP_PROXY + NO_PROXY="*" 走直连上传二进制 PNG
  process.env.HTTP_PROXY = proxyUrl
  process.env.NO_PROXY = '*'
  apiBaseForUpload = `http://127.0.0.1:${targetPort}/api/`
  const clientNoProxy = createWebSlackClient('xoxb-test', apiBaseForUpload)
  const r2 = await clientNoProxy.uploadFile({ channel: 'C01234567', filename: 'chart.png', file_path: pngPath })
  assert.equal(r2.ok, true)

  assert.equal(capturedUploads.length, 2)
  for (const upload of capturedUploads) {
    assert.match(upload.contentType, /^multipart\/form-data;\s*boundary=/i)
    assert.equal(upload.raw.includes(Buffer.from('[object FormData]')), false)
    assert.equal(upload.raw.includes(PNG_BYTES), true)
  }
})

test('addReaction 自动去除冒号、解析频道 ID 并返回规范 channel', async (t) => {
  let captured = null
  const apiUrl = await startLocalServer(t, async (req, res) => {
    const body = (await readBody(req)).toString('utf8')
    if (req.url.includes('users.conversations')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        ok: true,
        channels: [{ id: 'C01234567', name: 'general' }],
      }))
      return
    }
    if (req.url.includes('reactions.add')) {
      captured = Object.fromEntries(new URLSearchParams(body))
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }))
      return
    }
    res.writeHead(404).end('{}')
  })
  const client = createWebSlackClient('xoxb-test', apiUrl)
  const result = await client.addReaction({ channel: '#general', timestamp: '1700.123', name: ':thumbsup:' })
  assert.deepEqual(result, { ok: true, channel: 'C01234567' })
  assert.deepEqual(captured, { channel: 'C01234567', timestamp: '1700.123', name: 'thumbsup' })
})

test('mapSlackError 完整映射 SDK 错误类与平台错误码为中文，且不将代理错误归咎于 slackApiUrl', () => {
  // 限流（WebAPIRateLimitedError）
  const rateLimited = mapSlackError(new WebAPIRateLimitedError(15))
  assert.match(rateLimited, /15 秒/)
  assert.match(rateLimited, /限流/)

  // HTTP 错误（503 / 429 / 404）
  const http503 = mapSlackError(new WebAPIHTTPError(503, 'Service Unavailable', {}))
  assert.match(http503, /503/)
  assert.match(http503, /服务暂时不可用/)
  const http429 = mapSlackError(new WebAPIHTTPError(429, 'Too Many Requests', {}))
  assert.match(http429, /429/)
  assert.match(http429, /Retry-After/)
  const http404 = mapSlackError(new WebAPIHTTPError(404, 'Not Found', {}))
  assert.match(http404, /404/)

  // 请求错误（超时 / 代理异常 / 非法 URL / 网络连接失败）
  const timeoutOrig = new Error('The operation was aborted due to timeout')
  timeoutOrig.name = 'TimeoutError'
  const reqTimeout = mapSlackError(new WebAPIRequestError(timeoutOrig))
  assert.match(reqTimeout, /超时/)
  assert.match(reqTimeout, /先检查目标频道/)
  assert.match(reqTimeout, /避免重复/)

  // 代理 URL/协议错误不得误报为 slackApiUrl
  const proxyArgOrig = Object.assign(new TypeError('Invalid ProxyAgent URL'), { code: 'UND_ERR_INVALID_ARG' })
  const reqProxy = mapSlackError(new WebAPIRequestError(proxyArgOrig))
  assert.match(reqProxy, /代理/)
  assert.match(reqProxy, /HTTP_PROXY/)
  assert.doesNotMatch(reqProxy, /slackApiUrl/)

  const invalidUrlOrig = Object.assign(new TypeError('Invalid URL'), { code: 'ERR_INVALID_URL' })
  assert.match(mapSlackError(new WebAPIRequestError(invalidUrlOrig)), /slackApiUrl/)

  const netOrig = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' } })
  const reqNet = mapSlackError(new WebAPIRequestError(netOrig))
  assert.match(reqNet, /网络请求失败/)
  assert.match(reqNet, /ECONNREFUSED/)

  // missing_scope 提取 needed 与 provided
  const missingScope = mapSlackError(new WebAPIPlatformError({
    ok: false,
    error: 'missing_scope',
    needed: 'channels:history',
    provided: 'chat:write,channels:read',
  }))
  assert.match(missingScope, /channels:history/)
  assert.match(missingScope, /chat:write,channels:read/)

  // 令牌失效错误与 scope 权限错误分离
  for (const code of ['token_revoked', 'account_inactive', 'not_authed', 'token_expired']) {
    const msg = mapSlackError({ data: { error: code } })
    assert.match(msg, new RegExp(code))
    assert.match(msg, /重新/)
    assert.doesNotMatch(msg, /勾选 chat:write/)
  }

  // 新增平台错误码
  assert.match(mapSlackError({ data: { error: 'not_allowed_token_type' } }), /令牌类型不匹配/)
  assert.match(mapSlackError({ data: { error: 'already_reacted' } }), /已添加过该表情/)
  assert.match(mapSlackError({ data: { error: 'no_reaction' } }), /表情回应不存在/)
  assert.match(mapSlackError({ data: { error: 'message_not_found' } }), /消息未找到/)
  assert.match(mapSlackError({ data: { error: 'thread_not_found' } }), /线程未找到/)
  assert.match(mapSlackError({ data: { error: 'msg_blocks_too_long' } }), /12,000/)
  assert.match(mapSlackError({ data: { error: 'invalid_blocks' } }), /块格式无效/)
  assert.match(mapSlackError({ data: { error: 'file_uploads_disabled' } }), /禁用文件上传/)
})

test('buildNotifyTool 用注入 client 调 postMessage，参数正确', async () => {
  let captured = null
  const fake = {
    async postMessage(params) { captured = params; return { ts: '1234.5678', channel: params.channel } },
    async listChannels() { return [] },
  }
  const tool = buildNotifyTool({ clientProvider: () => fake, configProvider: CFG })
  const result = await tool.execute({ channel: '#general', text: '你好', thread_ts: '1234.0000' })
  assert.equal(captured.channel, '#general')
  assert.equal(captured.text, '你好')
  assert.equal(captured.thread_ts, '1234.0000')
  assert.deepEqual(result, { ts: '1234.5678', channel: '#general' })
})

test('不传 thread_ts 时 postMessage 不含该字段', async () => {
  let captured = null
  const fake = { async postMessage(p) { captured = p; return { ts: 't', channel: p.channel } }, async listChannels() { return [] } }
  const tool = buildNotifyTool({ clientProvider: () => fake, configProvider: CFG })
  await tool.execute({ channel: '#general', text: 'x' })
  assert.equal('thread_ts' in captured, false)
})

test('mapSlackError 映射 invalid_auth / channel_not_found 为中文', () => {
  const invalidAuth = mapSlackError({ data: { error: 'invalid_auth' } })
  assert.match(invalidAuth, /token/)
  assert.match(invalidAuth, /设置 → 插件 → Slack/)
  assert.match(mapSlackError({ data: { error: 'channel_not_found' } }), /频道/)
})

test('slack_notify 省略或留空 channel 时按执行期最新 defaultChannel 回退，均为空时报错', async () => {
  const sent = []
  let currentChannel = ''
  const fake = {
    async postMessage(params) { sent.push(params); return { ts: '1.0', channel: params.channel } },
    async listChannels() { return [] },
  }
  const tool = buildNotifyTool({
    clientProvider: () => fake,
    configProvider: () => ({ token: 'xoxb-test', defaultChannel: currentChannel, appToken: '' }),
  })
  await assert.rejects(() => tool.execute({ text: 'no-ch' }), /defaultChannel/)
  await assert.rejects(() => tool.execute({ channel: '   ', text: 'blank-ch' }), /defaultChannel/)

  currentChannel = '#ops-live'
  assert.deepEqual(await tool.execute({ text: 'omitted' }), { ts: '1.0', channel: '#ops-live' })
  assert.deepEqual(await tool.execute({ channel: '', text: 'empty' }), { ts: '1.0', channel: '#ops-live' })

  currentChannel = 'C999'
  assert.deepEqual(await tool.execute({ text: 'hot-reloaded' }), { ts: '1.0', channel: 'C999' })

  assert.deepEqual(await tool.execute({ channel: '#explicit', text: 'override' }), { ts: '1.0', channel: '#explicit' })
  assert.deepEqual(sent.map((s) => s.channel), ['#ops-live', '#ops-live', 'C999', '#explicit'])
})

test('client 抛 invalid_auth 时 execute 抛中文 token 提示', async () => {
  const fake = { async postMessage() { throw { data: { error: 'invalid_auth' } } }, async listChannels() { return [] } }
  const tool = buildNotifyTool({ clientProvider: () => fake, configProvider: CFG })
  await assert.rejects(() => tool.execute({ channel: '#general', text: 'x' }), /token/)
})

test('client 抛 channel_not_found 时 execute 抛中文频道提示', async () => {
  const fake = { async postMessage() { throw { data: { error: 'channel_not_found' } } }, async listChannels() { return [] } }
  const tool = buildNotifyTool({ clientProvider: () => fake, configProvider: CFG })
  await assert.rejects(() => tool.execute({ channel: '#general', text: 'x' }), /频道/)
})

test('assertChannel / assertText / assertTimestamp / assertReactionName 校验非法参数并规整', () => {
  assert.throws(() => assertChannel(''), /channel/)
  assert.throws(() => assertChannel(undefined), /channel/)
  assert.throws(() => assertText(''), /text/)
  assert.equal(assertChannel('  #general  '), '#general')
  assert.equal(assertText('  hi  '), '  hi  ')

  assert.equal(assertTimestamp(' 1700.123 '), '1700.123')
  assert.throws(() => assertTimestamp(1700.123), /timestamp/)
  assert.throws(() => assertTimestamp('   '), /timestamp/)

  assert.equal(assertReactionName(':thumbsup:'), 'thumbsup')
  assert.equal(assertReactionName('  white_check_mark  '), 'white_check_mark')
  assert.throws(() => assertReactionName(':::'), /name/)
  assert.throws(() => assertReactionName('bad name'), /name/)
})

test('buildChannelsTool 返回可见频道列表', async () => {
  const fake = {
    async postMessage() { throw new Error('unused') },
    async listChannels() { return [{ id: 'C1', name: 'general' }, { id: 'C2', name: 'random' }] },
  }
  const tool = buildChannelsTool({ clientProvider: () => fake, configProvider: CFG })
  const value = await tool.execute()
  assert.deepEqual(value, { channels: [{ id: 'C1', name: 'general' }, { id: 'C2', name: 'random' }] })
})

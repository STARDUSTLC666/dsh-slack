import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { connect as connectSocket } from 'node:net'
import { EnvHttpProxyAgent } from 'undici'
import { apply, Config, liveConfig, parseConfig, resolveToken, resolveAppToken, resolveDefaultChannel, requireToken } from '../lib/index.js'
import { isValidSlackApiUrl, validateTokenFormat } from '../lib/config.js'
import { createSilentSlackLogger, hasProxyEnv, inspectProxyEnv, createProxyDispatcher, createTransportFetch } from '../lib/transport.js'

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0xfe, 0xff])

function createConnectProxyFixture(t, targetHandler) {
  const proxiedTargets = []
  const trackedSockets = new Set()
  const targetServer = createServer(targetHandler)
  const proxyServer = createServer((req, res) => {
    proxiedTargets.push(req.url ?? '')
    targetHandler(req, res)
  })
  return (async () => {
    await new Promise((resolve) => targetServer.listen(0, '127.0.0.1', resolve))
    const targetPort = targetServer.address().port
    proxyServer.on('connect', (req, clientSocket, head) => {
      proxiedTargets.push(req.url ?? '')
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
    t.after(async () => {
      for (const sock of trackedSockets) sock.destroy()
      trackedSockets.clear()
      proxyServer.closeAllConnections()
      targetServer.closeAllConnections()
      await Promise.all([
        new Promise((resolve) => proxyServer.close(resolve)),
        new Promise((resolve) => targetServer.close(resolve)),
      ])
    })
    return {
      targetUrl: `http://127.0.0.1:${targetPort}`,
      proxyUrl: `http://127.0.0.1:${proxyServer.address().port}`,
      proxiedTargets,
    }
  })()
}

test('parseConfig 处理缺失/空配置（不抛错）', () => {
  const empty = { token: '', defaultChannel: '', appToken: '', botUserId: '', triggerTaskId: '' }
  assert.deepEqual(parseConfig(undefined), empty)
  assert.deepEqual(parseConfig(null), empty)
  assert.deepEqual(parseConfig({}), empty)
})

test('parseConfig 非法形状返回 undefined', () => {
  assert.equal(parseConfig('not-an-object'), undefined)
  assert.equal(parseConfig([1, 2]), undefined)
  assert.equal(parseConfig(42), undefined)
})

test('resolveToken：config.token 优先，其次环境变量 DSH_SLACK_TOKEN', () => {
  delete process.env.DSH_SLACK_TOKEN
  assert.equal(resolveToken({ token: 'xoxb-config', defaultChannel: '' }), 'xoxb-config')
  assert.equal(resolveToken({ token: '', defaultChannel: '' }), '')
  process.env.DSH_SLACK_TOKEN = 'xoxb-env'
  assert.equal(resolveToken({ token: '', defaultChannel: '' }), 'xoxb-env')
  assert.equal(resolveToken({ token: 'xoxb-config', defaultChannel: '' }), 'xoxb-config')
  delete process.env.DSH_SLACK_TOKEN
})

test('requireToken：缺失时抛中文提示（含原生设置页与环境变量指引）', () => {
  delete process.env.DSH_SLACK_TOKEN
  assert.throws(() => requireToken({ token: '', defaultChannel: '' }), /token 未配置/)
  assert.throws(() => requireToken(undefined), /设置 → 插件/)
  assert.throws(() => requireToken(undefined), /cordis\.patch\.yml/)
})

test('resolveDefaultChannel 返回配置的默认频道', () => {
  assert.equal(resolveDefaultChannel({ token: 'x', defaultChannel: '#general', appToken: '' }), '#general')
  assert.equal(resolveDefaultChannel(undefined), '')
})

test('resolveAppToken：config.appToken 优先，其次环境变量 DSH_SLACK_APP_TOKEN', () => {
  delete process.env.DSH_SLACK_APP_TOKEN
  assert.equal(resolveAppToken({ token: '', defaultChannel: '', appToken: 'xapp-config' }), 'xapp-config')
  assert.equal(resolveAppToken({ token: '', defaultChannel: '', appToken: '' }), '')
  process.env.DSH_SLACK_APP_TOKEN = 'xapp-env'
  assert.equal(resolveAppToken({ token: '', defaultChannel: '', appToken: '' }), 'xapp-env')
  assert.equal(resolveAppToken({ token: '', defaultChannel: '', appToken: 'xapp-config' }), 'xapp-config')
  delete process.env.DSH_SLACK_APP_TOKEN
})

test('parseConfig 解析 appToken 字段', () => {
  assert.equal(parseConfig({ token: 'xoxb-1', defaultChannel: '', appToken: 'xapp-2' }).appToken, 'xapp-2')
})

test('isValidSlackApiUrl 仅允许合法的 http/https URL', () => {
  assert.equal(isValidSlackApiUrl('https://slack.com/api/'), true)
  assert.equal(isValidSlackApiUrl('http://127.0.0.1:3999/api/'), true)
  assert.equal(isValidSlackApiUrl('  https://enterprise.slack.com/api  '), true)

  assert.equal(isValidSlackApiUrl(''), false)
  assert.equal(isValidSlackApiUrl('   '), false)
  assert.equal(isValidSlackApiUrl('not-a-url'), false)
  assert.equal(isValidSlackApiUrl('ftp://slack.com/api/'), false)
  assert.equal(isValidSlackApiUrl('javascript:alert(1)'), false)
  assert.equal(isValidSlackApiUrl('file:///etc/passwd'), false)
  assert.equal(isValidSlackApiUrl('http://'), false)
})

test('validateTokenFormat 区分 bot / user / xoxe 可轮换 / 误填 appToken / 未知前缀', () => {
  assert.deepEqual(validateTokenFormat('xoxb-12345'), { valid: true, kind: 'bot' })
  assert.deepEqual(validateTokenFormat('  xoxe.xoxb-1-abc  '), { valid: true, kind: 'bot' })
  assert.deepEqual(validateTokenFormat('xoxp-12345'), { valid: true, kind: 'user' })
  assert.deepEqual(validateTokenFormat('xoxe.xoxp-1-abc'), { valid: true, kind: 'user' })

  const appResult = validateTokenFormat('xapp-1-A0123-4567')
  assert.equal(appResult.valid, false)
  assert.equal(appResult.kind, 'app')
  assert.match(appResult.reason ?? '', /appToken/)
  assert.match(appResult.reason ?? '', /xapp-/)

  const unknownResult = validateTokenFormat('random-secret-token')
  assert.equal(unknownResult.valid, false)
  assert.equal(unknownResult.kind, 'unknown')
  assert.match(unknownResult.reason ?? '', /xoxb-/)

  const emptyResult = validateTokenFormat('   ')
  assert.equal(emptyResult.valid, false)
  assert.equal(emptyResult.kind, 'unknown')
  assert.ok(emptyResult.reason)
})

test('host-config 顶层描述与 defaultChannel 文案覆盖 9 工具并准确描述热更新回退', () => {
  const rootDesc = Config.meta.description
  assert.equal(typeof rootDesc, 'object')
  assert.match(String(rootDesc.zh), /文件上传/)
  assert.match(String(rootDesc.zh), /表情回应/)
  assert.match(String(rootDesc.en), /file uploads/i)

  const desc = Config.dict.defaultChannel.meta.description
  assert.equal(typeof desc, 'object')
  assert.doesNotMatch(String(desc.zh), /提示模型优先使用/)
  assert.match(String(desc.zh), /回退/)
  assert.match(String(desc.en), /omitted/i)
})

test('inspectProxyEnv 与 createProxyDispatcher：拒绝畸形/非 HTTP(S) 代理不抛错且不泄露凭据，修复空小写遮蔽', async () => {
  assert.deepEqual(inspectProxyEnv({}), { configured: false, valid: true, invalidEntries: [] })
  assert.deepEqual(inspectProxyEnv({ HTTPS_PROXY: 'http://127.0.0.1:7890' }), {
    configured: true,
    valid: true,
    invalidEntries: [],
  })

  // 畸形与非 HTTP(S) 代理：不抛错、不泄露用户名/密码、createProxyDispatcher 安全返回 undefined
  for (const bad of [
    '127.0.0.1:7890',
    'localhost:7890',
    'socks5h://alice:super-secret-pwd@127.0.0.1:7890',
    'ftp://bob:hunter2@127.0.0.1:21',
  ]) {
    const env = { HTTPS_PROXY: bad }
    const inspected = inspectProxyEnv(env)
    assert.equal(inspected.configured, true)
    assert.equal(inspected.valid, false)
    assert.equal(inspected.invalidEntries.length, 1)
    assert.equal(inspected.invalidEntries[0].key, 'HTTPS_PROXY')
    assert.doesNotMatch(inspected.invalidEntries[0].reason, /super-secret-pwd|hunter2|alice|bob/)
    assert.equal(createProxyDispatcher(env), undefined)
  }

  // Linux/macOS 常见空字符串小写变量不应遮蔽大写 HTTP_PROXY / NO_PROXY
  const shadowed = createProxyDispatcher({
    http_proxy: '',
    HTTP_PROXY: 'http://127.0.0.1:7890',
    no_proxy: '',
    NO_PROXY: '127.0.0.1',
  })
  assert.ok(shadowed instanceof EnvHttpProxyAgent)
  await shadowed.close()
})

test('transport 静默日志、代理门控、自管 dispatcher 复用与 FormData 二进制透传（代理 + NO_PROXY）', async (t) => {
  const logger = createSilentSlackLogger()
  assert.equal(logger.getLevel(), 'error')
  assert.doesNotThrow(() => {
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    logger.setLevel('debug')
    logger.setName('test')
  })

  // 无代理环境：严格返回 false 与 undefined（绝不无条件实例化 EnvHttpProxyAgent）
  assert.equal(hasProxyEnv({}), false)
  assert.equal(hasProxyEnv({ HTTPS_PROXY: '   ', http_proxy: '', NO_PROXY: 'localhost' }), false)
  assert.equal(createProxyDispatcher({}), undefined)
  assert.equal(createProxyDispatcher({ NO_PROXY: '*' }), undefined)

  // 有代理环境：4 个代理变量任一非空均返回 true 且创建 EnvHttpProxyAgent
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
    const env = { [key]: 'http://127.0.0.1:8080' }
    assert.equal(hasProxyEnv(env), true)
    const dispatcher = createProxyDispatcher(env)
    assert.ok(dispatcher instanceof EnvHttpProxyAgent)
    await dispatcher.close()
  }

  // createTransportFetch：已中止信号立刻拒绝
  const aborted = new AbortController()
  const reason = new Error('pre-aborted')
  aborted.abort(reason)
  const abortedFetch = createTransportFetch(aborted.signal, {})
  await assert.rejects(abortedFetch('http://127.0.0.1:1/never'), (err) => err === reason)

  // 记录目标服务收到的请求头与原始二进制载荷
  const receivedUploads = []
  const fixture = await createConnectProxyFixture(t, (req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks)
      if (req.url === '/upload') {
        receivedUploads.push({
          contentType: String(req.headers['content-type'] ?? ''),
          raw,
        })
      }
      res.writeHead(200, { 'content-type': 'application/json', connection: 'close' }).end(JSON.stringify({ proxied: true, path: req.url }))
    })
  })

  // 1. 通过代理 CONNECT 隧道发送常规请求（并复用缓存分发器）
  const proxiedFetch1 = createTransportFetch(AbortSignal.timeout(3000), { HTTP_PROXY: fixture.proxyUrl })
  const response1 = await proxiedFetch1('http://slack.invalid/api/auth.test')
  assert.equal(response1.status, 200)
  assert.deepEqual(await response1.json(), { proxied: true, path: '/api/auth.test' })

  const proxiedFetch2 = createTransportFetch(AbortSignal.timeout(3000), { HTTP_PROXY: fixture.proxyUrl })
  const response2 = await proxiedFetch2('http://slack.invalid/api/auth.test')
  assert.equal(response2.status, 200)
  assert.equal((await response2.json()).proxied, true)
  assert.ok(fixture.proxiedTargets.length >= 1)
  assert.match(fixture.proxiedTargets[0], /slack\.invalid/)

  // 2. P0 #1：globalThis.FormData 在 HTTP_PROXY 代理路径下保持 multipart/form-data 与精确 PNG 字节
  const buildForm = () => {
    const fd = new FormData()
    fd.append('title', 'diagram')
    fd.append('body', new Blob([PNG_BYTES], { type: 'image/png' }), 'shot.png')
    return fd
  }
  const uploadViaProxy = await proxiedFetch1('http://slack.invalid/upload', { method: 'POST', body: buildForm() })
  assert.equal(uploadViaProxy.status, 200)

  // 3. P0 #1：globalThis.FormData 在 HTTP_PROXY + NO_PROXY="*" 绕过代理路径下同样不损坏为 "[object FormData]"
  const noProxyFetch = createTransportFetch(AbortSignal.timeout(3000), {
    http_proxy: '',
    HTTP_PROXY: fixture.proxyUrl,
    no_proxy: '',
    NO_PROXY: '*',
  })
  const targetsBeforeNoProxy = fixture.proxiedTargets.length
  const uploadViaNoProxy = await noProxyFetch(`${fixture.targetUrl}/upload`, { method: 'POST', body: buildForm() })
  assert.equal(uploadViaNoProxy.status, 200)
  assert.equal(fixture.proxiedTargets.length, targetsBeforeNoProxy)

  assert.equal(receivedUploads.length, 2)
  for (const item of receivedUploads) {
    assert.match(item.contentType, /^multipart\/form-data;\s*boundary=/i)
    assert.equal(item.raw.includes(Buffer.from('[object FormData]')), false)
    assert.equal(item.raw.includes(PNG_BYTES), true)
    assert.equal(item.raw.includes(Buffer.from('filename="shot.png"')), true)
    assert.equal(item.raw.includes(Buffer.from('diagram')), true)
  }

  // 4. P1 #5：options.dispatcher 允许调用方传入自管生命周期 dispatcher（如 SocketModeClient）
  const ownedDispatcher = createProxyDispatcher({ HTTP_PROXY: fixture.proxyUrl })
  assert.ok(ownedDispatcher)
  const ownedFetch = createTransportFetch(AbortSignal.timeout(3000), {}, { dispatcher: ownedDispatcher })
  const ownedRes = await ownedFetch('http://slack.invalid/api/owned')
  assert.deepEqual(await ownedRes.json(), { proxied: true, path: '/api/owned' })
  await ownedDispatcher.close()
})

test('Config Schema 兼容宿主设置面板：凭据脱敏、volatile 热更新与 toJSON 序列化', async () => {
  delete process.env.DSH_SLACK_TOKEN
  delete process.env.DSH_SLACK_APP_TOKEN
  assert.equal(Config[Symbol.for('schemastery')], true)
  assert.equal(Config.dict.token.meta.role, 'secret')
  assert.equal(Config.dict.appToken.meta.role, 'secret')
  assert.equal(Config.dict.token.meta.volatile, true)
  assert.equal(Config.dict.defaultChannel.meta.volatile, true)
  assert.equal(Boolean(Config.dict.appToken.meta.volatile), false)

  const serialized = JSON.parse(JSON.stringify(Config))
  assert.equal(typeof serialized.uid, 'number')
  assert.ok(serialized.refs && typeof serialized.refs === 'object')

  const parsed = Config({})
  const registered = []
  apply({ tools: { register: (def) => { registered.push(def); return () => {} } }, logger: { warn() {} } }, parsed)
  const health = registered.find((d) => d.name === 'slack_health')
  assert.equal((await health.execute({})).ok, false)

  const updated = Config({ token: 'xoxb-live', defaultChannel: '#ops' })
  const writeSym = Symbol.for('cosmokit.volatile.write')
  parsed.token[writeSym](updated.token.get())
  parsed.defaultChannel[writeSym](updated.defaultChannel.get())
  assert.equal(liveConfig(parsed).token, 'xoxb-live')
  const checkAfter = await health.execute({})
  assert.equal(checkAfter.ok, true)
  assert.equal(checkAfter.checks[2].detail, '#ops')
})

test('slack_notify 通过 volatile 热更新 defaultChannel 后立即按新默认频道发送', async (t) => {
  const receivedChannels = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      receivedChannels.push(new URLSearchParams(body).get('channel'))
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, ts: '1700.1' }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    return new Promise((resolve) => server.close(resolve))
  })
  const apiUrl = `http://127.0.0.1:${server.address().port}/`

  const parsed = Config({ token: 'xoxb-live', defaultChannel: '#initial', slackApiUrl: apiUrl })
  const registered = []
  apply({ tools: { register: (def) => { registered.push(def); return () => {} } }, logger: { warn() {} } }, parsed)
  const notify = registered.find((d) => d.name === 'slack_notify')

  const first = await notify.execute({ text: 'hello 1' })
  assert.equal(first.channel, '#initial')

  const writeSym = Symbol.for('cosmokit.volatile.write')
  parsed.defaultChannel[writeSym]('#hot-updated')
  const second = await notify.execute({ text: 'hello 2' })
  assert.equal(second.channel, '#hot-updated')

  const third = await notify.execute({ channel: '', text: 'hello 3' })
  assert.equal(third.channel, '#hot-updated')

  parsed.defaultChannel[writeSym]('')
  await assert.rejects(() => notify.execute({ text: 'hello 4' }), /defaultChannel/)

  assert.deepEqual(receivedChannels, ['#initial', '#hot-updated', '#hot-updated'])
})

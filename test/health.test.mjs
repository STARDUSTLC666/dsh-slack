import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHealthTool } from '../lib/tools.js'

function deps(config, socket, client, extra = {}) {
  return {
    configProvider: () => config,
    clientProvider: () => {
      if (client) return client
      throw new Error('no network in tests')
    },
    inboxProvider: () => ({ drain: () => [], list: () => [], size: 0 }),
    socketStatusProvider: () => socket,
    ...extra,
  }
}

test('slack_health token 配置齐全时 ok=true（支持 xoxb- / xoxp- / xoxe.xoxb- / xoxe.xoxp-）', async () => {
  for (const token of ['xoxb-1', 'xoxp-1', 'xoxe.xoxb-1', 'xoxe.xoxp-1']) {
    const health = buildHealthTool(deps({ token, appToken: 'xapp-1', defaultChannel: '#general' }, { state: 'connected', attempts: 1 }))
    const value = await health.execute({})
    assert.equal(value.ok, true, token)
    assert.equal(value.checks[0].ok, true, token)
    assert.match(String(value.checks[1].detail), /Socket Mode/)
    assert.match(String(value.checks[2].detail), /#general/)
  }
})

test('slack_health does not confuse configured tokens with a working socket', async () => {
  const config = { token: 'xoxb-synthetic', appToken: 'xapp-synthetic' }
  const unknown = await buildHealthTool(deps(config)).execute({})
  assert.equal(unknown.ok, false)
  assert.match(unknown.checks.at(-1).detail, /尚未确认/)
  const failed = await buildHealthTool(deps(config, { state: 'auth_failed', attempts: 2, error: 'invalid_auth' })).execute({})
  assert.equal(failed.ok, false)
  assert.match(failed.checks.at(-1).detail, /停止重连/)
})

test('slack_health 缺 token 时 ok=false 且说明影响', async () => {
  const health = buildHealthTool(deps({ defaultChannel: undefined }))
  const value = await health.execute({})
  assert.equal(value.ok, false)
  assert.match(String(value.checks[0].detail), /未配置/)
  assert.match(String(value.checks[1].detail), /收件箱功能不可用/)
})

test('slack_health 误把 xapp- 填在 config.token 时报告失败并给出清晰中文指引', async () => {
  const health = buildHealthTool(deps({ token: 'xapp-1-wrong-slot', defaultChannel: '#general' }))
  const value = await health.execute(undefined)
  assert.equal(value.ok, false)
  assert.equal(value.checks[0].name, 'botToken')
  assert.equal(value.checks[0].ok, false)
  assert.match(String(value.checks[0].detail), /appToken/)
  const rendered = health.output.render({}, value)[0].text
  assert.match(rendered, /❌/)
  assert.match(rendered, /xoxb-/)
  assert.match(rendered, /xapp-/)
})

test('slack_health 在未知 token 前缀和非法 slackApiUrl 时报错', async () => {
  const health = buildHealthTool(deps({ token: 'plain-invalid-token', slackApiUrl: 'ftp://bad.local/api' }))
  const value = await health.execute({})
  assert.equal(value.ok, false)
  assert.equal(value.checks[0].ok, false)
  const urlCheck = value.checks.find((c) => c.name === 'slackApiUrl')
  assert.ok(urlCheck)
  assert.equal(urlCheck.ok, false)
  assert.match(String(urlCheck.detail), /http:\/\/ 或 https:\/\//)
  const rendered = health.output.render({}, value)[0].text
  assert.match(rendered, /slackApiUrl 格式无效/)
})

test('slack_health 检测到非法或不受支持的代理环境变量时汇报问题且不泄露凭据', async (t) => {
  const saved = { HTTPS_PROXY: process.env.HTTPS_PROXY, HTTP_PROXY: process.env.HTTP_PROXY }
  t.after(() => {
    if (saved.HTTPS_PROXY === undefined) delete process.env.HTTPS_PROXY
    else process.env.HTTPS_PROXY = saved.HTTPS_PROXY
    if (saved.HTTP_PROXY === undefined) delete process.env.HTTP_PROXY
    else process.env.HTTP_PROXY = saved.HTTP_PROXY
  })

  process.env.HTTPS_PROXY = 'socks5h://user:top-secret-pw@127.0.0.1:1080'
  process.env.HTTP_PROXY = '127.0.0.1:7890'

  const health = buildHealthTool(deps({ token: 'xoxb-1', defaultChannel: '#general' }))
  const value = await health.execute({})
  assert.equal(value.ok, false)
  const proxyCheck = value.checks.find((c) => c.name === '代理环境变量')
  assert.ok(proxyCheck)
  assert.equal(proxyCheck.ok, false)
  assert.match(String(proxyCheck.detail), /HTTPS_PROXY/)
  assert.match(String(proxyCheck.detail), /HTTP_PROXY/)
  assert.doesNotMatch(String(proxyCheck.detail), /top-secret-pw/)
  const rendered = health.output.render({}, value)[0].text
  assert.match(rendered, /代理环境变量无效/)
  assert.doesNotMatch(rendered, /top-secret-pw/)
})

test('slack_health 在 appToken 非 xapp- 开头时明确报错前缀无效，不误报已配置', async () => {
  const health = buildHealthTool(deps({ token: 'xoxb-1', appToken: 'xoxp-wrong', defaultChannel: '#general' }))
  const value = await health.execute({})
  assert.equal(value.ok, false)
  const appCheck = value.checks.find((c) => c.name === 'appToken')
  assert.equal(appCheck.ok, false)
  assert.match(String(appCheck.detail), /xapp-/)
  assert.doesNotMatch(String(appCheck.detail), /已配置/)
  const socketCheck = value.checks.find((c) => c.name === 'Socket Mode')
  assert.equal(socketCheck.ok, false)
  assert.match(String(socketCheck.detail), /xapp-/)
  const rendered = health.output.render({}, value)[0].text
  assert.match(rendered, /appToken.*xapp-/)
})

test('slack_health verify=true 调用 authTest、返回工作区权限并回调 onBotUserIdResolved', async () => {
  let called = 0
  let resolvedId = null
  const fakeClient = {
    async authTest() {
      called += 1
      return {
        ok: true,
        team: 'Acme Corp',
        user: 'dsh-bot',
        user_id: 'U12345',
        bot_id: 'B12345',
        scopes: ['chat:write', 'channels:read'],
      }
    },
  }
  const health = buildHealthTool(deps(
    { token: 'xoxb-1', defaultChannel: '#general' },
    undefined,
    fakeClient,
    { onBotUserIdResolved: (id) => { resolvedId = id } },
  ))
  const value = await health.execute({ verify: true })
  assert.equal(called, 1)
  assert.equal(resolvedId, 'U12345')
  assert.equal(value.ok, true)
  const authCheck = value.checks.find((c) => c.name === '在线鉴权（auth.test）')
  assert.ok(authCheck)
  assert.equal(authCheck.ok, true)
  assert.match(String(authCheck.detail), /Acme Corp/)
  assert.match(String(authCheck.detail), /dsh-bot/)
  assert.match(String(authCheck.detail), /chat:write/)
  assert.equal(value.auth.team, 'Acme Corp')
  assert.deepEqual(value.auth.scopes, ['chat:write', 'channels:read'])
})

test('slack_health verify=true 在 authTest 报错时映射为中文错误', async () => {
  const fakeClient = {
    async authTest() {
      throw { data: { error: 'invalid_auth' } }
    },
  }
  const health = buildHealthTool(deps({ token: 'xoxb-1' }, undefined, fakeClient))
  const value = await health.execute({ verify: true })
  assert.equal(value.ok, false)
  const authCheck = value.checks.find((c) => c.name === '在线鉴权（auth.test）')
  assert.ok(authCheck)
  assert.equal(authCheck.ok, false)
  assert.match(String(authCheck.detail), /invalid_auth/)
  const rendered = health.output.render({}, value)[0].text
  assert.match(rendered, /在线鉴权失败/)
})

test('slack_health verify=true 在 botToken 无效时跳过网络请求', async () => {
  const health = buildHealthTool(deps({ token: 'xapp-wrong' }))
  const value = await health.execute({ verify: true })
  assert.equal(value.ok, false)
  const authCheck = value.checks.find((c) => c.name === '在线鉴权（auth.test）')
  assert.ok(authCheck)
  assert.equal(authCheck.ok, false)
  assert.match(String(authCheck.detail), /已跳过/)
})

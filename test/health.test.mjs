import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHealthTool } from '../lib/tools.js'

function deps(config, socket) {
  return { configProvider: () => config, clientProvider: () => { throw new Error('no network in tests') }, inboxProvider: () => ({ drain: () => [] }), socketStatusProvider: () => socket }
}

test('slack_health token 配置齐全时 ok=true', async () => {
  const health = buildHealthTool(deps({ token: 'xoxb-1', appToken: 'xapp-1', defaultChannel: '#general' }, { state: 'connected', attempts: 1 }))
  const value = await health.execute({})
  assert.equal(value.ok, true)
  assert.match(String(value.checks[1].detail), /Socket Mode/)
  assert.match(String(value.checks[2].detail), /#general/)
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

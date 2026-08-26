import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHealthTool } from '../lib/tools.js'

function deps(config) {
  return { configProvider: () => config, clientProvider: () => { throw new Error('no network in tests') }, inboxProvider: () => ({ drain: () => [] }) }
}

test('slack_health token 配置齐全时 ok=true', async () => {
  const health = buildHealthTool(deps({ token: 'xoxb-1', appToken: 'xapp-1', defaultChannel: '#general' }))
  const value = await health.execute({})
  assert.equal(value.ok, true)
  assert.match(String(value.checks[1].detail), /Socket Mode/)
  assert.match(String(value.checks[2].detail), /#general/)
})

test('slack_health 缺 token 时 ok=false 且说明影响', async () => {
  const health = buildHealthTool(deps({ defaultChannel: undefined }))
  const value = await health.execute({})
  assert.equal(value.ok, false)
  assert.match(String(value.checks[0].detail), /未配置/)
  assert.match(String(value.checks[1].detail), /收件箱功能不可用/)
})

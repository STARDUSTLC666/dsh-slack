import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseConfig, resolveToken, resolveAppToken, resolveDefaultChannel, requireToken } from '../lib/index.js'

test('parseConfig 处理缺失/空配置（不抛错）', () => {
  assert.deepEqual(parseConfig(undefined), { token: '', defaultChannel: '', appToken: '' })
  assert.deepEqual(parseConfig(null), { token: '', defaultChannel: '', appToken: '' })
  assert.deepEqual(parseConfig({}), { token: '', defaultChannel: '', appToken: '' })
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

test('requireToken：缺失时抛中文提示', () => {
  delete process.env.DSH_SLACK_TOKEN
  assert.throws(() => requireToken({ token: '', defaultChannel: '' }), /token 未配置/)
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

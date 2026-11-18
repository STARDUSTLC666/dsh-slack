import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, Config, liveConfig, parseConfig, resolveToken, resolveAppToken, resolveDefaultChannel, requireToken } from '../lib/index.js'

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

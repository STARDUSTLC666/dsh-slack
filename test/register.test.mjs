import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, buildHealthTool } from '../lib/index.js'

function mockContext() {
  const registered = []
  return {
    tools: { register: (def) => { registered.push(def); return () => {} } },
    registered,
  }
}

test('apply 注册五个工具', () => {
  const ctx = mockContext()
  apply(ctx, { token: 'xoxb-test', defaultChannel: '#general' })
  const names = ctx.registered.map((t) => t.name).sort()
  assert.deepEqual(names, ['slack_channels', 'slack_health', 'slack_inbox', 'slack_notify', 'slack_reply'])
})

test('apply 在配置缺失时不抛错（懒加载），仍注册五个工具', () => {
  const ctx = mockContext()
  assert.doesNotThrow(() => apply(ctx, undefined))
  assert.equal(ctx.registered.length, 5)
})

test('两个工具的 parameters 都是已编译的 object JSON Schema', () => {
  const ctx = mockContext()
  apply(ctx, { token: 'xoxb-test', defaultChannel: '#general' })
  for (const tool of ctx.registered) {
    assert.equal(tool.parameters.type, 'object')
    assert.equal(typeof tool.parameters.properties, 'object')
    // 绝不能是原始 DSL（没有 type: object 根）
    assert.ok(Array.isArray(tool.parameters.required) || tool.parameters.required === undefined)
  }
  const notify = ctx.registered.find((t) => t.name === 'slack_notify')
  assert.deepEqual(notify.parameters.required, ['text'])
  assert.equal(typeof buildHealthTool, 'function')
})

test('配置缺失时 execute 抛中文 token 错误', async () => {
  delete process.env.DSH_SLACK_TOKEN
  const ctx = mockContext()
  apply(ctx, undefined)
  const notify = ctx.registered.find((t) => t.name === 'slack_notify')
  await assert.rejects(() => notify.execute({ channel: '#general', text: 'hi' }), /token 未配置/)
})

test('Cordis 4 ctx.effect 卸载时清理全部已注册工具', () => {
  const active = new Set()
  const effects = []
  apply({
    tools: { register: (def) => { active.add(def.name); return () => active.delete(def.name) } },
    effect: (fn) => { effects.push(fn()) },
  }, { token: 'xoxb-test', defaultChannel: '#general' })
  assert.equal(active.size, 5)
  for (const dispose of effects) dispose?.()
  assert.equal(active.size, 0)
})

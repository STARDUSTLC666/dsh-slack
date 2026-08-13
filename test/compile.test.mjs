import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileParameters } from '../lib/index.js'

test('compileParameters 输出已编译的 object JSON Schema', () => {
  const schema = compileParameters({
    channel: { type: 'string', required: true, description: '目标频道' },
    text: { type: 'string', required: true },
    thread_ts: { type: 'string' },
  })
  assert.equal(schema.type, 'object')
  assert.deepEqual(Object.keys(schema.properties).sort(), ['channel', 'text', 'thread_ts'])
  assert.deepEqual(schema.required, ['channel', 'text'])
  assert.equal(schema.properties.channel.type, 'string')
  assert.equal(schema.properties.channel.description, '目标频道')
  // 参数节点不能残留 DSL 的 required 标记（坑 1）
  assert.ok(!('required' in schema.properties.channel))
  assert.ok(!('required' in schema.properties.thread_ts))
})

test('compileParameters 空 DSL 也返回 object 根', () => {
  const schema = compileParameters({})
  assert.deepEqual(schema, { type: 'object', properties: {} })
})

test('compileParameters 编译 enum 与嵌套 items', () => {
  const schema = compileParameters({
    tags: { type: 'array', items: { type: 'string' } },
    level: { type: 'string', enum: ['low', 'high'] },
  })
  assert.deepEqual(schema.properties.tags, { type: 'array', items: { type: 'string' } })
  assert.deepEqual(schema.properties.level, { type: 'string', enum: ['low', 'high'] })
})

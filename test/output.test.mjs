import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNotifyTool, buildChannelsTool } from '../lib/index.js'

const CFG = () => ({ token: 'xoxb-test', defaultChannel: '#general' })

/** 递归断言值里没有任何 undefined（纯 JSON / lossless JSON）。 */
function assertLosslessJson(value) {
  const walk = (v, path) => {
    if (v === undefined) throw new Error(`${path} 是 undefined，不是合法 JSON`)
    if (Array.isArray(v)) { v.forEach((item, i) => walk(item, `${path}[${i}]`)); return }
    if (v !== null && typeof v === 'object') { Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`)) }
  }
  walk(value, 'value')
  // 确保可被 JSON 序列化（往返不丢字段）
  JSON.parse(JSON.stringify(value))
  return value
}

test('slack_notify 输出 schema 是 object JSON Schema', () => {
  const tool = buildNotifyTool({ clientProvider: () => { throw new Error('unused') }, configProvider: CFG })
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(tool.output.schema.properties.ts.type, 'string')
  assert.equal(tool.output.schema.properties.channel.type, 'string')
  assert.equal(tool.output.schema.additionalProperties, true)
})

test('slack_channels 输出 schema 是 object JSON Schema', () => {
  const tool = buildChannelsTool({ clientProvider: () => { throw new Error('unused') }, configProvider: CFG })
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(tool.output.schema.properties.channels.type, 'array')
  assert.equal(tool.output.schema.additionalProperties, true)
})

test('slack_notify execute 返回纯 JSON（无 undefined）', async () => {
  const fake = { async postMessage() { return { ts: 'T' } }, async listChannels() { return [] } }
  const tool = buildNotifyTool({ clientProvider: () => fake, configProvider: CFG })
  const value = await tool.execute({ channel: '#g', text: 'hi' })
  assertLosslessJson(value)
  assert.deepEqual(value, { ts: 'T', channel: '#g' })
})

test('slack_channels execute 返回纯 JSON（无 undefined）', async () => {
  const fake = {
    async postMessage() { throw new Error('unused') },
    async listChannels() { return [{ id: 'C1', name: 'general' }] },
  }
  const tool = buildChannelsTool({ clientProvider: () => fake, configProvider: CFG })
  const value = await tool.execute()
  assertLosslessJson(value)
  assert.deepEqual(value, { channels: [{ id: 'C1', name: 'general' }] })
})

test('render 输出 text 内容块', () => {
  const tool = buildNotifyTool({ clientProvider: () => { throw new Error('unused') }, configProvider: CFG })
  const blocks = tool.output.render({}, { ts: 'T', channel: '#g' })
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'text')
  assert.match(blocks[0].text, /#g/)
})

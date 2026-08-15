import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMessageEvent, createInboxQueue, INBOX_CAPACITY, buildInboxTool, buildReplyTool, apply } from '../lib/index.js'

const CFG = () => ({ token: 'xoxb-test', defaultChannel: '#general', appToken: '' })

function msg(ts, text) {
  return { ts, channel: 'C1', user: 'U1', text }
}

test('parseMessageEvent 解析普通 message 事件', () => {
  const value = parseMessageEvent({ type: 'message', ts: '1.2', channel: 'C1', user: 'U1', text: '你好' })
  assert.deepEqual(value, { ts: '1.2', channel: 'C1', user: 'U1', text: '你好' })
})

test('parseMessageEvent 排除 subtype 非空的消息', () => {
  assert.equal(parseMessageEvent({ type: 'message', subtype: 'bot_message', ts: '1.2', channel: 'C1', user: 'U1', text: 'x' }), null)
  assert.equal(parseMessageEvent({ type: 'message', subtype: 'channel_join', ts: '1.2', channel: 'C1', user: 'U1', text: 'x' }), null)
})

test('parseMessageEvent 排除 bot 自己发的消息（bot_id 或 botUserId）', () => {
  assert.equal(parseMessageEvent({ type: 'message', ts: '1.2', channel: 'C1', user: 'U1', text: 'x', bot_id: 'B1' }), null)
  assert.equal(parseMessageEvent({ type: 'message', ts: '1.2', channel: 'C1', user: 'UBOT', text: 'x' }, 'UBOT'), null)
})

test('parseMessageEvent 解析 slack_event 包（events_api → body.event）', () => {
  const raw = { type: 'events_api', body: { event: { type: 'message', ts: '2.3', channel: 'C2', user: 'U2', text: 'hi' } } }
  assert.deepEqual(parseMessageEvent(raw), { ts: '2.3', channel: 'C2', user: 'U2', text: 'hi' })
})

test('parseMessageEvent 排除非 message 类型与缺失字段', () => {
  assert.equal(parseMessageEvent({ type: 'hello' }), null)
  assert.equal(parseMessageEvent(null), null)
  assert.equal(parseMessageEvent({ type: 'message', ts: '1', channel: 'C', user: 'U', text: '' }), null)
  assert.equal(parseMessageEvent({ type: 'message', ts: '1', channel: 'C', user: 'U' }), null)
})

test('InboxQueue 容量 200：满则丢最旧，list 新的在前', () => {
  const q = createInboxQueue(INBOX_CAPACITY)
  for (let i = 0; i < 205; i++) q.push(msg('t' + i, 'm' + i))
  assert.equal(q.size, 200)
  const all = q.list(200)
  assert.equal(all[0].ts, 't204')
  assert.equal(all[all.length - 1].ts, 't5')
})

test('InboxQueue clear 清空队列', () => {
  const q = createInboxQueue()
  q.push(msg('1.2', 'a'))
  q.push(msg('2.3', 'b'))
  assert.equal(q.size, 2)
  q.clear()
  assert.equal(q.size, 0)
  assert.deepEqual(q.list(10), [])
})

test('InboxQueue 忽略 Slack 重投的重复事件', () => {
  const q = createInboxQueue()
  q.push(msg('1.2', 'a'))
  q.push(msg('1.2', 'a'))
  q.push(msg('2.3', 'b'))
  assert.equal(q.size, 2)
  assert.deepEqual(q.list(10).map((m) => m.ts), ['2.3', '1.2'])
})

test('InboxQueue drain 原子消费：返回最近 limit 条并清空整个队列', () => {
  const q = createInboxQueue()
  for (let i = 0; i < 30; i++) q.push(msg('t' + i, 'm' + i))
  const out = q.drain(10)
  assert.equal(out.length, 10)
  assert.equal(out[0].ts, 't29')
  assert.equal(q.size, 0)
})

test('buildInboxTool 返回队列消息，limit clamp 1-50，默认 10', async () => {
  const q = createInboxQueue()
  for (let i = 0; i < 60; i++) q.push(msg('t' + i, 'm' + i))
  const tool = buildInboxTool({ clientProvider: () => { throw new Error('unused') }, configProvider: CFG, inboxProvider: () => q })
  const value = await tool.execute({ limit: 100 })
  assert.equal(value.messages.length, 50)
  const one = await tool.execute({ limit: 0 })
  assert.equal(one.messages.length, 1)
  const def = await tool.execute({})
  assert.equal(def.messages.length, 10)
  assert.deepEqual(def.messages[0], msg('t59', 'm59'))
})

test('buildInboxTool markRead=true 返回后清空队列', async () => {
  const q = createInboxQueue()
  q.push(msg('1.2', 'a'))
  const tool = buildInboxTool({ clientProvider: () => { throw new Error('unused') }, configProvider: CFG, inboxProvider: () => q })
  const value = await tool.execute({ markRead: true })
  assert.equal(value.messages.length, 1)
  assert.equal(q.size, 0)
})

test('buildInboxTool 输出 schema 是 object JSON Schema 且返回值纯 JSON', async () => {
  const q = createInboxQueue()
  q.push(msg('1.2', 'a'))
  const tool = buildInboxTool({ clientProvider: () => { throw new Error('unused') }, configProvider: CFG, inboxProvider: () => q })
  assert.equal(tool.output.schema.type, 'object')
  assert.equal(tool.output.schema.properties.messages.type, 'array')
  const value = await tool.execute({})
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value)
})

test('buildReplyTool 载荷带 thread_ts，返回 { ts, channel }', async () => {
  let captured = null
  const fake = { async postMessage(p) { captured = p; return { ts: 'r.ts' } }, async listChannels() { return [] } }
  const tool = buildReplyTool({ clientProvider: () => fake, configProvider: CFG, inboxProvider: () => createInboxQueue() })
  const result = await tool.execute({ channel: '#general', text: '回复', thread_ts: '1.2' })
  assert.deepEqual(captured, { channel: '#general', text: '回复', thread_ts: '1.2' })
  assert.deepEqual(result, { ts: 'r.ts', channel: '#general' })
})

test('buildReplyTool 缺 thread_ts 抛中文错误', async () => {
  const fake = { async postMessage() { return { ts: 'x' } }, async listChannels() { return [] } }
  const tool = buildReplyTool({ clientProvider: () => fake, configProvider: CFG, inboxProvider: () => createInboxQueue() })
  await assert.rejects(() => tool.execute({ channel: '#general', text: 'x' }), /thread_ts/)
})

test('apply 缺 appToken 不崩，slack_inbox 返回空队列', async () => {
  const registered = []
  const ctx = {
    tools: { register: (def) => { registered.push(def); return () => {} } },
    effect: (start) => { start() },
    logger: { warn() {} },
  }
  assert.doesNotThrow(() => apply(ctx, { token: 'xoxb-test', defaultChannel: '#general' }))
  const inbox = registered.find((t) => t.name === 'slack_inbox')
  const value = await inbox.execute({})
  assert.deepEqual(value, { messages: [] })
})

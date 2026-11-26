import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMessageEvent, createInboxQueue, INBOX_CAPACITY, buildInboxTool, buildReplyTool, apply } from '../lib/index.js'

const CFG = () => ({ token: 'xoxb-test', defaultChannel: '#general', appToken: '' })

function msg(ts, text, channel = 'C1') {
  return { ts, channel, user: 'U1', text }
}

test('parseMessageEvent 解析普通 message 事件', () => {
  const value = parseMessageEvent({ type: 'message', ts: '1.2', channel: 'C1', user: 'U1', text: '你好' })
  assert.deepEqual(value, { ts: '1.2', channel: 'C1', user: 'U1', text: '你好' })
})

test('parseMessageEvent 保留 thread_ts 并在空白或缺失时省略', () => {
  const inThread = parseMessageEvent({
    type: 'message',
    ts: '2.3',
    thread_ts: ' 1.2 ',
    channel: 'C1',
    user: 'U1',
    text: '线程内回复',
  })
  assert.deepEqual(inThread, { ts: '2.3', thread_ts: '1.2', channel: 'C1', user: 'U1', text: '线程内回复' })

  const blankThread = parseMessageEvent({
    type: 'message',
    ts: '2.4',
    thread_ts: '   ',
    channel: 'C1',
    user: 'U1',
    text: '普通消息',
  })
  assert.deepEqual(blankThread, { ts: '2.4', channel: 'C1', user: 'U1', text: '普通消息' })
  assert.equal('thread_ts' in blankThread, false)
})

test('parseMessageEvent 支持 app_mention（直接事件、events_api 包与按类型包）', () => {
  const direct = parseMessageEvent({
    type: 'app_mention',
    ts: '3.1',
    thread_ts: '3.0',
    channel: 'C1',
    user: 'U1',
    text: '<@UBOT> 帮我看下日志',
  })
  assert.deepEqual(direct, {
    ts: '3.1',
    thread_ts: '3.0',
    channel: 'C1',
    user: 'U1',
    text: '<@UBOT> 帮我看下日志',
    event_type: 'app_mention',
  })

  const envelope = parseMessageEvent({
    type: 'events_api',
    body: { event: { type: 'app_mention', ts: '3.2', channel: 'C2', user: 'U2', text: '<@UBOT> hi' } },
  })
  assert.deepEqual(envelope, {
    ts: '3.2',
    channel: 'C2',
    user: 'U2',
    text: '<@UBOT> hi',
    event_type: 'app_mention',
  })

  const typed = parseMessageEvent({
    event: { type: 'app_mention', ts: '3.3', channel: 'C2', user: 'U2', text: '<@UBOT> ping' },
  })
  assert.deepEqual(typed, {
    ts: '3.3',
    channel: 'C2',
    user: 'U2',
    text: '<@UBOT> ping',
    event_type: 'app_mention',
  })

  assert.equal(parseMessageEvent({ type: 'app_mention', ts: '3.4', channel: 'C1', user: 'UBOT', text: 'self' }, 'UBOT'), null)
})

test('parseMessageEvent 允许 thread_broadcast 与 file_share，继续排除其他 subtype', () => {
  const broadcast = parseMessageEvent({
    type: 'message',
    subtype: 'thread_broadcast',
    ts: '4.2',
    thread_ts: '4.0',
    channel: 'C1',
    user: 'U1',
    text: '同步到频道的线程回复',
  })
  assert.deepEqual(broadcast, {
    ts: '4.2',
    thread_ts: '4.0',
    channel: 'C1',
    user: 'U1',
    text: '同步到频道的线程回复',
  })

  assert.equal(parseMessageEvent({ type: 'message', subtype: 'bot_message', ts: '1.2', channel: 'C1', user: 'U1', text: 'x' }), null)
  assert.equal(parseMessageEvent({ type: 'message', subtype: 'channel_join', ts: '1.2', channel: 'C1', user: 'U1', text: 'x' }), null)
  assert.equal(parseMessageEvent({ type: 'message', subtype: 'message_changed', ts: '1.2', channel: 'C1', user: 'U1', text: 'x' }), null)
  assert.equal(parseMessageEvent({ type: 'message', subtype: 'message_deleted', ts: '1.2', channel: 'C1', user: 'U1', text: 'x' }), null)
})

test('parseMessageEvent 处理 file_share 与附件：有说明保留原文本，无说明合成可读占位文本', () => {
  const withCaption = parseMessageEvent({
    type: 'message',
    subtype: 'file_share',
    ts: '5.1',
    channel: 'C1',
    user: 'U1',
    text: '附上今日报告',
    files: [{ name: 'report.pdf', mimetype: 'application/pdf', id: 'F1' }],
  })
  assert.deepEqual(withCaption, {
    ts: '5.1',
    channel: 'C1',
    user: 'U1',
    text: '附上今日报告',
    files: [{ name: 'report.pdf', mimetype: 'application/pdf' }],
  })

  const withoutCaption = parseMessageEvent({
    type: 'message',
    subtype: 'file_share',
    ts: '5.2',
    channel: 'C1',
    user: 'U1',
    text: '',
    files: [
      { name: 'report.pdf', mimetype: 'application/pdf' },
      { name: 'chart.png', mimetype: 'image/png' },
    ],
  })
  assert.deepEqual(withoutCaption, {
    ts: '5.2',
    channel: 'C1',
    user: 'U1',
    text: '[文件: report.pdf, chart.png]',
    files: [
      { name: 'report.pdf', mimetype: 'application/pdf' },
      { name: 'chart.png', mimetype: 'image/png' },
    ],
  })

  const unnamedFile = parseMessageEvent({
    type: 'message',
    subtype: 'file_share',
    ts: '5.3',
    channel: 'C1',
    user: 'U1',
    files: [{ mimetype: 'image/png' }],
  })
  assert.deepEqual(unnamedFile, {
    ts: '5.3',
    channel: 'C1',
    user: 'U1',
    text: '[文件]',
    files: [{ mimetype: 'image/png' }],
  })

  const plainWithFiles = parseMessageEvent({
    type: 'message',
    ts: '5.4',
    channel: 'C1',
    user: 'U1',
    text: '',
    files: [{ name: 'notes.txt' }],
  })
  assert.deepEqual(plainWithFiles, {
    ts: '5.4',
    channel: 'C1',
    user: 'U1',
    text: '[文件: notes.txt]',
    files: [{ name: 'notes.txt' }],
  })
})

test('parseMessageEvent 排除 bot 自己发的消息（bot_id 或非空 botUserId）', () => {
  assert.equal(parseMessageEvent({ type: 'message', ts: '1.2', channel: 'C1', user: 'U1', text: 'x', bot_id: 'B1' }), null)
  assert.equal(parseMessageEvent({ type: 'message', ts: '1.2', channel: 'C1', user: 'UBOT', text: 'x' }, 'UBOT'), null)
  assert.deepEqual(
    parseMessageEvent({ type: 'message', ts: '1.2', channel: 'C1', user: 'U1', text: 'x' }, ''),
    { ts: '1.2', channel: 'C1', user: 'U1', text: 'x' },
  )
})

test('parseMessageEvent 解析 slack_event 包（events_api → body.event）', () => {
  const raw = { type: 'events_api', body: { event: { type: 'message', ts: '2.3', channel: 'C2', user: 'U2', text: 'hi' } } }
  assert.deepEqual(parseMessageEvent(raw), { ts: '2.3', channel: 'C2', user: 'U2', text: 'hi' })
})

test('parseMessageEvent 排除非 message/app_mention 类型与缺失字段', () => {
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

test('InboxQueue 按 (channel, ts) 去重：message 先到、app_mention 后到时升级保留 event_type 及缺失元数据，跨频道同 ts 保留', () => {
  const q = createInboxQueue()
  const asMessage = parseMessageEvent({ type: 'message', ts: '1.2', channel: 'C1', user: 'U1', text: '<@UBOT> hello' })
  const asMention = parseMessageEvent({
    type: 'app_mention',
    ts: '1.2',
    thread_ts: '1.0',
    channel: 'C1',
    user: 'U1',
    text: '<@UBOT> hello',
    files: [{ name: 'spec.md', mimetype: 'text/markdown' }],
  })
  q.push(asMessage)
  q.push(asMention)
  q.push(msg('1.2', 'other channel', 'C2'))
  q.push(msg('2.3', 'b', 'C1'))
  assert.equal(q.size, 3)
  assert.deepEqual(
    q.list(10).map((m) => `${m.channel}:${m.ts}`),
    ['C1:2.3', 'C2:1.2', 'C1:1.2'],
  )
  const upgraded = q.list(10).find((m) => m.channel === 'C1' && m.ts === '1.2')
  assert.equal(upgraded.event_type, 'app_mention')
  assert.equal(upgraded.thread_ts, '1.0')
  assert.deepEqual(upgraded.files, [{ name: 'spec.md', mimetype: 'text/markdown' }])
  // 外部传入对象不会被队列原地污染
  assert.equal(asMessage.event_type, undefined)
})

test('InboxQueue list/drain 遇到 NaN 或非有限数返回空数组且不清空队列', () => {
  const q = createInboxQueue()
  q.push(msg('1.0', 'a'))
  q.push(msg('2.0', 'b'))
  assert.deepEqual(q.list(Number.NaN), [])
  assert.deepEqual(q.list(Number.POSITIVE_INFINITY), [])
  assert.deepEqual(q.drain(Number.NaN), [])
  assert.deepEqual(q.drain(Number.NEGATIVE_INFINITY), [])
  assert.deepEqual(q.drain(-3), [])
  assert.equal(q.size, 2)
  assert.deepEqual(q.list(10).map((m) => m.ts), ['2.0', '1.0'])
})

test('InboxQueue 分页标记已读不丢未返回的消息，重投已读消息不会重新入队', () => {
  const q = createInboxQueue()
  for (let i = 0; i < 30; i++) q.push(msg('t' + i, 'm' + i))
  const out = q.drain(10)
  assert.equal(out.length, 10)
  assert.equal(out[0].ts, 't29')
  assert.equal(q.size, 20)
  q.push(msg('t29', 'm29'))
  assert.equal(q.size, 20)
  assert.equal(q.drain(0).length, 0)
  assert.equal(q.size, 20)
  assert.equal(q.drain(10)[0].ts, 't19')
  assert.equal(q.drain(10)[0].ts, 't9')
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
  assert.deepEqual(value, { messages: [], remaining: 0 })
})

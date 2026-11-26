import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNotifyTool,
  buildChannelsTool,
  buildInboxTool,
  buildReplyTool,
  buildHealthTool,
  buildHistoryTool,
  buildThreadTool,
  buildUploadTool,
  buildReactTool,
  createInboxQueue,
} from '../lib/index.js'

const CFG = () => ({ token: 'xoxb-test', defaultChannel: '#general', appToken: '' })

/** 递归断言值里没有任何 undefined（纯 JSON / lossless JSON）。 */
function assertLosslessJson(value) {
  const walk = (v, path) => {
    if (v === undefined) throw new Error(`${path} 是 undefined，不是合法 JSON`)
    if (Array.isArray(v)) { v.forEach((item, i) => walk(item, `${path}[${i}]`)); return }
    if (v !== null && typeof v === 'object') { Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`)) }
  }
  walk(value, 'value')
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

test('slack_notify 保留 Slack 返回的规范化频道 ID，缺失时回退入参频道', async () => {
  const canonicalFake = { async postMessage() { return { ts: 'T1', channel: 'C001' } }, async listChannels() { return [] } }
  const tool1 = buildNotifyTool({ clientProvider: () => canonicalFake, configProvider: CFG })
  const val1 = await tool1.execute({ channel: '#general', text: 'hi' })
  assertLosslessJson(val1)
  assert.deepEqual(val1, { ts: 'T1', channel: 'C001' })

  const legacyFake = { async postMessage() { return { ts: 'T2' } }, async listChannels() { return [] } }
  const tool2 = buildNotifyTool({ clientProvider: () => legacyFake, configProvider: CFG })
  const val2 = await tool2.execute({ channel: '#g', text: 'hi' })
  assertLosslessJson(val2)
  assert.deepEqual(val2, { ts: 'T2', channel: '#g' })
})

test('slack_notify 对非字符串 thread_ts 严格报错，绝不静默发到主频道', async () => {
  let called = 0
  const fake = { async postMessage() { called += 1; return { ts: 'T', channel: 'C1' } }, async listChannels() { return [] } }
  const tool = buildNotifyTool({ clientProvider: () => fake, configProvider: CFG })
  await assert.rejects(() => tool.execute({ channel: '#general', text: 'hi', thread_ts: 1700000000.0001 }), /thread_ts/)
  await assert.rejects(() => tool.execute({ channel: '#general', text: 'hi', thread_ts: '   ' }), /thread_ts/)
  assert.equal(called, 0)

  await tool.execute({ channel: '#general', text: 'hi', thread_ts: '' })
  assert.equal(called, 1)
})

test('slack_reply 保留 Slack 返回的规范化频道 ID', async () => {
  const fake = { async postMessage() { return { ts: 'R1', channel: 'C001' } }, async listChannels() { return [] } }
  const tool = buildReplyTool({ clientProvider: () => fake, configProvider: CFG, inboxProvider: () => createInboxQueue() })
  const value = await tool.execute({ channel: '#general', text: 'reply', thread_ts: '1700.1' })
  assertLosslessJson(value)
  assert.deepEqual(value, { ts: 'R1', channel: 'C001' })
})

test('slack_channels 支持 scope 参数并返回纯 JSON（保留可选元数据）', async () => {
  const scopes = []
  const fake = {
    async postMessage() { throw new Error('unused') },
    async listChannels(_signal, options) {
      scopes.push(options?.scope)
      return [{ id: 'C1', name: 'general', is_private: false, is_member: true }]
    },
  }
  const tool = buildChannelsTool({ clientProvider: () => fake, configProvider: CFG })
  const v1 = await tool.execute()
  assertLosslessJson(v1)
  assert.deepEqual(v1, { channels: [{ id: 'C1', name: 'general', is_private: false, is_member: true }] })

  await tool.execute({ scope: 'all' })
  assert.deepEqual(scopes, ['joined', 'all'])

  await assert.rejects(() => tool.execute({ scope: 'invalid' }), /scope 参数错误/)
})

test('slack_inbox 返回纯 JSON 并保留可选 thread_ts / event_type / files', async () => {
  const q = createInboxQueue()
  q.push({
    ts: '1700.2',
    channel: 'C1',
    user: 'U1',
    text: '<@UBOT> 请看附件',
    thread_ts: '1700.1',
    event_type: 'app_mention',
    files: [{ name: 'spec.pdf', mimetype: 'application/pdf' }],
  })
  const tool = buildInboxTool({ clientProvider: () => { throw new Error('unused') }, configProvider: CFG, inboxProvider: () => q })
  const value = await tool.execute({})
  assertLosslessJson(value)
  assert.deepEqual(value.messages[0], {
    ts: '1700.2',
    channel: 'C1',
    user: 'U1',
    text: '<@UBOT> 请看附件',
    thread_ts: '1700.1',
    event_type: 'app_mention',
    files: [{ name: 'spec.pdf', mimetype: 'application/pdf' }],
  })
})

test('slack_inbox 尊重已中止的 exec.signal，markRead=true 时不会消费队列', async () => {
  const q = createInboxQueue()
  q.push({ ts: '1700.1', channel: 'C1', user: 'U1', text: 'do not lose me' })
  const tool = buildInboxTool({ clientProvider: () => { throw new Error('unused') }, configProvider: CFG, inboxProvider: () => q })

  const controller = new AbortController()
  const reason = new Error('turn aborted')
  controller.abort(reason)

  await assert.rejects(() => tool.execute({ markRead: true, limit: 10 }, { signal: controller.signal }), (err) => err === reason)
  assert.equal(q.size, 1)
})

test('slack_history 执行与输出纯 JSON，校验参数并 clamp limit', async () => {
  let captured = null
  const fake = {
    async getHistory(params) {
      captured = params
      return {
        channel: 'C001',
        has_more: true,
        messages: [{ ts: '1700.2', user: 'U1', userName: 'Alice', text: 'hello', reply_count: 2 }],
      }
    },
  }
  const tool = buildHistoryTool({ clientProvider: () => fake, configProvider: CFG })
  assert.equal(tool.output.schema.type, 'object')
  const value = await tool.execute({ channel: '#general', limit: 999, oldest: '1700.0', latest: '1700.9' })
  assertLosslessJson(value)
  assert.deepEqual(captured, { channel: '#general', limit: 100, oldest: '1700.0', latest: '1700.9' })
  assert.equal(value.has_more, true)
  await assert.rejects(() => tool.execute({ channel: '#general', oldest: 12345 }), /oldest 参数错误/)
})

test('slack_thread 执行与输出纯 JSON，校验 thread_ts', async () => {
  let captured = null
  const fake = {
    async getThread(params) {
      captured = params
      return {
        channel: 'C001',
        has_more: false,
        messages: [
          { ts: '1700.1', thread_ts: '1700.1', user: 'U1', text: 'parent' },
          { ts: '1700.2', thread_ts: '1700.1', user: 'U2', text: 'reply' },
        ],
      }
    },
  }
  const tool = buildThreadTool({ clientProvider: () => fake, configProvider: CFG })
  const value = await tool.execute({ channel: '#general', thread_ts: '1700.1' })
  assertLosslessJson(value)
  assert.deepEqual(captured, { channel: '#general', thread_ts: '1700.1', limit: 50 })
  await assert.rejects(() => tool.execute({ channel: '#general' }), /thread_ts/)
})

test('slack_upload 校验 content/file_path 对齐语义、空白兼容、缩进保留与严格 thread_ts', async () => {
  const captured = []
  const fake = {
    async uploadFile(params) {
      captured.push(params)
      return { ok: true, channel: 'C001', file_id: 'F001', filename: params.filename, permalink: 'https://slack.test/F001' }
    },
  }
  const tool = buildUploadTool({ clientProvider: () => fake, configProvider: CFG })
  await assert.rejects(() => tool.execute({ filename: 'a.txt' }), /content.*file_path/)
  await assert.rejects(() => tool.execute({ filename: 'a.txt', content: '' }), /content 参数错误/)
  await assert.rejects(() => tool.execute({ filename: 'a.txt', content: 'hi', file_path: '/tmp/a.txt' }), /不能同时提供/)
  await assert.rejects(() => tool.execute({ filename: 'a.txt', file_path: 123 }), (err) => {
    assert.equal(err instanceof TypeError, false)
    assert.match(err.message, /file_path 参数错误/)
    return true
  })
  await assert.rejects(() => tool.execute({ filename: 'a.txt', content: 'hi', thread_ts: 123.45 }), /thread_ts/)

  // 空白 file_path 不应与 content 冲突；initial_comment 保留前导缩进
  const v1 = await tool.execute({
    filename: 'report.md',
    content: '# Done',
    file_path: '   ',
    title: 'Report',
    initial_comment: '  - indented note',
  })
  assertLosslessJson(v1)
  assert.deepEqual(captured[0], {
    channel: '#general',
    filename: 'report.md',
    content: '# Done',
    title: 'Report',
    initial_comment: '  - indented note',
  })
  assert.equal(v1.file_id, 'F001')
  assert.equal(v1.channel, 'C001')

  // 空字符串 content 不应与有效 file_path 冲突
  const v2 = await tool.execute({ filename: 'bin.png', content: '', file_path: ' /tmp/bin.png ' })
  assertLosslessJson(v2)
  assert.deepEqual(captured[1], {
    channel: '#general',
    filename: 'bin.png',
    file_path: '/tmp/bin.png',
  })
})

test('slack_react 规范化表情名并保留规范化频道 ID 返回纯 JSON', async () => {
  let captured = null
  const fake = {
    async addReaction(params) {
      captured = params
      return { ok: true, channel: 'C001' }
    },
  }
  const tool = buildReactTool({ clientProvider: () => fake, configProvider: CFG })
  const value = await tool.execute({ channel: '#general', timestamp: '1700.1', name: ':thumbsup:' })
  assertLosslessJson(value)
  assert.deepEqual(captured, { channel: '#general', timestamp: '1700.1', name: 'thumbsup' })
  assert.deepEqual(value, { ok: true, channel: 'C001', timestamp: '1700.1', name: 'thumbsup' })
  await assert.rejects(() => tool.execute({ channel: '#general', timestamp: '1700.1', name: ':::' }), /name 参数错误/)

  // 兼容旧 fake 未返回 channel 字段时回退入参
  const legacyTool = buildReactTool({
    clientProvider: () => ({ async addReaction() { return { ok: true } } }),
    configProvider: CFG,
  })
  const legacyVal = await legacyTool.execute({ channel: '#general', timestamp: '1700.1', name: 'eyes' })
  assert.deepEqual(legacyVal, { ok: true, channel: '#general', timestamp: '1700.1', name: 'eyes' })
})

test('slack_health execute 返回纯 JSON（无 undefined）', async () => {
  const health = buildHealthTool({
    configProvider: CFG,
    clientProvider: () => ({ async authTest() { return { ok: true, team: 'T' } } }),
    inboxProvider: () => createInboxQueue(),
  })
  const value = await health.execute({ verify: true })
  assertLosslessJson(value)
})

test('render 输出 text 内容块', () => {
  const tool = buildNotifyTool({ clientProvider: () => { throw new Error('unused') }, configProvider: CFG })
  const blocks = tool.output.render({}, { ts: 'T', channel: '#g' })
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'text')
  assert.match(blocks[0].text, /#g/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createWebSlackClient } from '../lib/slack-client.js'
import { buildNotifyTool, buildChannelsTool, mapSlackError, assertChannel, assertText } from '../lib/index.js'

const CFG = () => ({ token: 'xoxb-test', defaultChannel: '#general' })

test('真实 WebClient 不自动重试限流或服务端失败，缺失回执不会假报成功', async t => {
  let requests = 0, status = 503, payload = { ok: false, error: 'fixture_failure' }
  const server = createServer((_req, res) => { requests++; res.writeHead(status, { 'content-type': 'application/json', 'retry-after': '0' }); res.end(JSON.stringify(payload)) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const client = createWebSlackClient('synthetic-token', 'http://127.0.0.1:' + server.address().port + '/')
  for (const code of [503, 429]) {
    status = code; const before = requests
    await assert.rejects(client.postMessage({ channel: 'C1', text: 'local fixture only' }))
    assert.equal(requests - before, 1)
  }
  status = 200; payload = { ok: true }
  await assert.rejects(client.postMessage({ channel: 'C1', text: 'local fixture only' }), /无法确认提交结果/)
})

test('buildNotifyTool 用注入 client 调 postMessage，参数正确', async () => {
  let captured = null
  const fake = {
    async postMessage(params) { captured = params; return { ts: '1234.5678' } },
    async listChannels() { return [] },
  }
  const tool = buildNotifyTool({ clientProvider: () => fake, configProvider: CFG })
  const result = await tool.execute({ channel: '#general', text: '你好', thread_ts: '1234.0000' })
  assert.equal(captured.channel, '#general')
  assert.equal(captured.text, '你好')
  assert.equal(captured.thread_ts, '1234.0000')
  assert.deepEqual(result, { ts: '1234.5678', channel: '#general' })
})

test('不传 thread_ts 时 postMessage 不含该字段', async () => {
  let captured = null
  const fake = { async postMessage(p) { captured = p; return { ts: 't' } }, async listChannels() { return [] } }
  const tool = buildNotifyTool({ clientProvider: () => fake, configProvider: CFG })
  await tool.execute({ channel: '#general', text: 'x' })
  assert.equal('thread_ts' in captured, false)
})

test('mapSlackError 映射 invalid_auth / channel_not_found 为中文', () => {
  assert.match(mapSlackError({ data: { error: 'invalid_auth' } }), /token/)
  assert.match(mapSlackError({ data: { error: 'channel_not_found' } }), /频道/)
})

test('client 抛 invalid_auth 时 execute 抛中文 token 提示', async () => {
  const fake = { async postMessage() { throw { data: { error: 'invalid_auth' } } }, async listChannels() { return [] } }
  const tool = buildNotifyTool({ clientProvider: () => fake, configProvider: CFG })
  await assert.rejects(() => tool.execute({ channel: '#general', text: 'x' }), /token/)
})

test('client 抛 channel_not_found 时 execute 抛中文频道提示', async () => {
  const fake = { async postMessage() { throw { data: { error: 'channel_not_found' } } }, async listChannels() { return [] } }
  const tool = buildNotifyTool({ clientProvider: () => fake, configProvider: CFG })
  await assert.rejects(() => tool.execute({ channel: '#general', text: 'x' }), /频道/)
})

test('assertChannel / assertText 校验非法参数并规整', () => {
  assert.throws(() => assertChannel(''), /channel/)
  assert.throws(() => assertChannel(undefined), /channel/)
  assert.throws(() => assertText(''), /text/)
  assert.equal(assertChannel('  #general  '), '#general')
  // text 内容保留原样（仅校验非空），不 trim，避免破坏 Markdown 排版
  assert.equal(assertText('  hi  '), '  hi  ')
})

test('buildChannelsTool 返回可见频道列表', async () => {
  const fake = {
    async postMessage() { throw new Error('unused') },
    async listChannels() { return [{ id: 'C1', name: 'general' }, { id: 'C2', name: 'random' }] },
  }
  const tool = buildChannelsTool({ clientProvider: () => fake, configProvider: CFG })
  const value = await tool.execute()
  assert.deepEqual(value, { channels: [{ id: 'C1', name: 'general' }, { id: 'C2', name: 'random' }] })
})

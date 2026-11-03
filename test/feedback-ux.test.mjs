import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildChannelsTool, buildInboxTool, buildNotifyTool, buildReplyTool } from '../lib/index.js'
import { buildHealthTool } from '../lib/tools.js'

function deps(config, socket) {
  return {
    configProvider: () => config,
    clientProvider: () => { throw new Error('no network in tests') },
    inboxProvider: () => ({ drain: () => [], list: () => [], size: 0 }),
    socketStatusProvider: () => socket,
  }
}

const EMPTY_INBOX = { messages: [], remaining: 0 }

test('slack_inbox 空态：区分未配 appToken / 格式错 / 未连接 / 已连接无消息', () => {
  const noToken = buildInboxTool(deps({ token: 'xoxb-1' }))
  const noTokenText = noToken.output.render({}, EMPTY_INBOX)[0].text
  assert.match(noTokenText, /未配置 App-Level Token/)
  assert.match(noTokenText, /xapp-/)

  const badFormat = buildInboxTool(deps({ token: 'xoxb-1', appToken: 'not-an-app-token' }))
  assert.match(badFormat.output.render({}, EMPTY_INBOX)[0].text, /格式不对/)

  const reconnecting = buildInboxTool(deps({ token: 'xoxb-1', appToken: 'xapp-1' }, { state: 'reconnecting' }))
  const reconnectText = reconnecting.output.render({}, EMPTY_INBOX)[0].text
  assert.match(reconnectText, /未连接/)
  assert.match(reconnectText, /slack_health/)

  const connected = buildInboxTool(deps({ token: 'xoxb-1', appToken: 'xapp-1' }, { state: 'connected' }))
  const connectedText = connected.output.render({}, EMPTY_INBOX)[0].text
  assert.match(connectedText, /已连接/)
  assert.match(connectedText, /message\.channels/)
})

test('slack_health 失败时给出下一步', async () => {
  const health = buildHealthTool(deps({ defaultChannel: undefined }))
  const value = await health.execute({})
  assert.equal(value.ok, false)
  const text = health.output.render({}, value)[0].text
  assert.match(text, /自检：发现问题/)
  assert.match(text, /下一步：/)
  assert.match(text, /DSH_SLACK_TOKEN/)
})

test('slack_health Socket 未连上时下一步提到事件订阅与令牌', async () => {
  const health = buildHealthTool(deps({ token: 'xoxb-1', appToken: 'xapp-1' }, { state: 'auth_failed', attempts: 2, error: 'invalid_auth' }))
  const value = await health.execute({})
  assert.equal(value.ok, false)
  const text = health.output.render({}, value)[0].text
  assert.match(text, /下一步：/)
  assert.match(text, /message\.channels/)
  assert.match(text, /重新生成令牌/)
})

test('slack_channels 渲染带频道 ID，空列表带下一步', () => {
  const list = buildChannelsTool(deps({ token: 'xoxb-1' }))
  const empty = list.output.render({}, { channels: [] })[0].text
  assert.match(empty, /invite/)
  assert.match(empty, /channels:read/)
  const text = list.output.render({}, { channels: [{ id: 'C1', name: 'general' }] })[0].text
  assert.match(text, /#general（C1）/)
})

test('slack_notify / slack_reply 回执说明下一步（线程回复）', () => {
  const notify = buildNotifyTool(deps({ token: 'xoxb-1' }))
  assert.match(notify.output.render({}, { ts: 'T1', channel: '#g' })[0].text, /slack_reply/)
  const reply = buildReplyTool(deps({ token: 'xoxb-1' }))
  assert.match(reply.output.render({}, { ts: 'T2', channel: '#g' })[0].text, /thread_ts/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChannelsTool,
  buildInboxTool,
  buildNotifyTool,
  buildReplyTool,
  buildHistoryTool,
  buildThreadTool,
  buildUploadTool,
  buildReactTool,
} from '../lib/index.js'
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

test('slack_inbox 空态：区分未配 appToken / 格式错 / 未连接 / 已连接无消息（含群聊与提及事件提示）', () => {
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
  assert.match(connectedText, /message\.groups/)
  assert.match(connectedText, /message\.mpim/)
  assert.match(connectedText, /app_mention/)
})

test('slack_inbox 渲染 thread_ts、@提及标记与附件数', () => {
  const inbox = buildInboxTool(deps({ token: 'xoxb-1', appToken: 'xapp-1' }, { state: 'connected' }))
  const text = inbox.output.render({}, {
    remaining: 1,
    messages: [
      {
        ts: '1700.2',
        channel: 'C1',
        user: 'U1',
        text: '请看这个日志',
        thread_ts: '1700.1',
        event_type: 'app_mention',
        files: [{ name: 'err.log', mimetype: 'text/plain' }],
      },
    ],
  })[0].text
  assert.match(text, /\[@提及\]/)
  assert.match(text, /thread_ts: 1700\.1/)
  assert.match(text, /附件 1 个/)
  assert.match(text, /err\.log/)
  assert.match(text, /slack_reply/)
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
  assert.match(text, /app_mention/)
  assert.match(text, /重新生成令牌/)
})

test('slack_channels 渲染带频道 ID 与公开/私密/未加入标签，空列表带下一步', () => {
  const list = buildChannelsTool(deps({ token: 'xoxb-1' }))
  const empty = list.output.render({}, { channels: [] })[0].text
  assert.match(empty, /invite/)
  assert.match(empty, /channels:read/)
  assert.match(empty, /groups:read/)
  const text = list.output.render({}, {
    channels: [
      { id: 'C1', name: 'general', is_private: false, is_member: true },
      { id: 'G2', name: 'sec', is_private: true, is_member: true },
      { id: 'C3', name: 'open', is_private: false, is_member: false },
    ],
  })[0].text
  assert.match(text, /#general（C1）\[公开\]/)
  assert.match(text, /#sec（G2）\[私密\]/)
  assert.match(text, /#open（C3）\[公开·未加入\]/)
})

test('slack_notify / slack_reply 回执说明下一步（线程回复）', () => {
  const notify = buildNotifyTool(deps({ token: 'xoxb-1' }))
  assert.match(notify.output.render({}, { ts: 'T1', channel: '#g' })[0].text, /slack_reply/)
  const reply = buildReplyTool(deps({ token: 'xoxb-1' }))
  assert.match(reply.output.render({}, { ts: 'T2', channel: '#g' })[0].text, /thread_ts/)
})

test('Plan B 新工具（history / thread / upload / react）渲染可读中文结果', () => {
  const history = buildHistoryTool(deps({ token: 'xoxb-1' }))
  const histText = history.output.render({}, {
    channel: 'C001',
    has_more: true,
    messages: [{ ts: '1700.2', user: 'U1', userName: 'Alice', text: '构建通过', reply_count: 3, files: [{ name: 'ci.log' }] }],
  })[0].text
  assert.match(histText, /Alice（U1）/)
  assert.match(histText, /3 条回复/)
  assert.match(histText, /ci\.log/)
  assert.match(histText, /还有更早消息/)

  const thread = buildThreadTool(deps({ token: 'xoxb-1' }))
  const threadText = thread.output.render({}, {
    channel: 'C001',
    has_more: false,
    messages: [
      { ts: '1700.1', user: 'U1', text: '问题是什么？' },
      { ts: '1700.2', user: 'U2', text: '已修复' },
    ],
  })[0].text
  assert.match(threadText, /\[主消息\]/)
  assert.match(threadText, /\[回复 #1\]/)

  const upload = buildUploadTool(deps({ token: 'xoxb-1' }))
  const uploadText = upload.output.render({}, {
    ok: true,
    channel: 'C001',
    file_id: 'F001',
    filename: 'report.md',
    permalink: 'https://slack.test/F001',
  })[0].text
  assert.match(uploadText, /report\.md/)
  assert.match(uploadText, /C001/)
  assert.match(uploadText, /F001/)
  assert.match(uploadText, /https:\/\/slack\.test\/F001/)

  const react = buildReactTool(deps({ token: 'xoxb-1' }))
  const reactText = react.output.render({}, { ok: true, channel: 'C001', timestamp: '1700.1', name: 'thumbsup' })[0].text
  assert.match(reactText, /:thumbsup:/)
  assert.match(reactText, /1700\.1/)
})

test('全部九个工具的 output.render 对 null / undefined 安全（绝不抛 TypeError）', () => {
  const sharedDeps = deps({ token: 'xoxb-1' })
  const allTools = [
    buildNotifyTool(sharedDeps),
    buildChannelsTool(sharedDeps),
    buildInboxTool(sharedDeps),
    buildReplyTool(sharedDeps),
    buildHealthTool(sharedDeps),
    buildHistoryTool(sharedDeps),
    buildThreadTool(sharedDeps),
    buildUploadTool(sharedDeps),
    buildReactTool(sharedDeps),
  ]
  for (const tool of allTools) {
    for (const emptyVal of [null, undefined]) {
      const blocks = tool.output.render({}, emptyVal)
      assert.ok(Array.isArray(blocks) && blocks.length === 1, `${tool.name} render(${String(emptyVal)})`)
      assert.equal(blocks[0].type, 'text', tool.name)
      assert.equal(typeof blocks[0].text, 'string', tool.name)
      assert.ok(blocks[0].text.length > 0, tool.name)
    }
  }
})

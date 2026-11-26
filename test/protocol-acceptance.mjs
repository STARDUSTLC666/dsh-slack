/**
 * 协议级验收：用官方 @slack/web-api SDK 真实发起 HTTP 请求，打到本地假 Slack API。
 * 验证：postMessage（含 Markdown blocks 与规范化 channel）、thread_ts、listChannels（joined/all）、
 * authTest、getHistory、getThread、uploadFile（filesUploadV2 三步流）、addReaction、错误码中文映射。
 * 运行：node test/protocol-acceptance.mjs（或 pnpm run test:protocol）
 */
import assert from 'node:assert/strict'
import { startFakeSlackServer } from './fake-slack-server.mjs'
import { createWebSlackClient, mapSlackError } from '../lib/slack-client.js'

const server = startFakeSlackServer(0)
await server.start()
try {
  const client = createWebSlackClient('xoxb-test', `http://127.0.0.1:${server.port}/api/`)

  // 1. 普通发消息（校验 Markdown blocks 与规范化 channel ID 返回）
  const sent = await client.postMessage({ channel: '#general', text: 'hello **验收**' })
  assert.equal(sent.ts, '1700000000.000100')
  assert.equal(sent.channel, 'C001')
  const req1 = server.requests.find((r) => r.url.includes('chat.postMessage'))
  assert.ok(req1, '应有 postMessage 请求')
  assert.equal(req1.token, 'xoxb-test')
  const body1 = Object.fromEntries(new URLSearchParams(req1.body))
  assert.equal(body1.channel, '#general')
  assert.equal(body1.text, 'hello **验收**')
  assert.ok(body1.blocks, '短消息应附带 Markdown blocks')
  const blocks1 = JSON.parse(body1.blocks)
  assert.equal(blocks1[0].type, 'markdown')
  assert.equal(blocks1[0].text, 'hello **验收**')
  console.log('PASS 1: 发消息载荷、Markdown block、规范化 channel 与鉴权头')

  // 2. 线程回复
  const replied = await client.postMessage({ channel: 'C001', text: '线程回复', thread_ts: '1700000000.000100' })
  assert.equal(replied.channel, 'C001')
  const body2 = Object.fromEntries(new URLSearchParams(server.requests.at(-1).body))
  assert.equal(body2.thread_ts, '1700000000.000100')
  console.log('PASS 2: thread_ts 透传')

  // 3. 列频道：默认 joined (users.conversations) 与 all (conversations.list)
  const joined = await client.listChannels()
  assert.deepEqual(
    joined.map((c) => ({ id: c.id, name: c.name, is_private: c.is_private, is_member: c.is_member })),
    [
      { id: 'C001', name: 'general', is_private: false, is_member: true },
      { id: 'G003', name: 'secret', is_private: true, is_member: true },
    ],
  )
  assert.ok(server.requests.some((r) => r.url.includes('/users.conversations')), '默认应调用 users.conversations')

  const all = await client.listChannels(undefined, { scope: 'all' })
  assert.equal(all.length, 3)
  assert.ok(server.requests.some((r) => r.url.includes('/conversations.list')), 'scope=all 应调用 conversations.list')
  console.log('PASS 3: 频道解析（joined / all）')

  // 4. auth.test 在线鉴权与 scopes 提取
  const auth = await client.authTest()
  assert.equal(auth.ok, true)
  assert.equal(auth.team, 'Fake Workspace')
  assert.equal(auth.user_id, 'UBOT01')
  assert.ok(Array.isArray(auth.scopes) && auth.scopes.includes('chat:write'))
  console.log('PASS 4: auth.test 鉴权与权限提取')

  // 5. 历史消息（#频道名自动解析为 ID + 用户名补全）
  const history = await client.getHistory({ channel: '#general', limit: 10 })
  assert.equal(history.channel, 'C001')
  assert.equal(history.messages.length, 2)
  assert.equal(history.messages[0].userName, 'Alice')
  assert.equal(history.messages[0].files[0].name, 'build.log')
  console.log('PASS 5: conversations.history 频道解析与用户名补全')

  // 6. 线程上下文
  const thread = await client.getThread({ channel: '#general', thread_ts: '1700000002.000200' })
  assert.equal(thread.channel, 'C001')
  assert.equal(thread.messages.length, 2)
  assert.equal(thread.messages[1].text, '测试全部通过，可以发布')
  console.log('PASS 6: conversations.replies 线程读取')

  // 7. 文件上传（filesUploadV2 三步流）
  const uploaded = await client.uploadFile({
    channel: '#general',
    filename: 'summary.md',
    content: '# Acceptance Summary\nAll good.',
    title: 'Acceptance Summary',
    initial_comment: '验收报告已上传',
  })
  assert.equal(uploaded.ok, true)
  assert.equal(uploaded.channel, 'C001')
  assert.equal(uploaded.filename, 'summary.md')
  assert.ok(uploaded.file_id)
  assert.ok(server.requests.some((r) => r.url.includes('/files.getUploadURLExternal')))
  assert.ok(server.requests.some((r) => r.url.startsWith('/upload/')))
  assert.ok(server.requests.some((r) => r.url.includes('/files.completeUploadExternal')))
  console.log('PASS 7: filesUploadV2 三步上传流')

  // 8. 表情回应
  const reacted = await client.addReaction({ channel: '#general', timestamp: '1700000000.000100', name: ':thumbsup:' })
  assert.equal(reacted.ok, true)
  assert.equal(reacted.channel, 'C001')
  const reactReq = server.requests.filter((r) => r.url.includes('/reactions.add')).at(-1)
  assert.equal(new URLSearchParams(reactReq.body).get('name'), 'thumbsup')
  console.log('PASS 8: reactions.add 表情回应与规范化频道返回')

  // 9. 错误映射：invalid_auth / channel_not_found / already_reacted
  const bad = createWebSlackClient('xoxb-bad', `http://127.0.0.1:${server.port}/api/`)
  try { await bad.listChannels(); assert.fail('应抛错') } catch (e) {
    const msg = mapSlackError(e)
    assert.match(msg, /token|令牌/i)
    console.log('PASS 9a: invalid_auth 中文映射 ->', msg.slice(0, 40))
  }

  try { await client.postMessage({ channel: 'missing', text: 'x' }); assert.fail('应抛错') } catch (e) {
    const msg = mapSlackError(e)
    assert.match(msg, /频道|channel/i)
    console.log('PASS 9b: channel_not_found 中文映射 ->', msg.slice(0, 40))
  }

  try { await client.addReaction({ channel: 'C001', timestamp: '1700000000.000100', name: 'already' }); assert.fail('应抛错') } catch (e) {
    const msg = mapSlackError(e)
    assert.match(msg, /already_reacted|已添加/i)
    console.log('PASS 9c: already_reacted 中文映射 ->', msg.slice(0, 40))
  }

  console.log('SLACK PROTOCOL ACCEPTANCE: ALL PASSED')
} finally {
  await server.close()
}

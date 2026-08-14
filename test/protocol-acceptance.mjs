/**
 * 协议级验收：用官方 @slack/web-api SDK 真实发起 HTTP 请求，打到本地假 Slack API。
 * 验证：载荷结构（channel/text/thread_ts）、鉴权头、成功解析、错误码中文映射。
 * 运行：node test/protocol-acceptance.mjs（或 pnpm run test:protocol）
 */
import assert from 'node:assert/strict'
import { startFakeSlackServer } from './fake-slack-server.mjs'
import { createWebSlackClient, mapSlackError } from '../lib/slack-client.js'

const server = startFakeSlackServer(3999)
await server.start()
try {
  const client = createWebSlackClient('xoxb-test', 'http://127.0.0.1:3999/api/')

  // 1. 普通发消息
  const sent = await client.postMessage({ channel: 'C001', text: 'hello 验收' })
  assert.equal(sent.ts, '1700000000.000100')
  const req1 = server.requests.find((r) => r.url.includes('chat.postMessage'))
  assert.ok(req1, '应有 postMessage 请求')
  assert.equal(req1.token, 'xoxb-test')
  const body1 = Object.fromEntries(new URLSearchParams(req1.body))
  assert.equal(body1.channel, 'C001')
  assert.equal(body1.text, 'hello 验收')
  console.log('PASS 1: 发消息载荷与鉴权头')

  // 2. 线程回复
  await client.postMessage({ channel: 'C001', text: '线程回复', thread_ts: '1700000000.000100' })
  const body2 = Object.fromEntries(new URLSearchParams(server.requests.at(-1).body))
  assert.equal(body2.thread_ts, '1700000000.000100')
  console.log('PASS 2: thread_ts 透传')

  // 3. 列频道
  const channels = await client.listChannels()
  assert.deepEqual(channels, [{ id: 'C001', name: 'general' }, { id: 'C002', name: 'random' }])
  console.log('PASS 3: 频道解析')

  // 4. 错误映射：invalid_auth -> token 中文提示
  const bad = createWebSlackClient('xoxb-bad', 'http://127.0.0.1:3999/api/')
  try { await bad.listChannels(); assert.fail('应抛错') } catch (e) {
    const msg = mapSlackError(e)
    assert.match(msg, /token|令牌/i)
    console.log('PASS 4: invalid_auth 中文映射 ->', msg.slice(0, 40))
  }

  // 5. 错误映射：channel_not_found -> 频道中文提示
  try { await client.postMessage({ channel: 'missing', text: 'x' }); assert.fail('应抛错') } catch (e) {
    const msg = mapSlackError(e)
    assert.match(msg, /频道|channel/i)
    console.log('PASS 5: channel_not_found 中文映射 ->', msg.slice(0, 40))
  }

  console.log('SLACK PROTOCOL ACCEPTANCE: 5/5 PASSED')
} finally {
  await server.close()
}

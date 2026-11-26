import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { buildNotifyTool, buildReplyTool, buildChannelsTool, createWebSlackClient } from '../lib/index.js'

test('cancelled Slack tools cannot dispatch a message or start a channel query', async () => {
  let calls = 0
  const deps = { clientProvider: () => ({
    async postMessage() { calls++; return { ts: '1.0', channel: 'C1' } },
    async listChannels() { calls++; return [] },
  }), configProvider: () => ({ token: 'synthetic', defaultChannel: '' }) }
  const controller = new AbortController(), reason = new Error('turn cancelled')
  controller.abort(reason)
  for (const [tool, args] of [[buildNotifyTool(deps), { channel: 'C1', text: 'example' }], [buildReplyTool(deps), { channel: 'C1', text: 'example', thread_ts: '1.0' }], [buildChannelsTool(deps), {}]]) {
    await assert.rejects(tool.execute(args, { signal: controller.signal }), error => error === reason)
  }
  assert.equal(calls, 0)
})

test('Slack caller cancellation aborts the active HTTP request without a retry', async t => {
  let received, closed, requests = 0
  const started = new Promise(resolve => { received = resolve })
  const ended = new Promise(resolve => { closed = resolve })
  const server = createServer((request, response) => {
    requests++; request.resume(); response.on('close', closed); received()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)) })
  const client = createWebSlackClient('synthetic', `http://127.0.0.1:${server.address().port}/`)
  const controller = new AbortController()
  const sent = client.postMessage({ channel: 'C1', text: 'local fixture only' }, controller.signal)
  await started
  const rejected = assert.rejects(sent)
  controller.abort(new Error('turn cancelled'))
  await Promise.race([Promise.all([rejected, ended]), new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('caller cancellation did not stop the HTTP request')), 1000); timer.unref()
  })])
  assert.equal(requests, 1)
})

test('Slack tools forward caller cancellation and retain its original reason', async () => {
  for (const build of [buildNotifyTool, buildReplyTool, buildChannelsTool]) {
    const controller = new AbortController(), reason = new Error('caller stopped the turn')
    const capture = async signal => { assert.equal(signal, controller.signal); controller.abort(reason); throw new Error('SDK wrapped cancellation') }
    const tool = build({ configProvider: () => ({ token: 'synthetic' }), clientProvider: () => ({
      postMessage: (_params, signal) => capture(signal), listChannels: signal => capture(signal),
    }) })
    await assert.rejects(tool.execute({ channel: 'C1', text: 'example', thread_ts: '1.0' }, { signal: controller.signal }), error => error === reason)
  }
})

test('cancelling one Slack request cannot cancel a concurrent request', async t => {
  const pending = new Map()
  let receive
  const ready = new Promise(resolve => { receive = resolve })
  const server = createServer((request, response) => {
    let body = ''; request.on('data', chunk => { body += chunk }); request.on('end', () => {
      const key = new URLSearchParams(body).get('channel'); pending.set(key, response)
      if (pending.size === 2) receive()
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)) })
  const client = createWebSlackClient('synthetic', `http://127.0.0.1:${server.address().port}/`)
  const first = new AbortController(), second = new AbortController()
  const failed = assert.rejects(client.postMessage({ channel: 'C1', text: 'first' }, first.signal))
  const accepted = client.postMessage({ channel: 'C2', text: 'second' }, second.signal)
  await ready; first.abort(new Error('cancel first'))
  pending.get('C2').writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, ts: '2.0', channel: 'C2' }))
  await failed; assert.deepEqual(await accepted, { ts: '2.0', channel: 'C2' }); assert.equal(second.signal.aborted, false)
})

test('Plan B methods respect pre-aborted signals without issuing HTTP requests and isolate concurrent cancellations', async t => {
  let requests = 0
  const pending = new Map()
  let bothReady
  const ready = new Promise(resolve => { bothReady = resolve })
  const server = createServer((request, response) => {
    requests++
    request.resume()
    if (request.url.includes('conversations.history')) pending.set('history', response)
    else if (request.url.includes('auth.test')) pending.set('auth', response)
    if (pending.size === 2) bothReady()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)) })
  const client = createWebSlackClient('xoxb-test', `http://127.0.0.1:${server.address().port}/`)

  // Pre-aborted signal must reject immediately with zero HTTP requests
  const preAborted = new AbortController()
  const reason = new Error('already aborted')
  preAborted.abort(reason)
  await assert.rejects(client.authTest(preAborted.signal), e => e === reason)
  await assert.rejects(client.getHistory({ channel: 'C01234567' }, preAborted.signal), e => e === reason)
  await assert.rejects(client.getThread({ channel: 'C01234567', thread_ts: '1700.1' }, preAborted.signal), e => e === reason)
  await assert.rejects(client.uploadFile({ channel: 'C01234567', filename: 'a.txt', content: 'hi' }, preAborted.signal), e => e === reason)
  await assert.rejects(client.uploadFile({ channel: 'C01234567', filename: 'a.txt', file_path: 'Z:\\definitely-not-read.txt' }, preAborted.signal), e => e === reason)
  await assert.rejects(client.addReaction({ channel: 'C01234567', timestamp: '1700.1', name: 'thumbsup' }, preAborted.signal), e => e === reason)
  assert.equal(requests, 0)

  // Concurrent cancellation isolation across different WebClient methods
  const historyCtrl = new AbortController()
  const authCtrl = new AbortController()
  const historyPromise = assert.rejects(client.getHistory({ channel: 'C01234567' }, historyCtrl.signal))
  const authPromise = client.authTest(authCtrl.signal)
  await ready
  historyCtrl.abort(new Error('cancel history'))
  pending.get('auth').writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, team: 'Acme' }))
  await historyPromise
  assert.deepEqual(await authPromise, { ok: true, team: 'Acme' })
  assert.equal(authCtrl.signal.aborted, false)
})

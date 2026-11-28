import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInboxTrigger } from '../lib/trigger.js'
import { createInboxQueue } from '../lib/inbox.js'

function harness(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 })
  const ids = [], warnings = [], signals = []
  const state = { id: '', service: { run({ id }, signal) { ids.push(id); signals.push(signal) } } }
  const queue = createInboxQueue()
  const trigger = createInboxTrigger({ get: () => state.service }, () => state.id, () => 'UBOT', log => warnings.push(log))
  t.after(() => trigger.dispose())
  function receive(ts, extra = {}) {
    const row = queue.push({ channel: 'C1', ts, user: 'U1', text: 'hello', ...extra })
    if (row) trigger.onMessage(row)
  }
  return { ids, state, warnings, signals, queue, receive, dispose: trigger.dispose, tick: ms => t.mock.timers.tick(ms) }
}

test('only new qualifying inbox messages wake the selected task, with a single trailing delivery', t => {
  const h = harness(t)
  h.receive('1', { channel: 'D1' })
  h.state.id = 'task'
  h.tick(0)
  h.receive('2', { text: '<@UOTHER>' })
  h.receive('3', { channel: 'D1', user: 'UBOT' })
  h.tick(0)
  assert.deepEqual(h.ids, [])
  h.receive('4', { text: '<@UBOT> hi' })
  h.tick(0)
  assert.deepEqual(h.ids, ['task'])
  h.receive('4', { event_type: 'app_mention' })
  h.queue.drain(10)
  h.receive('4', { event_type: 'app_mention' })
  h.tick(60_000)
  assert.deepEqual(h.ids, ['task'], 'Slack retries must not schedule another delivery')
  h.receive('5')
  h.receive('5', { event_type: 'app_mention' })
  h.tick(0)
  h.receive('6', { channel: 'D1' })
  h.receive('7', { channel: 'D1' })
  h.tick(59_999)
  assert.deepEqual(h.ids, ['task', 'task'])
  h.tick(1)
  assert.deepEqual(h.ids, ['task', 'task', 'task'])
})

test('reconfiguration drops stale work, and disposal cancels pending and in-flight deliveries', t => {
  const h = harness(t)
  h.state.id = 'first'
  h.receive('1', { channel: 'D1' })
  h.tick(0)
  h.receive('2', { channel: 'D1' })
  h.state.id = 'second'
  h.tick(60_000)
  assert.deepEqual(h.ids, ['first'])
  h.receive('3', { channel: 'D1' })
  h.tick(0)
  h.receive('4', { channel: 'D1' })
  h.dispose()
  h.tick(60_000)
  assert.deepEqual(h.ids, ['first', 'second'])
  assert.ok(h.signals.every(signal => signal.aborted))
})

test('unavailable or throwing schedule service leaves the inbox available', t => {
  const h = harness(t)
  h.state.id = 'task'
  h.state.service = undefined
  h.receive('1', { channel: 'D1' })
  h.tick(0)
  h.state.service = { run() { throw new Error('fixture') } }
  h.receive('2', { channel: 'D1' })
  h.tick(1)
  assert.equal(h.queue.size, 2)
  assert.equal(h.warnings.length, 2)
})

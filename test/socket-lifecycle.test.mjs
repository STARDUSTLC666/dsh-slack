import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { startSocketModeClient } from '../lib/socket.js'

test('SDK reconnect rejection after token revocation does not terminate the host', () => {
  const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', `
    import { SocketModeClient } from '@slack/socket-mode'
    import { startSocketModeClient } from './lib/socket.js'
    let attempts = 0
    SocketModeClient.prototype.start = async function () {
      this.clientPingTimeoutMS = 1
      if (++attempts === 1) {
        this.emit('connected', {})
        queueMicrotask(() => this.emit('close'))
        return {}
      }
      throw Object.assign(new Error('invalid_auth'), {
        code: 'slack_webapi_platform_error', data: { error: 'invalid_auth' },
      })
    }
    const dispose = startSocketModeClient('xapp-synthetic-test', { onMessage() {} }, () => {}, { retryBaseMs: 5 })
    setTimeout(() => {
      const status = dispose.status?.()
      dispose()
      console.log(JSON.stringify({ attempts, status }))
    }, 150)
  `], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 5000 })
  assert.equal(child.status, 0, child.stderr)
  const result = JSON.parse(child.stdout.trim().split('\n').at(-1))
  assert.equal(result.attempts, 2)
  assert.equal(result.status.state, 'auth_failed')
  assert.equal(result.status.error, 'invalid_auth')
  assert.ok(!child.stdout.includes('xapp-synthetic-test'))
})

test('temporary disconnect retries once at a time and disposal cancels scheduled attempts', async () => {
  const client = new EventEmitter()
  let attempts = 0, disconnected = 0, concurrent = 0, maxConcurrent = 0
  client.start = async () => {
    concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent)
    try {
      if (++attempts === 1) throw Object.assign(new Error('offline'), { code: 'ECONNRESET' })
      client.emit('connected')
    } finally { concurrent-- }
  }
  client.disconnect = async () => { disconnected++; client.emit('disconnected') }
  const dispose = startSocketModeClient('xapp-synthetic', { onMessage() {} }, () => {}, {
    retryBaseMs: 5,
    createClient(options) { assert.equal(options.autoReconnectEnabled, false); return client },
  })
  try {
    await new Promise(resolve => setTimeout(resolve, 40))
    assert.equal(dispose.status().state, 'connected')
    assert.equal(attempts, 2)
    assert.equal(maxConcurrent, 1)
    client.emit('disconnected'); client.emit('disconnected')
    dispose(); dispose()
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(dispose.status().state, 'stopped')
    assert.equal(attempts, 2)
    assert.equal(disconnected, 1)
  } finally { dispose() }
})

test('late connection after disposal is closed and cannot deliver messages', async () => {
  const client = new EventEmitter()
  let finish, disconnected = 0, delivered = 0
  client.start = () => new Promise(resolve => { finish = resolve })
  client.disconnect = async () => { disconnected++; client.emit('disconnected') }
  const dispose = startSocketModeClient('xapp-synthetic', { onMessage() { delivered++ } }, () => {}, { createClient: () => client })
  await new Promise(resolve => setImmediate(resolve))
  dispose()
  client.emit('connected')
  client.emit('slack_event', { body: { event: { type: 'message', channel: 'C1', user: 'U1', ts: '1.0', text: 'late' } } })
  finish({})
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(dispose.status().state, 'stopped')
  assert.equal(delivered, 0)
  assert.ok(disconnected >= 2)
})

test('all permanent token failures stop retrying, including revoked tokens', async () => {
  for (const code of ['invalid_auth', 'not_authed', 'account_inactive', 'user_removed_from_team', 'team_disabled', 'token_revoked']) {
    const client = new EventEmitter()
    let attempts = 0
    client.start = async () => { attempts++; throw { data: { error: code } } }
    client.disconnect = async () => { client.emit('disconnected') }
    const dispose = startSocketModeClient('xapp-synthetic', { onMessage() {} }, () => {}, { retryBaseMs: 1, createClient: () => client })
    try {
      await new Promise(resolve => setTimeout(resolve, 8))
      assert.equal(dispose.status().state, 'auth_failed', code)
      assert.equal(dispose.status().error, code)
      assert.equal(attempts, 1, code)
    } finally { dispose() }
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { EnvHttpProxyAgent } from 'undici'
import { startSocketModeClient } from '../lib/socket.js'

const PROXY_KEYS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']

function withProxyEnv(overrides, fn) {
  const saved = Object.fromEntries(PROXY_KEYS.map((key) => [key, process.env[key]]))
  for (const key of PROXY_KEYS) delete process.env[key]
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value
  }
  const restore = () => {
    for (const key of PROXY_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result.finally(restore)
    }
    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

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
    const dispose = startSocketModeClient('xapp-synthetic-test', { onMessage() {} }, () => {}, { retryBaseMs: 5, jitter: false })
    setTimeout(() => {
      const status = dispose.status?.()
      dispose()
      console.log(JSON.stringify({ attempts, status }))
    }, 150)
  `], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 5000 })
  assert.equal(child.status, 0, child.stderr)
  const lines = child.stdout.trim().split('\n')
  assert.equal(lines.length, 1, `expected silent SDK logger without stdout spam, got: ${child.stdout}`)
  const result = JSON.parse(lines[0])
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
    jitter: false,
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
    const dispose = startSocketModeClient('xapp-synthetic', { onMessage() {} }, () => {}, { retryBaseMs: 1, jitter: false, createClient: () => client })
    try {
      await new Promise(resolve => setTimeout(resolve, 8))
      assert.equal(dispose.status().state, 'auth_failed', code)
      assert.equal(dispose.status().error, code)
      assert.equal(attempts, 1, code)
    } finally { dispose() }
  }
})

test('dispose during in-flight apps.connections.open aborts request and never opens zombie WebSocket', async () => {
  await withProxyEnv({}, async () => {
    let wsUpgrades = 0
    let requestAbortedByClient = false
    let openRequestReceived
    let resolveAborted
    const requestArrived = new Promise(resolve => { openRequestReceived = resolve })
    const clientAborted = new Promise(resolve => { resolveAborted = resolve })
    const timers = new Set()

    const server = http.createServer((req, res) => {
      if (req.url === '/api/apps.connections.open') {
        req.resume()
        openRequestReceived()
        res.on('close', () => {
          if (!res.writableEnded) {
            requestAbortedByClient = true
            resolveAborted()
          }
        })
        const timer = setTimeout(() => {
          timers.delete(timer)
          if (!res.writableEnded && !req.destroyed) {
            const { port } = server.address()
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: true, url: `ws://127.0.0.1:${port}/ws` }))
          }
        }, 500)
        timer.unref?.()
        timers.add(timer)
        return
      }
      res.writeHead(404)
      res.end()
    })
    server.on('upgrade', (_req, socket) => {
      wsUpgrades++
      socket.destroy()
    })

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    const warnings = []
    let dispose
    try {
      dispose = startSocketModeClient(
        'xapp-abort-test',
        { onMessage() {} },
        (message) => warnings.push(message),
        { slackApiUrl: `http://127.0.0.1:${port}/api/` },
      )
      await requestArrived
      dispose()
      const abortResult = await Promise.race([
        clientAborted.then(() => 'aborted'),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 300)),
      ])
      assert.equal(abortResult, 'aborted')
      await new Promise(resolve => setTimeout(resolve, 60))
      assert.equal(dispose.status().state, 'stopped')
      assert.equal(requestAbortedByClient, true)
      assert.equal(wsUpgrades, 0)
      assert.deepEqual(warnings, [])
    } finally {
      dispose?.()
      for (const timer of timers) clearTimeout(timer)
      await new Promise(resolve => server.close(resolve))
    }
  })
})

test('forwards valid slackApiUrl, injects silent logger, and fails closed without network on invalid slackApiUrl', async () => {
  let capturedValid
  const fakeClient = () => {
    const emitter = new EventEmitter()
    emitter.start = () => new Promise(() => {})
    emitter.disconnect = async () => {}
    return emitter
  }

  const disposeValid = startSocketModeClient('xapp-test', { onMessage() {} }, () => {}, {
    slackApiUrl: '  https://slack.enterprise.test/api/  ',
    createClient(options) {
      capturedValid = options
      return fakeClient()
    },
  })
  disposeValid()

  assert.equal(capturedValid.clientOptions.slackApiUrl, 'https://slack.enterprise.test/api/')
  assert.ok(capturedValid.logger)
  assert.equal(typeof capturedValid.logger.info, 'function')
  assert.equal(typeof capturedValid.logger.error, 'function')
  assert.equal(capturedValid.clientOptions.logger, capturedValid.logger)
  assert.equal(typeof capturedValid.clientOptions.fetch, 'function')

  let createClientCalls = 0
  const warnings = []
  const disposeInvalid = startSocketModeClient('xapp-enterprise-secret', { onMessage() {} }, (msg) => warnings.push(msg), {
    slackApiUrl: 'htps://enterprise.slack.com/api/',
    createClient() {
      createClientCalls++
      return fakeClient()
    },
  })
  assert.equal(createClientCalls, 0)
  assert.deepEqual(disposeInvalid.status(), { state: 'stopped', attempts: 0, error: 'invalid_slack_api_url' })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /slackApiUrl/)
  assert.ok(!warnings[0].includes('xapp-enterprise-secret'))
  disposeInvalid()
  disposeInvalid()

  // Real SDK path (no createClient override): verify ZERO fetch calls to public slack.com.
  await withProxyEnv({}, async () => {
    const originalFetch = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = async () => {
      fetchCalls++
      throw new Error('should never hit network on invalid slackApiUrl')
    }
    try {
      const disposeReal = startSocketModeClient('xapp-enterprise-secret', { onMessage() {} }, () => {}, {
        slackApiUrl: 'htps://enterprise.slack.com/api/',
      })
      await new Promise(resolve => setTimeout(resolve, 25))
      assert.equal(fetchCalls, 0)
      assert.deepEqual(disposeReal.status(), { state: 'stopped', attempts: 0, error: 'invalid_slack_api_url' })
      disposeReal()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('attaches single owned proxy dispatcher when valid proxy env is set, reuses it for fetch, closes it on dispose, and survives malformed proxy env', async () => {
  const fakeClient = () => {
    const emitter = new EventEmitter()
    emitter.start = () => new Promise(() => {})
    emitter.disconnect = async () => {}
    return emitter
  }

  withProxyEnv({}, () => {
    let captured
    const dispose = startSocketModeClient('xapp-no-proxy', { onMessage() {} }, () => {}, {
      createClient(options) {
        captured = options
        return fakeClient()
      },
    })
    dispose()
    assert.equal('dispatcher' in captured, false)
    assert.equal(captured.dispatcher, undefined)
  })

  await withProxyEnv({ HTTPS_PROXY: 'http://127.0.0.1:8888' }, async () => {
    let captured
    let closeCalls = 0
    let dispatchCalls = 0
    const dispose = startSocketModeClient('xapp-with-proxy', { onMessage() {} }, () => {}, {
      createClient(options) {
        captured = options
        const originalClose = options.dispatcher.close.bind(options.dispatcher)
        options.dispatcher.close = (...args) => {
          if (args.length === 0) closeCalls++
          return originalClose(...args)
        }
        options.dispatcher.dispatch = (_opts, handler) => {
          dispatchCalls++
          const err = Object.assign(new Error('intercepted-proxy-dispatch'), { code: 'ECONNREFUSED' })
          if (typeof handler.onResponseError === 'function') handler.onResponseError(null, err)
          else if (typeof handler.onError === 'function') handler.onError(err)
          else throw err
          return false
        }
        return fakeClient()
      },
    })
    assert.ok(captured.dispatcher instanceof EnvHttpProxyAgent)
    assert.equal(closeCalls, 0)
    assert.equal(captured.dispatcher.closed, false)
    await assert.rejects(() => captured.clientOptions.fetch('https://slack.invalid/api/apps.connections.open', { method: 'POST' }))
    assert.equal(dispatchCalls, 1)
    dispose()
    dispose()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(closeCalls, 1)
    assert.equal(captured.dispatcher.closed, true)
  })

  for (const badProxy of ['127.0.0.1:7890', 'socks5h://alice:topsecret@127.0.0.1:7890', 'ftp://127.0.0.1:7890']) {
    withProxyEnv({ HTTPS_PROXY: badProxy }, () => {
      let captured
      const warnings = []
      const dispose = startSocketModeClient('xapp-bad-proxy', { onMessage() {} }, (msg) => warnings.push(msg), {
        createClient(options) {
          captured = options
          return fakeClient()
        },
      })
      dispose()
      assert.equal('dispatcher' in captured, false)
      assert.equal(warnings.length, 1)
      assert.match(warnings[0], /HTTPS_PROXY/)
      assert.ok(!warnings[0].includes('topsecret'))
    })
  }
})

test('invokes onConnected on initial connect and reconnects, catches callback errors, and skips after dispose', async () => {
  const client = new EventEmitter()
  client.start = async () => {}
  client.disconnect = async () => {}

  let calls = 0
  const warnings = []
  const dispose = startSocketModeClient(
    'xapp-on-connected',
    { onMessage() {} },
    (msg) => warnings.push(msg),
    {
      onConnected() {
        calls++
        if (calls === 2) throw new Error('refresh failed')
      },
      createClient: () => client,
    },
  )

  try {
    await new Promise(resolve => setImmediate(resolve))
    client.emit('connected')
    assert.equal(calls, 1)
    assert.equal(dispose.status().state, 'connected')
    assert.equal(warnings.length, 0)

    client.emit('connected')
    assert.equal(calls, 2)
    assert.equal(dispose.status().state, 'connected')
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /onConnected/)

    dispose()
    client.emit('connected')
    assert.equal(calls, 2)
  } finally {
    dispose()
  }
})

test('filters self messages via botUserId and dynamic botUserIdProvider', async () => {
  const client = new EventEmitter()
  client.start = async () => { client.emit('connected') }
  client.disconnect = async () => {}

  const received = []
  let resolvedBotId
  const dispose = startSocketModeClient(
    'xapp-bot-filter',
    { onMessage(message) { received.push(message) } },
    () => {},
    {
      botUserId: 'UFALLBACK',
      botUserIdProvider: () => resolvedBotId,
      createClient: () => client,
    },
  )

  try {
    await new Promise(resolve => setImmediate(resolve))
    // Before provider resolves, falls back to static botUserId.
    client.emit('slack_event', { type: 'events_api', body: { event: { type: 'message', channel: 'C1', user: 'UFALLBACK', ts: '1.0', text: 'fallback self' } } })
    client.emit('slack_event', { type: 'events_api', body: { event: { type: 'message', channel: 'C1', user: 'UUSER', ts: '1.1', text: 'human' } } })

    // Once provider resolves, filters dynamic bot user ID.
    resolvedBotId = 'UDYNAMIC'
    client.emit('slack_event', { type: 'events_api', body: { event: { type: 'message', channel: 'C1', user: 'UDYNAMIC', ts: '1.2', text: 'dynamic self' } } })
    client.emit('slack_event', { type: 'events_api', body: { event: { type: 'app_mention', channel: 'C1', user: 'UUSER2', ts: '1.3', text: '<@UDYNAMIC> hi' } } })

    assert.deepEqual(received, [
      { ts: '1.1', channel: 'C1', user: 'UUSER', text: 'human' },
      { ts: '1.3', channel: 'C1', user: 'UUSER2', text: '<@UDYNAMIC> hi', event_type: 'app_mention' },
    ])
  } finally {
    dispose()
  }
})

test('logs ack() rejection instead of swallowing it silently', async () => {
  const client = new EventEmitter()
  client.start = async () => { client.emit('connected') }
  client.disconnect = async () => {}

  const warnings = []
  const dispose = startSocketModeClient(
    'xapp-ack-fail',
    { onMessage() {} },
    (message) => warnings.push(message),
    { createClient: () => client },
  )

  try {
    await new Promise(resolve => setImmediate(resolve))
    client.emit('slack_event', {
      type: 'events_api',
      body: { event: { type: 'message', channel: 'C1', user: 'U1', ts: '1.0', text: 'hello' } },
      ack: async () => {
        throw Object.assign(new Error('socket closed'), { code: 'slack_socket_mode_send_while_disconnected_error' })
      },
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /Socket Mode 事件确认失败/)
    assert.match(warnings[0], /slack_socket_mode_send_while_disconnected_error/)
  } finally {
    dispose()
  }
})

test('backoff jitter scales retry delay within 0.75x-1.25x and can be disabled via jitter: false', async () => {
  async function captureRetryDelay({ jitter, randomValue, retryBaseMs }) {
    const originalRandom = Math.random
    const originalSetTimeout = globalThis.setTimeout
    const delays = []
    Math.random = () => randomValue
    globalThis.setTimeout = (fn, delay, ...args) => {
      delays.push(delay)
      const handle = originalSetTimeout(fn, 60000, ...args)
      handle.unref?.()
      return handle
    }
    const client = new EventEmitter()
    client.start = async () => { throw Object.assign(new Error('offline'), { code: 'ECONNRESET' }) }
    client.disconnect = async () => {}
    let dispose
    try {
      dispose = startSocketModeClient('xapp-jitter', { onMessage() {} }, () => {}, {
        retryBaseMs,
        jitter,
        createClient: () => client,
      })
      await new Promise(resolve => setImmediate(resolve))
      await new Promise(resolve => setImmediate(resolve))
      return delays[0]
    } finally {
      dispose?.()
      Math.random = originalRandom
      globalThis.setTimeout = originalSetTimeout
    }
  }

  // First failure increments failures to 1 -> baseDelay = 1000 * 2^1 = 2000.
  assert.equal(await captureRetryDelay({ jitter: false, randomValue: 0, retryBaseMs: 1000 }), 2000)
  assert.equal(await captureRetryDelay({ jitter: true, randomValue: 0, retryBaseMs: 1000 }), 1500)
  assert.equal(await captureRetryDelay({ jitter: true, randomValue: 1, retryBaseMs: 1000 }), 2500)
  // Upper clamp to 30000 even when baseDelay is at cap and randomValue = 1.
  assert.equal(await captureRetryDelay({ jitter: true, randomValue: 1, retryBaseMs: 20000 }), 30000)
})

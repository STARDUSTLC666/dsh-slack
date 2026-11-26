/** Socket Mode lifecycle: SDK auto-reconnect is disabled; every attempt is owned and caught here. */
import { SocketModeClient } from '@slack/socket-mode'
import { isValidSlackApiUrl } from './config.js'
import { parseMessageEvent, type InboxMessage } from './inbox.js'
import {
  createSilentSlackLogger,
  createSocketModeProxyDispatcher,
  createTransportFetch,
  inspectProxyEnv,
} from './transport.js'

export interface SocketMessageHandler { onMessage(message: InboxMessage): void }
type Warn = (message: string, ...args: unknown[]) => void
export interface SocketStatus {
  state: 'connecting' | 'connected' | 'reconnecting' | 'auth_failed' | 'stopped'
  attempts: number
  error?: string
  /** 当 Slack hello 帧回报 >1 个并发连接时记录，提示事件可能被多实例分流。 */
  activeConnections?: number
}
export interface SocketClientLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown
  start(): Promise<unknown>
  disconnect(): Promise<unknown>
  listeners?(event: string): Array<(...args: unknown[]) => unknown>
  off?(event: string, listener: (...args: unknown[]) => void): unknown
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown
  send?(envelopeId: string, body?: unknown): Promise<unknown>
}
export interface SocketLifecycleOptions {
  retryBaseMs?: number
  jitter?: boolean
  /** WebSocket 客户端 pong 超时（毫秒）；默认 15,000ms，避免公网/代理抖动触发 SDK 默认 5s 误断连。 */
  clientPingTimeoutMs?: number
  slackApiUrl?: string
  botUserId?: string
  botUserIdProvider?: () => string | undefined
  onConnected?: () => void
  createClient?: (options: ConstructorParameters<typeof SocketModeClient>[0]) => SocketClientLike
}
export type SocketDisposer = (() => void) & { status(): SocketStatus }

type SocketClientOptionsArg = NonNullable<ConstructorParameters<typeof SocketModeClient>[0]>
type SocketWebClientOptions = NonNullable<SocketClientOptionsArg['clientOptions']>

const DEFAULT_CLIENT_PING_TIMEOUT_MS = 15000

const AUTH_ERRORS = new Set([
  'invalid_auth',
  'not_authed',
  'account_inactive',
  'user_removed_from_team',
  'team_disabled',
  'token_revoked',
  'token_expired',
  'missing_scope',
  'not_allowed_token_type',
  'org_login_required',
  'team_access_not_granted',
  'cannot_find_service',
  'invalid_token',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSocketEnvelope(data: unknown): Record<string, unknown> | null {
  let text: string
  if (typeof data === 'string') {
    text = data
  } else if (Buffer.isBuffer(data)) {
    text = data.toString('utf8')
  } else if (data instanceof ArrayBuffer) {
    text = new TextDecoder().decode(data)
  } else if (ArrayBuffer.isView(data)) {
    text = new TextDecoder().decode(data)
  } else {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function errorCode(error: unknown): string {
  const value = error as { data?: { error?: unknown }; code?: unknown } | null
  const code = value?.data?.error ?? value?.code
  if (typeof code === 'string' && (AUTH_ERRORS.has(code) || /^(?:E[A-Z0-9_]+|slack_(?:webapi|socket_mode)_[a-z_]+)$/.test(code))) {
    return code
  }
  return 'connection_error'
}

function createAbortError(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException('Socket Mode connection aborted', 'AbortError')
}

export function startSocketModeClient(
  appToken: string,
  handler: SocketMessageHandler,
  warn: Warn,
  options: SocketLifecycleOptions = {},
): SocketDisposer {
  const log = (message: string, error?: unknown) => {
    try {
      warn('[dsh-slack] ' + message + (error === undefined ? '' : '（' + errorCode(error) + '）'))
    } catch {
      /* Logging must not create an unhandled rejection. */
    }
  }

  const rawSlackApiUrl = typeof options.slackApiUrl === 'string' ? options.slackApiUrl.trim() : ''
  if (rawSlackApiUrl !== '' && !isValidSlackApiUrl(rawSlackApiUrl)) {
    const invalidStatus: SocketStatus = { state: 'stopped', attempts: 0, error: 'invalid_slack_api_url' }
    log('slackApiUrl 格式无效（必须为 http:// 或 https:// URL），已跳过 Socket Mode 启动，不会回退连接公网 slack.com')
    return Object.assign(() => {}, { status: () => ({ ...invalidStatus }) })
  }
  const slackApiUrl = rawSlackApiUrl !== '' ? rawSlackApiUrl : undefined

  const proxyInspection = inspectProxyEnv()
  if (proxyInspection.invalidEntries.length > 0) {
    const detail = proxyInspection.invalidEntries
      .map((entry) => entry.reason)
      .join('；')
    log('检测到无效或暂不支持的代理环境变量，已忽略该代理配置：' + detail)
  }

  const silentLogger = createSilentSlackLogger()
  const dispatcher = createSocketModeProxyDispatcher()

  let status: SocketStatus = { state: 'connecting', attempts: 0 }
  let stopped = false, fatal = false, connecting = false, needsRetry = false, failures = 0
  let dispatcherClosed = false
  let activeConnections: number | undefined
  let warnedSharedConnections = false
  let retry: ReturnType<typeof setTimeout> | undefined
  let attemptController: AbortController | undefined

  const transportFetch: NonNullable<SocketWebClientOptions['fetch']> = async (url, init) => {
    const signal = attemptController?.signal
    if (stopped || fatal || signal?.aborted) {
      throw createAbortError(signal)
    }
    const response = await createTransportFetch(signal, undefined, { dispatcher })(url, init)
    if (stopped || fatal || signal?.aborted) {
      void response.body?.cancel?.().catch(() => {})
      throw createAbortError(signal)
    }
    return response
  }

  const clientPingTimeout = Number.isFinite(options.clientPingTimeoutMs)
    ? Math.max(1000, Math.min(60000, Math.trunc(options.clientPingTimeoutMs!)))
    : DEFAULT_CLIENT_PING_TIMEOUT_MS

  const clientOptions = {
    timeout: 15000,
    retryConfig: { retries: 0 },
    rejectRateLimitedCalls: true,
    logger: silentLogger,
    fetch: transportFetch,
    ...(slackApiUrl !== undefined ? { slackApiUrl } : {}),
  } as SocketWebClientOptions

  const clientConfig: SocketClientOptionsArg = {
    appToken,
    autoReconnectEnabled: false,
    clientPingTimeout,
    logger: silentLogger as unknown as SocketClientOptionsArg['logger'],
    ...(dispatcher !== undefined ? { dispatcher } : {}),
    clientOptions,
  }

  const client = (options.createClient ?? (config => new SocketModeClient(config)))(clientConfig)
  const retryBase = Number.isFinite(options.retryBaseMs) ? Math.max(1, Math.min(30000, options.retryBaseMs!)) : 1000
  const jitterEnabled = options.jitter !== false

  // 防护 @slack/socket-mode 3.x 已知崩溃缺陷：当 Slack 下发不含 event 的 events_api 控制包
  // （如 app_rate_limited）时，SDK 的 async onWebSocketMessage 会直接解引用 payload.event.type
  // 导致未捕获 Promise 拒绝；同时在 hello 帧检测 num_connections > 1 提醒多实例分流。
  const originalWsListeners = typeof client.listeners === 'function'
    ? [...client.listeners('ws_message')]
    : []
  for (const listener of originalWsListeners) {
    if (typeof client.off === 'function') client.off('ws_message', listener)
    else if (typeof client.removeListener === 'function') client.removeListener('ws_message', listener)
  }
  client.on('ws_message', (data: unknown, isBinary?: unknown) => {
    if (isBinary !== true) {
      const envelope = parseSocketEnvelope(data)
      if (envelope !== null) {
        if (envelope.type === 'hello') {
          const count = envelope.num_connections
          if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) {
            activeConnections = count
            if (status.state === 'connected') {
              status = {
                state: 'connected',
                attempts: status.attempts,
                ...(count > 1 ? { activeConnections: count } : {}),
              }
            }
            if (count <= 1) {
              warnedSharedConnections = false
            } else if (!warnedSharedConnections && !stopped && !fatal) {
              warnedSharedConnections = true
              log(`检测到当前 Slack App 存在 ${count} 个并发 Socket Mode 连接，Slack 会将事件分流到不同连接；如出现收件箱漏收消息，请检查是否有其他实例共用同一 xapp- 令牌`)
            }
          }
        } else if (envelope.type === 'disconnect') {
          if (envelope.reason === 'link_disabled' && !stopped && !fatal) {
            log('Slack 下发 disconnect（link_disabled）：App 的 Socket Mode 可能已被关闭或应用已卸载，请检查 Slack App 设置')
          }
        } else if (envelope.type === 'events_api') {
          const payload = isPlainObject(envelope.payload) ? envelope.payload : undefined
          const innerEvent = payload !== undefined && isPlainObject(payload.event) ? payload.event : undefined
          const eventType = typeof innerEvent?.type === 'string' ? innerEvent.type.trim() : ''
          if (eventType === '') {
            if (!stopped && !fatal) {
              if (payload?.type === 'app_rate_limited') {
                log('Slack Events API 触发应用限流（app_rate_limited），已确认该控制通知')
              } else {
                log('收到缺少 event.type 的 Slack Events API 控制包，已忽略并确认')
              }
              const envelopeId = typeof envelope.envelope_id === 'string' ? envelope.envelope_id.trim() : ''
              const sendFn: unknown = Reflect.get(client as object, 'send')
              if (envelopeId !== '' && typeof sendFn === 'function') {
                void Promise.resolve()
                  .then(() => (sendFn as (id: string, body?: unknown) => Promise<unknown>).call(client, envelopeId))
                  .catch(error => log('Socket Mode 控制包确认失败', error))
              }
            }
            return
          }
        }
      }
    }
    for (const listener of originalWsListeners) {
      try {
        const result = listener.call(client, data, isBinary)
        if (result !== null && typeof result === 'object' && typeof (result as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(result).catch(error => log('处理 Socket Mode 消息帧失败', error))
        }
      } catch (error) {
        log('处理 Socket Mode 消息帧失败', error)
      }
    }
  })

  const closeDispatcher = () => {
    if (dispatcher === undefined || dispatcherClosed) return
    dispatcherClosed = true
    void Promise.resolve().then(() => dispatcher.close()).catch(() => {})
  }
  const disconnect = (onSettled?: () => void) => {
    void Promise.resolve()
      .then(() => client.disconnect())
      .catch(error => log('Socket Mode 断开失败', error))
      .finally(() => onSettled?.())
  }
  const computeDelay = (): number => {
    const baseDelay = Math.min(30000, retryBase * 2 ** Math.min(failures, 5))
    if (!jitterEnabled) return baseDelay
    return Math.max(1, Math.min(30000, Math.round(baseDelay * (0.75 + Math.random() * 0.5))))
  }
  const schedule = () => {
    if (stopped || fatal || connecting || retry !== undefined) return
    status = { ...status, state: 'reconnecting' }
    const delay = computeDelay()
    retry = setTimeout(() => { retry = undefined; connect() }, delay)
    retry.unref?.()
  }
  const failure = (error: unknown) => {
    const code = errorCode(error)
    fatal = AUTH_ERRORS.has(code)
    activeConnections = undefined
    status = { state: fatal ? 'auth_failed' : 'reconnecting', attempts: status.attempts, error: code }
    failures++
    needsRetry = !fatal
    log(fatal ? 'Socket Mode 令牌或权限无效，已停止重连；更新 App-Level Token 后重启插件' : 'Socket Mode 连接失败，将退避重试', error)
    if (fatal) {
      attemptController?.abort()
      disconnect(closeDispatcher)
    }
  }
  const connect = () => {
    if (stopped || fatal || connecting) return
    connecting = true
    needsRetry = false
    activeConnections = undefined
    attemptController?.abort()
    const controller = new AbortController()
    attemptController = controller
    status = { state: status.attempts === 0 ? 'connecting' : 'reconnecting', attempts: status.attempts + 1 }
    void Promise.resolve().then(() => {
      if (!stopped && !fatal) return client.start()
    }).then(() => {
      if (stopped || fatal) disconnect()
    }).catch(error => {
      if (!stopped && !fatal) failure(error)
    }).finally(() => {
      if (attemptController === controller) attemptController = undefined
      connecting = false
      if (needsRetry) schedule()
    })
  }
  client.on('connected', () => {
    if (stopped || fatal) { disconnect(); return }
    failures = 0
    needsRetry = false
    status = {
      state: 'connected',
      attempts: status.attempts,
      ...(activeConnections !== undefined && activeConnections > 1 ? { activeConnections } : {}),
    }
    if (typeof options.onConnected === 'function') {
      try {
        options.onConnected()
      } catch (error) {
        log('Socket Mode onConnected 回调失败', error)
      }
    }
  })
  client.on('disconnected', () => {
    if (stopped || fatal) return
    activeConnections = undefined
    needsRetry = true
    status = { state: 'reconnecting', attempts: status.attempts }
    schedule()
  })
  client.on('error', error => {
    if (stopped || fatal) return
    if (AUTH_ERRORS.has(errorCode(error))) failure(error)
    else log('Socket Mode 连接错误', error)
  })
  client.on('slack_event', (...args: unknown[]) => {
    if (stopped || fatal) return
    const raw = args[0] as { ack?: () => Promise<unknown> } | null
    try {
      const botUserId = options.botUserIdProvider?.() ?? options.botUserId
      const message = parseMessageEvent(raw, botUserId)
      if (message !== null) handler.onMessage(message)
    } catch (error) {
      log('解析 Socket Mode 事件失败', error)
    } finally {
      if (typeof raw?.ack === 'function') {
        void Promise.resolve().then(() => raw.ack!()).catch(error => log('Socket Mode 事件确认失败', error))
      }
    }
  })
  connect()
  return Object.assign(() => {
    if (stopped) return
    stopped = true
    activeConnections = undefined
    attemptController?.abort()
    if (retry !== undefined) clearTimeout(retry)
    retry = undefined
    status = { state: 'stopped', attempts: status.attempts, ...(status.error !== undefined ? { error: status.error } : {}) }
    disconnect(closeDispatcher)
  }, { status: () => ({ ...status }) })
}

/** Socket Mode lifecycle: SDK auto-reconnect is disabled; every attempt is owned and caught here. */
import { SocketModeClient } from '@slack/socket-mode'
import { isValidSlackApiUrl } from './config.js'
import { parseMessageEvent, type InboxMessage } from './inbox.js'
import { createProxyDispatcher, createSilentSlackLogger, createTransportFetch, inspectProxyEnv } from './transport.js'

export interface SocketMessageHandler { onMessage(message: InboxMessage): void }
type Warn = (message: string, ...args: unknown[]) => void
export interface SocketStatus {
  state: 'connecting' | 'connected' | 'reconnecting' | 'auth_failed' | 'stopped'
  attempts: number
  error?: string
}
export interface SocketClientLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown
  start(): Promise<unknown>
  disconnect(): Promise<unknown>
}
export interface SocketLifecycleOptions {
  retryBaseMs?: number
  jitter?: boolean
  slackApiUrl?: string
  botUserId?: string
  botUserIdProvider?: () => string | undefined
  onConnected?: () => void
  createClient?: (options: ConstructorParameters<typeof SocketModeClient>[0]) => SocketClientLike
}
export type SocketDisposer = (() => void) & { status(): SocketStatus }

type SocketClientOptionsArg = NonNullable<ConstructorParameters<typeof SocketModeClient>[0]>
type SocketWebClientOptions = NonNullable<SocketClientOptionsArg['clientOptions']>

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
])

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
  const dispatcher = createProxyDispatcher()

  let status: SocketStatus = { state: 'connecting', attempts: 0 }
  let stopped = false, fatal = false, connecting = false, needsRetry = false, failures = 0
  let dispatcherClosed = false
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
    logger: silentLogger as unknown as SocketClientOptionsArg['logger'],
    ...(dispatcher !== undefined ? { dispatcher } : {}),
    clientOptions,
  }

  const client = (options.createClient ?? (config => new SocketModeClient(config)))(clientConfig)
  const retryBase = Number.isFinite(options.retryBaseMs) ? Math.max(1, Math.min(30000, options.retryBaseMs!)) : 1000
  const jitterEnabled = options.jitter !== false

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
    status = { ...status, state: fatal ? 'auth_failed' : 'reconnecting', error: code }
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
    attemptController?.abort()
    const controller = new AbortController()
    attemptController = controller
    status = { ...status, state: status.attempts === 0 ? 'connecting' : 'reconnecting', attempts: status.attempts + 1 }
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
    status = { state: 'connected', attempts: status.attempts }
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
    needsRetry = true
    status = { ...status, state: 'reconnecting' }
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
    attemptController?.abort()
    if (retry !== undefined) clearTimeout(retry)
    retry = undefined
    status = { ...status, state: 'stopped' }
    disconnect(closeDispatcher)
  }, { status: () => ({ ...status }) })
}

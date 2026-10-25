/** Socket Mode lifecycle: SDK auto-reconnect is disabled; every attempt is owned and caught here. */
import { SocketModeClient } from '@slack/socket-mode'
import { parseMessageEvent, type InboxMessage } from './inbox.js'

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
  createClient?: (options: ConstructorParameters<typeof SocketModeClient>[0]) => SocketClientLike
}
export type SocketDisposer = (() => void) & { status(): SocketStatus }
const AUTH_ERRORS = new Set(['invalid_auth', 'not_authed', 'account_inactive', 'user_removed_from_team', 'team_disabled', 'token_revoked', 'token_expired', 'missing_scope', 'not_allowed_token_type'])
function errorCode(error: unknown): string {
  const value = error as { data?: { error?: unknown }; code?: unknown } | null
  const code = value?.data?.error ?? value?.code
  if (typeof code === 'string' && (AUTH_ERRORS.has(code) || /^(?:E[A-Z0-9_]+|slack_webapi_[a-z_]+)$/.test(code))) return code
  return 'connection_error'
}
export function startSocketModeClient(appToken: string, handler: SocketMessageHandler, warn: Warn, options: SocketLifecycleOptions = {}): SocketDisposer {
  const client = (options.createClient ?? (config => new SocketModeClient(config)))({
    appToken, autoReconnectEnabled: false,
    clientOptions: { timeout: 15000, retryConfig: { retries: 0 }, rejectRateLimitedCalls: true },
  })
  const retryBase = Number.isFinite(options.retryBaseMs) ? Math.max(1, Math.min(30000, options.retryBaseMs!)) : 1000
  let status: SocketStatus = { state: 'connecting', attempts: 0 }
  let stopped = false, fatal = false, connecting = false, needsRetry = false, failures = 0
  let retry: ReturnType<typeof setTimeout> | undefined
  const log = (message: string, error?: unknown) => {
    try { warn('[dsh-slack] ' + message + (error === undefined ? '' : '（' + errorCode(error) + '）')) } catch { /* Logging must not create an unhandled rejection. */ }
  }
  const disconnect = () => { void Promise.resolve().then(() => client.disconnect()).catch(error => log('Socket Mode 断开失败', error)) }
  const schedule = () => {
    if (stopped || fatal || connecting || retry !== undefined) return
    status = { ...status, state: 'reconnecting' }
    const delay = Math.min(30000, retryBase * 2 ** Math.min(failures, 5))
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
    if (fatal) disconnect()
  }
  const connect = () => {
    if (stopped || fatal || connecting) return
    connecting = true
    needsRetry = false
    status = { ...status, state: status.attempts === 0 ? 'connecting' : 'reconnecting', attempts: status.attempts + 1 }
    void Promise.resolve().then(() => {
      if (!stopped) return client.start()
    }).then(() => {
      if (stopped) disconnect()
    }).catch(error => { if (!stopped) failure(error) }).finally(() => {
      connecting = false
      if (needsRetry) schedule()
    })
  }
  client.on('connected', () => {
    if (stopped || fatal) { disconnect(); return }
    failures = 0
    needsRetry = false
    status = { state: 'connected', attempts: status.attempts }
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
      const message = parseMessageEvent(raw)
      if (message !== null) handler.onMessage(message)
    } catch (error) { log('解析 Socket Mode 事件失败', error) }
    finally {
      if (typeof raw?.ack === 'function') void Promise.resolve().then(() => raw.ack!()).catch(() => {})
    }
  })
  connect()
  return Object.assign(() => {
    if (stopped) return
    stopped = true
    if (retry !== undefined) clearTimeout(retry)
    retry = undefined
    status = { ...status, state: 'stopped' }
    disconnect()
  }, { status: () => ({ ...status }) })
}

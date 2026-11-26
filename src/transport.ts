/**
 * 共享网络传输与静默日志辅助模块（供 WebClient 与 SocketModeClient 共用）。
 *
 * 1. createSilentSlackLogger：屏蔽 @slack/web-api 与 @slack/socket-mode 默认向 stdout 输出的杂讯；
 * 2. inspectProxyEnv / hasProxyEnv / createProxyDispatcher：严格校验 http(s) 代理 URL，
 *    无代理或代理格式非法/协议不支持时返回 undefined（绝不同步抛错阻塞插件加载），
 *    并避免空字符串小写变量（http_proxy="" / no_proxy=""）遮蔽大写变量；
 * 3. createTransportFetch：合并调用方 AbortSignal 与 SDK 内部超时信号，支持外部生命周期 dispatcher 注入
 *    或模块级有界代理分发器缓存，并将 Node globalThis.FormData 转换为 undici.FormData 防止二进制上传损坏。
 */

import { LogLevel, type Logger } from '@slack/web-api'
import {
  EnvHttpProxyAgent,
  FormData as UndiciFormData,
  fetch as undiciFetch,
  type BodyInit as UndiciBodyInit,
  type Dispatcher,
  type RequestInfo as UndiciRequestInfo,
  type RequestInit as UndiciRequestInit,
} from 'undici'

const PROXY_ENV_KEYS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'] as const
const MAX_CACHED_PROXY_DISPATCHERS = 8

/** 单条代理环境变量校验问题（不包含任何凭据或主机敏感信息）。 */
export interface ProxyEnvIssue {
  key: string
  reason: string
}

/** 代理环境变量巡检结果。 */
export interface ProxyEnvInspection {
  configured: boolean
  valid: boolean
  invalidEntries: ProxyEnvIssue[]
}

/** createTransportFetch 可选参数。 */
export interface TransportFetchOptions {
  /** 调用方自管生命周期的 undici Dispatcher（传入后优先使用，不再进入模块级缓存）。 */
  dispatcher?: Dispatcher
}

const transportProxyCache = new Map<string, Dispatcher>()

function validateProxyUrl(key: string, raw: string): { ok: true; url: string } | { ok: false; issue: ProxyEnvIssue } {
  const trimmed = raw.trim()
  if (!trimmed.includes('://')) {
    return {
      ok: false,
      issue: {
        key,
        reason: `${key} 格式无效：缺少 http:// 或 https:// 协议前缀。`,
      },
    }
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return {
      ok: false,
      issue: {
        key,
        reason: `${key} 格式无效：无法解析为合法的代理 URL。`,
      },
    }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const scheme = /^[a-z][a-z0-9+.-]*:$/i.test(parsed.protocol) ? parsed.protocol.slice(0, -1) : '未知'
    return {
      ok: false,
      issue: {
        key,
        reason: `${key} 使用了不支持的代理协议（${scheme}://）：当前仅支持 http:// 或 https:// 代理。`,
      },
    }
  }
  if (!parsed.hostname) {
    return {
      ok: false,
      issue: {
        key,
        reason: `${key} 缺少代理主机名，请填写完整的 http:// 或 https:// 代理地址。`,
      },
    }
  }
  return { ok: true, url: trimmed }
}

/**
 * 巡检环境变量中的 HTTP(S) 代理配置，返回是否存在非法/不支持协议的代理项（绝不包含凭据）。
 */
export function inspectProxyEnv(env: NodeJS.ProcessEnv = process.env): ProxyEnvInspection {
  let configured = false
  const invalidEntries: ProxyEnvIssue[] = []
  for (const key of PROXY_ENV_KEYS) {
    const raw = env[key]
    if (typeof raw !== 'string' || raw.trim() === '') continue
    configured = true
    const checked = validateProxyUrl(key, raw)
    if (!checked.ok) invalidEntries.push(checked.issue)
  }
  return {
    configured,
    valid: invalidEntries.length === 0,
    invalidEntries,
  }
}

function pickValidProxy(
  env: NodeJS.ProcessEnv,
  lowerKey: 'http_proxy' | 'https_proxy',
  upperKey: 'HTTP_PROXY' | 'HTTPS_PROXY',
): string {
  for (const key of [lowerKey, upperKey] as const) {
    const raw = env[key]
    if (typeof raw !== 'string' || raw.trim() === '') continue
    const checked = validateProxyUrl(key, raw)
    if (checked.ok) return checked.url
  }
  return ''
}

function resolveProxyValues(env: NodeJS.ProcessEnv): { httpProxy: string; httpsProxy: string; noProxy: string } {
  const httpProxy = pickValidProxy(env, 'http_proxy', 'HTTP_PROXY')
  const httpsProxy = pickValidProxy(env, 'https_proxy', 'HTTPS_PROXY')
  const noProxy = env.no_proxy?.trim() || env.NO_PROXY?.trim() || ''
  return { httpProxy, httpsProxy, noProxy }
}

function getSharedTransportProxyDispatcher(env: NodeJS.ProcessEnv): Dispatcher | undefined {
  const { httpProxy, httpsProxy, noProxy } = resolveProxyValues(env)
  if (httpProxy === '' && httpsProxy === '') return undefined
  const key = `${httpProxy}\u0000${httpsProxy}\u0000${noProxy}`
  const existing = transportProxyCache.get(key)
  if (existing !== undefined) {
    transportProxyCache.delete(key)
    transportProxyCache.set(key, existing)
    return existing
  }
  const dispatcher = createProxyDispatcher(env)
  if (dispatcher === undefined) return undefined
  if (transportProxyCache.size >= MAX_CACHED_PROXY_DISPATCHERS) {
    const oldestKey = transportProxyCache.keys().next().value
    if (oldestKey !== undefined) {
      const evicted = transportProxyCache.get(oldestKey)
      transportProxyCache.delete(oldestKey)
      void evicted?.close?.().catch(() => {})
    }
  }
  transportProxyCache.set(key, dispatcher)
  return dispatcher
}

interface FormDataLike {
  entries(): Iterable<[string, unknown]>
  readonly [Symbol.toStringTag]?: string
}

function isFormDataLike(body: unknown): body is FormDataLike {
  if (body === null || typeof body !== 'object') return false
  if (typeof globalThis.FormData === 'function' && body instanceof globalThis.FormData) return true
  const candidate = body as Partial<FormDataLike>
  return typeof candidate.entries === 'function' && candidate[Symbol.toStringTag] === 'FormData'
}

async function normalizeBodyForUndici(body: RequestInit['body']): Promise<UndiciBodyInit | null | undefined> {
  if (body === undefined || body === null) return body
  if (body instanceof UndiciFormData) return body
  if (!isFormDataLike(body)) return body as UndiciBodyInit

  const converted = new UndiciFormData()
  for (const [key, value] of body.entries()) {
    if (typeof value === 'string') {
      converted.append(key, value)
      continue
    }
    if (value !== null && typeof value === 'object' && typeof (value as Blob).arrayBuffer === 'function') {
      const blobValue = value as Blob & { name?: unknown }
      const buffer = await blobValue.arrayBuffer()
      const mimeType = typeof blobValue.type === 'string' ? blobValue.type : ''
      const clonedBlob = new Blob([buffer], { type: mimeType })
      const filename = typeof blobValue.name === 'string' ? blobValue.name : undefined
      if (filename !== undefined) {
        converted.append(key, clonedBlob, filename)
      } else {
        converted.append(key, clonedBlob)
      }
      continue
    }
    converted.append(key, String(value))
  }
  return converted
}

/** 返回与 @slack/logger Logger 接口兼容的静默空实现，避免 SDK 默认向 stdout 打日志。 */
export function createSilentSlackLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
    setLevel() {},
    getLevel() {
      return LogLevel.ERROR
    },
    setName() {},
  }
}

/** 仅当环境变量中存在非空 HTTP(S)_PROXY 配置时返回 true。 */
export function hasProxyEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return inspectProxyEnv(env).configured
}

/**
 * 仅在检测到合法的 http:// 或 https:// 代理环境变量时返回新的 undici EnvHttpProxyAgent；
 * 无代理或代理配置非法/协议不支持时返回 undefined（永不同步抛错），避免阻塞插件启动或破坏默认连接治理。
 */
export function createProxyDispatcher(env: NodeJS.ProcessEnv = process.env): Dispatcher | undefined {
  const { httpProxy, httpsProxy, noProxy } = resolveProxyValues(env)
  if (httpProxy === '' && httpsProxy === '') return undefined
  try {
    return new EnvHttpProxyAgent({ httpProxy, httpsProxy, noProxy })
  } catch {
    return undefined
  }
}

/**
 * 构建绑定单次调用 AbortSignal 与可选代理分发的 WHATWG fetch 包装。
 * - 若调用方传入 options.dispatcher，则直接复用该自管生命周期分发器；
 * - 否则在存在合法 HTTP(S) 代理环境变量时复用模块级有界 EnvHttpProxyAgent 缓存；
 * - 经由 undici.fetch 发送 FormData 时自动转换 globalThis.FormData，防止二进制文件上传被破坏。
 */
export function createTransportFetch(
  signal?: AbortSignal,
  env?: NodeJS.ProcessEnv,
  options?: TransportFetchOptions,
): typeof fetch {
  return async (input, init) => {
    signal?.throwIfAborted()
    const initSignal = init?.signal ?? undefined
    const mergedSignal = signal && initSignal
      ? AbortSignal.any([signal, initSignal])
      : (signal ?? initSignal)
    const effectiveEnv = env ?? process.env
    const hasExplicitDispatcher = options !== undefined && 'dispatcher' in options
    const dispatcher = hasExplicitDispatcher
      ? options.dispatcher
      : getSharedTransportProxyDispatcher(effectiveEnv)

    if (dispatcher !== undefined) {
      const normalizedBody = await normalizeBodyForUndici(init?.body)
      signal?.throwIfAborted()
      const undiciInit: UndiciRequestInit = {
        ...(init as UndiciRequestInit | undefined),
        ...(normalizedBody !== undefined ? { body: normalizedBody } : {}),
        ...(mergedSignal !== undefined ? { signal: mergedSignal } : {}),
        dispatcher,
      }
      return await undiciFetch(input as UndiciRequestInfo, undiciInit) as unknown as Response
    }
    const nextInit: RequestInit = {
      ...init,
      ...(mergedSignal !== undefined ? { signal: mergedSignal } : {}),
    }
    return await globalThis.fetch(input, nextInit)
  }
}

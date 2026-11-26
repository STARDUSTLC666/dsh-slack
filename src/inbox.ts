/**
 * Socket Mode 收件箱：把收到的 Slack message / app_mention 事件解析进内存队列。
 * 队列容量 200，满则丢最旧；解析为纯函数，便于注入 fake 事件测试。
 */

import { extractFallbackMessageText } from './message-text.js'

/** 收件箱消息中的文件附件摘要。 */
export interface InboxFileSummary {
  name?: string
  mimetype?: string
}

/** 收件箱中的一条消息。 */
export interface InboxMessage {
  ts: string
  channel: string
  user: string
  text: string
  thread_ts?: string
  event_type?: 'message' | 'app_mention'
  files?: InboxFileSummary[]
}

/** 队列容量上限。 */
export const INBOX_CAPACITY = 200

const ALLOWED_MESSAGE_SUBTYPES = new Set(['', 'thread_broadcast', 'file_share'])

/** 创建收件箱队列。 */
export function createInboxQueue(capacity: number = INBOX_CAPACITY): InboxQueue {
  return new InboxQueue(capacity)
}

/**
 * 内存消息队列：先进先出，容量满时丢弃最旧消息。
 */
export class InboxQueue {
  private items: InboxMessage[] = []
  private readonly seen = new Set<string>()
  readonly capacity: number

  constructor(capacity: number = INBOX_CAPACITY) {
    this.capacity = capacity
  }

  private key(message: InboxMessage): string {
    return message.channel + '\u0000' + message.ts
  }

  /** 追加一条消息；按 Slack 规范标识 (channel, ts) 去重，重复到达时合并升级未读项元数据，超过容量时丢弃最旧。 */
  push(message: InboxMessage): void {
    const key = this.key(message)
    if (this.seen.has(key)) {
      const existing = this.items.find((item) => this.key(item) === key)
      if (existing !== undefined) {
        if (message.event_type === 'app_mention') {
          existing.event_type = 'app_mention'
        }
        if (existing.thread_ts === undefined && message.thread_ts !== undefined) {
          existing.thread_ts = message.thread_ts
        }
        if (existing.files === undefined && message.files !== undefined && message.files.length > 0) {
          existing.files = message.files.map((file) => ({ ...file }))
        }
      }
      return
    }
    this.seen.add(key)
    while (this.seen.size > Math.max(200, this.capacity * 4)) this.seen.delete(this.seen.values().next().value!)
    const stored: InboxMessage = {
      ...message,
      ...(message.files !== undefined ? { files: message.files.map((file) => ({ ...file })) } : {}),
    }
    this.items.push(stored)
    if (this.items.length > this.capacity) {
      this.items.splice(0, this.items.length - this.capacity)
    }
  }

  /** 返回最近 limit 条消息（新的在前）。 */
  list(limit: number): InboxMessage[] {
    if (!Number.isFinite(limit)) return []
    const n = Math.max(0, Math.trunc(limit))
    if (n === 0) return []
    return this.items.slice(-n).reverse()
  }

  /**
   * 原子地取出最近 limit 条，只将返回的消息标记为已读。
   * 避免“先 list 再 clear”之间新到的消息被误清掉。
   */
  drain(limit: number): InboxMessage[] {
    if (!Number.isFinite(limit)) return []
    const n = Math.max(0, Math.trunc(limit))
    if (n === 0) {
      return []
    }
    const out = this.items.splice(-n).reverse()
    return out
  }

  /** 清空队列。 */
  clear(): void {
    this.items = []
  }

  /** 当前队列长度。 */
  get size(): number {
    return this.items.length
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSupportedEventType(type: unknown): type is 'message' | 'app_mention' {
  return type === 'message' || type === 'app_mention'
}

function extractFiles(rawFiles: unknown): InboxFileSummary[] | undefined {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) return undefined
  const files: InboxFileSummary[] = []
  for (const item of rawFiles) {
    if (!isObject(item)) continue
    const summary: InboxFileSummary = {}
    if (typeof item.name === 'string' && item.name.trim() !== '') summary.name = item.name.trim()
    if (typeof item.mimetype === 'string' && item.mimetype.trim() !== '') summary.mimetype = item.mimetype.trim()
    files.push(summary)
  }
  return files.length > 0 ? files : undefined
}

function fallbackFileText(files: InboxFileSummary[] | undefined): string {
  const names = (files ?? [])
    .map((file) => file.name)
    .filter((name): name is string => typeof name === 'string' && name !== '')
  return names.length > 0 ? '[文件: ' + names.join(', ') + ']' : '[文件]'
}

/**
 * 从 Socket Mode 事件里解析出一条消息；不满足条件返回 null。
 * - 支持 message 与 app_mention 事件，兼容直接事件、slack_event 包（{ type: 'events_api', body: { event } }）与
 *   按类型监听包（{ event }）。
 * - message 允许无 subtype、thread_broadcast 与 file_share，继续排除其他 subtype（如 bot_message、channel_join、message_changed）。
 * - 排除 bot 自己发的消息（bot_id 非空，或 user 等于非空 botUserId）。
 * - 保留 thread_ts、files 摘要，并在 app_mention 时标记 event_type；纯文件分享无文本时合成可读占位文本。
 */
export function parseMessageEvent(raw: unknown, botUserId?: string): InboxMessage | null {
  const event = unwrapMessageEvent(raw)
  if (event === null) return null
  if (!isSupportedEventType(event.type)) return null

  const subtype = event.subtype
  if (subtype !== undefined && (typeof subtype !== 'string' || !ALLOWED_MESSAGE_SUBTYPES.has(subtype))) {
    return null
  }

  const botId = event.bot_id
  if (typeof botId === 'string' && botId.trim() !== '') return null
  if (botUserId !== undefined && botUserId !== '' && event.user === botUserId) return null

  const ts = event.ts
  const channel = event.channel
  const user = event.user
  if (typeof ts !== 'string' || ts === '') return null
  if (typeof channel !== 'string' || channel === '') return null
  if (typeof user !== 'string' || user === '') return null

  const files = extractFiles(event.files)
  const rawText = typeof event.text === 'string' ? event.text : ''
  let text = rawText
  if (rawText.trim() === '') {
    const structuredFallback = extractFallbackMessageText(event.blocks, event.attachments)
    if (structuredFallback !== '') {
      text = structuredFallback
    } else if (subtype === 'file_share' || files !== undefined) {
      text = fallbackFileText(files)
    } else {
      return null
    }
  }

  const message: InboxMessage = { ts, channel, user, text }
  if (typeof event.thread_ts === 'string' && event.thread_ts.trim() !== '') {
    message.thread_ts = event.thread_ts.trim()
  }
  if (event.type === 'app_mention') {
    message.event_type = 'app_mention'
  }
  if (files !== undefined) {
    message.files = files
  }
  return message
}

function unwrapMessageEvent(raw: unknown): Record<string, unknown> | null {
  if (!isObject(raw)) return null
  const type = raw.type
  if (isSupportedEventType(type)) return raw
  if (type === 'events_api') {
    const body = raw.body
    if (isObject(body) && isObject(body.event)) return body.event
    if (isObject(raw.event)) return raw.event
    return null
  }
  // 按类型监听的包：{ event: { type: 'message' | 'app_mention', ... } }
  const inner = raw.event
  if (isObject(inner) && isSupportedEventType(inner.type)) return inner
  // 兼容测试构造的省略 type 的 events_api 包：{ body: { event: ... } }
  if (type === undefined && isObject(raw.body) && isObject(raw.body.event) && isSupportedEventType(raw.body.event.type)) {
    return raw.body.event
  }
  return null
}

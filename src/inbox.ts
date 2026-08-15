/**
 * Socket Mode 收件箱：把收到的 Slack message 事件解析进内存队列。
 * 队列容量 200，满则丢最旧；解析为纯函数，便于注入 fake 事件测试。
 */

/** 收件箱中的一条消息。 */
export interface InboxMessage {
  ts: string
  channel: string
  user: string
  text: string
}

/** 队列容量上限。 */
export const INBOX_CAPACITY = 200

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
    return message.channel + '\u0000' + message.ts + '\u0000' + message.user + '\u0000' + message.text
  }

  /** 追加一条消息；Slack 至少投递一次，重复事件直接忽略，超过容量时丢弃最旧。 */
  push(message: InboxMessage): void {
    const key = this.key(message)
    if (this.seen.has(key)) return
    this.seen.add(key)
    this.items.push(message)
    if (this.items.length > this.capacity) {
      const removed = this.items.splice(0, this.items.length - this.capacity)
      for (const item of removed) this.seen.delete(this.key(item))
    }
  }

  /** 返回最近 limit 条消息（新的在前）。 */
  list(limit: number): InboxMessage[] {
    const n = Math.max(0, Math.trunc(limit))
    if (n === 0) return []
    return this.items.slice(-n).reverse()
  }

  /**
   * 原子地取出最近 limit 条并清空整个队列。
   * 避免“先 list 再 clear”之间新到的消息被误清掉。
   */
  drain(limit: number): InboxMessage[] {
    const n = Math.max(0, Math.trunc(limit))
    if (n === 0) {
      this.clear()
      return []
    }
    const out = this.items.splice(-n).reverse()
    this.items = []
    this.seen.clear()
    return out
  }

  /** 清空队列。 */
  clear(): void {
    this.items = []
    this.seen.clear()
  }

  /** 当前队列长度。 */
  get size(): number {
    return this.items.length
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 从 Socket Mode 事件里解析出一条消息；不满足条件返回 null。
 * - 兼容直接 message 事件、slack_event 包（{ type: 'events_api', body: { event } }）与
 *   按类型监听包（{ event }）。
 * - 排除 subtype 非空的消息、bot 自己发的消息（bot_id 非空，或 user 等于 botUserId）。
 */
export function parseMessageEvent(raw: unknown, botUserId?: string): InboxMessage | null {
  const event = unwrapMessageEvent(raw)
  if (event === null) return null
  if (event.type !== 'message') return null

  const subtype = event.subtype
  if (typeof subtype === 'string' && subtype !== '') return null

  const botId = event.bot_id
  if (typeof botId === 'string' && botId !== '') return null
  if (botUserId !== undefined && event.user === botUserId) return null

  const ts = event.ts
  const channel = event.channel
  const user = event.user
  const text = event.text
  if (typeof ts !== 'string' || ts === '') return null
  if (typeof channel !== 'string' || channel === '') return null
  if (typeof user !== 'string' || user === '') return null
  if (typeof text !== 'string' || text === '') return null

  return { ts, channel, user, text }
}

function unwrapMessageEvent(raw: unknown): Record<string, unknown> | null {
  if (!isObject(raw)) return null
  const type = raw.type
  if (type === 'message') return raw
  if (type === 'events_api') {
    const body = raw.body
    if (isObject(body) && isObject(body.event)) return body.event as Record<string, unknown>
    if (isObject(raw.event)) return raw.event as Record<string, unknown>
    return null
  }
  // 按类型监听的包：{ event: { type: 'message', ... } }
  const inner = raw.event
  if (isObject(inner) && inner.type === 'message') return inner as Record<string, unknown>
  return null
}

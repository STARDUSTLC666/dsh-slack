/**
 * Slack 客户端抽象：生产用官方 @slack/web-api，测试注入 fake。
 * 同时把 Slack 错误码映射为全中文提示，并抽出频道/文本校验纯函数。
 */

import { WebClient } from '@slack/web-api'

/** chat.postMessage 参数。 */
export interface PostMessageParams {
  channel: string
  text: string
  thread_ts?: string
}

/** conversations.list 可见频道的最小信息。 */
export interface ChannelInfo {
  id: string
  name: string
}

/** 可注入的 Slack 客户端抽象。 */
export interface SlackClient {
  /** 发消息，返回消息 ts（用于线程后续引用）。 */
  postMessage(params: PostMessageParams): Promise<{ ts: string }>
  /** 列出机器人可见频道。 */
  listChannels(): Promise<ChannelInfo[]>
}

/** 用官方 WebClient 实现。 */
export function createWebSlackClient(token: string): SlackClient {
  const client = new WebClient(token)
  return {
    async postMessage(params: PostMessageParams): Promise<{ ts: string }> {
      const result = await client.chat.postMessage({
        channel: params.channel,
        text: params.text,
        ...(params.thread_ts !== undefined ? { thread_ts: params.thread_ts } : {}),
      })
      const ts = typeof result.ts === 'string' ? result.ts : ''
      return { ts }
    },
    async listChannels(): Promise<ChannelInfo[]> {
      const result = await client.conversations.list({ types: 'public_channel,private_channel' })
      const channels: ChannelInfo[] = []
      for (const ch of result.channels ?? []) {
        if (typeof ch.id === 'string' && typeof ch.name === 'string') {
          channels.push({ id: ch.id, name: ch.name })
        }
      }
      return channels
    },
  }
}

/**
 * 把 Slack API 错误映射为全中文提示。
 */
export function mapSlackError(error: unknown): string {
  const data = (error as { data?: { error?: string } } | null | undefined)?.data
  const code = data?.error
  if (code === 'invalid_auth') {
    return 'Slack 认证失败（invalid_auth）：token 无效、已撤销或过期。请检查并重新生成令牌，再在 profile 的 cordis.patch.yml 覆盖 slack 行的 config.token 并重启。'
  }
  if (code === 'channel_not_found') {
    return '频道未找到（channel_not_found）：请检查频道名或频道 ID 是否正确（如 #general）。'
  }
  if (code === 'not_in_channel') {
    return '机器人不在该频道中（not_in_channel）：请先把机器人 App 添加（invite）到该频道。'
  }
  if (code === 'token_revoked' || code === 'account_inactive' || code === 'missing_scope') {
    return `Slack 令牌或权限不足（${code}）：请确认已勾选 chat:write 与 channels:read，并重新安装 App 拿新令牌。`
  }
  const message = (error as { message?: string } | null | undefined)?.message
  return message ? `Slack API 调用失败：${message}` : 'Slack API 调用失败：未知错误。'
}

/** 校验 channel 参数：必须是非空字符串（频道名或频道 ID）。 */
export function assertChannel(channel: unknown): string {
  if (typeof channel !== 'string' || channel.trim() === '') {
    throw new Error('channel 参数错误：必须是频道名（如 #general）或频道 ID 的非空字符串。')
  }
  return channel.trim()
}

/** 校验 text 参数：必须是非空字符串。 */
export function assertText(text: unknown): string {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('text 参数错误：必须是待发送的 Markdown 文本（非空字符串）。')
  }
  return text
}

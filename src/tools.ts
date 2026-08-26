import { compileParameters } from './compile.js'
import type { SlackConfig } from './config.js'
import { resolveAppToken, resolveDefaultChannel, resolveToken } from './config.js'
import type { ContentBlock, ToolDefinition, ToolOutputDefinition } from './types.js'
import type { SlackClient } from './slack-client.js'
import { assertChannel, assertText, assertThreadTs, mapSlackError } from './slack-client.js'
import type { InboxMessage, InboxQueue } from './inbox.js'

/** 工具构建的依赖注入点。 */
export interface ToolDeps {
  clientProvider: () => SlackClient
  configProvider: () => SlackConfig | undefined
  inboxProvider: () => InboxQueue
}

const NOTIFY_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ts: { type: 'string' },
    channel: { type: 'string' },
  },
  required: ['ts', 'channel'],
  additionalProperties: true,
} as const

const CHANNELS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    channels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
        additionalProperties: true,
      },
    },
  },
  required: ['channels'],
  additionalProperties: true,
} as const

const INBOX_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ts: { type: 'string' },
          channel: { type: 'string' },
          user: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['ts', 'channel', 'user', 'text'],
        additionalProperties: true,
      },
    },
  },
  required: ['messages'],
  additionalProperties: true,
} as const

function textBlock(text: string): ContentBlock {
  return { type: 'text', text }
}

function clampLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 10
  return Math.min(50, Math.max(1, Math.trunc(value)))
}

/** 自检工具：检查 token / appToken / 默认频道配置，不发起网络请求。 */
export function buildHealthTool(deps: ToolDeps): ToolDefinition {
  return {
    name: 'slack_health',
    description: 'dsh-slack 自检：检查 botToken / appToken / 默认频道配置是否就绪（不发起网络请求）。遇到问题时先运行本工具定位。',
    parameters: compileParameters({}),
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args: unknown, value: unknown) => {
        const rec = (value ?? {}) as Record<string, unknown>
        const rawChecks = Array.isArray(rec.checks) ? rec.checks : []
        const lines = ['dsh-slack 自检' + (rec.ok === true ? '：正常。' : '：发现问题。')]
        for (const item of rawChecks) {
          const c = (item ?? {}) as Record<string, unknown>
          lines.push('- ' + String(c.name) + '：' + (c.ok === true ? '✅ ' + String(c.detail ?? '') : '❌ ' + String(c.detail ?? '')))
        }
        return [textBlock(lines.join('\n'))]
      },
    },
    async execute() {
      const config = deps.configProvider()
      const checks: Array<Record<string, unknown>> = []
      const token = resolveToken(config)
      checks.push({ name: 'botToken', ok: token !== '', detail: token !== '' ? '已配置' : '未配置：请填 token 或环境变量（发送/频道工具需要）' })
      const appToken = resolveAppToken(config)
      checks.push({ name: 'appToken', ok: true, detail: appToken !== '' ? '已配置（Socket Mode 收件箱可用）' : '未配置（收件箱功能不可用，通知不受影响）' })
      const defaultChannel = resolveDefaultChannel(config)
      checks.push({ name: '默认频道', ok: true, detail: defaultChannel !== '' ? defaultChannel : '未配置（发送时必须显式给 channel）' })
      const ok = token !== ''
      return { ok, plugin: 'dsh-slack', checks }
    },
  }
}

export function buildNotifyTool(deps: ToolDeps): ToolDefinition {
  const defaultChannel = resolveDefaultChannel(deps.configProvider())
  const channelDescription = defaultChannel
    ? '目标频道：频道名（如 #general）或频道 ID。未特别指定时可使用默认频道 ' + defaultChannel + '。'
    : '目标频道：频道名（如 #general）或频道 ID。'

  const parameters = compileParameters({
    channel: { type: 'string', required: true, description: channelDescription },
    text: { type: 'string', required: true, description: '要发送的 Markdown 文本内容。' },
    thread_ts: { type: 'string', description: '可选：回复某条消息所在线程的 ts（即 slack_notify 返回的 ts）。' },
  })

  const output: ToolOutputDefinition = {
    schema: NOTIFY_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = value as { ts: string; channel: string }
      return [textBlock('已发送到 ' + v.channel + '（消息 ts：' + v.ts + '）。')]
    },
  }

  return {
    name: 'slack_notify',
    description: '向指定 Slack 频道（或线程）发送一条 Markdown 文本消息，返回消息 ts 供后续引用。',
    parameters,
    output,
    timeoutMs: 30000,
    async execute(args) {
      const raw = args as { channel?: unknown; text?: unknown; thread_ts?: unknown }
      const channel = assertChannel(raw.channel)
      const text = assertText(raw.text)
      const thread_ts = typeof raw.thread_ts === 'string' && raw.thread_ts.trim() !== ''
        ? raw.thread_ts.trim()
        : undefined
      const client = deps.clientProvider()
      try {
        const result = await client.postMessage({
          channel,
          text,
          ...(thread_ts !== undefined ? { thread_ts } : {}),
        })
        return { ts: result.ts, channel }
      } catch (error) {
        throw new Error(mapSlackError(error))
      }
    },
  }
}

export function buildChannelsTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({})

  const output: ToolOutputDefinition = {
    schema: CHANNELS_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = value as { channels: Array<{ id: string; name: string }> }
      if (v.channels.length === 0) {
        return [textBlock('机器人当前看不到任何频道（可能需要先把 App 加入频道）。')]
      }
      const names = v.channels.map((c) => '#' + c.name).join('、')
      return [textBlock('机器人可见频道（' + v.channels.length + ' 个）：' + names + '。')]
    },
  }

  return {
    name: 'slack_channels',
    description: '列出当前 Slack 机器人可见的频道（conversations.list）。',
    parameters,
    output,
    timeoutMs: 30000,
    async execute() {
      const client = deps.clientProvider()
      try {
        const channels = await client.listChannels()
        return { channels: channels.map((c) => ({ id: c.id, name: c.name })) }
      } catch (error) {
        throw new Error(mapSlackError(error))
      }
    },
  }
}

export function buildInboxTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    limit: { type: 'integer', description: '最多返回的消息数（默认 10，范围 1-50）。' },
    markRead: { type: 'boolean', description: '为 true 时，返回后清空收件箱队列（标记已读）。' },
  })

  const output: ToolOutputDefinition = {
    schema: INBOX_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = value as { messages: InboxMessage[] }
      if (v.messages.length === 0) {
        return [textBlock('收件箱为空：尚未开启 Socket Mode（缺少 appToken），或暂未收到新的 Slack 消息。请确认已配置 appToken 并订阅 message.channels / message.im 事件。')]
      }
      const lines = v.messages.map((m) => '[' + m.channel + '] ' + m.user + '（ts: ' + m.ts + '）：' + m.text)
      return [textBlock('收件箱（' + v.messages.length + ' 条，新的在前）：\n' + lines.join('\n'))]
    },
  }

  return {
    name: 'slack_inbox',
    description: '读取通过 Socket Mode 收到的 Slack 消息（内存队列，最多保留 200 条，新的在前）。',
    parameters,
    output,
    async execute(args) {
      const raw = args as { limit?: unknown; markRead?: unknown }
      const limit = clampLimit(raw.limit)
      const markRead = raw.markRead === true
      const queue = deps.inboxProvider()
      const messages = markRead ? queue.drain(limit) : queue.list(limit)
      
      return { messages: messages.map((m) => ({ ts: m.ts, channel: m.channel, user: m.user, text: m.text })) }
    },
  }
}

export function buildReplyTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    channel: { type: 'string', required: true, description: '目标频道：频道名（如 #general）或频道 ID。' },
    text: { type: 'string', required: true, description: '回复内容（Markdown 文本）。' },
    thread_ts: { type: 'string', required: true, description: '要回复消息的 ts（来自 slack_inbox 返回的 ts）。' },
  })

  const output: ToolOutputDefinition = {
    schema: NOTIFY_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = value as { ts: string; channel: string }
      return [textBlock('已线程回复 ' + v.channel + '（消息 ts：' + v.ts + '）。')]
    },
  }

  return {
    name: 'slack_reply',
    description: '以线程回复的形式回复某条 Slack 消息（chat.postMessage 带 thread_ts）。',
    parameters,
    output,
    timeoutMs: 30000,
    async execute(args) {
      const raw = args as { channel?: unknown; text?: unknown; thread_ts?: unknown }
      const channel = assertChannel(raw.channel)
      const text = assertText(raw.text)
      const thread_ts = assertThreadTs(raw.thread_ts)
      const client = deps.clientProvider()
      try {
        const result = await client.postMessage({ channel, text, thread_ts })
        return { ts: result.ts, channel }
      } catch (error) {
        throw new Error(mapSlackError(error))
      }
    },
  }
}

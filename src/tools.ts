/**
 * 构建两个面向模型的工具：slack_notify、slack_channels。
 * 依赖通过 ToolDeps 注入（clientProvider / configProvider），测试可注入 fake client。
 */

import { compileParameters } from './compile.js'
import type { SlackConfig } from './config.js'
import { resolveDefaultChannel } from './config.js'
import type { ContentBlock, ToolDefinition, ToolOutputDefinition } from './types.js'
import type { SlackClient } from './slack-client.js'
import { assertChannel, assertText, mapSlackError } from './slack-client.js'

/** 工具构建的依赖注入点。 */
export interface ToolDeps {
  /** 返回一个 SlackClient；token 缺失时抛中文错误。 */
  clientProvider: () => SlackClient
  /** 返回当前配置（供默认频道等解析）。 */
  configProvider: () => SlackConfig | undefined
}

/** slack_notify 的输出 schema（原始 JSON Schema，纯 JSON 无 undefined）。 */
const NOTIFY_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ts: { type: 'string' },
    channel: { type: 'string' },
  },
  required: ['ts', 'channel'],
  additionalProperties: true,
} as const

/** slack_channels 的输出 schema。 */
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

function textBlock(text: string): ContentBlock {
  return { type: 'text', text }
}

/** 构建 slack_notify：向指定频道/线程发送 Markdown 文本，返回 ts。 */
export function buildNotifyTool(deps: ToolDeps): ToolDefinition {
  const defaultChannel = resolveDefaultChannel(deps.configProvider())
  const channelDescription = defaultChannel
    ? `目标频道：频道名（如 #general）或频道 ID。未特别指定时可使用默认频道 ${defaultChannel}。`
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
      return [textBlock(`已发送到 ${v.channel}（消息 ts：${v.ts}）。`)]
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

/** 构建 slack_channels：列出机器人可见频道（conversations.list）。 */
export function buildChannelsTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({})

  const output: ToolOutputDefinition = {
    schema: CHANNELS_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = value as { channels: Array<{ id: string; name: string }> }
      if (v.channels.length === 0) {
        return [textBlock('机器人当前看不到任何频道（可能需要先把 App 加入频道）。')]
      }
      const names = v.channels.map((c) => `#${c.name}`).join('、')
      return [textBlock(`机器人可见频道（${v.channels.length} 个）：${names}。`)]
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

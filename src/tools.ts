import { compileParameters } from './compile.js'
import type { SlackConfig } from './config.js'
import { resolveAppToken, resolveDefaultChannel, resolveToken } from './config.js'
import type { ContentBlock, ToolDefinition, ToolOutputDefinition } from './types.js'
import type { SlackClient } from './slack-client.js'
import { assertChannel, assertText, assertThreadTs, mapSlackError } from './slack-client.js'
import type { InboxMessage, InboxQueue } from './inbox.js'
import type { SocketStatus } from './socket.js'

function executionSignal(exec: unknown): AbortSignal | undefined {
  const signal = (exec as { signal?: unknown } | null)?.signal
  return signal instanceof AbortSignal ? signal : undefined
}

/** 工具构建的依赖注入点。 */
export interface ToolDeps {
  clientProvider: () => SlackClient
  configProvider: () => SlackConfig | undefined
  inboxProvider: () => InboxQueue
  socketStatusProvider?: () => SocketStatus | undefined
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
        remaining: { type: 'integer' },
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
  required: ['messages', 'remaining'],
  additionalProperties: true,
} as const

function textBlock(text: string): ContentBlock {
  return { type: 'text', text }
}

function clampLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 10
  return Math.min(50, Math.max(1, Math.trunc(value)))
}

/** Socket Mode 状态 → 用户可读文案（自检与收件箱共用，避免两处各写一份）。 */
const SOCKET_STATE_LABELS: Record<string, string> = {
  connecting: '正在连接',
  connected: '已连接',
  reconnecting: '已断开，退避重连中',
  auth_failed: '令牌或权限无效，已停止重连；更新 App-Level Token 后重启插件',
  stopped: '已停止',
}

/** 自检工具：检查 token / appToken / 默认频道配置，不发起网络请求。 */
export function buildHealthTool(deps: ToolDeps): ToolDefinition {
  return {
    name: 'slack_health',
    isConcurrencySafe: () => true,
    description: 'dsh-slack 自检：检查 botToken / appToken / 默认频道配置和当前 Socket Mode 连接状态（不额外发起网络请求）。遇到问题时先运行本工具定位。',
    parameters: compileParameters({}),
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args: unknown, value: unknown) => {
        const rec = (value ?? {}) as Record<string, unknown>
        const rawChecks = Array.isArray(rec.checks) ? rec.checks : []
        const lines = ['dsh-slack 自检' + (rec.ok === true ? '：正常。' : '：发现问题。')]
        const failed: string[] = []
        for (const item of rawChecks) {
          const c = (item ?? {}) as Record<string, unknown>
          lines.push('- ' + String(c.name) + '：' + (c.ok === true ? '✅ ' + String(c.detail ?? '') : '❌ ' + String(c.detail ?? '')))
          if (c.ok !== true) failed.push(String(c.name))
        }
        if (failed.length > 0) {
          lines.push('', '下一步：')
          if (failed.includes('botToken')) lines.push('  · botToken 未配置：在 DSH「设置 → 插件 → Slack（dsh-slack）」直接填写 token（保存即生效，无需重启），或在 profile 的 cordis.patch.yml 覆盖 slack 行，或设置环境变量 DSH_SLACK_TOKEN。')
          if (failed.includes('Socket Mode')) lines.push('  · Socket Mode 未连上：确认 App-Level Token 为 xapp- 开头、App 已开启 Socket Mode 并订阅 message.channels / message.im；invalid_auth 需要重新生成令牌并在「设置 → 插件 → Slack」更新 appToken。')
          lines.push('  · 填好后再次运行 slack_health 复查。')
        }
        return [textBlock(lines.join('\n'))]
      },
    },
    async execute() {
      const config = deps.configProvider()
      const checks: Array<Record<string, unknown>> = []
      const token = resolveToken(config)
      checks.push({ name: 'botToken', ok: token !== '', detail: token !== '' ? '已配置' : '未配置：请在 DSH「设置 → 插件 → Slack」填写 token 或设置环境变量 DSH_SLACK_TOKEN（发送/频道工具需要）' })
      const appToken = resolveAppToken(config)
      checks.push({ name: 'appToken', ok: appToken === '' || appToken.startsWith('xapp-'), detail: appToken !== '' ? '已配置（Socket Mode 连接状态见下项）' : '未配置（收件箱功能不可用，通知不受影响）' })
      const defaultChannel = resolveDefaultChannel(config)
      checks.push({ name: '默认频道', ok: true, detail: defaultChannel !== '' ? defaultChannel : '未配置（发送时必须显式给 channel）' })
      const socket = deps.socketStatusProvider?.()
      if (appToken !== '') checks.push({ name: 'Socket Mode', ok: socket?.state === 'connected', detail: socket ? SOCKET_STATE_LABELS[socket.state] + (socket.error ? '（' + socket.error + '）' : '') : '仅检查配置，尚未确认连接' })
      const ok = token !== '' && checks.every(check => check.ok === true)
      return { ok, plugin: 'dsh-slack', checks, ...(socket ? { socket } : {}) }
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
      return [textBlock('已发送到 ' + v.channel + '（消息 ts：' + v.ts + '）。需要在同一条消息下继续讨论时，把这个 ts 作为 slack_reply 的 thread_ts。')]
    },
  }

  return {
    name: 'slack_notify',
    description: '向指定 Slack 频道（或线程）发送一条 Markdown 文本消息，返回消息 ts 供后续引用。',
    parameters,
    output,
    timeoutMs: 30000,
    async execute(args, exec) {
      const signal = executionSignal(exec)
      signal?.throwIfAborted()
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
        }, signal)
        signal?.throwIfAborted()
        return { ts: result.ts, channel }
      } catch (error) {
        signal?.throwIfAborted()
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
        return [textBlock('机器人当前看不到任何频道（可能需要先把 App 加入频道）。下一步：在 Slack 里用 /invite @你的机器人 把 App 加进目标频道，或检查 App 是否勾选了 channels:read 权限，然后重新调用 slack_channels。')]
      }
      // 带上频道 ID：私密频道/重名频道只有 ID 是唯一的，slack_notify 和 slack_reply 都接受 ID。
      const names = v.channels.map((c) => '#' + c.name + '（' + c.id + '）').join('、')
      return [textBlock('机器人可见频道（' + v.channels.length + ' 个）：' + names + '。')]
    },
  }

  return {
    name: 'slack_channels',
    isConcurrencySafe: () => true,
    description: '列出当前 Slack 机器人可见的频道（conversations.list）。',
    parameters,
    output,
    timeoutMs: 30000,
    async execute(_args, exec) {
      const signal = executionSignal(exec)
      signal?.throwIfAborted()
      const client = deps.clientProvider()
      try {
        const channels = await client.listChannels(signal)
        signal?.throwIfAborted()
        return { channels: channels.map((c) => ({ id: c.id, name: c.name })) }
      } catch (error) {
        signal?.throwIfAborted()
        throw new Error(mapSlackError(error))
      }
    },
  }
}

export function buildInboxTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    limit: { type: 'integer', description: '最多返回的消息数（默认 10，范围 1-50）。' },
    markRead: { type: 'boolean', description: '为 true 时，只将本次返回的消息标记已读；未返回的消息继续保留。' },
  })

  const output: ToolOutputDefinition = {
    schema: INBOX_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = value as { messages: InboxMessage[]; remaining?: number }
      if (v.messages.length === 0) {
        // 「没配 appToken」「Socket 断了」「连着但没消息」三种空收件箱的修法完全不同。
        const appToken = resolveAppToken(deps.configProvider())
        const socket = deps.socketStatusProvider?.()
        let reason: string
        if (appToken === '') reason = '未配置 App-Level Token（appToken 或环境变量 DSH_SLACK_APP_TOKEN），Socket Mode 不会启动，收件箱永远收不到消息。下一步：在 Slack App 里开启 Socket Mode 并生成 xapp- 开头的 Token，填进 DSH「设置 → 插件 → Slack」的 appToken（或设置环境变量 DSH_SLACK_APP_TOKEN）。'
        else if (!appToken.startsWith('xapp-')) reason = 'appToken 格式不对（应以 xapp- 开头），Socket Mode 已跳过启动。下一步：重新复制 App-Level Token 并更新配置后重启。'
        else if (socket === undefined) reason = 'Socket Mode 尚未开始连接（刚启动时可能还没就绪）。下一步：等几秒重试；持续为空请运行 slack_health 检查连接状态。'
        else if (socket.state !== 'connected') reason = 'Socket Mode 未连接（当前状态：' + (SOCKET_STATE_LABELS[socket.state] ?? socket.state) + '）。下一步：运行 slack_health 看具体原因；网络类问题会自动退避重连，invalid_auth 需要更换 App-Level Token。'
        else reason = 'Socket Mode 已连接，但队列里暂时没有新消息：只有已订阅事件（message.channels / message.im）且未带 subtype 的消息会进入收件箱。下一步：在 Slack 里再发一条测试消息，或检查 App 的事件订阅。'
        return [textBlock('收件箱为空：' + reason)]
      }
      const lines = v.messages.map((m) => '[' + m.channel + '] ' + m.user + '（ts: ' + m.ts + '）：' + m.text)
      return [textBlock('收件箱（' + v.messages.length + ' 条，新的在前；剩余未读 ' + (v.remaining ?? 0) + ' 条）：\n' + lines.join('\n'))]
    },
  }

  return {
    name: 'slack_inbox',
    isConcurrencySafe: (args) => (args as { markRead?: unknown } | undefined)?.markRead !== true,
    description: '读取通过 Socket Mode 收到的 Slack 消息（内存队列，最多保留 200 条，新的在前）。',
    parameters,
    output,
    async execute(args) {
      const raw = args as { limit?: unknown; markRead?: unknown }
      const limit = clampLimit(raw.limit)
      const markRead = raw.markRead === true
      const queue = deps.inboxProvider()
      const messages = markRead ? queue.drain(limit) : queue.list(limit)
      
      return { messages: messages.map((m) => ({ ts: m.ts, channel: m.channel, user: m.user, text: m.text })), remaining: queue.size }
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
      return [textBlock('已线程回复 ' + v.channel + '（回复消息 ts：' + v.ts + '）。如需继续跟进同一线程，继续用原消息的 thread_ts，而不是这条回复的 ts。')]
    },
  }

  return {
    name: 'slack_reply',
    description: '以线程回复的形式回复某条 Slack 消息（chat.postMessage 带 thread_ts）。',
    parameters,
    output,
    timeoutMs: 30000,
    async execute(args, exec) {
      const signal = executionSignal(exec)
      signal?.throwIfAborted()
      const raw = args as { channel?: unknown; text?: unknown; thread_ts?: unknown }
      const channel = assertChannel(raw.channel)
      const text = assertText(raw.text)
      const thread_ts = assertThreadTs(raw.thread_ts)
      const client = deps.clientProvider()
      try {
        const result = await client.postMessage({ channel, text, thread_ts }, signal)
        signal?.throwIfAborted()
        return { ts: result.ts, channel }
      } catch (error) {
        signal?.throwIfAborted()
        throw new Error(mapSlackError(error))
      }
    },
  }
}

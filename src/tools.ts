import { compileParameters } from './compile.js'
import type { SlackConfig } from './config.js'
import { isValidSlackApiUrl, resolveAppToken, resolveDefaultChannel, resolveToken, validateTokenFormat } from './config.js'
import type { ContentBlock, ToolDefinition, ToolOutputDefinition } from './types.js'
import type {
  AuthTestResult,
  ChannelInfo,
  HistoryMessage,
  HistoryResult,
  ListChannelsOptions,
  SlackClient,
} from './slack-client.js'
import {
  assertChannel,
  assertReactionName,
  assertText,
  assertThreadTs,
  assertTimestamp,
  mapSlackError,
  normalizeHistoryTimestamp,
} from './slack-client.js'
import type { InboxMessage, InboxQueue } from './inbox.js'
import type { SocketStatus } from './socket.js'
import { inspectProxyEnv } from './transport.js'

function executionSignal(exec: unknown): AbortSignal | undefined {
  const signal = (exec as { signal?: unknown } | null)?.signal
  return signal instanceof AbortSignal ? signal : undefined
}

function asRecord(args: unknown): Record<string, unknown> {
  if (args !== null && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>
  }
  return {}
}

/** 工具构建的依赖注入点。 */
export interface ToolDeps {
  clientProvider: () => SlackClient
  configProvider: () => SlackConfig | undefined
  inboxProvider: () => InboxQueue
  socketStatusProvider?: () => SocketStatus | undefined
  onBotUserIdResolved?: (userId: string) => void
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
          is_private: { type: 'boolean' },
          is_member: { type: 'boolean' },
          num_members: { type: 'integer' },
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
          thread_ts: { type: 'string' },
          event_type: { type: 'string', enum: ['message', 'app_mention'] },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                mimetype: { type: 'string' },
              },
              additionalProperties: true,
            },
          },
        },
        required: ['ts', 'channel', 'user', 'text'],
        additionalProperties: true,
      },
    },
  },
  required: ['messages', 'remaining'],
  additionalProperties: true,
} as const

const HISTORY_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    channel: { type: 'string' },
    has_more: { type: 'boolean' },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ts: { type: 'string' },
          user: { type: 'string' },
          userName: { type: 'string' },
          bot_id: { type: 'string' },
          text: { type: 'string' },
          thread_ts: { type: 'string' },
          reply_count: { type: 'integer' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                mimetype: { type: 'string' },
                size: { type: 'integer' },
              },
              additionalProperties: true,
            },
          },
        },
        required: ['ts', 'text'],
        additionalProperties: true,
      },
    },
  },
  required: ['channel', 'messages', 'has_more'],
  additionalProperties: true,
} as const

const UPLOAD_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    channel: { type: 'string' },
    file_id: { type: 'string' },
    filename: { type: 'string' },
    permalink: { type: 'string' },
  },
  required: ['ok', 'channel', 'filename'],
  additionalProperties: true,
} as const

const REACT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    channel: { type: 'string' },
    timestamp: { type: 'string' },
    name: { type: 'string' },
  },
  required: ['ok', 'channel', 'timestamp', 'name'],
  additionalProperties: true,
} as const

function textBlock(text: string): ContentBlock {
  return { type: 'text', text }
}

function clampRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function resolveTargetChannel(rawChannel: unknown, config: SlackConfig | undefined): string {
  const explicitChannel = typeof rawChannel === 'string' ? rawChannel.trim() : rawChannel
  if (explicitChannel === undefined || explicitChannel === null || explicitChannel === '') {
    const fallback = resolveDefaultChannel(config).trim()
    if (!fallback) {
      throw new Error('channel 参数错误：未指定目标频道且未配置默认频道（defaultChannel）；请传入频道名（如 #general）或频道 ID，或在 DSH「设置 → 插件 → Slack」配置 defaultChannel。')
    }
    return assertChannel(fallback)
  }
  return assertChannel(explicitChannel)
}

function assertOptionalHistoryTs(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return normalizeHistoryTimestamp(value, fieldName)
}

function assertFilename(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('filename 参数错误：必须是上传文件名的非空字符串（如 report.md）。')
  }
  return value.trim()
}

function normalizeHistoryMessage(m: HistoryMessage): HistoryMessage {
  return {
    ts: m.ts,
    text: m.text,
    ...(m.user !== undefined ? { user: m.user } : {}),
    ...(m.userName !== undefined ? { userName: m.userName } : {}),
    ...(m.bot_id !== undefined ? { bot_id: m.bot_id } : {}),
    ...(m.thread_ts !== undefined ? { thread_ts: m.thread_ts } : {}),
    ...(typeof m.reply_count === 'number' ? { reply_count: m.reply_count } : {}),
    ...(Array.isArray(m.files) && m.files.length > 0
      ? {
        files: m.files.map((f) => ({
          ...(f.name !== undefined ? { name: f.name } : {}),
          ...(f.mimetype !== undefined ? { mimetype: f.mimetype } : {}),
          ...(typeof f.size === 'number' ? { size: f.size } : {}),
        })),
      }
      : {}),
  }
}

function normalizeHistoryResult(result: HistoryResult): HistoryResult {
  return {
    channel: result.channel,
    messages: result.messages.map(normalizeHistoryMessage),
    has_more: Boolean(result.has_more),
  }
}

function formatHistoryMessageLine(m: HistoryMessage, roleLabel?: string): string {
  const sender = m.userName && m.user
    ? `${m.userName}（${m.user}）`
    : m.userName || m.user || (m.bot_id ? `bot:${m.bot_id}` : '未知发送者')
  const metaParts = ['ts: ' + m.ts]
  if (m.thread_ts && m.thread_ts !== m.ts) metaParts.push('thread_ts: ' + m.thread_ts)
  if (typeof m.reply_count === 'number' && m.reply_count > 0) metaParts.push(m.reply_count + ' 条回复')
  const filesSuffix = Array.isArray(m.files) && m.files.length > 0
    ? ' [附件：' + m.files.map((f) => f.name || '未命名文件').join('、') + ']'
    : ''
  const prefix = roleLabel ? roleLabel + ' ' : ''
  return `${prefix}${sender}（${metaParts.join('，')}）：${m.text}${filesSuffix}`
}

/** Socket Mode 状态 → 用户可读文案（自检与收件箱共用，避免两处各写一份）。 */
const SOCKET_STATE_LABELS: Record<string, string> = {
  connecting: '正在连接',
  connected: '已连接',
  reconnecting: '已断开，退避重连中',
  auth_failed: '令牌或权限无效，已停止重连；更新 App-Level Token 后重启插件',
  stopped: '已停止',
}

/** 自检工具：检查 token / appToken / 默认频道 / API 地址 / 代理环境配置与 Socket Mode 连接状态；可选 verify=true 在线验证。 */
export function buildHealthTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    verify: {
      type: 'boolean',
      description: '可选：为 true 时调用 Slack auth.test 在线验证令牌有效性并返回工作区/机器人信息与已授予权限（默认 false，不发起网络请求）。',
    },
  })

  return {
    name: 'slack_health',
    isConcurrencySafe: () => true,
    timeoutMs: 30000,
    description: 'dsh-slack 自检：检查 botToken / appToken / 默认频道配置和当前 Socket Mode 连接状态（默认不发起网络请求；传 verify=true 可调用 auth.test 在线验证）。遇到问题时先运行本工具定位。',
    parameters,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args: unknown, value: unknown) => {
        const rec = asRecord(value)
        const rawChecks = Array.isArray(rec.checks) ? rec.checks : []
        const lines = ['dsh-slack 自检' + (rec.ok === true ? '：正常。' : '：发现问题。')]
        const failed = new Map<string, string>()
        for (const item of rawChecks) {
          const c = asRecord(item)
          const name = String(c.name ?? '检查项')
          const detail = String(c.detail ?? '')
          lines.push('- ' + name + '：' + (c.ok === true ? '✅ ' + detail : '❌ ' + detail))
          if (c.ok !== true) failed.set(name, detail)
        }
        if (failed.size > 0) {
          lines.push('', '下一步：')
          if (failed.has('botToken')) {
            const detail = failed.get('botToken') ?? ''
            if (detail.includes('未配置')) {
              lines.push('  · botToken 未配置：在 DSH「设置 → 插件 → Slack（dsh-slack）」直接填写 token（保存即生效，无需重启），或在 profile 的 cordis.patch.yml 覆盖 slack 行，或设置环境变量 DSH_SLACK_TOKEN。')
            } else {
              lines.push('  · botToken 格式无效：请填写以 xoxb- / xoxp-（或 xoxe.xoxb- / xoxe.xoxp-）开头的令牌，勿将 xapp- App-Level Token 填在 token 栏；在 DSH「设置 → 插件 → Slack（dsh-slack）」或环境变量 DSH_SLACK_TOKEN 更正（保存即生效）。')
            }
          }
          if (failed.has('appToken')) {
            lines.push('  · appToken 格式无效：请确认 App-Level Token 以 xapp- 开头，在 DSH「设置 → 插件 → Slack」更正 appToken 后重载插件。')
          }
          if (failed.has('slackApiUrl')) {
            lines.push('  · slackApiUrl 格式无效：请填写合法的 http:// 或 https:// 地址，或留空以使用官方默认地址 https://slack.com/api/。')
          }
          if (failed.has('代理环境变量')) {
            lines.push('  · 代理环境变量无效：HTTP_PROXY / HTTPS_PROXY 必须为合法的 http:// 或 https:// URL（暂不支持 socks5:// / ftp:// 等协议），请更正或清理无效环境变量。')
          }
          if (failed.has('Socket Mode')) {
            lines.push('  · Socket Mode 未连上：确认 App-Level Token 为 xapp- 开头（具备 connections:write）、slackApiUrl 合法、App 已开启 Socket Mode 并订阅 message.channels / message.groups / message.im / message.mpim / app_mention（需配 app_mentions:read）；invalid_auth 需要重新生成令牌并在「设置 → 插件 → Slack」更新 appToken。')
          }
          if (failed.has('在线鉴权（auth.test）')) {
            lines.push('  · 在线鉴权失败：请按上方错误提示检查令牌状态、已授予权限或网络连通性，修复后再次运行 slack_health(verify=true)。')
          }
          lines.push('  · 填好后再次运行 slack_health 复查。')
        }
        return [textBlock(lines.join('\n'))]
      },
    },
    async execute(args, exec) {
      const signal = executionSignal(exec)
      signal?.throwIfAborted()
      const raw = asRecord(args)
      const verify = raw.verify === true
      const config = deps.configProvider()
      const checks: Array<Record<string, unknown>> = []

      const token = resolveToken(config)
      const tokenCheck = token !== '' ? validateTokenFormat(token) : undefined
      const tokenValid = token !== '' && tokenCheck?.valid === true
      if (token === '') {
        checks.push({
          name: 'botToken',
          ok: false,
          detail: '未配置：请在 DSH「设置 → 插件 → Slack」填写 token 或设置环境变量 DSH_SLACK_TOKEN（发送/频道工具需要）',
        })
      } else if (tokenCheck?.valid) {
        const kindLabel = tokenCheck.kind === 'bot' ? 'Bot Token' : tokenCheck.kind === 'user' ? 'User Token' : ''
        checks.push({
          name: 'botToken',
          ok: true,
          detail: kindLabel ? '已配置（' + kindLabel + '）' : '已配置',
        })
      } else {
        const detail = tokenCheck?.reason
          ?? (tokenCheck?.kind === 'app'
            ? '格式无效：检测到 xapp- App-Level Token，请将其填在 appToken 栏，并在 token 栏填写 xoxb- 或 xoxp- 令牌'
            : '格式无效：token 须以 xoxb-、xoxp-、xoxe.xoxb- 或 xoxe.xoxp- 开头')
        checks.push({ name: 'botToken', ok: false, detail })
      }

      const appToken = resolveAppToken(config)
      const appTokenValid = appToken === '' || appToken.startsWith('xapp-')
      const appTokenDetail = appToken === ''
        ? '未配置（收件箱功能不可用，通知不受影响）'
        : appTokenValid
          ? '已配置（Socket Mode 连接状态见下项）'
          : '格式无效：App-Level Token 须以 xapp- 开头（已跳过 Socket Mode 启动）'
      checks.push({ name: 'appToken', ok: appTokenValid, detail: appTokenDetail })

      const defaultChannel = resolveDefaultChannel(config)
      checks.push({
        name: '默认频道',
        ok: true,
        detail: defaultChannel !== '' ? defaultChannel : '未配置（发送时必须显式给 channel）',
      })

      const apiUrl = config?.slackApiUrl
      const apiUrlValid = !apiUrl || isValidSlackApiUrl(apiUrl)
      if (apiUrl && !apiUrlValid) {
        checks.push({
          name: 'slackApiUrl',
          ok: false,
          detail: '格式无效：必须是合法的 http:// 或 https:// URL（当前：' + apiUrl + '）',
        })
      }

      const proxyReport = inspectProxyEnv()
      if (proxyReport.invalidEntries.length > 0) {
        const details = proxyReport.invalidEntries.map((entry) => entry.reason).join('；')
        checks.push({
          name: '代理环境变量',
          ok: false,
          detail: '检测到无效或不受支持的代理配置（已忽略无效项）：' + details,
        })
      }

      const socket = deps.socketStatusProvider?.()
      if (appToken !== '') {
        const socketSharedHint = socket?.state === 'connected'
          && typeof socket.activeConnections === 'number'
          && socket.activeConnections > 1
          ? `（注意：检测到 ${socket.activeConnections} 个并发连接，Slack 会将事件分流到不同实例）`
          : ''
        checks.push({
          name: 'Socket Mode',
          ok: appTokenValid && apiUrlValid && socket?.state === 'connected',
          detail: !appTokenValid
            ? '未启动：appToken 须以 xapp- 开头，已跳过 Socket Mode 连接'
            : !apiUrlValid
              ? '未启动：slackApiUrl 格式无效，已跳过 Socket Mode 连接（避免误连公共 Slack 服务）'
              : socket
                ? SOCKET_STATE_LABELS[socket.state] + (socket.error ? '（' + socket.error + '）' : '') + socketSharedHint
                : '仅检查配置，尚未确认连接',
        })
      }

      let authPayload: Record<string, unknown> | undefined
      if (verify) {
        if (!tokenValid || !apiUrlValid) {
          checks.push({
            name: '在线鉴权（auth.test）',
            ok: false,
            detail: '已跳过：请先修复 botToken 或 slackApiUrl 配置后再执行在线验证',
          })
        } else {
          const client = deps.clientProvider()
          if (typeof client.authTest !== 'function') {
            checks.push({
              name: '在线鉴权（auth.test）',
              ok: false,
              detail: '当前客户端实现不支持 auth.test 在线验证',
            })
          } else {
            try {
              const auth: AuthTestResult = await client.authTest(signal)
              signal?.throwIfAborted()
              if (auth.ok === true && typeof auth.user_id === 'string' && auth.user_id !== '') {
                deps.onBotUserIdResolved?.(auth.user_id)
              }
              const parts: string[] = []
              if (auth.team) parts.push('工作区：' + auth.team)
              if (auth.user) parts.push('身份：' + auth.user)
              if (auth.user_id) parts.push('用户 ID：' + auth.user_id)
              if (auth.bot_id) parts.push('机器人 ID：' + auth.bot_id)
              if (Array.isArray(auth.scopes) && auth.scopes.length > 0) parts.push('权限：' + auth.scopes.join(', '))
              checks.push({
                name: '在线鉴权（auth.test）',
                ok: auth.ok === true,
                detail: auth.ok === true
                  ? (parts.length > 0 ? '验证通过（' + parts.join('；') + '）' : '验证通过')
                  : '鉴权未通过',
              })
              authPayload = {
                ok: auth.ok,
                ...(auth.url !== undefined ? { url: auth.url } : {}),
                ...(auth.team !== undefined ? { team: auth.team } : {}),
                ...(auth.user !== undefined ? { user: auth.user } : {}),
                ...(auth.team_id !== undefined ? { team_id: auth.team_id } : {}),
                ...(auth.user_id !== undefined ? { user_id: auth.user_id } : {}),
                ...(auth.bot_id !== undefined ? { bot_id: auth.bot_id } : {}),
                ...(auth.scopes !== undefined ? { scopes: auth.scopes } : {}),
              }
            } catch (error) {
              signal?.throwIfAborted()
              checks.push({
                name: '在线鉴权（auth.test）',
                ok: false,
                detail: mapSlackError(error),
              })
            }
          }
        }
      }

      const ok = tokenValid && checks.every((check) => check.ok === true)
      return {
        ok,
        plugin: 'dsh-slack',
        checks,
        ...(socket ? { socket } : {}),
        ...(authPayload ? { auth: authPayload } : {}),
      }
    },
  }
}

export function buildNotifyTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    channel: {
      type: 'string',
      description: '目标频道：频道名（如 #general）或频道 ID。省略或留空时自动回退到当前配置的默认频道（defaultChannel，支持热更新）。',
    },
    text: { type: 'string', required: true, description: '要发送的 Markdown 文本内容。' },
    thread_ts: { type: 'string', description: '可选：回复某条消息所在线程的 ts（即 slack_notify 或 slack_inbox 返回的 ts）。' },
  })

  const output: ToolOutputDefinition = {
    schema: NOTIFY_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = asRecord(value)
      const ch = typeof v.channel === 'string' && v.channel ? v.channel : '目标频道'
      const ts = typeof v.ts === 'string' && v.ts ? v.ts : '未知'
      return [textBlock('已发送到 ' + ch + '（消息 ts：' + ts + '）。需要在同一条消息下继续讨论时，把这个 ts 作为 slack_reply 的 thread_ts。')]
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
      const raw = asRecord(args)
      const channel = resolveTargetChannel(raw.channel, deps.configProvider())
      const text = assertText(raw.text)
      const thread_ts = raw.thread_ts !== undefined && raw.thread_ts !== null && raw.thread_ts !== ''
        ? assertThreadTs(raw.thread_ts)
        : undefined
      const client = deps.clientProvider()
      try {
        const result = await client.postMessage({
          channel,
          text,
          ...(thread_ts !== undefined ? { thread_ts } : {}),
        }, signal)
        signal?.throwIfAborted()
        return { ts: result.ts, channel: result.channel || channel }
      } catch (error) {
        signal?.throwIfAborted()
        throw new Error(mapSlackError(error))
      }
    },
  }
}

export function buildChannelsTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    scope: {
      type: 'string',
      enum: ['joined', 'all'],
      description: '频道范围：joined（默认，仅列出机器人已加入的频道）或 all（列出工作区可见频道）。',
    },
  })

  const output: ToolOutputDefinition = {
    schema: CHANNELS_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = asRecord(value)
      const channels = Array.isArray(v.channels) ? (v.channels as ChannelInfo[]) : []
      if (channels.length === 0) {
        return [textBlock('机器人当前看不到任何频道（可能需要先把 App 加入频道，或改用 scope="all" 查看工作区可见频道）。下一步：在 Slack 里用 /invite @你的机器人 把 App 加进目标频道，或检查 App 是否勾选了 channels:read（私密频道需 groups:read）权限，然后重新调用 slack_channels。')]
      }
      // 带上频道 ID：私密频道/重名频道只有 ID 是唯一的，slack_notify 和 slack_reply 都接受 ID。
      const names = channels.map((c) => {
        const badges: string[] = []
        if (c.is_private === true) badges.push('私密')
        else if (c.is_private === false) badges.push('公开')
        if (c.is_member === false) badges.push('未加入')
        const badgeText = badges.length > 0 ? '[' + badges.join('·') + ']' : ''
        return '#' + c.name + '（' + c.id + '）' + badgeText
      }).join('、')
      return [textBlock('机器人可见频道（' + channels.length + ' 个）：' + names + '。')]
    },
  }

  return {
    name: 'slack_channels',
    isConcurrencySafe: () => true,
    description: '列出当前 Slack 机器人可见的频道（默认仅列出已加入频道，传入 scope="all" 可列出工作区全部可见频道）。',
    parameters,
    output,
    timeoutMs: 30000,
    async execute(args, exec) {
      const signal = executionSignal(exec)
      signal?.throwIfAborted()
      const raw = asRecord(args)
      let scope: ListChannelsOptions['scope'] = 'joined'
      if (raw.scope !== undefined && raw.scope !== null && raw.scope !== '') {
        if (raw.scope !== 'joined' && raw.scope !== 'all') {
          throw new Error('scope 参数错误：仅支持 joined（仅列出已加入频道，默认）或 all（列出工作区可见频道）。')
        }
        scope = raw.scope
      }
      const client = deps.clientProvider()
      try {
        const channels = await client.listChannels(signal, { scope })
        signal?.throwIfAborted()
        return {
          channels: channels.map((c) => ({
            id: c.id,
            name: c.name,
            ...(typeof c.is_private === 'boolean' ? { is_private: c.is_private } : {}),
            ...(typeof c.is_member === 'boolean' ? { is_member: c.is_member } : {}),
            ...(typeof c.num_members === 'number' ? { num_members: c.num_members } : {}),
          })),
        }
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
      const v = asRecord(value)
      const messages = Array.isArray(v.messages) ? (v.messages as InboxMessage[]) : []
      const remaining = typeof v.remaining === 'number' ? v.remaining : 0
      if (messages.length === 0) {
        // 「没配 appToken」「Socket 断了」「连着但没消息」三种空收件箱的修法完全不同。
        const appToken = resolveAppToken(deps.configProvider())
        const socket = deps.socketStatusProvider?.()
        let reason: string
        if (appToken === '') reason = '未配置 App-Level Token（appToken 或环境变量 DSH_SLACK_APP_TOKEN），Socket Mode 不会启动，收件箱永远收不到消息。下一步：在 Slack App 里开启 Socket Mode 并生成 xapp- 开头的 Token，填进 DSH「设置 → 插件 → Slack」的 appToken（或设置环境变量 DSH_SLACK_APP_TOKEN）。'
        else if (!appToken.startsWith('xapp-')) reason = 'appToken 格式不对（应以 xapp- 开头），Socket Mode 已跳过启动。下一步：重新复制 App-Level Token 并更新配置后重启。'
        else if (socket === undefined) reason = 'Socket Mode 尚未开始连接（刚启动时可能还没就绪）。下一步：等几秒重试；持续为空请运行 slack_health 检查连接状态。'
        else if (socket.state !== 'connected') reason = 'Socket Mode 未连接（当前状态：' + (SOCKET_STATE_LABELS[socket.state] ?? socket.state) + '）。下一步：运行 slack_health 看具体原因；网络类问题会自动退避重连，invalid_auth 需要更换 App-Level Token。'
        else reason = 'Socket Mode 已连接，但队列里暂时没有新消息：只有已订阅事件（message.channels / message.groups / message.im / message.mpim / app_mention）且属于普通消息、线程广播或文件分享的消息会进入收件箱。下一步：在 Slack 里再发一条测试消息，或检查 App 的事件订阅。'
        return [textBlock('收件箱为空：' + reason)]
      }
      let hasThread = false
      const lines = messages.map((m) => {
        const prefix = m.event_type === 'app_mention' ? '[@提及] ' : ''
        if (m.thread_ts) hasThread = true
        const tsMeta = m.thread_ts ? 'ts: ' + m.ts + ', thread_ts: ' + m.thread_ts : 'ts: ' + m.ts
        const filesSuffix = Array.isArray(m.files) && m.files.length > 0
          ? ' [附件 ' + m.files.length + ' 个' + (m.files.some((f) => f.name) ? '：' + m.files.map((f) => f.name || '未命名').join('、') : '') + ']'
          : ''
        return prefix + '[' + m.channel + '] ' + m.user + '（' + tsMeta + '）：' + m.text + filesSuffix
      })
      const tip = hasThread ? '\n提示：回复线程内消息时，请把对应消息的 thread_ts 传给 slack_reply，而非单条回复的 ts。' : ''
      return [textBlock('收件箱（' + messages.length + ' 条，新的在前；剩余未读 ' + remaining + ' 条）：\n' + lines.join('\n') + tip)]
    },
  }

  return {
    name: 'slack_inbox',
    isConcurrencySafe: (args) => (args as { markRead?: unknown } | undefined)?.markRead !== true,
    description: '读取通过 Socket Mode 收到的 Slack 消息（内存队列，最多保留 200 条，新的在前）。',
    parameters,
    output,
    async execute(args, exec) {
      const signal = executionSignal(exec)
      signal?.throwIfAborted()
      const raw = asRecord(args)
      const limit = clampRange(raw.limit, 10, 1, 50)
      const markRead = raw.markRead === true
      const queue = deps.inboxProvider()
      const messages = markRead ? queue.drain(limit) : queue.list(limit)

      return {
        messages: messages.map((m) => ({
          ts: m.ts,
          channel: m.channel,
          user: m.user,
          text: m.text,
          ...(m.thread_ts !== undefined ? { thread_ts: m.thread_ts } : {}),
          ...(m.event_type !== undefined ? { event_type: m.event_type } : {}),
          ...(Array.isArray(m.files) && m.files.length > 0
            ? {
              files: m.files.map((f) => ({
                ...(f.name !== undefined ? { name: f.name } : {}),
                ...(f.mimetype !== undefined ? { mimetype: f.mimetype } : {}),
              })),
            }
            : {}),
        })),
        remaining: queue.size,
      }
    },
  }
}

export function buildReplyTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    channel: { type: 'string', required: true, description: '目标频道：频道名（如 #general）或频道 ID。' },
    text: { type: 'string', required: true, description: '回复内容（Markdown 文本）。' },
    thread_ts: { type: 'string', required: true, description: '要回复消息的 ts（来自 slack_inbox / slack_history / slack_notify 返回的 ts 或 thread_ts）。' },
  })

  const output: ToolOutputDefinition = {
    schema: NOTIFY_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = asRecord(value)
      const ch = typeof v.channel === 'string' && v.channel ? v.channel : '目标频道'
      const ts = typeof v.ts === 'string' && v.ts ? v.ts : '未知'
      return [textBlock('已线程回复 ' + ch + '（回复消息 ts：' + ts + '）。如需继续跟进同一线程，继续用原消息的 thread_ts，而不是这条回复的 ts。')]
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
      const raw = asRecord(args)
      const channel = assertChannel(raw.channel)
      const text = assertText(raw.text)
      const thread_ts = assertThreadTs(raw.thread_ts)
      const client = deps.clientProvider()
      try {
        const result = await client.postMessage({ channel, text, thread_ts }, signal)
        signal?.throwIfAborted()
        return { ts: result.ts, channel: result.channel || channel }
      } catch (error) {
        signal?.throwIfAborted()
        throw new Error(mapSlackError(error))
      }
    },
  }
}

export function buildHistoryTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    channel: { type: 'string', required: true, description: '目标频道：频道名（如 #general）或频道 ID（如 C01234567）。' },
    limit: { type: 'integer', description: '最多返回的消息数（默认 20，范围 1-100）。' },
    oldest: { type: 'string', description: '可选：起始时间边界，支持 Slack 时间戳 ts（如 1700000000.000100）或 ISO-8601 时间（如 2026-11-26T00:00:00Z），只返回晚于该时间的消息。' },
    latest: { type: 'string', description: '可选：截止时间边界，支持 Slack 时间戳 ts 或 ISO-8601 时间，只返回早于该时间的消息。' },
  })

  const output: ToolOutputDefinition = {
    schema: HISTORY_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = asRecord(value)
      const ch = typeof v.channel === 'string' && v.channel ? v.channel : '目标频道'
      const messages = Array.isArray(v.messages) ? (v.messages as HistoryMessage[]) : []
      const hasMore = v.has_more === true
      if (messages.length === 0) {
        return [textBlock('频道 ' + ch + ' 在当前查询范围内没有历史消息。')]
      }
      const lines = messages.map((m) => formatHistoryMessageLine(m))
      const header = '频道 ' + ch + ' 历史消息（共 ' + messages.length + ' 条' + (hasMore ? '，还有更早消息' : '') + '）：'
      return [textBlock(header + '\n' + lines.join('\n'))]
    },
  }

  return {
    name: 'slack_history',
    isConcurrencySafe: () => true,
    description: '读取指定 Slack 频道的历史消息（conversations.history），支持指定条数与时间范围。',
    parameters,
    output,
    timeoutMs: 30000,
    async execute(args, exec) {
      const signal = executionSignal(exec)
      signal?.throwIfAborted()
      const raw = asRecord(args)
      const channel = assertChannel(raw.channel)
      const limit = clampRange(raw.limit, 20, 1, 100)
      const oldest = assertOptionalHistoryTs(raw.oldest, 'oldest')
      const latest = assertOptionalHistoryTs(raw.latest, 'latest')
      const client = deps.clientProvider()
      if (typeof client.getHistory !== 'function') {
        throw new Error('当前 Slack 客户端不支持历史消息读取（getHistory）。')
      }
      try {
        const result = await client.getHistory({
          channel,
          limit,
          ...(oldest !== undefined ? { oldest } : {}),
          ...(latest !== undefined ? { latest } : {}),
        }, signal)
        signal?.throwIfAborted()
        return normalizeHistoryResult(result)
      } catch (error) {
        signal?.throwIfAborted()
        throw new Error(mapSlackError(error))
      }
    },
  }
}

export function buildThreadTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    channel: { type: 'string', required: true, description: '目标频道：频道名（如 #general）或频道 ID（如 C01234567）。' },
    thread_ts: { type: 'string', required: true, description: '线程父消息的 ts（如 1700000000.000100）。' },
    limit: { type: 'integer', description: '最多返回的消息数（默认 50，范围 1-100）。' },
  })

  const output: ToolOutputDefinition = {
    schema: HISTORY_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = asRecord(value)
      const ch = typeof v.channel === 'string' && v.channel ? v.channel : '目标频道'
      const messages = Array.isArray(v.messages) ? (v.messages as HistoryMessage[]) : []
      const hasMore = v.has_more === true
      if (messages.length === 0) {
        return [textBlock('线程中未找到消息（频道：' + ch + '）。')]
      }
      const lines = messages.map((m, idx) => formatHistoryMessageLine(m, idx === 0 ? '[主消息]' : '[回复 #' + idx + ']'))
      const header = '线程上下文（频道 ' + ch + '，共 ' + messages.length + ' 条' + (hasMore ? '，还有更多回复' : '') + '）：'
      return [textBlock(header + '\n' + lines.join('\n'))]
    },
  }

  return {
    name: 'slack_thread',
    isConcurrencySafe: () => true,
    description: '读取指定 Slack 线程的完整消息上下文（conversations.replies），包含父消息及回复。',
    parameters,
    output,
    timeoutMs: 30000,
    async execute(args, exec) {
      const signal = executionSignal(exec)
      signal?.throwIfAborted()
      const raw = asRecord(args)
      const channel = assertChannel(raw.channel)
      const thread_ts = assertThreadTs(raw.thread_ts)
      const limit = clampRange(raw.limit, 50, 1, 100)
      const client = deps.clientProvider()
      if (typeof client.getThread !== 'function') {
        throw new Error('当前 Slack 客户端不支持线程读取（getThread）。')
      }
      try {
        const result = await client.getThread({ channel, thread_ts, limit }, signal)
        signal?.throwIfAborted()
        return normalizeHistoryResult(result)
      } catch (error) {
        signal?.throwIfAborted()
        throw new Error(mapSlackError(error))
      }
    },
  }
}

export function buildUploadTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    channel: {
      type: 'string',
      description: '目标频道：频道名（如 #general）或频道 ID。省略或留空时自动回退到当前配置的默认频道（defaultChannel，支持热更新）。',
    },
    filename: { type: 'string', required: true, description: '上传后的文件名（如 report.md 或 build.log）。' },
    content: { type: 'string', description: '要上传的文本内容（与 file_path 二选一）。' },
    file_path: { type: 'string', description: '本地文件路径（与 content 二选一）。' },
    title: { type: 'string', description: '可选：文件在 Slack 中显示的标题。' },
    initial_comment: { type: 'string', description: '可选：随文件一起发布的说明文字。' },
    thread_ts: { type: 'string', description: '可选：将文件上传到指定线程的 ts。' },
  })

  const output: ToolOutputDefinition = {
    schema: UPLOAD_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = asRecord(value)
      const filename = typeof v.filename === 'string' && v.filename ? v.filename : '文件'
      const ch = typeof v.channel === 'string' && v.channel ? v.channel : '目标频道'
      const fileId = typeof v.file_id === 'string' && v.file_id ? v.file_id : ''
      const permalink = typeof v.permalink === 'string' && v.permalink ? v.permalink : ''
      const meta: string[] = []
      if (fileId) meta.push('文件 ID：' + fileId)
      const head = '已上传文件 ' + filename + ' 到频道 ' + ch + (meta.length > 0 ? '（' + meta.join('，') + '）' : '') + '。'
      return [textBlock(permalink ? head + '\n链接：' + permalink : head)]
    },
  }

  return {
    name: 'slack_upload',
    description: '上传文本内容或本地文件到指定 Slack 频道（或线程），适合分享日志、报告与附件（filesUploadV2）。',
    parameters,
    output,
    timeoutMs: 60000,
    async execute(args, exec) {
      const signal = executionSignal(exec)
      signal?.throwIfAborted()
      const raw = asRecord(args)
      const channel = resolveTargetChannel(raw.channel, deps.configProvider())
      const filename = assertFilename(raw.filename)

      if (raw.content !== undefined && raw.content !== null && typeof raw.content !== 'string') {
        throw new Error('content 参数错误：必须是字符串。')
      }
      if (raw.file_path !== undefined && raw.file_path !== null && typeof raw.file_path !== 'string') {
        throw new Error('file_path 参数错误：必须是本地文件路径的字符串。')
      }

      const rawContent = typeof raw.content === 'string' ? raw.content : undefined
      const rawFilePath = typeof raw.file_path === 'string' ? raw.file_path.trim() : ''
      const hasContent = rawContent !== undefined && rawContent.length > 0
      const hasFilePath = rawFilePath !== ''

      if (hasContent && hasFilePath) {
        throw new Error('参数错误：content 与 file_path 不能同时提供，请二选一。')
      }
      if (!hasContent && !hasFilePath) {
        if (rawContent === '') {
          throw new Error('content 参数错误：内容不能为空，Slack 不支持上传 0 字节文件；如需上传本地文件请提供 file_path。')
        }
        if (typeof raw.file_path === 'string' && raw.file_path.trim() === '') {
          throw new Error('file_path 参数错误：必须是本地文件路径的非空字符串（或改用 content 提供文本内容）。')
        }
        throw new Error('参数错误：必须提供 content（文本内容）或 file_path（本地文件路径）之一。')
      }

      const content = hasContent ? rawContent : undefined
      const file_path = hasFilePath ? rawFilePath : undefined

      let title: string | undefined
      if (raw.title !== undefined && raw.title !== null && raw.title !== '') {
        if (typeof raw.title !== 'string') throw new Error('title 参数错误：必须是字符串。')
        title = raw.title.trim() || undefined
      }

      let initial_comment: string | undefined
      if (raw.initial_comment !== undefined && raw.initial_comment !== null) {
        if (typeof raw.initial_comment !== 'string') throw new Error('initial_comment 参数错误：必须是字符串。')
        if (raw.initial_comment.trim() !== '') initial_comment = raw.initial_comment
      }

      const thread_ts = raw.thread_ts !== undefined && raw.thread_ts !== null && raw.thread_ts !== ''
        ? assertThreadTs(raw.thread_ts)
        : undefined

      const client = deps.clientProvider()
      if (typeof client.uploadFile !== 'function') {
        throw new Error('当前 Slack 客户端不支持文件上传（uploadFile）。')
      }
      try {
        const result = await client.uploadFile({
          channel,
          filename,
          ...(content !== undefined ? { content } : {}),
          ...(file_path !== undefined ? { file_path } : {}),
          ...(title !== undefined ? { title } : {}),
          ...(initial_comment !== undefined ? { initial_comment } : {}),
          ...(thread_ts !== undefined ? { thread_ts } : {}),
        }, signal)
        signal?.throwIfAborted()
        return {
          ok: result.ok,
          channel: result.channel || channel,
          filename: result.filename || filename,
          ...(result.file_id !== undefined ? { file_id: result.file_id } : {}),
          ...(result.permalink !== undefined ? { permalink: result.permalink } : {}),
        }
      } catch (error) {
        signal?.throwIfAborted()
        throw new Error(mapSlackError(error))
      }
    },
  }
}

export function buildReactTool(deps: ToolDeps): ToolDefinition {
  const parameters = compileParameters({
    channel: { type: 'string', required: true, description: '目标频道：频道名（如 #general）或频道 ID（如 C01234567）。' },
    timestamp: { type: 'string', required: true, description: '目标消息的时间戳 ts（如 1700000000.000100）。' },
    name: { type: 'string', required: true, description: '表情名称（如 thumbsup、white_check_mark、eyes，或常见 Unicode 表情如 👍、✅、👀，自动转为 Slack 短码）。' },
  })

  const output: ToolOutputDefinition = {
    schema: REACT_OUTPUT_SCHEMA,
    render: (_args, value) => {
      const v = asRecord(value)
      const ch = typeof v.channel === 'string' && v.channel ? v.channel : '目标频道'
      const timestamp = typeof v.timestamp === 'string' && v.timestamp ? v.timestamp : '未知'
      const emojiName = typeof v.name === 'string' && v.name ? v.name : '未知'
      return [textBlock('已为频道 ' + ch + ' 的消息（ts：' + timestamp + '）添加表情回应 :' + emojiName + ':。')]
    },
  }

  return {
    name: 'slack_react',
    description: '为指定 Slack 消息添加表情回应（reactions.add）。',
    parameters,
    output,
    timeoutMs: 30000,
    async execute(args, exec) {
      const signal = executionSignal(exec)
      signal?.throwIfAborted()
      const raw = asRecord(args)
      const channel = assertChannel(raw.channel)
      const timestamp = assertTimestamp(raw.timestamp)
      const name = assertReactionName(raw.name)
      const client = deps.clientProvider()
      if (typeof client.addReaction !== 'function') {
        throw new Error('当前 Slack 客户端不支持添加表情回应（addReaction）。')
      }
      try {
        const result = await client.addReaction({ channel, timestamp, name }, signal)
        signal?.throwIfAborted()
        const resolvedChannel = typeof (result as { channel?: unknown })?.channel === 'string'
          && (result as { channel: string }).channel.trim() !== ''
          ? (result as { channel: string }).channel.trim()
          : channel
        return { ok: result.ok, channel: resolvedChannel, timestamp, name }
      } catch (error) {
        signal?.throwIfAborted()
        throw new Error(mapSlackError(error))
      }
    },
  }
}

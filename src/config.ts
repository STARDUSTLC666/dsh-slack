/**
 * Slack 插件配置解析（懒加载、全中文错误）。
 *
 * 坑 5：配置缺失时插件【不失败】——apply 里 try/catch，失败只 console.warn；
 * 每个工具的 execute 再解析，缺失时抛出带中文指引的错误。
 */

/** Slack 插件配置。 */
export interface SlackConfig {
  token: string
  defaultChannel: string
  /** App-Level Token（xapp- 开头），用于 Socket Mode 接收消息。 */
  appToken: string
  /** Slack Web API 基地址；默认官方 https://slack.com/api/。企业网格（Enterprise Grid）与本地协议级测试可覆盖。 */
  slackApiUrl?: string
  /** 机器人 user id（U...），用于判断 @ 是否指向本机器人。 */
  botUserId?: string
  /** 收件箱触发器要唤醒的 DSH 定时任务 id；留空则关闭触发器。 */
  triggerTaskId?: string
}

/** token 的环境变量名。 */
export const ENV_TOKEN = 'DSH_SLACK_TOKEN'
/** appToken 的环境变量名。 */
export const ENV_APP_TOKEN = 'DSH_SLACK_APP_TOKEN'

/**
 * 解析原始配置。永不抛错：非法形状返回 undefined，让插件懒加载不失败。
 */
export function parseConfig(raw: unknown): SlackConfig | undefined {
  if (raw === undefined || raw === null) return { token: '', defaultChannel: '', appToken: '', botUserId: '', triggerTaskId: '' }
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  const token = typeof obj.token === 'string' ? obj.token.trim() : ''
  const defaultChannel = typeof obj.defaultChannel === 'string' ? obj.defaultChannel.trim() : ''
  const appToken = typeof obj.appToken === 'string' ? obj.appToken.trim() : ''
  const slackApiUrl = typeof obj.slackApiUrl === 'string' && obj.slackApiUrl.trim() !== '' ? obj.slackApiUrl.trim() : undefined
  const botUserId = typeof obj.botUserId === 'string' ? obj.botUserId.trim() : ''
  const triggerTaskId = typeof obj.triggerTaskId === 'string' ? obj.triggerTaskId.trim() : ''
  return { token, defaultChannel, appToken, botUserId, triggerTaskId, ...(slackApiUrl !== undefined ? { slackApiUrl } : {}) }
}

/**
 * 解析 token：config.token 优先，其次环境变量 DSH_SLACK_TOKEN。
 */
export function resolveToken(config: SlackConfig | undefined): string {
  const fromConfig = config?.token?.trim() ?? ''
  if (fromConfig) return fromConfig
  return process.env[ENV_TOKEN]?.trim() ?? ''
}

/**
 * 解析 appToken：config.appToken 优先，其次环境变量 DSH_SLACK_APP_TOKEN。
 */
export function resolveAppToken(config: SlackConfig | undefined): string {
  const fromConfig = config?.appToken?.trim() ?? ''
  if (fromConfig) return fromConfig
  return process.env[ENV_APP_TOKEN]?.trim() ?? ''
}

/**
 * 解析默认频道。
 */
export function resolveDefaultChannel(config: SlackConfig | undefined): string {
  return config?.defaultChannel ?? ''
}

/** 令牌格式校验结果。 */
export interface TokenValidationResult {
  valid: boolean
  kind: 'bot' | 'user' | 'app' | 'unknown'
  reason?: string
}

/**
 * 校验自定义 Slack Web API 基地址是否为合法的 http/https URL。
 */
export function isValidSlackApiUrl(url: string): boolean {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (trimmed === '') return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 校验 Slack Web API 令牌前缀格式（区分 Bot / User / 误填的 App-Level Token / 未知格式）。
 */
export function validateTokenFormat(token: string): TokenValidationResult {
  const trimmed = typeof token === 'string' ? token.trim() : ''
  if (trimmed === '') {
    return {
      valid: false,
      kind: 'unknown',
      reason: 'token 为空：请提供 Slack 机器人令牌（xoxb-...）或用户令牌（xoxp-...）。',
    }
  }
  if (trimmed.startsWith('xoxb-') || trimmed.startsWith('xoxe.xoxb-')) {
    return { valid: true, kind: 'bot' }
  }
  if (trimmed.startsWith('xoxp-') || trimmed.startsWith('xoxe.xoxp-')) {
    return { valid: true, kind: 'user' }
  }
  if (trimmed.startsWith('xapp-')) {
    return {
      valid: false,
      kind: 'app',
      reason: '检测到 App-Level Token（xapp- 开头）：该令牌仅用于 Socket Mode 收件箱，请改填到 appToken（或环境变量 DSH_SLACK_APP_TOKEN），不要填在 token 中；token 需填写机器人令牌（xoxb-...）或用户令牌（xoxp-...）。',
    }
  }
  return {
    valid: false,
    kind: 'unknown',
    reason: '令牌前缀格式无效：token 应以 xoxb-（机器人令牌）、xoxp-（用户令牌）或 xoxe.xoxb- / xoxe.xoxp-（可轮换令牌）开头。',
  }
}

/**
 * 要求 token：缺失时抛出带中文指引的错误（供 execute 使用）。
 */
export function requireToken(config: SlackConfig | undefined): string {
  const token = resolveToken(config)
  if (!token) {
    throw new Error(
      'token 未配置：缺少 Slack 机器人令牌（xoxb-）或用户令牌（xoxp-）。'
      + '可在 DSH「设置 → 插件 → Slack（dsh-slack）」直接填写 token（保存即生效，无需重启），或在 profile 的 cordis.patch.yml 覆盖 slack 行的 config.token，或设置环境变量 DSH_SLACK_TOKEN。',
    )
  }
  return token
}

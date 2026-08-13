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
}

/** token 的环境变量名。 */
export const ENV_TOKEN = 'DSH_SLACK_TOKEN'
/** appToken 的环境变量名。 */
export const ENV_APP_TOKEN = 'DSH_SLACK_APP_TOKEN'

/**
 * 解析原始配置。永不抛错：非法形状返回 undefined，让插件懒加载不失败。
 */
export function parseConfig(raw: unknown): SlackConfig | undefined {
  if (raw === undefined || raw === null) return { token: '', defaultChannel: '', appToken: '' }
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  const token = typeof obj.token === 'string' ? obj.token.trim() : ''
  const defaultChannel = typeof obj.defaultChannel === 'string' ? obj.defaultChannel.trim() : ''
  const appToken = typeof obj.appToken === 'string' ? obj.appToken.trim() : ''
  return { token, defaultChannel, appToken }
}

/**
 * 解析 token：config.token 优先，其次环境变量 DSH_SLACK_TOKEN。
 */
export function resolveToken(config: SlackConfig | undefined): string {
  const fromConfig = config?.token.trim() ?? ''
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

/**
 * 要求 token：缺失时抛出带中文指引的错误（供 execute 使用）。
 */
export function requireToken(config: SlackConfig | undefined): string {
  const token = resolveToken(config)
  if (!token) {
    throw new Error(
      'token 未配置：缺少 Slack 机器人令牌（xoxb-）或用户令牌（xoxp-）。'
      + '请在 profile 的 cordis.patch.yml 覆盖 slack 行的 config.token 并重启，或设置环境变量 DSH_SLACK_TOKEN。',
    )
  }
  return token
}

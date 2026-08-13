/**
 * dsh-slack：DSH 社区 Slack 通知/桥接插件。
 * v0.1 只做单向通知（agent→Slack），无 Socket Mode / RTM / 交互组件。
 * @module dsh-slack
 */

import { parseConfig, requireToken, type SlackConfig } from './config.js'
import { createWebSlackClient, type SlackClient } from './slack-client.js'
import { buildChannelsTool, buildNotifyTool } from './tools.js'
import type { SlackContext } from './types.js'

export const name = 'dsh-slack'
export const inject = ['tools']

export { compileParameters, type ParameterDsl, type ParameterDslMap, type JsonSchemaNode } from './compile.js'
export {
  parseConfig,
  resolveToken,
  resolveDefaultChannel,
  requireToken,
  ENV_TOKEN,
  type SlackConfig,
} from './config.js'
export {
  createWebSlackClient,
  mapSlackError,
  assertChannel,
  assertText,
  type SlackClient,
  type PostMessageParams,
  type ChannelInfo,
} from './slack-client.js'
export { buildNotifyTool, buildChannelsTool, type ToolDeps } from './tools.js'
export type { SlackContext, ToolDefinition, ToolOutputDefinition, ContentBlock } from './types.js'

/**
 * 插件入口。配置缺失【不失败】（懒加载）：只 console.warn；
 * token 缺失在每个工具的 execute 时抛出带中文指引的错误。
 */
export function apply(ctx: SlackContext, rawConfig: unknown): void {
  let config: SlackConfig | undefined
  try {
    config = parseConfig(rawConfig)
  } catch (error) {
    console.warn('[dsh-slack] 配置解析失败，工具将在调用时报错：', error)
    config = undefined
  }

  if (config === undefined) {
    console.warn('[dsh-slack] 配置缺失或格式错误：slack_notify / slack_channels 已注册，但调用时会报错。请在 profile 的 cordis.patch.yml 配置 slack 行并重启。')
  } else {
    const token = config.token.trim() || process.env.DSH_SLACK_TOKEN?.trim()
    if (!token) {
      console.warn('[dsh-slack] 未检测到 Slack 令牌（config.token 与 DSH_SLACK_TOKEN 均为空）：slack_notify / slack_channels 调用时会报错。')
    }
  }

  const configProvider = (): SlackConfig | undefined => config
  const clientProvider = (): SlackClient => {
    // 每次调用时重新解析配置（config.token 优先，环境变量回退），并懒创建客户端。
    const current = parseConfig(rawConfig)
    const token = requireToken(current)
    return createWebSlackClient(token)
  }

  const deps = { clientProvider, configProvider }
  ctx.tools.register(buildNotifyTool(deps))
  ctx.tools.register(buildChannelsTool(deps))
}

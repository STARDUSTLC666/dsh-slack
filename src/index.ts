/**
 * dsh-slack：DSH 社区 Slack 通知/桥接插件。
 * v0.2 新增 Socket Mode 双向：slack_inbox 收消息、slack_reply 线程回复。
 * @module dsh-slack
 */

import { parseConfig, requireToken, resolveAppToken, resolveToken, type SlackConfig } from './config.js'
import { createWebSlackClient, type SlackClient } from './slack-client.js'
import { buildChannelsTool, buildInboxTool, buildNotifyTool, buildReplyTool, type ToolDeps } from './tools.js'
import { createInboxQueue } from './inbox.js'
import { startSocketModeClient } from './socket.js'
import type { SlackContext } from './types.js'

export const name = 'dsh-slack'
export const inject = ['tools']

export { compileParameters, type ParameterDsl, type ParameterDslMap, type JsonSchemaNode } from './compile.js'
export {
  parseConfig,
  resolveToken,
  resolveDefaultChannel,
  requireToken,
  resolveAppToken,
  ENV_TOKEN,
  ENV_APP_TOKEN,
  type SlackConfig,
} from './config.js'
export {
  createWebSlackClient,
  mapSlackError,
  assertChannel,
  assertText,
  assertThreadTs,
  type SlackClient,
  type PostMessageParams,
  type ChannelInfo,
} from './slack-client.js'
export { buildNotifyTool, buildChannelsTool, buildInboxTool, buildReplyTool, type ToolDeps } from './tools.js'
export { parseMessageEvent, InboxQueue, createInboxQueue, INBOX_CAPACITY, type InboxMessage } from './inbox.js'
export { startSocketModeClient, type SocketMessageHandler } from './socket.js'
export type { SlackContext, ToolDefinition, ToolOutputDefinition, ContentBlock } from './types.js'

/**
 * 插件入口。配置缺失【不失败】（懒加载）：只 console.warn；
 * token 缺失在每个工具的 execute 时抛出带中文指引的错误；
 * appToken 存在时启动 Socket Mode（ctx.effect 管理生命周期，dispose 时断开）。
 */
export function apply(ctx: SlackContext, rawConfig: unknown): void {
  const warn = (message: string, ...args: unknown[]): void => {
    const logger = ctx.logger
    if (logger !== undefined && typeof logger.warn === 'function') {
      logger.warn(message, ...args)
    } else {
      console.warn(message, ...args)
    }
  }

  let config: SlackConfig | undefined
  try {
    config = parseConfig(rawConfig)
  } catch (error) {
    warn('[dsh-slack] 配置解析失败，工具将在调用时报错：', error)
    config = undefined
  }

  if (config === undefined) {
    warn('[dsh-slack] 配置缺失或格式错误：slack_notify / slack_channels / slack_inbox / slack_reply 已注册，但调用时会报错。请在 profile 的 cordis.patch.yml 配置 slack 行并重启。')
  } else {
    if (!resolveToken(config)) {
      warn('[dsh-slack] 未检测到 Slack 令牌（config.token 与 DSH_SLACK_TOKEN 均为空）：slack_notify / slack_channels / slack_reply 调用时会报错。')
    }
    const appToken = resolveAppToken(config)
    if (!appToken) {
      warn('[dsh-slack] 未检测到 App-Level Token（config.appToken 与 DSH_SLACK_APP_TOKEN 均为空）：未开启 Socket Mode，slack_inbox 将返回空队列。')
    } else if (!appToken.startsWith('xapp-')) {
      warn('[dsh-slack] appToken 格式错误（应以 xapp- 开头）：已跳过 Socket Mode 启动。')
    }
  }

  const inboxQueue = createInboxQueue()

  const configProvider = (): SlackConfig | undefined => config
  const clientProvider = (): SlackClient => {
    // 每次调用时重新解析配置（config.token 优先，环境变量回退），并懒创建客户端。
    const current = parseConfig(rawConfig)
    const token = requireToken(current)
    return createWebSlackClient(token, current?.slackApiUrl)
  }
  const inboxProvider = (): ReturnType<typeof createInboxQueue> => inboxQueue

  const deps: ToolDeps = { clientProvider, configProvider, inboxProvider }

  const appToken = resolveAppToken(config)
  if (appToken !== '' && appToken.startsWith('xapp-')) {
    const startSocket = (): (() => void) => startSocketModeClient(appToken, {
      onMessage(message) {
        inboxQueue.push(message)
      },
    }, warn)
    if (typeof ctx.effect === 'function') {
      ctx.effect(startSocket)
    } else {
      startSocket()
    }
  }

  ctx.tools.register(buildNotifyTool(deps))
  ctx.tools.register(buildChannelsTool(deps))
  ctx.tools.register(buildInboxTool(deps))
  ctx.tools.register(buildReplyTool(deps))
}

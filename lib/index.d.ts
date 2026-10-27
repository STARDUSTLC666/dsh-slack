import type { SlackContext } from './types.js';
export declare const name = "dsh-slack";
export declare const inject: string[];
export { compileParameters, type ParameterDsl, type ParameterDslMap, type JsonSchemaNode } from './compile.js';
export { parseConfig, resolveToken, resolveDefaultChannel, requireToken, resolveAppToken, ENV_TOKEN, ENV_APP_TOKEN, type SlackConfig, } from './config.js';
export { createWebSlackClient, mapSlackError, assertChannel, assertText, assertThreadTs, type SlackClient, type PostMessageParams, type ChannelInfo, } from './slack-client.js';
export { buildNotifyTool, buildChannelsTool, buildInboxTool, buildReplyTool, type ToolDeps } from './tools.js';
export { parseMessageEvent, InboxQueue, createInboxQueue, INBOX_CAPACITY, type InboxMessage } from './inbox.js';
export { startSocketModeClient, type SocketMessageHandler, type SocketStatus, type SocketDisposer, type SocketLifecycleOptions } from './socket.js';
export type { SlackContext, ToolDefinition, ToolOutputDefinition, ContentBlock } from './types.js';
/**
 * 插件入口。配置缺失【不失败】（懒加载）：只 console.warn；
 * token 缺失在每个工具的 execute 时抛出带中文指引的错误；
 * appToken 存在时启动 Socket Mode（ctx.effect 管理生命周期，dispose 时断开）。
 */
export declare function apply(ctx: SlackContext, rawConfig: unknown): void;

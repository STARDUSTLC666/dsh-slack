/**
 * dsh-slack：DSH 社区 Slack 通知/桥接插件。
 * 支持频道发信、线程回复、Socket Mode 双向收件箱、历史与线程上下文、文件上传、表情回应及在线自检。
 * @module dsh-slack
 */
import { type SlackConfig } from './config.js';
import type { SlackContext } from './types.js';
export declare const Config: import("./host-config.js").HostSchemaNode<Partial<SlackConfig>>;
export declare const name = "dsh-slack";
export declare const inject: string[];
export { liveConfig, createVolatile, HostValidationError, type HostSchemaNode, type HostSchemaMeta, type VolatileRef } from './host-config.js';
export { compileParameters, type ParameterDsl, type ParameterDslMap, type JsonSchemaNode } from './compile.js';
export { parseConfig, resolveToken, resolveDefaultChannel, requireToken, resolveAppToken, isValidSlackApiUrl, validateTokenFormat, ENV_TOKEN, ENV_APP_TOKEN, type SlackConfig, type TokenValidationResult, } from './config.js';
export { createWebSlackClient, mapSlackError, normalizeChannelInput, normalizeHistoryTimestamp, assertChannel, assertText, assertThreadTs, assertTimestamp, assertReactionName, type SlackClient, type PostMessageParams, type PostMessageResult, type ChannelInfo, type ListChannelsOptions, type AuthTestResult, type HistoryParams, type ThreadParams, type HistoryMessageFile, type HistoryMessage, type HistoryResult, type UploadFileParams, type UploadFileResult, type AddReactionParams, } from './slack-client.js';
export { extractFallbackMessageText } from './message-text.js';
export { buildNotifyTool, buildChannelsTool, buildInboxTool, buildReplyTool, buildHealthTool, buildHistoryTool, buildThreadTool, buildUploadTool, buildReactTool, type ToolDeps, } from './tools.js';
export { parseMessageEvent, InboxQueue, createInboxQueue, INBOX_CAPACITY, type InboxFileSummary, type InboxMessage, } from './inbox.js';
export { startSocketModeClient, type SocketMessageHandler, type SocketStatus, type SocketDisposer, type SocketClientLike, type SocketLifecycleOptions, } from './socket.js';
export type { SlackContext, ToolDefinition, ToolOutputDefinition, ContentBlock } from './types.js';
/**
 * 插件入口。配置缺失【不失败】（懒加载）：只 warn；
 * token 缺失在每个工具的 execute 时抛出带中文指引的错误；
 * appToken 存在且 slackApiUrl 合法时启动 Socket Mode（ctx.effect 管理生命周期，dispose 时断开）。
 */
export declare function apply(ctx: SlackContext, rawConfig: unknown): void;

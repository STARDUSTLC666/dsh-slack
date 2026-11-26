import type { SlackConfig } from './config.js';
import type { ToolDefinition } from './types.js';
import type { SlackClient } from './slack-client.js';
import type { InboxQueue } from './inbox.js';
import type { SocketStatus } from './socket.js';
/** 工具构建的依赖注入点。 */
export interface ToolDeps {
    clientProvider: () => SlackClient;
    configProvider: () => SlackConfig | undefined;
    inboxProvider: () => InboxQueue;
    socketStatusProvider?: () => SocketStatus | undefined;
    onBotUserIdResolved?: (userId: string) => void;
}
/** 自检工具：检查 token / appToken / 默认频道 / API 地址 / 代理环境配置与 Socket Mode 连接状态；可选 verify=true 在线验证。 */
export declare function buildHealthTool(deps: ToolDeps): ToolDefinition;
export declare function buildNotifyTool(deps: ToolDeps): ToolDefinition;
export declare function buildChannelsTool(deps: ToolDeps): ToolDefinition;
export declare function buildInboxTool(deps: ToolDeps): ToolDefinition;
export declare function buildReplyTool(deps: ToolDeps): ToolDefinition;
export declare function buildHistoryTool(deps: ToolDeps): ToolDefinition;
export declare function buildThreadTool(deps: ToolDeps): ToolDefinition;
export declare function buildUploadTool(deps: ToolDeps): ToolDefinition;
export declare function buildReactTool(deps: ToolDeps): ToolDefinition;

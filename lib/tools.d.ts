import type { SlackConfig } from './config.js';
import type { ToolDefinition } from './types.js';
import type { SlackClient } from './slack-client.js';
import type { InboxQueue } from './inbox.js';
/** 工具构建的依赖注入点。 */
export interface ToolDeps {
    clientProvider: () => SlackClient;
    configProvider: () => SlackConfig | undefined;
    inboxProvider: () => InboxQueue;
}
/** 自检工具：检查 token / appToken / 默认频道配置，不发起网络请求。 */
export declare function buildHealthTool(deps: ToolDeps): ToolDefinition;
export declare function buildNotifyTool(deps: ToolDeps): ToolDefinition;
export declare function buildChannelsTool(deps: ToolDeps): ToolDefinition;
export declare function buildInboxTool(deps: ToolDeps): ToolDefinition;
export declare function buildReplyTool(deps: ToolDeps): ToolDefinition;

/**
 * Slack 客户端抽象：生产用官方 @slack/web-api，测试注入 fake。
 * 同时把 Slack 错误码映射为全中文提示，并抽出频道/文本校验纯函数。
 */
/** chat.postMessage 参数。 */
export interface PostMessageParams {
    channel: string;
    text: string;
    thread_ts?: string;
}
/** conversations.list 可见频道的最小信息。 */
export interface ChannelInfo {
    id: string;
    name: string;
}
/** 可注入的 Slack 客户端抽象。 */
export interface SlackClient {
    /** 发消息，返回消息 ts（用于线程后续引用）。 */
    postMessage(params: PostMessageParams): Promise<{
        ts: string;
    }>;
    /** 列出机器人可见频道。 */
    listChannels(): Promise<ChannelInfo[]>;
}
/** 用官方 WebClient 实现。 */
export declare function createWebSlackClient(token: string, slackApiUrl?: string): SlackClient;
/**
 * 把 Slack API 错误映射为全中文提示。
 */
export declare function mapSlackError(error: unknown): string;
/** 校验 channel 参数：必须是非空字符串（频道名或频道 ID）。 */
export declare function assertChannel(channel: unknown): string;
/** 校验 text 参数：必须是非空字符串。 */
export declare function assertText(text: unknown): string;
/** 校验 thread_ts 参数：必须是待回复消息 ts 的非空字符串。 */
export declare function assertThreadTs(thread_ts: unknown): string;

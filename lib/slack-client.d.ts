/**
 * Slack 客户端抽象：生产用官方 @slack/web-api，测试注入 fake。
 * 同时把 Slack 错误码（含限流、HTTP、网络超时、代理异常、缺失 Scope）映射为全中文提示，
 * 并提供频道/文本/时间戳/表情参数校验纯函数。
 */
/** chat.postMessage 参数。 */
export interface PostMessageParams {
    channel: string;
    text: string;
    thread_ts?: string;
}
/** chat.postMessage 结果。 */
export interface PostMessageResult {
    ts: string;
    channel: string;
}
/** 频道最小信息。 */
export interface ChannelInfo {
    id: string;
    name: string;
    is_private?: boolean;
    is_member?: boolean;
    num_members?: number;
}
/** 列频道范围选项。 */
export interface ListChannelsOptions {
    scope?: 'joined' | 'all';
}
/** auth.test 鉴权检查结果。 */
export interface AuthTestResult {
    ok: boolean;
    url?: string;
    team?: string;
    user?: string;
    team_id?: string;
    user_id?: string;
    bot_id?: string;
    scopes?: string[];
}
/** 频道历史消息查询参数。 */
export interface HistoryParams {
    channel: string;
    limit?: number;
    oldest?: string;
    latest?: string;
}
/** 线程回复查询参数。 */
export interface ThreadParams {
    channel: string;
    thread_ts: string;
    limit?: number;
}
/** 历史消息附件摘要。 */
export interface HistoryMessageFile {
    name?: string;
    mimetype?: string;
    size?: number;
}
/** 历史/线程消息条目。 */
export interface HistoryMessage {
    ts: string;
    user?: string;
    userName?: string;
    bot_id?: string;
    text: string;
    thread_ts?: string;
    reply_count?: number;
    files?: HistoryMessageFile[];
}
/** 历史/线程消息查询结果。 */
export interface HistoryResult {
    channel: string;
    messages: HistoryMessage[];
    has_more: boolean;
}
/** 文件上传参数。 */
export interface UploadFileParams {
    channel: string;
    filename: string;
    content?: string;
    file_path?: string;
    title?: string;
    initial_comment?: string;
    thread_ts?: string;
}
/** 文件上传结果。 */
export interface UploadFileResult {
    ok: boolean;
    channel: string;
    file_id?: string;
    filename: string;
    permalink?: string;
}
/** 添加表情回应参数。 */
export interface AddReactionParams {
    channel: string;
    timestamp: string;
    name: string;
}
/** 可注入的 Slack 客户端抽象（新增 Plan B 方法设为可选以保持对旧 fake 的向后兼容）。 */
export interface SlackClient {
    /** 发消息，返回消息 ts 与 Slack 规范频道 ID。 */
    postMessage(params: PostMessageParams, signal?: AbortSignal): Promise<PostMessageResult>;
    /** 列出机器人可见频道。 */
    listChannels(signal?: AbortSignal, options?: ListChannelsOptions): Promise<ChannelInfo[]>;
    /** 在线校验令牌身份与已授予权限。 */
    authTest?(signal?: AbortSignal): Promise<AuthTestResult>;
    /** 拉取频道历史消息。 */
    getHistory?(params: HistoryParams, signal?: AbortSignal): Promise<HistoryResult>;
    /** 拉取单条线程回复列表。 */
    getThread?(params: ThreadParams, signal?: AbortSignal): Promise<HistoryResult>;
    /** 上传文本或本地文件到指定频道或线程。 */
    uploadFile?(params: UploadFileParams, signal?: AbortSignal): Promise<UploadFileResult>;
    /** 为指定消息添加表情回应，返回规范频道 ID。 */
    addReaction?(params: AddReactionParams, signal?: AbortSignal): Promise<{
        ok: boolean;
        channel: string;
    }>;
    /** 按用户 ID 尽力解析显示名（带 TTL 缓存）。 */
    resolveUserName?(userId: string, signal?: AbortSignal): Promise<string | undefined>;
    /** 将频道名（如 #general）或频道 ID 规范解析为 Slack 频道 ID。 */
    resolveChannelId?(channel: string, signal?: AbortSignal): Promise<string>;
}
/** 用官方 WebClient 实现完整 SlackClient。 */
export declare function createWebSlackClient(token: string, slackApiUrl?: string): Required<SlackClient>;
/**
 * 把 Slack API 错误映射为全中文提示（本地校验/文件/分页等已知中文错误直接透传，不加冗余前缀）。
 */
export declare function mapSlackError(error: unknown): string;
/**
 * 规整频道输入：提取 Slack 频道提及（如 <#C01234567|general>）与 channel: 前缀中的规范频道 ID，
 * 其他频道名（如 #general）或规范 ID 原样去首尾空白返回。
 */
export declare function normalizeChannelInput(channel: string): string;
/** 校验 channel 参数：必须是非空字符串（频道名或频道 ID）。 */
export declare function assertChannel(channel: unknown): string;
/** 校验 text 参数：必须是非空字符串。 */
export declare function assertText(text: unknown): string;
/** 校验 thread_ts 参数：必须是待回复消息 ts 的非空字符串。 */
export declare function assertThreadTs(thread_ts: unknown): string;
/** 校验消息时间戳（ts / timestamp）参数：必须是非空字符串。 */
export declare function assertTimestamp(timestamp: unknown, fieldName?: string): string;
/**
 * 规整历史查询边界时间戳（oldest / latest）：
 * - 直接透传标准 Slack 数字时间戳（如 1700000000.000100 或 1700000000）；
 * - 自动将 ISO-8601 日期/时间（如 2026-11-26T00:00:00Z、2026-11-26T08:00:00+08:00、
 *   2026-11-26T00:00:00.000100Z 或 2026-11-26）转为 Unix 秒时间戳，保留 Slack 6 位微秒精度；
 * - 其他非法格式抛出清晰中文错误，避免把不可解析文本发给 Slack 触发 invalid_ts_oldest/latest。
 */
export declare function normalizeHistoryTimestamp(value: unknown, fieldName?: string): string;
/** 校验并规整 Slack 表情回应名称（自动去除两侧冒号，并将常见 Unicode 表情转换为 Slack 短码）。 */
export declare function assertReactionName(name: unknown): string;

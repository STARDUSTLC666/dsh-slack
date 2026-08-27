/**
 * Socket Mode 收件箱：把收到的 Slack message 事件解析进内存队列。
 * 队列容量 200，满则丢最旧；解析为纯函数，便于注入 fake 事件测试。
 */
/** 收件箱中的一条消息。 */
export interface InboxMessage {
    ts: string;
    channel: string;
    user: string;
    text: string;
}
/** 队列容量上限。 */
export declare const INBOX_CAPACITY = 200;
/** 创建收件箱队列。 */
export declare function createInboxQueue(capacity?: number): InboxQueue;
/**
 * 内存消息队列：先进先出，容量满时丢弃最旧消息。
 */
export declare class InboxQueue {
    private items;
    private readonly seen;
    readonly capacity: number;
    constructor(capacity?: number);
    private key;
    /** 追加一条消息；Slack 至少投递一次，重复事件直接忽略，超过容量时丢弃最旧。 */
    push(message: InboxMessage): void;
    /** 返回最近 limit 条消息（新的在前）。 */
    list(limit: number): InboxMessage[];
    /**
     * 原子地取出最近 limit 条并清空整个队列。
     * 避免“先 list 再 clear”之间新到的消息被误清掉。
     */
    drain(limit: number): InboxMessage[];
    /** 清空队列。 */
    clear(): void;
    /** 当前队列长度。 */
    get size(): number;
}
/**
 * 从 Socket Mode 事件里解析出一条消息；不满足条件返回 null。
 * - 兼容直接 message 事件、slack_event 包（{ type: 'events_api', body: { event } }）与
 *   按类型监听包（{ event }）。
 * - 排除 subtype 非空的消息、bot 自己发的消息（bot_id 非空，或 user 等于 botUserId）。
 */
export declare function parseMessageEvent(raw: unknown, botUserId?: string): InboxMessage | null;

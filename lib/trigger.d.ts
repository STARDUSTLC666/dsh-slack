/**
 * 收件箱触发器：把「收到需要处理的消息」翻译成「唤醒一条 DSH 定时任务」。
 *
 * 独立模块：只依赖宿主事件 `dsh-slack/inbox`（由 index.ts 在消息进队列后 emit）
 * 与 ctx 上的 `schedule` 服务，不读 Slack、不碰收件箱内容、不关心任务本身做什么。
 *
 * 设计约束：
 * - 只在消息确实需要 agent 时唤醒：@ 机器人、`app_mention` 事件、私信（频道 id 以 D 开头）；
 * - schedule 的手动投递下限是 60 秒，窗口内的多条消息合并成一次唤醒（尾沿触发）；
 * - 宿主没有 schedule 服务时只 warn，不阻塞插件加载。
 */
import type { InboxMessage } from './inbox.js';
/** 消息进收件箱后发出的事件名。 */
export declare const INBOX_EVENT = "dsh-slack/inbox";
/** 与 schedule 服务的手动投递下限一致。 */
export declare const MIN_TRIGGER_INTERVAL_MS = 60000;
/** 触发器需要的 Context 形状（比 SlackContext 更窄，全部可选）。 */
export interface InboxTriggerContext {
    on?(event: string, listener: (message: InboxMessage) => void): unknown;
    get?(name: string): unknown;
}
/** 触发器配置。 */
export interface InboxTriggerOptions {
    /** 被唤醒的定时任务 id；传函数则每次触发时实时读取。 */
    taskId: string | (() => string);
    /** 机器人 user id 的实时读取器。 */
    botUserId?: () => string | undefined;
    /** 合并窗口，最小 60 秒。 */
    intervalMs?: number;
    /** 告警输出。 */
    warn?: (message: string) => void;
}
/**
 * 安装触发器。
 * @param ctx - 宿主插件上下文。
 * @param options - 触发器配置。
 * @returns 卸载函数。
 */
export declare function installInboxTrigger(ctx: InboxTriggerContext, options: InboxTriggerOptions): () => void;

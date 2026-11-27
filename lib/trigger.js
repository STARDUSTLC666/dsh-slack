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
/** 消息进收件箱后发出的事件名。 */
export const INBOX_EVENT = 'dsh-slack/inbox';
/** 与 schedule 服务的手动投递下限一致。 */
export const MIN_TRIGGER_INTERVAL_MS = 60_000;
/**
 * 安装触发器。
 * @param ctx - 宿主插件上下文。
 * @param options - 触发器配置。
 * @returns 卸载函数。
 */
export function installInboxTrigger(ctx, options) {
    const taskIdOf = typeof options.taskId === 'function' ? options.taskId : () => options.taskId;
    const botUserId = options.botUserId ?? (() => undefined);
    const warn = options.warn ?? (() => { });
    const requested = Number(options.intervalMs);
    const intervalMs = Number.isFinite(requested) && requested > 0
        ? Math.max(MIN_TRIGGER_INTERVAL_MS, requested)
        : MIN_TRIGGER_INTERVAL_MS;
    let lastRunAt = 0;
    let timer;
    let disposed = false;
    let warnedMissingTask = false;
    let warnedMissingService = false;
    const qualifies = (message) => {
        if (message === null || typeof message !== 'object')
            return false;
        if (message.event_type === 'app_mention')
            return true;
        const id = botUserId();
        if (typeof id === 'string' && id !== '' && message.text.includes(`<@${id}>`))
            return true;
        return typeof message.channel === 'string' && message.channel.startsWith('D');
    };
    const fire = () => {
        timer = undefined;
        if (disposed)
            return;
        const wait = lastRunAt + intervalMs - Date.now();
        if (wait > 0) {
            timer = setTimeout(fire, wait);
            return;
        }
        const taskId = String(taskIdOf() ?? '').trim();
        if (taskId === '') {
            if (!warnedMissingTask) {
                warnedMissingTask = true;
                warn('[dsh-slack] 触发器已启用但 triggerTaskId 为空，无法唤醒任务');
            }
            return;
        }
        const schedule = ctx.get?.('schedule');
        if (schedule === undefined || typeof schedule.run !== 'function') {
            if (!warnedMissingService) {
                warnedMissingService = true;
                warn('[dsh-slack] 触发器：宿主没有 schedule 服务，无法唤醒任务');
            }
            return;
        }
        lastRunAt = Date.now();
        Promise.resolve(schedule.run({ id: taskId }))
            .then((result) => {
            if (result !== null && typeof result === 'object' && typeof result.code === 'string' && result.code !== 'schedule_execution_pending') {
                warn(`[dsh-slack] 触发器：投递失败 ${result.code}`);
            }
        })
            .catch((error) => warn(`[dsh-slack] 触发器：投递异常 ${String(error)}`));
    };
    ctx.on?.(INBOX_EVENT, (message) => {
        if (disposed || timer !== undefined || !qualifies(message))
            return;
        timer = setTimeout(fire, Math.max(0, lastRunAt + intervalMs - Date.now()));
    });
    return () => {
        disposed = true;
        if (timer !== undefined)
            clearTimeout(timer);
    };
}

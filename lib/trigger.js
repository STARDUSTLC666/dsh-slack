const MIN_TRIGGER_INTERVAL_MS = 60_000;
/** One Socket Mode connection owns its messages, cooldown and pending delivery. */
export function createInboxTrigger(ctx, taskId, botUserId, warn) {
    const lifetime = new AbortController();
    const requested = new WeakSet();
    let nextRunAt = 0;
    let pendingTask = '';
    let timer;
    let warnedMissingService = false;
    async function deliver() {
        timer = undefined;
        const id = pendingTask;
        if (lifetime.signal.aborted || taskId() !== id)
            return;
        try {
            const schedule = ctx.get?.('schedule');
            if (typeof schedule?.run !== 'function') {
                if (!warnedMissingService)
                    warn('[dsh-slack] 宿主没有 schedule 服务，消息仍在收件箱中。');
                warnedMissingService = true;
                return;
            }
            warnedMissingService = false;
            nextRunAt = Date.now() + MIN_TRIGGER_INTERVAL_MS;
            const result = await schedule.run({ id }, lifetime.signal);
            if (!lifetime.signal.aborted && result?.code && result.code !== 'schedule_execution_pending') {
                warn('[dsh-slack] 收件箱任务投递失败：' + result.code);
            }
        }
        catch {
            if (!lifetime.signal.aborted)
                warn('[dsh-slack] 收件箱任务投递失败，请检查任务和会话状态。');
        }
    }
    return {
        onMessage(message) {
            if (lifetime.signal.aborted || requested.has(message))
                return;
            const id = taskId();
            if (!id)
                return;
            const bot = botUserId();
            if (bot && message.user === bot)
                return;
            if (message.event_type !== 'app_mention' && !message.channel.startsWith('D') &&
                !(bot && message.text.includes(`<@${bot}>`)))
                return;
            requested.add(message);
            pendingTask = id;
            if (timer === undefined)
                timer = setTimeout(() => { void deliver(); }, Math.max(0, nextRunAt - Date.now()));
        },
        dispose() {
            lifetime.abort();
            clearTimeout(timer);
        },
    };
}

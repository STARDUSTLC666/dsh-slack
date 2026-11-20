/**
 * Slack 客户端抽象：生产用官方 @slack/web-api，测试注入 fake。
 * 同时把 Slack 错误码映射为全中文提示，并抽出频道/文本校验纯函数。
 */
import { WebClient } from '@slack/web-api';
/** 用官方 WebClient 实现。 */
export function createWebSlackClient(token, slackApiUrl) {
    const createClient = (signal) => new WebClient(token, {
        timeout: 25000, retryConfig: { retries: 0 }, rejectRateLimitedCalls: true,
        // Capture the signal per client so concurrent SDK requests cannot share cancellation.
        ...(signal ? { fetch: (url, init) => {
                signal.throwIfAborted();
                return fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal });
            } } : {}),
        ...(slackApiUrl !== undefined && slackApiUrl !== '' ? { slackApiUrl } : {})
    });
    const client = createClient();
    return {
        async postMessage(params, signal) {
            signal?.throwIfAborted();
            const result = await (signal ? createClient(signal) : client).chat.postMessage({
                channel: params.channel,
                text: params.text,
                ...(params.thread_ts !== undefined ? { thread_ts: params.thread_ts } : {}),
            });
            signal?.throwIfAborted();
            const ts = typeof result.ts === 'string' ? result.ts : '';
            if (!ts)
                throw new Error('Slack 未返回消息回执，无法确认提交结果；请先检查频道，避免直接重发。');
            return { ts };
        },
        async listChannels(signal) {
            signal?.throwIfAborted();
            const requestClient = signal ? createClient(signal) : client;
            let cursor;
            let pages = 0;
            const allChannels = [];
            const seen = new Set();
            const cursors = new Set();
            // Follow the official pagination cursor, with the existing 20-page cap.
            do {
                pages += 1;
                if (pages > 20)
                    throw new Error('Slack 频道列表超过分页上限，无法确认完整清单；请缩小机器人可见范围后重试。');
                signal?.throwIfAborted();
                const result = await requestClient.conversations.list({
                    types: 'public_channel,private_channel',
                    limit: 200,
                    ...(cursor !== undefined ? { cursor } : {}),
                });
                signal?.throwIfAborted();
                for (const ch of (result.channels ?? [])) {
                    if (typeof ch.id === 'string' && typeof ch.name === 'string' && !seen.has(ch.id)) {
                        seen.add(ch.id);
                        allChannels.push({ id: ch.id, name: ch.name });
                    }
                }
                const next = result.response_metadata?.next_cursor;
                cursor = typeof next === 'string' ? next.trim() : '';
                if (cursor) {
                    if (cursors.has(cursor))
                        throw new Error('Slack 返回重复分页游标，频道清单不完整；请稍后重试。');
                    cursors.add(cursor);
                }
            } while (cursor !== '');
            return allChannels;
        },
    };
}
/**
 * 把 Slack API 错误映射为全中文提示。
 */
export function mapSlackError(error) {
    const data = error?.data;
    const code = data?.error;
    if (code === 'invalid_auth') {
        return 'Slack 认证失败（invalid_auth）：token 无效、已撤销或过期。请检查并重新生成令牌，再在 profile 的 cordis.patch.yml 覆盖 slack 行的 config.token 并重启。';
    }
    if (code === 'channel_not_found') {
        return '频道未找到（channel_not_found）：请检查频道名或频道 ID 是否正确（如 #general）。';
    }
    if (code === 'not_in_channel') {
        return '机器人不在该频道中（not_in_channel）：请先把机器人 App 添加（invite）到该频道。';
    }
    if (code === 'token_revoked' || code === 'account_inactive' || code === 'missing_scope' || code === 'not_authed') {
        return `Slack 令牌或权限不足（${code}）：请确认已勾选 chat:write 与 channels:read，并重新安装 App 拿新令牌。`;
    }
    if (code === 'is_archived') {
        return '频道已归档（is_archived）：机器人不能在已归档频道发消息，请改用其他频道。';
    }
    if (code === 'msg_too_long') {
        return '消息过长（msg_too_long）：Slack 单条消息不能超过 40,000 字符，请精简后重试。';
    }
    if (code === 'ratelimited' || code === 'rate_limited') {
        return 'Slack 触发限流（ratelimited）：请求太频繁，请稍等几秒后重试。';
    }
    const message = error?.message;
    return message ? `Slack API 调用失败：${message}` : 'Slack API 调用失败：未知错误。';
}
/** 校验 channel 参数：必须是非空字符串（频道名或频道 ID）。 */
export function assertChannel(channel) {
    if (typeof channel !== 'string' || channel.trim() === '') {
        throw new Error('channel 参数错误：必须是频道名（如 #general）或频道 ID 的非空字符串。');
    }
    return channel.trim();
}
/** 校验 text 参数：必须是非空字符串。 */
export function assertText(text) {
    if (typeof text !== 'string' || text.trim() === '') {
        throw new Error('text 参数错误：必须是待发送的 Markdown 文本（非空字符串）。');
    }
    return text;
}
/** 校验 thread_ts 参数：必须是待回复消息 ts 的非空字符串。 */
export function assertThreadTs(thread_ts) {
    if (typeof thread_ts !== 'string' || thread_ts.trim() === '') {
        throw new Error('thread_ts 参数错误：必须是待回复消息的 ts（来自 slack_inbox 返回的 ts）的非空字符串。');
    }
    return thread_ts.trim();
}

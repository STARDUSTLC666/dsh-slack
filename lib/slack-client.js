/**
 * Slack 客户端抽象：生产用官方 @slack/web-api，测试注入 fake。
 * 同时把 Slack 错误码映射为全中文提示，并抽出频道/文本校验纯函数。
 */
import { WebClient } from '@slack/web-api';
/** 用官方 WebClient 实现。 */
export function createWebSlackClient(token, slackApiUrl) {
    const client = new WebClient(token, { ...(slackApiUrl !== undefined && slackApiUrl !== '' ? { slackApiUrl } : {}) });
    return {
        async postMessage(params) {
            const result = await client.chat.postMessage({
                channel: params.channel,
                text: params.text,
                ...(params.thread_ts !== undefined ? { thread_ts: params.thread_ts } : {}),
            });
            const ts = typeof result.ts === 'string' ? result.ts : '';
            return { ts };
        },
        async listChannels() {
            let cursor;
            let pages = 0;
            const allChannels = [];
            const seen = new Set();
            // conversations.list 默认分页（每页约 100-200 条）；企业工作区频道很多时
            // 必须沿 next_cursor 翻完，否则模型会漏掉后面的频道。
            do {
                pages += 1;
                if (pages > 20)
                    break;
                const result = await client.conversations.list({
                    types: 'public_channel,private_channel',
                    ...(cursor !== undefined ? { cursor } : {}),
                });
                for (const ch of (result.channels ?? [])) {
                    if (typeof ch.id === 'string' && typeof ch.name === 'string' && !seen.has(ch.id)) {
                        seen.add(ch.id);
                        allChannels.push({ id: ch.id, name: ch.name });
                    }
                }
                const next = result.response_metadata?.next_cursor;
                cursor = typeof next === 'string' && next !== cursor ? next : '';
            } while (cursor !== '');
            return allChannels;
            /*
              // if (typeof ch.id === 'string' && typeof ch.name === 'string') {
                // allChannels.push({ id: ch.id, name: ch.name })
              */
            // }
            // removed duplicate return
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

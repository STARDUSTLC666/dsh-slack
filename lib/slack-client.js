/**
 * Slack 客户端抽象：生产用官方 @slack/web-api，测试注入 fake。
 * 同时把 Slack 错误码（含限流、HTTP、网络超时、代理异常、缺失 Scope）映射为全中文提示，
 * 并提供频道/文本/时间戳/表情参数校验纯函数。
 */
import { readFile, stat } from 'node:fs/promises';
import { ErrorCode, WebClient } from '@slack/web-api';
import { isValidSlackApiUrl } from './config.js';
import { extractFallbackMessageText } from './message-text.js';
import { createSilentSlackLogger, createTransportFetch } from './transport.js';
const SILENT_LOGGER = createSilentSlackLogger();
const MAX_MARKDOWN_BLOCK_LENGTH = 12000;
const MAX_FALLBACK_TEXT_LENGTH = 3000;
const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024;
const USER_INFO_TIMEOUT_MS = 4000;
const CHANNEL_CACHE_TTL_MS = 5 * 60 * 1000;
const CHANNEL_CACHE_MAX_SIZE = 5000;
const USER_CACHE_TTL_MS = 10 * 60 * 1000;
const USER_CACHE_MAX_SIZE = 500;
const MAX_USER_LOOKUPS_PER_CALL = 15;
const USER_LOOKUP_CONCURRENCY = 4;
// Real Slack channel/group/DM/Enterprise shared IDs start with C/G/D/Z, contain at least one digit, and are 8+ chars.
// Excludes W... (Enterprise user IDs) and all-letter names like GENERAL/WARNINGS/CHANNEL.
const SLACK_CHANNEL_ID_RE = /^[CGDZ](?=[A-Z0-9]*\d)[A-Z0-9]{7,}$/;
const SLACK_CHANNEL_MENTION_RE = /^<#([CGDZ](?=[A-Z0-9]*\d)[A-Z0-9]{2,})(?:\|[^>]*)?>$/i;
const SLACK_CHANNEL_PREFIX_RE = /^channel:([CGDZ](?=[A-Z0-9]*\d)[A-Z0-9]{2,})$/i;
const SLACK_NUMERIC_TS_RE = /^\d+(?:\.\d+)?$/;
const ISO_DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_TZ_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):?(\d{2}))$/i;
const kLocalSlackError = Symbol.for('dsh-slack.local-error');
class LocalSlackError extends Error {
    [kLocalSlackError] = true;
    constructor(message) {
        super(message);
        this.name = 'LocalSlackError';
    }
}
function isLocalSlackError(error) {
    return error instanceof Error && Boolean(error[kLocalSlackError]);
}
function getCache(cache, key, now = Date.now()) {
    const entry = cache.get(key);
    if (entry === undefined)
        return { hit: false };
    if (entry.expiresAt <= now) {
        cache.delete(key);
        return { hit: false };
    }
    return { hit: true, value: entry.value };
}
function setCache(cache, key, value, ttlMs, maxSize, now = Date.now()) {
    if (cache.has(key)) {
        cache.delete(key);
    }
    else if (cache.size >= maxSize) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined)
            cache.delete(oldestKey);
    }
    cache.set(key, { value, expiresAt: now + ttlMs });
}
function clampApiLimit(value, fallback, max = 100) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    return Math.min(max, Math.max(1, Math.trunc(value)));
}
function truncateFallbackText(text, maxUnits) {
    if (text.length <= maxUnits)
        return text;
    let cut = maxUnits - 1;
    if (cut > 0) {
        const lastCode = text.charCodeAt(cut - 1);
        if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
            cut -= 1;
        }
    }
    return text.slice(0, cut) + '…';
}
function platformErrorCode(error) {
    const code = error?.data?.error;
    return typeof code === 'string' ? code : undefined;
}
function platformNeededScopes(error) {
    const raw = error?.data?.needed;
    if (typeof raw !== 'string' || raw.trim() === '')
        return [];
    return raw.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => s !== '');
}
function extractFiles(rawFiles) {
    if (!Array.isArray(rawFiles) || rawFiles.length === 0)
        return undefined;
    const files = [];
    for (const item of rawFiles) {
        if (item === null || typeof item !== 'object')
            continue;
        const summary = {
            ...(typeof item.name === 'string' && item.name !== '' ? { name: item.name } : {}),
            ...(typeof item.mimetype === 'string' && item.mimetype !== '' ? { mimetype: item.mimetype } : {}),
            ...(typeof item.size === 'number' && Number.isFinite(item.size) ? { size: item.size } : {}),
        };
        if (Object.keys(summary).length > 0)
            files.push(summary);
    }
    return files.length > 0 ? files : undefined;
}
function mapLocalFsError(filePath, error, action, signal) {
    signal?.throwIfAborted();
    if (error?.name === 'AbortError') {
        throw error;
    }
    const code = error?.code;
    if (code === 'ENOENT') {
        throw new LocalSlackError(`文件不存在：找不到路径「${filePath}」，请检查 file_path 是否正确。`);
    }
    if (code === 'EACCES' || code === 'EPERM') {
        throw new LocalSlackError(`无权读取文件「${filePath}」：请检查文件访问权限。`);
    }
    if (code === 'EISDIR') {
        throw new LocalSlackError(`file_path 参数错误：「${filePath}」是目录而不是文件，无法上传。`);
    }
    throw new LocalSlackError(`无法${action}文件「${filePath}」：${error instanceof Error ? error.message : String(error)}`);
}
/** 用官方 WebClient 实现完整 SlackClient。 */
export function createWebSlackClient(token, slackApiUrl) {
    const normalizedApiUrl = typeof slackApiUrl === 'string' ? slackApiUrl.trim() : '';
    if (normalizedApiUrl !== '' && !isValidSlackApiUrl(normalizedApiUrl)) {
        throw new LocalSlackError(`slackApiUrl 参数错误：无效的 Slack Web API 地址（${normalizedApiUrl}），必须是以 http:// 或 https:// 开头的合法 URL。`);
    }
    // Per-call WebClient guarantees strict AbortSignal isolation (p-queue@6 leaks AsyncLocalStorage).
    const createClient = (signal, timeoutMs = 25000) => new WebClient(token, {
        timeout: timeoutMs,
        retryConfig: { retries: 0 },
        rejectRateLimitedCalls: true,
        logger: SILENT_LOGGER,
        fetch: createTransportFetch(signal),
        ...(normalizedApiUrl !== '' ? { slackApiUrl: normalizedApiUrl } : {}),
    });
    const channelNameCache = new Map();
    const channelIdCache = new Map();
    const userNameCache = new Map();
    let usersInfoScopeBlockedUntil = 0;
    const recordChannelsInCache = (channels) => {
        const now = Date.now();
        for (const ch of channels) {
            setCache(channelNameCache, ch.name.toLowerCase(), ch.id, CHANNEL_CACHE_TTL_MS, CHANNEL_CACHE_MAX_SIZE, now);
            setCache(channelIdCache, ch.id, ch.id, CHANNEL_CACHE_TTL_MS, CHANNEL_CACHE_MAX_SIZE, now);
        }
    };
    const listChannels = async (signal, options) => {
        signal?.throwIfAborted();
        const requestClient = createClient(signal);
        const scope = options?.scope === 'all' ? 'all' : 'joined';
        const fetchWithTypes = async (types) => {
            let cursor;
            let pages = 0;
            const allChannels = [];
            const seen = new Set();
            const cursors = new Set();
            // Follow the official pagination cursor, with the existing 20-page cap.
            do {
                pages += 1;
                if (pages > 20)
                    throw new LocalSlackError('Slack 频道列表超过分页上限，无法确认完整清单；请缩小机器人可见范围后重试。');
                signal?.throwIfAborted();
                const requestArgs = {
                    types,
                    exclude_archived: true,
                    limit: 200,
                    ...(cursor !== undefined ? { cursor } : {}),
                };
                const result = scope === 'all'
                    ? await requestClient.conversations.list(requestArgs)
                    : await requestClient.users.conversations(requestArgs);
                signal?.throwIfAborted();
                for (const ch of (result.channels ?? [])) {
                    const rawChannel = ch;
                    const chName = typeof rawChannel.name === 'string' && rawChannel.name !== ''
                        ? rawChannel.name
                        : (typeof rawChannel.name_normalized === 'string' && rawChannel.name_normalized !== ''
                            ? rawChannel.name_normalized
                            : undefined);
                    if (typeof rawChannel.id === 'string' && chName !== undefined && !seen.has(rawChannel.id)) {
                        seen.add(rawChannel.id);
                        const isPrivate = typeof rawChannel.is_private === 'boolean'
                            ? rawChannel.is_private
                            : (rawChannel.is_group === true ? true : undefined);
                        const info = {
                            id: rawChannel.id,
                            name: chName,
                            ...(isPrivate !== undefined ? { is_private: isPrivate } : {}),
                            ...(typeof rawChannel.is_member === 'boolean' ? { is_member: rawChannel.is_member } : {}),
                            ...(typeof rawChannel.num_members === 'number' && Number.isFinite(rawChannel.num_members)
                                ? { num_members: rawChannel.num_members }
                                : {}),
                        };
                        allChannels.push(info);
                    }
                }
                const next = result.response_metadata?.next_cursor;
                cursor = typeof next === 'string' ? next.trim() : '';
                if (cursor) {
                    if (cursors.has(cursor))
                        throw new LocalSlackError('Slack 返回重复分页游标，频道清单不完整；请稍后重试。');
                    cursors.add(cursor);
                }
            } while (cursor !== '');
            return allChannels;
        };
        let channels;
        try {
            channels = await fetchWithTypes('public_channel,private_channel');
        }
        catch (error) {
            signal?.throwIfAborted();
            if (platformErrorCode(error) !== 'missing_scope')
                throw error;
            const needed = platformNeededScopes(error);
            const needsGroups = needed.includes('groups:read');
            const needsChannels = needed.includes('channels:read');
            if (needsGroups && !needsChannels) {
                channels = await fetchWithTypes('public_channel');
            }
            else if (needsChannels && !needsGroups) {
                channels = await fetchWithTypes('private_channel');
            }
            else if (needed.length === 0) {
                try {
                    channels = await fetchWithTypes('public_channel');
                }
                catch (fallbackError) {
                    signal?.throwIfAborted();
                    const fallbackNeeded = platformNeededScopes(fallbackError);
                    if (platformErrorCode(fallbackError) === 'missing_scope'
                        && (fallbackNeeded.length === 0 || fallbackNeeded.includes('channels:read'))) {
                        channels = await fetchWithTypes('private_channel');
                    }
                    else {
                        throw fallbackError;
                    }
                }
            }
            else {
                // Neither scope is granted (or an unrelated scope is missing): rethrow without wasted retries.
                throw error;
            }
        }
        recordChannelsInCache(channels);
        return channels;
    };
    const resolveChannelId = async (channel, signal) => {
        signal?.throwIfAborted();
        const trimmed = normalizeChannelInput(assertChannel(channel));
        if (SLACK_CHANNEL_ID_RE.test(trimmed))
            return trimmed;
        const normalized = trimmed.replace(/^#/, '').toLowerCase();
        const now = Date.now();
        const cachedByName = getCache(channelNameCache, normalized, now);
        if (cachedByName.hit)
            return cachedByName.value;
        const cachedById = getCache(channelIdCache, trimmed, now);
        if (cachedById.hit)
            return cachedById.value;
        const matchChannel = (list) => {
            const found = list.find((ch) => ch.name.toLowerCase() === normalized || ch.id === trimmed);
            return found?.id;
        };
        const joined = await listChannels(signal, { scope: 'joined' });
        const joinedMatch = matchChannel(joined);
        if (joinedMatch !== undefined)
            return joinedMatch;
        try {
            const all = await listChannels(signal, { scope: 'all' });
            const allMatch = matchChannel(all);
            if (allMatch !== undefined)
                return allMatch;
        }
        catch (error) {
            signal?.throwIfAborted();
            if (platformErrorCode(error) !== 'missing_scope')
                throw error;
        }
        throw new LocalSlackError(`未找到频道「${trimmed}」：请确认频道名或频道 ID 是否正确，或先用 /invite 将机器人加入该频道。`);
    };
    const resolveUserName = async (userId, signal) => {
        if (typeof userId !== 'string' || userId.trim() === '')
            return undefined;
        signal?.throwIfAborted();
        const id = userId.trim();
        const now = Date.now();
        const cached = getCache(userNameCache, id, now);
        if (cached.hit)
            return cached.value;
        if (usersInfoScopeBlockedUntil > now)
            return undefined;
        try {
            const result = await createClient(signal, USER_INFO_TIMEOUT_MS).users.info({ user: id });
            signal?.throwIfAborted();
            const profile = result.user?.profile;
            const candidates = [profile?.display_name, profile?.real_name, result.user?.real_name, result.user?.name];
            const resolved = candidates.find((v) => typeof v === 'string' && v.trim() !== '')?.trim();
            setCache(userNameCache, id, resolved, USER_CACHE_TTL_MS, USER_CACHE_MAX_SIZE);
            return resolved;
        }
        catch (error) {
            signal?.throwIfAborted();
            const code = platformErrorCode(error);
            if (code === 'missing_scope') {
                usersInfoScopeBlockedUntil = Date.now() + USER_CACHE_TTL_MS;
                return undefined;
            }
            if (code === 'user_not_found' || code === 'not_allowed_token_type') {
                setCache(userNameCache, id, undefined, USER_CACHE_TTL_MS, USER_CACHE_MAX_SIZE);
                return undefined;
            }
            throw error;
        }
    };
    const enrichMessages = async (rawMessages, signal) => {
        const items = Array.isArray(rawMessages) ? rawMessages : [];
        const uniqueUsers = [];
        const seenUsers = new Set();
        for (const item of items) {
            if (typeof item?.user === 'string' && item.user.trim() !== '') {
                const uid = item.user.trim();
                if (!seenUsers.has(uid)) {
                    seenUsers.add(uid);
                    uniqueUsers.push(uid);
                }
            }
        }
        const resolvedNames = new Map();
        const toFetch = [];
        const now = Date.now();
        for (const uid of uniqueUsers) {
            const cached = getCache(userNameCache, uid, now);
            if (cached.hit) {
                if (cached.value !== undefined)
                    resolvedNames.set(uid, cached.value);
            }
            else if (toFetch.length < MAX_USER_LOOKUPS_PER_CALL && usersInfoScopeBlockedUntil <= now) {
                toFetch.push(uid);
            }
        }
        if (toFetch.length > 0) {
            let nextIndex = 0;
            const workerCount = Math.min(USER_LOOKUP_CONCURRENCY, toFetch.length);
            await Promise.all(Array.from({ length: workerCount }, async () => {
                while (nextIndex < toFetch.length) {
                    signal?.throwIfAborted();
                    if (usersInfoScopeBlockedUntil > Date.now())
                        return;
                    const uid = toFetch[nextIndex++];
                    try {
                        const name = await resolveUserName(uid, signal);
                        if (name !== undefined)
                            resolvedNames.set(uid, name);
                    }
                    catch (error) {
                        signal?.throwIfAborted();
                        // Best-effort enrichment: ignore transient user lookup failures.
                        void error;
                    }
                }
            }));
        }
        const messages = [];
        for (const item of items) {
            if (item === null || typeof item !== 'object')
                continue;
            const ts = typeof item.ts === 'string' ? item.ts : '';
            if (!ts)
                continue;
            const user = typeof item.user === 'string' && item.user.trim() !== '' ? item.user.trim() : undefined;
            const botProfileName = typeof item.bot_profile?.name === 'string' && item.bot_profile.name.trim() !== ''
                ? item.bot_profile.name.trim()
                : undefined;
            const fallbackBotUsername = typeof item.username === 'string' && item.username.trim() !== ''
                ? item.username.trim()
                : undefined;
            const userName = (user !== undefined ? resolvedNames.get(user) : undefined)
                ?? botProfileName
                ?? fallbackBotUsername;
            const botId = typeof item.bot_id === 'string' && item.bot_id.trim() !== '' ? item.bot_id.trim() : undefined;
            const rawText = typeof item.text === 'string' ? item.text : '';
            const text = rawText.trim() !== ''
                ? rawText
                : extractFallbackMessageText(item.blocks, item.attachments);
            const threadTs = typeof item.thread_ts === 'string' && item.thread_ts.trim() !== '' ? item.thread_ts.trim() : undefined;
            const replyCount = typeof item.reply_count === 'number' && Number.isFinite(item.reply_count) ? item.reply_count : undefined;
            const files = extractFiles(item.files);
            messages.push({
                ts,
                text,
                ...(user !== undefined ? { user } : {}),
                ...(userName !== undefined ? { userName } : {}),
                ...(botId !== undefined ? { bot_id: botId } : {}),
                ...(threadTs !== undefined ? { thread_ts: threadTs } : {}),
                ...(replyCount !== undefined ? { reply_count: replyCount } : {}),
                ...(files !== undefined ? { files } : {}),
            });
        }
        return messages;
    };
    return {
        async postMessage(params, signal) {
            signal?.throwIfAborted();
            const targetChannel = normalizeChannelInput(params.channel);
            const useMarkdownBlock = params.text.length <= MAX_MARKDOWN_BLOCK_LENGTH;
            const fallbackText = truncateFallbackText(params.text, MAX_FALLBACK_TEXT_LENGTH);
            const sendToChannel = async (channelId) => {
                const sendPlain = () => createClient(signal).chat.postMessage({
                    channel: channelId,
                    text: params.text,
                    ...(params.thread_ts !== undefined ? { thread_ts: params.thread_ts } : {}),
                });
                if (useMarkdownBlock) {
                    try {
                        return await createClient(signal).chat.postMessage({
                            channel: channelId,
                            text: fallbackText,
                            blocks: [{ type: 'markdown', text: params.text }],
                            ...(params.thread_ts !== undefined ? { thread_ts: params.thread_ts } : {}),
                        });
                    }
                    catch (error) {
                        signal?.throwIfAborted();
                        const code = platformErrorCode(error);
                        if (code === 'invalid_blocks' || code === 'invalid_blocks_format' || code === 'msg_blocks_too_long') {
                            return await sendPlain();
                        }
                        throw error;
                    }
                }
                return await sendPlain();
            };
            let effectiveChannel = targetChannel;
            let result;
            try {
                result = await sendToChannel(targetChannel);
            }
            catch (error) {
                signal?.throwIfAborted();
                // 部分私密频道或历史重命名频道按 #频道名 直发会触发 channel_not_found；
                // 仅在首次请求已被 Slack 明确拒绝（零重复风险）时尝试解析为规范 ID 重发一次。
                if (platformErrorCode(error) === 'channel_not_found' && !SLACK_CHANNEL_ID_RE.test(targetChannel)) {
                    let resolvedId;
                    try {
                        resolvedId = await resolveChannelId(targetChannel, signal);
                    }
                    catch (resolveError) {
                        signal?.throwIfAborted();
                        void resolveError;
                    }
                    if (resolvedId !== undefined && resolvedId !== targetChannel) {
                        effectiveChannel = resolvedId;
                        result = await sendToChannel(resolvedId);
                    }
                    else {
                        throw error;
                    }
                }
                else {
                    throw error;
                }
            }
            signal?.throwIfAborted();
            const ts = typeof result.ts === 'string' ? result.ts : '';
            if (!ts)
                throw new LocalSlackError('Slack 未返回消息回执，无法确认提交结果；请先检查频道，避免直接重发。');
            const resolvedChannel = typeof result.channel === 'string' && result.channel.trim() !== ''
                ? result.channel.trim()
                : effectiveChannel;
            return { ts, channel: resolvedChannel };
        },
        listChannels,
        resolveChannelId,
        resolveUserName,
        async authTest(signal) {
            signal?.throwIfAborted();
            const result = await createClient(signal).auth.test();
            signal?.throwIfAborted();
            const scopes = Array.isArray(result.response_metadata?.scopes)
                ? result.response_metadata.scopes
                    .map((item) => (typeof item === 'string' ? item.trim() : ''))
                    .filter((item) => item !== '')
                : undefined;
            return {
                ok: result.ok === true,
                ...(typeof result.url === 'string' && result.url !== '' ? { url: result.url } : {}),
                ...(typeof result.team === 'string' && result.team !== '' ? { team: result.team } : {}),
                ...(typeof result.user === 'string' && result.user !== '' ? { user: result.user } : {}),
                ...(typeof result.team_id === 'string' && result.team_id !== '' ? { team_id: result.team_id } : {}),
                ...(typeof result.user_id === 'string' && result.user_id !== '' ? { user_id: result.user_id } : {}),
                ...(typeof result.bot_id === 'string' && result.bot_id !== '' ? { bot_id: result.bot_id } : {}),
                ...(scopes !== undefined && scopes.length > 0 ? { scopes } : {}),
            };
        },
        async getHistory(params, signal) {
            signal?.throwIfAborted();
            const channel = await resolveChannelId(params.channel, signal);
            const limit = clampApiLimit(params.limit, 20, 100);
            const oldest = params.oldest !== undefined && params.oldest !== ''
                ? normalizeHistoryTimestamp(params.oldest, 'oldest')
                : undefined;
            const latest = params.latest !== undefined && params.latest !== ''
                ? normalizeHistoryTimestamp(params.latest, 'latest')
                : undefined;
            const result = await createClient(signal).conversations.history({
                channel,
                limit,
                ...(oldest !== undefined ? { oldest } : {}),
                ...(latest !== undefined ? { latest } : {}),
            });
            signal?.throwIfAborted();
            const messages = await enrichMessages(result.messages, signal);
            return {
                channel,
                messages,
                has_more: result.has_more === true,
            };
        },
        async getThread(params, signal) {
            signal?.throwIfAborted();
            const channel = await resolveChannelId(params.channel, signal);
            const ts = assertThreadTs(params.thread_ts);
            const limit = clampApiLimit(params.limit, 50, 100);
            const result = await createClient(signal).conversations.replies({
                channel,
                ts,
                limit,
            });
            signal?.throwIfAborted();
            const messages = await enrichMessages(result.messages, signal);
            return {
                channel,
                messages,
                has_more: result.has_more === true,
            };
        },
        async uploadFile(params, signal) {
            signal?.throwIfAborted();
            if (typeof params.filename !== 'string' || params.filename.trim() === '') {
                throw new LocalSlackError('filename 参数错误：必须是非空的文件名（如 report.txt 或 screenshot.png）。');
            }
            const filename = params.filename.trim();
            if (params.file_path !== undefined && params.file_path !== null && typeof params.file_path !== 'string') {
                throw new LocalSlackError('file_path 参数错误：必须是本地文件路径字符串。');
            }
            if (params.content !== undefined && params.content !== null && typeof params.content !== 'string') {
                throw new LocalSlackError('content 参数错误：必须是字符串内容。');
            }
            const normalizedFilePath = typeof params.file_path === 'string' ? params.file_path.trim() : '';
            const hasFilePath = normalizedFilePath !== '';
            const rawContent = typeof params.content === 'string' ? params.content : undefined;
            const hasNonEmptyContent = rawContent !== undefined && rawContent.length > 0;
            if (hasNonEmptyContent && hasFilePath) {
                throw new LocalSlackError('uploadFile 参数错误：content 与 file_path 不能同时提供，请二选一。');
            }
            if (!hasFilePath) {
                if (rawContent === undefined) {
                    throw new LocalSlackError('uploadFile 参数错误：必须提供 content（文本内容）或 file_path（本地文件路径）之一。');
                }
                const byteLen = Buffer.byteLength(rawContent, 'utf8');
                if (byteLen === 0) {
                    throw new LocalSlackError('content 参数错误：内容不能为空，Slack 不支持上传 0 字节文件。');
                }
                if (byteLen > MAX_UPLOAD_FILE_BYTES) {
                    throw new LocalSlackError(`content 参数错误：内容大小为 ${(byteLen / (1024 * 1024)).toFixed(1)} MiB，超过单次上传 50 MiB 上限。`);
                }
            }
            const threadTs = params.thread_ts !== undefined && params.thread_ts !== null && params.thread_ts !== ''
                ? assertThreadTs(params.thread_ts)
                : undefined;
            if (params.title !== undefined && params.title !== null && typeof params.title !== 'string') {
                throw new LocalSlackError('title 参数错误：必须是字符串。');
            }
            if (params.initial_comment !== undefined && params.initial_comment !== null && typeof params.initial_comment !== 'string') {
                throw new LocalSlackError('initial_comment 参数错误：必须是字符串。');
            }
            const title = typeof params.title === 'string' && params.title.trim() !== '' ? params.title.trim() : undefined;
            const initialComment = typeof params.initial_comment === 'string' && params.initial_comment.trim() !== ''
                ? params.initial_comment
                : undefined;
            // Validate and resolve channel BEFORE reading local file bytes into memory.
            const channel = await resolveChannelId(params.channel, signal);
            let fileBuffer;
            if (hasFilePath) {
                let info;
                try {
                    info = await stat(normalizedFilePath);
                }
                catch (error) {
                    mapLocalFsError(normalizedFilePath, error, '访问', signal);
                }
                signal?.throwIfAborted();
                if (info.isDirectory()) {
                    throw new LocalSlackError(`file_path 参数错误：「${normalizedFilePath}」是目录而不是文件，无法上传。`);
                }
                if (!info.isFile()) {
                    throw new LocalSlackError(`file_path 参数错误：「${normalizedFilePath}」不是常规文件，无法上传。`);
                }
                if (info.size === 0) {
                    throw new LocalSlackError(`文件内容为空：「${normalizedFilePath}」为 0 字节，Slack 不支持上传空文件。`);
                }
                if (info.size > MAX_UPLOAD_FILE_BYTES) {
                    throw new LocalSlackError(`文件过大：「${normalizedFilePath}」大小为 ${(info.size / (1024 * 1024)).toFixed(1)} MiB，超过单次上传 50 MiB 上限。`);
                }
                try {
                    fileBuffer = await readFile(normalizedFilePath, { signal });
                }
                catch (error) {
                    mapLocalFsError(normalizedFilePath, error, '读取', signal);
                }
                signal?.throwIfAborted();
                if (fileBuffer.byteLength === 0) {
                    throw new LocalSlackError(`文件内容为空：「${normalizedFilePath}」为 0 字节，Slack 不支持上传空文件。`);
                }
                if (fileBuffer.byteLength > MAX_UPLOAD_FILE_BYTES) {
                    throw new LocalSlackError(`文件过大：「${normalizedFilePath}」大小为 ${(fileBuffer.byteLength / (1024 * 1024)).toFixed(1)} MiB，超过单次上传 50 MiB 上限。`);
                }
            }
            const commonArgs = {
                channel_id: channel,
                filename,
                ...(title !== undefined ? { title } : {}),
                ...(initialComment !== undefined ? { initial_comment: initialComment } : {}),
                ...(threadTs !== undefined ? { thread_ts: threadTs } : {}),
            };
            const uploadArgs = (fileBuffer !== undefined
                ? { ...commonArgs, file: fileBuffer }
                : { ...commonArgs, content: rawContent });
            const result = await createClient(signal, 55000).filesUploadV2(uploadArgs);
            signal?.throwIfAborted();
            const firstCompletion = result.files?.[0];
            const uploaded = firstCompletion?.files?.[0] ?? firstCompletion;
            const fileId = typeof uploaded?.id === 'string' && uploaded.id !== '' ? uploaded.id : undefined;
            const permalink = typeof uploaded?.permalink === 'string' && uploaded.permalink !== '' ? uploaded.permalink : undefined;
            return {
                ok: result.ok === true,
                channel,
                filename,
                ...(fileId !== undefined ? { file_id: fileId } : {}),
                ...(permalink !== undefined ? { permalink } : {}),
            };
        },
        async addReaction(params, signal) {
            signal?.throwIfAborted();
            const channel = await resolveChannelId(params.channel, signal);
            const timestamp = assertTimestamp(params.timestamp);
            const name = assertReactionName(params.name);
            const result = await createClient(signal).reactions.add({ channel, timestamp, name });
            signal?.throwIfAborted();
            return { ok: result.ok === true, channel };
        },
    };
}
function joinMetadataList(value) {
    if (!Array.isArray(value))
        return undefined;
    const items = value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item !== '');
    return items.length > 0 ? items.join(', ') : undefined;
}
function describeOriginalError(original) {
    const err = original;
    const name = typeof err?.name === 'string' ? err.name : '';
    const code = typeof err?.code === 'string'
        ? err.code
        : (typeof err?.cause?.code === 'string' ? err.cause.code : '');
    const message = typeof err?.message === 'string' ? err.message : '';
    const causeMessage = typeof err?.cause?.message === 'string' ? err.cause.message : '';
    const stack = `${typeof err?.stack === 'string' ? err.stack : ''} ${typeof err?.cause?.stack === 'string' ? err.cause.stack : ''}`;
    const combined = `${name} ${code} ${message} ${causeMessage}`;
    const isTimeout = name === 'TimeoutError'
        || name === 'AbortError'
        || /\b(ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)\b/i.test(combined)
        || /timed?\s*out|timeout|aborted/i.test(combined);
    const isProxyError = code === 'UND_ERR_INVALID_ARG'
        || /\b(UND_ERR_PROXY|ERR_PROXY)\b/i.test(combined)
        || /proxy|ProxyAgent|EnvHttpProxyAgent|socks/i.test(`${combined} ${stack}`);
    const isInvalidUrl = !isProxyError && (code === 'ERR_INVALID_URL'
        || /invalid url|failed to parse url/i.test(combined));
    const detail = [code, message || causeMessage].filter((part) => part !== '').join(': ') || '网络异常';
    return { isTimeout, isProxyError, isInvalidUrl, detail };
}
/**
 * 把 Slack API 错误映射为全中文提示（本地校验/文件/分页等已知中文错误直接透传，不加冗余前缀）。
 */
export function mapSlackError(error) {
    if (isLocalSlackError(error)) {
        return error.message;
    }
    const err = (error ?? {});
    const sdkCode = typeof err.code === 'string' ? err.code : undefined;
    // 1. 限流错误（WebAPIRateLimitedError 或带数字 retryAfter 的对象）
    if (sdkCode === ErrorCode.RateLimitedError || typeof err.retryAfter === 'number') {
        if (typeof err.retryAfter === 'number' && Number.isFinite(err.retryAfter) && err.retryAfter >= 0) {
            return `Slack 触发限流（ratelimited）：请求过于频繁，请等待 ${err.retryAfter} 秒后重试。`;
        }
        return 'Slack 触发限流（ratelimited）：请求太频繁，请稍等几秒后重试。';
    }
    // 2. HTTP 层错误（WebAPIHTTPError）
    if (sdkCode === ErrorCode.HTTPError || typeof err.statusCode === 'number') {
        const status = typeof err.statusCode === 'number' ? err.statusCode : 0;
        const statusText = typeof err.statusMessage === 'string' && err.statusMessage.trim() !== ''
            ? ` ${err.statusMessage.trim()}`
            : '';
        if (status === 429) {
            const retryHeader = err.headers?.['retry-after'] ?? err.headers?.['Retry-After'];
            const parsedRetry = typeof retryHeader === 'string' ? Number.parseInt(retryHeader, 10) : Number.NaN;
            if (Number.isFinite(parsedRetry) && parsedRetry >= 0) {
                return `Slack 返回 HTTP 429（限流）：请求过于频繁，请等待 ${parsedRetry} 秒后重试。`;
            }
            return 'Slack 返回 HTTP 429（限流）：请求过于频繁，响应未包含有效的 Retry-After 等待时间，请稍等几秒后重试。';
        }
        if (status >= 500 && status < 600) {
            return `Slack 服务暂时不可用（HTTP ${status}${statusText}）：Slack 服务端出现临时故障，请稍后重试；若刚执行发送操作，重发前请先检查频道避免重复。`;
        }
        return `Slack HTTP 请求异常（HTTP ${status}${statusText}）：请检查 slackApiUrl 配置及网络代理设置后重试。`;
    }
    // 3. 网络/超时/代理请求错误（WebAPIRequestError）
    if (sdkCode === ErrorCode.RequestError) {
        const { isTimeout, isProxyError, isInvalidUrl, detail } = describeOriginalError(err.original ?? err.cause ?? err);
        if (isTimeout) {
            return `Slack 请求超时（${detail}）：无法确认请求是否已送达 Slack，重发前请先检查目标频道，避免重复发送。`;
        }
        if (isProxyError) {
            return `Slack 代理配置或连接错误（${detail}）：请检查环境变量 HTTP_PROXY / HTTPS_PROXY / NO_PROXY 是否为合法的 http:// 或 https:// 代理地址。`;
        }
        if (isInvalidUrl) {
            return `Slack API 地址无效（${detail}）：请检查 slackApiUrl 配置是否为合法的 http:// 或 https:// 地址。`;
        }
        return `Slack 网络请求失败（${detail}）：请检查网络连接、防火墙或 HTTP_PROXY / HTTPS_PROXY 代理设置后重试。`;
    }
    // 4. 文件上传参数/读取错误
    if (sdkCode === ErrorCode.FileUploadInvalidArgumentsError || sdkCode === ErrorCode.FileUploadReadFileDataError) {
        const detail = typeof err.message === 'string' && err.message !== '' ? err.message : '文件参数或内容读取失败';
        return `Slack 文件上传失败（${sdkCode}）：${detail}`;
    }
    // 5. Slack 平台业务错误（WebAPIPlatformError / { data: { error } }）
    const data = err.data;
    const code = typeof data?.error === 'string' ? data.error : undefined;
    if (code === 'invalid_auth') {
        return 'Slack 认证失败（invalid_auth）：token 无效、已撤销或过期。请重新生成令牌并在 DSH「设置 → 插件 → Slack（dsh-slack）」更新 token（保存即生效，无需重启），或在 profile 的 cordis.patch.yml 覆盖 slack 行的 config.token 并重启。';
    }
    if (code === 'token_expired') {
        return 'Slack 令牌已过期（token_expired）：请重新授权或刷新令牌，并在 DSH「设置 → 插件 → Slack（dsh-slack）」更新 token（保存即生效，无需重启）。';
    }
    if (code === 'token_revoked' || code === 'account_inactive' || code === 'not_authed' || code === 'invalid_token') {
        return `Slack 令牌不可用（${code}）：当前令牌已被撤销、账号已停用或未携带认证信息。请重新生成或重新授权令牌，并在 DSH「设置 → 插件 → Slack（dsh-slack）」更新 token（保存即生效，无需重启）。`;
    }
    if (code === 'org_login_required' || code === 'team_access_not_granted') {
        return `Slack 工作区或组织访问受限（${code}）：当前令牌未获得目标工作区/企业组织（Enterprise Grid）的授权，请重新安装或联系组织管理员授权。`;
    }
    if (code === 'missing_scope') {
        const needed = (typeof data?.needed === 'string' && data.needed.trim() !== '' ? data.needed.trim() : undefined)
            ?? joinMetadataList(data?.response_metadata?.acceptedScopes);
        const provided = (typeof data?.provided === 'string' && data.provided.trim() !== '' ? data.provided.trim() : undefined)
            ?? joinMetadataList(data?.response_metadata?.scopes);
        if (needed !== undefined) {
            const providedHint = provided !== undefined ? `（当前已授予：${provided}）` : '';
            return `Slack 权限不足（missing_scope）：缺少必需权限 ${needed}${providedHint}。请在 Slack App「OAuth & Permissions → Scopes」勾选上述权限并重新安装（Reinstall）App，获取新令牌后更新 token。`;
        }
        return 'Slack 权限不足（missing_scope）：当前令牌缺少所需 OAuth Scope，请在 Slack App「OAuth & Permissions → Scopes」补全权限并重新安装（Reinstall）App，获取新令牌后更新 token。';
    }
    if (code === 'not_allowed_token_type') {
        return 'Slack 令牌类型不匹配（not_allowed_token_type）：当前令牌类型不支持该操作（例如误把 xapp- 填到了 token，或接口需要 Bot Token xoxb- / User Token xoxp-），请检查 token 配置。';
    }
    if (code === 'channel_not_found') {
        return '频道未找到（channel_not_found）：请检查频道名或频道 ID 是否正确（如 #general 或 C01234567），私有频道需先将机器人加入。';
    }
    if (code === 'not_in_channel') {
        return '机器人不在该频道中（not_in_channel）：请先把机器人 App 添加（invite）到该频道。';
    }
    if (code === 'is_archived' || code === 'channel_is_archived') {
        return `频道已归档（${code}）：机器人不能在已归档频道执行此操作，请改用其他频道。`;
    }
    if (code === 'messages_tab_disabled') {
        return 'App 私信标签页未启用（messages_tab_disabled）：请在 Slack App「App Home」开启 Messages Tab 并关闭只读（或导入 slack-app-manifest.yaml 预设配置）。';
    }
    if (code === 'msg_too_long') {
        return '消息过长（msg_too_long）：Slack 单条消息不能超过 40,000 字符，请精简后重试。';
    }
    if (code === 'msg_blocks_too_long') {
        return '消息 Markdown 块过长（msg_blocks_too_long）：单个 Markdown 渲染块超过 Slack 12,000 字符上限，请精简内容或分段发送。';
    }
    if (code === 'invalid_blocks' || code === 'invalid_blocks_format') {
        const metaMsgs = joinMetadataList(data?.response_metadata?.messages);
        const detail = metaMsgs !== undefined ? `（${metaMsgs}）` : '';
        return `消息块格式无效（${code}）${detail}：Slack 无法解析当前 Markdown / Block Kit 结构，请简化特殊排版语法后重试。`;
    }
    if (code === 'markdown_text_conflict') {
        return '消息格式冲突（markdown_text_conflict）：Slack 不允许同时传递互斥的 Markdown 与 Block Kit 载荷，请精简消息内容后重试。';
    }
    if (code === 'already_reacted') {
        return '已添加过该表情回应（already_reacted）：当前机器人已对此消息添加过相同表情，无需重复添加。';
    }
    if (code === 'no_reaction') {
        return '表情回应不存在（no_reaction）：目标消息上未找到对应的表情回应。';
    }
    if (code === 'too_many_reactions') {
        return '表情回应数量达到上限（too_many_reactions）：目标消息上的表情种类或数量已达到 Slack 限制。';
    }
    if (code === 'invalid_name') {
        return '表情名称无效（invalid_name）：请检查 Slack 表情名称拼写（如 thumbsup、white_check_mark，不含两侧冒号）。';
    }
    if (code === 'message_not_found') {
        return '消息未找到（message_not_found）：目标时间戳（ts）对应的消息不存在或已被删除，请确认 channel 与 ts 是否匹配。';
    }
    if (code === 'thread_not_found' || code === 'cannot_reply_to_message') {
        return `线程未找到或无法回复（${code}）：目标 thread_ts 对应的线程不存在、已被删除或不支持回复，请确认 channel 与 thread_ts 是否正确。`;
    }
    if (code === 'invalid_ts_oldest' || code === 'invalid_ts_latest') {
        return `时间范围参数无效（${code}）：请传入合法的 Slack 时间戳（如 1700000000.000100）或 ISO-8601 时间（如 2026-11-26T00:00:00Z）。`;
    }
    if (code === 'restricted_action' || code === 'ekm_access_denied') {
        return `工作区策略限制了该操作（${code}）：当前 Slack 频道或企业安全策略禁止机器人执行此操作，请联系工作区管理员。`;
    }
    if (code === 'file_uploads_disabled') {
        return '工作区已禁用文件上传（file_uploads_disabled）：当前 Slack 工作区策略不允许上传文件，请联系工作区管理员。';
    }
    if (code === 'ratelimited' || code === 'rate_limited') {
        return 'Slack 触发限流（ratelimited）：请求太频繁，请稍等几秒后重试。';
    }
    const message = typeof err.message === 'string' ? err.message : '';
    if (/Retry header did not contain a valid timeout/i.test(message)) {
        return 'Slack 返回 HTTP 429（限流）：请求过于频繁，但响应未包含有效的 Retry-After 等待秒数，请稍等几秒后重试。';
    }
    return message ? `Slack API 调用失败：${message}` : 'Slack API 调用失败：未知错误。';
}
/**
 * 规整频道输入：提取 Slack 频道提及（如 <#C01234567|general>）与 channel: 前缀中的规范频道 ID，
 * 其他频道名（如 #general）或规范 ID 原样去首尾空白返回。
 */
export function normalizeChannelInput(channel) {
    const trimmed = channel.trim();
    const mention = SLACK_CHANNEL_MENTION_RE.exec(trimmed);
    if (mention?.[1])
        return mention[1].toUpperCase();
    const prefixed = SLACK_CHANNEL_PREFIX_RE.exec(trimmed);
    if (prefixed?.[1])
        return prefixed[1].toUpperCase();
    return trimmed;
}
/** 校验 channel 参数：必须是非空字符串（频道名或频道 ID）。 */
export function assertChannel(channel) {
    if (typeof channel !== 'string' || channel.trim() === '') {
        throw new LocalSlackError('channel 参数错误：必须是频道名（如 #general）或频道 ID 的非空字符串。');
    }
    return channel.trim();
}
/** 校验 text 参数：必须是非空字符串。 */
export function assertText(text) {
    if (typeof text !== 'string' || text.trim() === '') {
        throw new LocalSlackError('text 参数错误：必须是待发送的 Markdown 文本（非空字符串）。');
    }
    return text;
}
/** 校验 thread_ts 参数：必须是待回复消息 ts 的非空字符串。 */
export function assertThreadTs(thread_ts) {
    if (typeof thread_ts !== 'string' || thread_ts.trim() === '') {
        throw new LocalSlackError('thread_ts 参数错误：必须是待回复消息的 ts（来自 slack_inbox 返回的 ts）的非空字符串。');
    }
    return thread_ts.trim();
}
/** 校验消息时间戳（ts / timestamp）参数：必须是非空字符串。 */
export function assertTimestamp(timestamp, fieldName = 'timestamp') {
    if (typeof timestamp !== 'string' || timestamp.trim() === '') {
        throw new LocalSlackError(`${fieldName} 参数错误：必须是目标消息的 ts（如 1700000000.000100）的非空字符串。`);
    }
    return timestamp.trim();
}
function utcEpochSeconds(year, month, day, hour = 0, minute = 0, second = 0) {
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, 0);
    return date.getTime() / 1000;
}
function isValidUtcCalendarDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return false;
    const check = new Date(0);
    check.setUTCFullYear(year, month - 1, day);
    check.setUTCHours(0, 0, 0, 0);
    return (check.getUTCFullYear() === year
        && check.getUTCMonth() === month - 1
        && check.getUTCDate() === day);
}
/**
 * 规整历史查询边界时间戳（oldest / latest）：
 * - 直接透传标准 Slack 数字时间戳（如 1700000000.000100 或 1700000000）；
 * - 自动将 ISO-8601 日期/时间（如 2026-11-26T00:00:00Z、2026-11-26T08:00:00+08:00、
 *   2026-11-26T00:00:00.000100Z 或 2026-11-26）转为 Unix 秒时间戳，保留 Slack 6 位微秒精度；
 * - 其他非法格式抛出清晰中文错误，避免把不可解析文本发给 Slack 触发 invalid_ts_oldest/latest。
 */
export function normalizeHistoryTimestamp(value, fieldName = 'timestamp') {
    const trimmed = assertTimestamp(value, fieldName);
    if (SLACK_NUMERIC_TS_RE.test(trimmed))
        return trimmed;
    const dateMatch = ISO_DATE_ONLY_RE.exec(trimmed);
    if (dateMatch) {
        const year = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const day = Number(dateMatch[3]);
        if (isValidUtcCalendarDate(year, month, day)) {
            const seconds = utcEpochSeconds(year, month, day);
            if (Number.isFinite(seconds) && seconds >= 0)
                return String(seconds);
        }
        throw new LocalSlackError(`${fieldName} 参数错误：日期「${trimmed}」无效，请传入合法的 Slack 时间戳（如 1700000000.000100）或 ISO-8601 时间（如 2026-11-26T00:00:00Z）。`);
    }
    const dtMatch = ISO_DATETIME_TZ_RE.exec(trimmed);
    if (dtMatch) {
        const year = Number(dtMatch[1]);
        const month = Number(dtMatch[2]);
        const day = Number(dtMatch[3]);
        const hour = Number(dtMatch[4]);
        const minute = Number(dtMatch[5]);
        const second = dtMatch[6] !== undefined ? Number(dtMatch[6]) : 0;
        const rawFrac = dtMatch[7];
        const tzSign = dtMatch[9];
        const tzHour = dtMatch[10] !== undefined ? Number(dtMatch[10]) : 0;
        const tzMinute = dtMatch[11] !== undefined ? Number(dtMatch[11]) : 0;
        const validParts = isValidUtcCalendarDate(year, month, day)
            && hour <= 23
            && minute <= 59
            && second <= 59
            && tzHour <= 23
            && tzMinute <= 59;
        if (validParts) {
            const tzOffsetSeconds = tzSign === undefined
                ? 0
                : (tzSign === '+' ? 1 : -1) * (tzHour * 3600 + tzMinute * 60);
            const wholeSeconds = utcEpochSeconds(year, month, day, hour, minute, second) - tzOffsetSeconds;
            if (Number.isFinite(wholeSeconds) && wholeSeconds >= 0) {
                const microFrac = rawFrac !== undefined
                    ? rawFrac.slice(0, 6).replace(/0+$/, '')
                    : '';
                return microFrac !== '' ? `${wholeSeconds}.${microFrac}` : String(wholeSeconds);
            }
        }
    }
    throw new LocalSlackError(`${fieldName} 参数错误：「${trimmed}」不是有效的 Slack 时间戳或 ISO-8601 时间（示例：1700000000.000100 或 2026-11-26T00:00:00Z）。`);
}
const SLACK_EMOJI_SKIN_TONE_MODIFIER_RE = /[\u{1F3FB}-\u{1F3FF}]/gu;
const SLACK_EMOJI_VARIATION_SELECTOR_RE = /[\uFE0E\uFE0F]/g;
const SLACK_EMOJI_SKIN_TONE_BY_MODIFIER = new Map([
    ['🏻', 2],
    ['🏼', 3],
    ['🏽', 4],
    ['🏾', 5],
    ['🏿', 6],
]);
// Slack reactions.add 仅对支持肤色的手势/人物表情接受 ::skin-tone-2..6 后缀。
const SLACK_EMOJI_SKIN_TONE_CAPABLE = new Set([
    'thumbsup',
    'thumbsdown',
    'pray',
    'male-technologist',
    'female-technologist',
    'writing_hand',
    'clap',
    'ok_hand',
    'muscle',
    'raised_hands',
    'wave',
    'v',
    'crossed_fingers',
    'handshake',
]);
// Slack reactions.add 仅接受短码（如 white_check_mark / thumbsup），不接受原始 Unicode 表情字符。
// 模型经常直接传入 Unicode 表情，这里自动映射高频表情并保留合法的肤色修饰符。
const SLACK_EMOJI_SHORTNAME_BY_GLYPH = new Map([
    ['✅', 'white_check_mark'],
    ['✔', 'heavy_check_mark'],
    ['☑', 'ballot_box_with_check'],
    ['❌', 'x'],
    ['👍', 'thumbsup'],
    ['👎', 'thumbsdown'],
    ['🎉', 'tada'],
    ['🎊', 'confetti_ball'],
    ['❤', 'heart'],
    ['🧡', 'orange_heart'],
    ['💛', 'yellow_heart'],
    ['💚', 'green_heart'],
    ['💙', 'blue_heart'],
    ['💜', 'purple_heart'],
    ['💔', 'broken_heart'],
    ['😄', 'smile'],
    ['😊', 'blush'],
    ['😂', 'joy'],
    ['🤣', 'rolling_on_the_floor_laughing'],
    ['😅', 'sweat_smile'],
    ['😉', 'wink'],
    ['😎', 'sunglasses'],
    ['🥳', 'partying_face'],
    ['😢', 'cry'],
    ['😭', 'sob'],
    ['😡', 'rage'],
    ['🤯', 'exploding_head'],
    ['🫡', 'saluting_face'],
    ['🚀', 'rocket'],
    ['👀', 'eyes'],
    ['🙏', 'pray'],
    ['🙌', 'raised_hands'],
    ['👋', 'wave'],
    ['🤝', 'handshake'],
    ['✌', 'v'],
    ['🤞', 'crossed_fingers'],
    ['🔥', 'fire'],
    ['✨', 'sparkles'],
    ['💯', '100'],
    ['⚠', 'warning'],
    ['❓', 'question'],
    ['❗', 'exclamation'],
    ['‼', 'bangbang'],
    ['➕', 'heavy_plus_sign'],
    ['➖', 'heavy_minus_sign'],
    ['🤔', 'thinking_face'],
    ['👨‍💻', 'male-technologist'],
    ['👨💻', 'male-technologist'],
    ['👩‍💻', 'female-technologist'],
    ['👩💻', 'female-technologist'],
    ['⚡', 'zap'],
    ['🌐', 'globe_with_meridians'],
    ['😱', 'scream'],
    ['🥱', 'yawning_face'],
    ['😨', 'fearful'],
    ['⏳', 'hourglass_flowing_sand'],
    ['⏰', 'alarm_clock'],
    ['✍', 'writing_hand'],
    ['🗜', 'compression'],
    ['🧠', 'brain'],
    ['🛠', 'hammer_and_wrench'],
    ['💻', 'computer'],
    ['🤖', 'robot_face'],
    ['👏', 'clap'],
    ['👌', 'ok_hand'],
    ['💪', 'muscle'],
    ['⭐', 'star'],
    ['📌', 'pushpin'],
    ['📎', 'paperclip'],
    ['🐛', 'bug'],
    ['🔧', 'wrench'],
    ['📝', 'memo'],
    ['💡', 'bulb'],
    ['🎯', 'dart'],
    ['🏁', 'checkered_flag'],
    ['🏆', 'trophy'],
    ['🥇', 'first_place_medal'],
    ['🔄', 'arrows_counterclockwise'],
    ['📦', 'package'],
    ['🚧', 'construction'],
    ['🧪', 'test_tube'],
    ['📊', 'bar_chart'],
    ['📈', 'chart_with_upwards_trend'],
    ['📉', 'chart_with_downwards_trend'],
    ['📣', 'mega'],
    ['🔔', 'bell'],
    ['🔒', 'lock'],
    ['🔓', 'unlock'],
    ['🔑', 'key'],
    ['☕', 'coffee'],
    ['🔴', 'red_circle'],
    ['🟡', 'large_yellow_circle'],
    ['🟢', 'large_green_circle'],
    ['🔵', 'large_blue_circle'],
]);
/** 校验并规整 Slack 表情回应名称（自动去除两侧冒号，并将常见 Unicode 表情转换为 Slack 短码）。 */
export function assertReactionName(name) {
    if (typeof name !== 'string') {
        throw new LocalSlackError('name 参数错误：必须是 Slack 表情名称字符串（如 thumbsup、white_check_mark）。');
    }
    const cleaned = name.trim().replace(/^:+|:+$/g, '').trim();
    if (cleaned === '' || /\s/.test(cleaned)) {
        throw new LocalSlackError('name 参数错误：必须是有效的 Slack 表情名称（如 thumbsup、white_check_mark，不含空白字符）。');
    }
    const skinModifiers = cleaned.match(SLACK_EMOJI_SKIN_TONE_MODIFIER_RE);
    const skinModifier = skinModifiers?.[0];
    const glyphKey = cleaned
        .replace(SLACK_EMOJI_SKIN_TONE_MODIFIER_RE, '')
        .replace(SLACK_EMOJI_VARIATION_SELECTOR_RE, '');
    const mapped = SLACK_EMOJI_SHORTNAME_BY_GLYPH.get(glyphKey);
    if (mapped !== undefined) {
        const tone = skinModifier && SLACK_EMOJI_SKIN_TONE_CAPABLE.has(mapped)
            ? SLACK_EMOJI_SKIN_TONE_BY_MODIFIER.get(skinModifier)
            : undefined;
        return tone !== undefined ? `${mapped}::skin-tone-${tone}` : mapped;
    }
    return /^[A-Za-z0-9_+-]+(?:::[A-Za-z0-9_-]+)?$/.test(cleaned) ? cleaned.toLowerCase() : cleaned;
}

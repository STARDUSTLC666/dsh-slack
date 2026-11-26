/**
 * 共享网络传输与静默日志辅助模块（供 WebClient 与 SocketModeClient 共用）。
 *
 * 1. createSilentSlackLogger：屏蔽 @slack/web-api 与 @slack/socket-mode 默认向 stdout 输出的杂讯；
 * 2. inspectProxyEnv / hasProxyEnv / createProxyDispatcher：严格校验 http(s) 代理 URL，
 *    无代理或代理格式非法/协议不支持时返回 undefined（绝不同步抛错阻塞插件加载），
 *    并避免空字符串小写变量（http_proxy="" / no_proxy=""）遮蔽大写变量；
 * 3. createTransportFetch：合并调用方 AbortSignal 与 SDK 内部超时信号，支持外部生命周期 dispatcher 注入
 *    或模块级有界代理分发器缓存，并将 Node globalThis.FormData 转换为 undici.FormData 防止二进制上传损坏。
 */
import { createRequire } from 'node:module';
import { LogLevel } from '@slack/web-api';
import { EnvHttpProxyAgent, FormData as UndiciFormData, fetch as undiciFetch, } from 'undici';
const DEFAULT_UNDICI_RUNTIME = {
    EnvHttpProxyAgent,
    FormData: UndiciFormData,
    fetch: undiciFetch,
};
let cachedSocketModeUndici;
/**
 * 解析 @slack/socket-mode 自身引用的 undici 副本。
 * 在宿主与插件分别装有不同主版本 undici 时，SocketModeClient 内部 WebSocket 要求 dispatcher
 * 来自同一份 undici 实例；若两者共享同一份 undici，则返回与顶层导入完全一致的构造器。
 */
function loadSocketModeUndici() {
    if (cachedSocketModeUndici !== undefined)
        return cachedSocketModeUndici;
    try {
        const reqHere = createRequire(import.meta.url);
        let socketModeAnchor;
        try {
            socketModeAnchor = reqHere.resolve('@slack/socket-mode/package.json');
        }
        catch {
            socketModeAnchor = reqHere.resolve('@slack/socket-mode');
        }
        const reqFromSocketMode = createRequire(socketModeAnchor);
        const mod = reqFromSocketMode('undici');
        if (typeof mod.EnvHttpProxyAgent === 'function'
            && typeof mod.FormData === 'function'
            && typeof mod.fetch === 'function') {
            cachedSocketModeUndici = {
                EnvHttpProxyAgent: mod.EnvHttpProxyAgent,
                FormData: mod.FormData,
                fetch: mod.fetch,
            };
            return cachedSocketModeUndici;
        }
    }
    catch {
        // 无法定位 @slack/socket-mode 的独立 undici 副本时回退到插件自身 undici。
    }
    cachedSocketModeUndici = DEFAULT_UNDICI_RUNTIME;
    return cachedSocketModeUndici;
}
function resolveRuntimeForDispatcher(dispatcher) {
    const smRuntime = loadSocketModeUndici();
    if (smRuntime.EnvHttpProxyAgent !== EnvHttpProxyAgent
        && dispatcher instanceof smRuntime.EnvHttpProxyAgent) {
        return smRuntime;
    }
    return DEFAULT_UNDICI_RUNTIME;
}
function normalizeEmptyBodyInit(init) {
    const isEmptyStringBody = init?.body === '';
    const isEmptySearchParamsBody = init?.body instanceof URLSearchParams && init.body.size === 0;
    if (!isEmptyStringBody && !isEmptySearchParamsBody)
        return init;
    // 无参 Slack Web API POST（如 auth.test / apps.connections.open）会携带空字符串或空 URLSearchParams body；
    // 剥离零长度 body 可避免 Undici HTTP/2 在 HEADERS 上漏设 END_STREAM 导致请求挂起（Undici #5645）。
    const { body: _emptyBody, ...rest } = init;
    return rest;
}
const PROXY_ENV_KEYS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];
const MAX_CACHED_PROXY_DISPATCHERS = 8;
const transportProxyCache = new Map();
function validateProxyUrl(key, raw) {
    const trimmed = raw.trim();
    if (!trimmed.includes('://')) {
        return {
            ok: false,
            issue: {
                key,
                reason: `${key} 格式无效：缺少 http:// 或 https:// 协议前缀。`,
            },
        };
    }
    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        return {
            ok: false,
            issue: {
                key,
                reason: `${key} 格式无效：无法解析为合法的代理 URL。`,
            },
        };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        const scheme = /^[a-z][a-z0-9+.-]*:$/i.test(parsed.protocol) ? parsed.protocol.slice(0, -1) : '未知';
        return {
            ok: false,
            issue: {
                key,
                reason: `${key} 使用了不支持的代理协议（${scheme}://）：当前仅支持 http:// 或 https:// 代理。`,
            },
        };
    }
    if (!parsed.hostname) {
        return {
            ok: false,
            issue: {
                key,
                reason: `${key} 缺少代理主机名，请填写完整的 http:// 或 https:// 代理地址。`,
            },
        };
    }
    return { ok: true, url: trimmed };
}
/**
 * 巡检环境变量中的 HTTP(S) 代理配置，返回是否存在非法/不支持协议的代理项（绝不包含凭据）。
 */
export function inspectProxyEnv(env = process.env) {
    let configured = false;
    const invalidEntries = [];
    for (const key of PROXY_ENV_KEYS) {
        const raw = env[key];
        if (typeof raw !== 'string' || raw.trim() === '')
            continue;
        configured = true;
        const checked = validateProxyUrl(key, raw);
        if (!checked.ok)
            invalidEntries.push(checked.issue);
    }
    return {
        configured,
        valid: invalidEntries.length === 0,
        invalidEntries,
    };
}
function pickValidProxy(env, lowerKey, upperKey) {
    for (const key of [lowerKey, upperKey]) {
        const raw = env[key];
        if (typeof raw !== 'string' || raw.trim() === '')
            continue;
        const checked = validateProxyUrl(key, raw);
        if (checked.ok)
            return checked.url;
    }
    return '';
}
function resolveProxyValues(env) {
    const httpProxy = pickValidProxy(env, 'http_proxy', 'HTTP_PROXY');
    const httpsProxy = pickValidProxy(env, 'https_proxy', 'HTTPS_PROXY');
    const noProxy = env.no_proxy?.trim() || env.NO_PROXY?.trim() || '';
    return { httpProxy, httpsProxy, noProxy };
}
function getSharedTransportProxyDispatcher(env) {
    const { httpProxy, httpsProxy, noProxy } = resolveProxyValues(env);
    if (httpProxy === '' && httpsProxy === '')
        return undefined;
    const key = `${httpProxy}\u0000${httpsProxy}\u0000${noProxy}`;
    const existing = transportProxyCache.get(key);
    if (existing !== undefined) {
        transportProxyCache.delete(key);
        transportProxyCache.set(key, existing);
        return existing;
    }
    const dispatcher = createProxyDispatcher(env);
    if (dispatcher === undefined)
        return undefined;
    if (transportProxyCache.size >= MAX_CACHED_PROXY_DISPATCHERS) {
        const oldestKey = transportProxyCache.keys().next().value;
        if (oldestKey !== undefined) {
            const evicted = transportProxyCache.get(oldestKey);
            transportProxyCache.delete(oldestKey);
            void evicted?.close?.().catch(() => { });
        }
    }
    transportProxyCache.set(key, dispatcher);
    return dispatcher;
}
function isFormDataLike(body) {
    if (body === null || typeof body !== 'object')
        return false;
    if (typeof globalThis.FormData === 'function' && body instanceof globalThis.FormData)
        return true;
    const candidate = body;
    return typeof candidate.entries === 'function' && candidate[Symbol.toStringTag] === 'FormData';
}
async function normalizeBodyForUndici(body, FormDataCtor = UndiciFormData) {
    if (body === undefined || body === null)
        return body;
    if (body instanceof FormDataCtor)
        return body;
    if (!isFormDataLike(body))
        return body;
    const converted = new FormDataCtor();
    for (const [key, value] of body.entries()) {
        if (typeof value === 'string') {
            converted.append(key, value);
            continue;
        }
        if (value !== null && typeof value === 'object' && typeof value.arrayBuffer === 'function') {
            const blobValue = value;
            const buffer = await blobValue.arrayBuffer();
            const mimeType = typeof blobValue.type === 'string' ? blobValue.type : '';
            const clonedBlob = new Blob([buffer], { type: mimeType });
            const filename = typeof blobValue.name === 'string' ? blobValue.name : undefined;
            if (filename !== undefined) {
                converted.append(key, clonedBlob, filename);
            }
            else {
                converted.append(key, clonedBlob);
            }
            continue;
        }
        converted.append(key, String(value));
    }
    return converted;
}
/** 返回与 @slack/logger Logger 接口兼容的静默空实现，避免 SDK 默认向 stdout 打日志。 */
export function createSilentSlackLogger() {
    return {
        debug() { },
        info() { },
        warn() { },
        error() { },
        setLevel() { },
        getLevel() {
            return LogLevel.ERROR;
        },
        setName() { },
    };
}
/** 仅当环境变量中存在非空 HTTP(S)_PROXY 配置时返回 true。 */
export function hasProxyEnv(env = process.env) {
    return inspectProxyEnv(env).configured;
}
/**
 * 仅在检测到合法的 http:// 或 https:// 代理环境变量时返回新的 undici EnvHttpProxyAgent；
 * 无代理或代理配置非法/协议不支持时返回 undefined（永不同步抛错），避免阻塞插件启动或破坏默认连接治理。
 */
export function createProxyDispatcher(env = process.env) {
    const { httpProxy, httpsProxy, noProxy } = resolveProxyValues(env);
    if (httpProxy === '' && httpsProxy === '')
        return undefined;
    try {
        return new EnvHttpProxyAgent({ httpProxy, httpsProxy, noProxy });
    }
    catch {
        return undefined;
    }
}
/**
 * 为 @slack/socket-mode 创建与该包自身 undici 副本匹配的代理分发器。
 * 单 undici 副本下与 createProxyDispatcher 完全等价；多 undici 副本宿主下可避免 WebSocket 握手因跨副本 Symbol 不匹配失败。
 */
export function createSocketModeProxyDispatcher(env = process.env) {
    const { httpProxy, httpsProxy, noProxy } = resolveProxyValues(env);
    if (httpProxy === '' && httpsProxy === '')
        return undefined;
    const smRuntime = loadSocketModeUndici();
    try {
        // 与 @slack/socket-mode 的 SlackWebSocket.buildDefaultDispatcher 保持一致：
        // undici v8 默认 allowH2=true，必须显式锁定 HTTP/1.1（含 ProxyAgent.requestTls 与 NO_PROXY Agent.connect），
        // 防止 WebSocket 握手在代理隧道或直连回退路径上协商 HTTP/2 导致连接失败。
        return new smRuntime.EnvHttpProxyAgent({
            httpProxy,
            httpsProxy,
            noProxy,
            allowH2: false,
            connect: { allowH2: false },
            requestTls: { allowH2: false },
        });
    }
    catch {
        return undefined;
    }
}
/**
 * 构建绑定单次调用 AbortSignal 与可选代理分发的 WHATWG fetch 包装。
 * - 若调用方传入 options.dispatcher，则直接复用该自管生命周期分发器；
 * - 否则在存在合法 HTTP(S) 代理环境变量时复用模块级有界 EnvHttpProxyAgent 缓存；
 * - 自动剥离无参 POST 的空字符串 body（防止 Undici HTTP/2 流挂起），并转换 globalThis.FormData 保证二进制上传无损。
 */
export function createTransportFetch(signal, env, options) {
    return async (input, init) => {
        signal?.throwIfAborted();
        const normalizedInit = normalizeEmptyBodyInit(init);
        const initSignal = normalizedInit?.signal ?? undefined;
        const mergedSignal = signal && initSignal
            ? AbortSignal.any([signal, initSignal])
            : (signal ?? initSignal);
        const effectiveEnv = env ?? process.env;
        const hasExplicitDispatcher = options !== undefined && 'dispatcher' in options;
        const dispatcher = hasExplicitDispatcher
            ? options.dispatcher
            : getSharedTransportProxyDispatcher(effectiveEnv);
        if (dispatcher !== undefined) {
            const runtime = resolveRuntimeForDispatcher(dispatcher);
            const normalizedBody = await normalizeBodyForUndici(normalizedInit?.body, runtime.FormData);
            signal?.throwIfAborted();
            const undiciInit = {
                ...normalizedInit,
                ...(normalizedBody !== undefined ? { body: normalizedBody } : {}),
                ...(mergedSignal !== undefined ? { signal: mergedSignal } : {}),
                dispatcher,
            };
            return await runtime.fetch(input, undiciInit);
        }
        const nextInit = {
            ...normalizedInit,
            ...(mergedSignal !== undefined ? { signal: mergedSignal } : {}),
        };
        return await globalThis.fetch(input, nextInit);
    };
}

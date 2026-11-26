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
import { type Logger } from '@slack/web-api';
import { type Dispatcher } from 'undici';
/** 单条代理环境变量校验问题（不包含任何凭据或主机敏感信息）。 */
export interface ProxyEnvIssue {
    key: string;
    reason: string;
}
/** 代理环境变量巡检结果。 */
export interface ProxyEnvInspection {
    configured: boolean;
    valid: boolean;
    invalidEntries: ProxyEnvIssue[];
}
/** createTransportFetch 可选参数。 */
export interface TransportFetchOptions {
    /** 调用方自管生命周期的 undici Dispatcher（传入后优先使用，不再进入模块级缓存）。 */
    dispatcher?: Dispatcher;
}
/**
 * 巡检环境变量中的 HTTP(S) 代理配置，返回是否存在非法/不支持协议的代理项（绝不包含凭据）。
 */
export declare function inspectProxyEnv(env?: NodeJS.ProcessEnv): ProxyEnvInspection;
/** 返回与 @slack/logger Logger 接口兼容的静默空实现，避免 SDK 默认向 stdout 打日志。 */
export declare function createSilentSlackLogger(): Logger;
/** 仅当环境变量中存在非空 HTTP(S)_PROXY 配置时返回 true。 */
export declare function hasProxyEnv(env?: NodeJS.ProcessEnv): boolean;
/**
 * 仅在检测到合法的 http:// 或 https:// 代理环境变量时返回新的 undici EnvHttpProxyAgent；
 * 无代理或代理配置非法/协议不支持时返回 undefined（永不同步抛错），避免阻塞插件启动或破坏默认连接治理。
 */
export declare function createProxyDispatcher(env?: NodeJS.ProcessEnv): Dispatcher | undefined;
/**
 * 为 @slack/socket-mode 创建与该包自身 undici 副本匹配的代理分发器。
 * 单 undici 副本下与 createProxyDispatcher 完全等价；多 undici 副本宿主下可避免 WebSocket 握手因跨副本 Symbol 不匹配失败。
 */
export declare function createSocketModeProxyDispatcher(env?: NodeJS.ProcessEnv): Dispatcher | undefined;
/**
 * 构建绑定单次调用 AbortSignal 与可选代理分发的 WHATWG fetch 包装。
 * - 若调用方传入 options.dispatcher，则直接复用该自管生命周期分发器；
 * - 否则在存在合法 HTTP(S) 代理环境变量时复用模块级有界 EnvHttpProxyAgent 缓存；
 * - 自动剥离无参 POST 的空字符串 body（防止 Undici HTTP/2 流挂起），并转换 globalThis.FormData 保证二进制上传无损。
 */
export declare function createTransportFetch(signal?: AbortSignal, env?: NodeJS.ProcessEnv, options?: TransportFetchOptions): typeof fetch;

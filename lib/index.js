import { registerUpdates } from '@stardustlc/dsh-updates';
/**
 * dsh-slack：DSH 社区 Slack 通知/桥接插件。
 * 支持频道发信、线程回复、Socket Mode 双向收件箱、历史与线程上下文、文件上传、表情回应及在线自检。
 * @module dsh-slack
 */
import { isValidSlackApiUrl, parseConfig, requireToken, resolveAppToken, resolveToken, validateTokenFormat, } from './config.js';
import { Config as SlackConfigSchema, liveConfig } from './host-config.js';
import { createWebSlackClient } from './slack-client.js';
import { buildChannelsTool, buildHealthTool, buildHistoryTool, buildInboxTool, buildNotifyTool, buildReactTool, buildReplyTool, buildThreadTool, buildUploadTool, } from './tools.js';
import { createInboxQueue } from './inbox.js';
import { startSocketModeClient } from './socket.js';
import { inspectProxyEnv } from './transport.js';
export const Config = SlackConfigSchema;
export const name = 'dsh-slack';
export const inject = ['tools'];
export { liveConfig, createVolatile, HostValidationError } from './host-config.js';
export { compileParameters } from './compile.js';
export { parseConfig, resolveToken, resolveDefaultChannel, requireToken, resolveAppToken, isValidSlackApiUrl, validateTokenFormat, ENV_TOKEN, ENV_APP_TOKEN, } from './config.js';
export { createWebSlackClient, mapSlackError, assertChannel, assertText, assertThreadTs, assertTimestamp, assertReactionName, } from './slack-client.js';
export { buildNotifyTool, buildChannelsTool, buildInboxTool, buildReplyTool, buildHealthTool, buildHistoryTool, buildThreadTool, buildUploadTool, buildReactTool, } from './tools.js';
export { parseMessageEvent, InboxQueue, createInboxQueue, INBOX_CAPACITY, } from './inbox.js';
export { startSocketModeClient, } from './socket.js';
/**
 * 插件入口。配置缺失【不失败】（懒加载）：只 warn；
 * token 缺失在每个工具的 execute 时抛出带中文指引的错误；
 * appToken 存在且 slackApiUrl 合法时启动 Socket Mode（ctx.effect 管理生命周期，dispose 时断开）。
 */
export function apply(ctx, rawConfig) {
    registerUpdates(ctx, { name: "dsh-slack" });
    const warn = (message, ...args) => {
        const logger = ctx.logger;
        if (logger !== undefined && typeof logger.warn === 'function') {
            logger.warn(message, ...args);
        }
        else {
            console.warn(message, ...args);
        }
    };
    const liveRaw = typeof rawConfig === 'object' && rawConfig !== null && !Array.isArray(rawConfig)
        ? liveConfig(rawConfig)
        : rawConfig;
    const readConfig = () => {
        try {
            return parseConfig(liveRaw);
        }
        catch {
            return undefined;
        }
    };
    let config;
    try {
        config = parseConfig(liveRaw);
    }
    catch (error) {
        warn('[dsh-slack] 配置解析失败，工具将在调用时报错：', error);
        config = undefined;
    }
    const proxyReport = inspectProxyEnv();
    if (proxyReport.invalidEntries.length > 0) {
        const details = proxyReport.invalidEntries.map((entry) => entry.reason).join('；');
        warn('[dsh-slack] 检测到无效或不受支持的代理环境变量，已忽略无效项（不影响工具注册）：' + details);
    }
    const hasInvalidApiUrl = Boolean(config?.slackApiUrl && !isValidSlackApiUrl(config.slackApiUrl));
    if (config === undefined) {
        warn('[dsh-slack] 配置缺失或格式错误：slack_notify / slack_channels / slack_inbox / slack_reply / slack_health / slack_history / slack_thread / slack_upload / slack_react 已注册，但调用时会报错。可在 DSH「设置 → 插件 → Slack」或 profile 的 cordis.patch.yml 填写配置。');
    }
    else {
        const token = resolveToken(config);
        if (!token) {
            warn('[dsh-slack] 未检测到 Slack 令牌（config.token 与 DSH_SLACK_TOKEN 均为空）：可在 DSH「设置 → 插件 → Slack」填写 token（保存即生效）。');
        }
        else {
            const tokenCheck = validateTokenFormat(token);
            if (!tokenCheck.valid) {
                warn('[dsh-slack] token 格式异常：' + (tokenCheck.reason ?? '请填写 xoxb- 或 xoxp- 令牌（不要把 xapp- 填在 token 栏）。'));
            }
        }
        if (hasInvalidApiUrl) {
            warn('[dsh-slack] slackApiUrl 格式无效（必须为 http:// 或 https:// URL）：' + config.slackApiUrl);
        }
        const appToken = resolveAppToken(config);
        if (!appToken) {
            warn('[dsh-slack] 未检测到 App-Level Token（config.appToken 与 DSH_SLACK_APP_TOKEN 均为空）：未开启 Socket Mode，slack_inbox 将返回空队列。');
        }
        else if (!appToken.startsWith('xapp-')) {
            warn('[dsh-slack] appToken 格式错误（应以 xapp- 开头）：已跳过 Socket Mode 启动。');
        }
    }
    const inboxQueue = createInboxQueue();
    const configFingerprint = (cfg) => resolveToken(cfg) + '\u0000' + (cfg?.slackApiUrl ?? '');
    const configProvider = () => readConfig();
    let client;
    let clientFingerprint = '';
    let socket;
    let socketActive = false;
    let socketDisposed = false;
    let resolvedBotUserId;
    let resolvedBotUserIdFingerprint = '';
    let authAbort;
    let botIdRefreshInFlightFingerprint = '';
    const refreshBotUserId = (force = false) => {
        if (!socketActive || socketDisposed)
            return;
        const current = readConfig();
        const token = resolveToken(current);
        const apiUrl = current?.slackApiUrl;
        const tokenValid = token !== '' && validateTokenFormat(token).valid;
        const apiUrlOk = !apiUrl || isValidSlackApiUrl(apiUrl);
        const fp = token + '\u0000' + (apiUrl ?? '');
        if (resolvedBotUserIdFingerprint !== '' && resolvedBotUserIdFingerprint !== fp) {
            resolvedBotUserId = undefined;
            resolvedBotUserIdFingerprint = '';
        }
        if (!tokenValid || !apiUrlOk)
            return;
        if (!force && resolvedBotUserId !== undefined && resolvedBotUserIdFingerprint === fp)
            return;
        if (!force && botIdRefreshInFlightFingerprint === fp)
            return;
        authAbort?.abort();
        const controller = new AbortController();
        authAbort = controller;
        botIdRefreshInFlightFingerprint = fp;
        void Promise.resolve()
            .then(() => clientProvider().authTest?.(controller.signal))
            .then((info) => {
            if (socketDisposed || controller.signal.aborted)
                return;
            if (configFingerprint(readConfig()) !== fp)
                return;
            if (typeof info?.user_id === 'string' && info.user_id !== '') {
                resolvedBotUserId = info.user_id;
                resolvedBotUserIdFingerprint = fp;
            }
        })
            .catch(() => { })
            .finally(() => {
            if (botIdRefreshInFlightFingerprint === fp)
                botIdRefreshInFlightFingerprint = '';
            if (authAbort === controller)
                authAbort = undefined;
        });
    };
    const clientProvider = () => {
        // 每次调用时重新解析活引用配置（config.token 优先，环境变量回退）。
        // 同一 token/API 地址复用 WebClient；配置变更时自动重建并刷新机器人 user_id。
        const current = readConfig();
        const token = requireToken(current);
        const fingerprint = token + '\u0000' + (current?.slackApiUrl ?? '');
        if (client === undefined || fingerprint !== clientFingerprint) {
            const previousFingerprint = clientFingerprint;
            client = createWebSlackClient(token, current?.slackApiUrl);
            clientFingerprint = fingerprint;
            if (previousFingerprint !== fingerprint) {
                if (resolvedBotUserIdFingerprint !== fingerprint) {
                    resolvedBotUserId = undefined;
                    resolvedBotUserIdFingerprint = '';
                }
                if (socketActive && !socketDisposed) {
                    refreshBotUserId(false);
                }
            }
        }
        return client;
    };
    const botUserIdProvider = () => {
        const fp = configFingerprint(readConfig());
        if (resolvedBotUserIdFingerprint !== '' && resolvedBotUserIdFingerprint !== fp) {
            resolvedBotUserId = undefined;
            resolvedBotUserIdFingerprint = '';
            refreshBotUserId(true);
            return undefined;
        }
        if (resolvedBotUserId === undefined && socketActive && !socketDisposed) {
            refreshBotUserId(false);
        }
        return resolvedBotUserId;
    };
    const inboxProvider = () => inboxQueue;
    const deps = {
        clientProvider,
        configProvider,
        inboxProvider,
        socketStatusProvider: () => socket?.status(),
        onBotUserIdResolved: (userId) => {
            if (typeof userId === 'string' && userId !== '') {
                resolvedBotUserId = userId;
                resolvedBotUserIdFingerprint = configFingerprint(readConfig());
            }
        },
    };
    const appToken = resolveAppToken(config);
    if (appToken !== '' && appToken.startsWith('xapp-')) {
        if (hasInvalidApiUrl) {
            warn('[dsh-slack] 因 slackApiUrl 格式无效，已跳过 Socket Mode 启动（避免误连公共 Slack 服务）。');
        }
        else {
            const startSocket = () => {
                const current = readConfig();
                const rawApiUrl = current?.slackApiUrl;
                if (rawApiUrl && !isValidSlackApiUrl(rawApiUrl)) {
                    warn('[dsh-slack] 因 slackApiUrl 格式无效，已跳过 Socket Mode 启动（避免误连公共 Slack 服务）。');
                    return () => { };
                }
                const validApiUrl = rawApiUrl || undefined;
                socketDisposed = false;
                socketActive = true;
                try {
                    const activeSocket = startSocketModeClient(appToken, {
                        onMessage(message) {
                            inboxQueue.push(message);
                        },
                    }, warn, {
                        ...(validApiUrl !== undefined ? { slackApiUrl: validApiUrl } : {}),
                        botUserIdProvider,
                        onConnected: () => {
                            const fp = configFingerprint(readConfig());
                            const needsRecovery = resolvedBotUserId === undefined || resolvedBotUserIdFingerprint !== fp;
                            refreshBotUserId(needsRecovery);
                        },
                    });
                    socket = activeSocket;
                    refreshBotUserId();
                    return () => {
                        socketDisposed = true;
                        socketActive = false;
                        authAbort?.abort();
                        authAbort = undefined;
                        botIdRefreshInFlightFingerprint = '';
                        activeSocket();
                    };
                }
                catch (error) {
                    socketActive = false;
                    authAbort?.abort();
                    authAbort = undefined;
                    botIdRefreshInFlightFingerprint = '';
                    warn('[dsh-slack] Socket Mode 启动失败（已忽略，不影响工具注册）：', error);
                    return () => {
                        socketDisposed = true;
                        socketActive = false;
                    };
                }
            };
            try {
                if (typeof ctx.effect === 'function') {
                    ctx.effect(startSocket);
                }
                else {
                    const dispose = startSocket();
                    ctx.on?.('dispose', dispose);
                }
            }
            catch (error) {
                warn('[dsh-slack] Socket Mode 生命周期注册失败（已忽略，不影响工具注册）：', error);
            }
        }
    }
    const disposers = [];
    for (const definition of [
        buildNotifyTool(deps),
        buildChannelsTool(deps),
        buildInboxTool(deps),
        buildReplyTool(deps),
        buildHealthTool(deps),
        buildHistoryTool(deps),
        buildThreadTool(deps),
        buildUploadTool(deps),
        buildReactTool(deps),
    ]) {
        const dispose = ctx.tools.register(definition);
        if (typeof dispose === 'function')
            disposers.push(dispose);
    }
    const teardownTools = () => {
        for (const dispose of disposers)
            dispose();
    };
    if (typeof ctx.effect === 'function') {
        ctx.effect(() => teardownTools, 'slack.tools()');
    }
    else {
        ctx.on?.('dispose', teardownTools);
    }
}

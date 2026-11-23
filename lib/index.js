import { registerUpdates } from '@stardustlc/dsh-updates';
/**
 * dsh-slack：DSH 社区 Slack 通知/桥接插件。
 * v0.2 新增 Socket Mode 双向：slack_inbox 收消息、slack_reply 线程回复。
 * @module dsh-slack
 */
import { parseConfig, requireToken, resolveAppToken, resolveToken } from './config.js';
import { Config as SlackConfigSchema, liveConfig } from './host-config.js';
import { createWebSlackClient } from './slack-client.js';
import { buildChannelsTool, buildInboxTool, buildNotifyTool, buildHealthTool, buildReplyTool } from './tools.js';
import { createInboxQueue } from './inbox.js';
import { startSocketModeClient } from './socket.js';
export const Config = SlackConfigSchema;
export const name = 'dsh-slack';
export const inject = ['tools'];
export { liveConfig, createVolatile, HostValidationError } from './host-config.js';
export { compileParameters } from './compile.js';
export { parseConfig, resolveToken, resolveDefaultChannel, requireToken, resolveAppToken, ENV_TOKEN, ENV_APP_TOKEN, } from './config.js';
export { createWebSlackClient, mapSlackError, assertChannel, assertText, assertThreadTs, } from './slack-client.js';
export { buildNotifyTool, buildChannelsTool, buildInboxTool, buildReplyTool, buildHealthTool } from './tools.js';
export { parseMessageEvent, InboxQueue, createInboxQueue, INBOX_CAPACITY } from './inbox.js';
export { startSocketModeClient } from './socket.js';
/**
 * 插件入口。配置缺失【不失败】（懒加载）：只 console.warn；
 * token 缺失在每个工具的 execute 时抛出带中文指引的错误；
 * appToken 存在时启动 Socket Mode（ctx.effect 管理生命周期，dispose 时断开）。
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
    if (config === undefined) {
        warn('[dsh-slack] 配置缺失或格式错误：slack_notify / slack_channels / slack_inbox / slack_reply / slack_health 已注册，但调用时会报错。可在 DSH「设置 → 插件 → Slack」或 profile 的 cordis.patch.yml 填写配置。');
    }
    else {
        if (!resolveToken(config)) {
            warn('[dsh-slack] 未检测到 Slack 令牌（config.token 与 DSH_SLACK_TOKEN 均为空）：可在 DSH「设置 → 插件 → Slack」填写 token（保存即生效）。');
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
    const configProvider = () => readConfig();
    let client;
    let clientFingerprint = '';
    const clientProvider = () => {
        // 每次调用时重新解析活引用配置（config.token 优先，环境变量回退）。
        // 同一 token/API 地址复用 WebClient；配置变更时自动重建。
        const current = readConfig();
        const token = requireToken(current);
        const fingerprint = token + '\u0000' + (current?.slackApiUrl ?? '');
        if (client === undefined || fingerprint !== clientFingerprint) {
            client = createWebSlackClient(token, current?.slackApiUrl);
            clientFingerprint = fingerprint;
        }
        return client;
    };
    const inboxProvider = () => inboxQueue;
    let socket;
    const deps = { clientProvider, configProvider, inboxProvider, socketStatusProvider: () => socket?.status() };
    const appToken = resolveAppToken(config);
    if (appToken !== '' && appToken.startsWith('xapp-')) {
        const startSocket = () => socket = startSocketModeClient(appToken, {
            onMessage(message) {
                inboxQueue.push(message);
            },
        }, warn);
        if (typeof ctx.effect === 'function') {
            ctx.effect(startSocket);
        }
        else {
            const dispose = startSocket();
            ctx.on?.('dispose', dispose);
        }
    }
    const disposers = [];
    for (const definition of [
        buildNotifyTool(deps),
        buildChannelsTool(deps),
        buildInboxTool(deps),
        buildReplyTool(deps),
        buildHealthTool(deps),
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

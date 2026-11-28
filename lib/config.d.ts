/**
 * Slack 插件配置解析（懒加载、全中文错误）。
 *
 * 坑 5：配置缺失时插件【不失败】——apply 里 try/catch，失败只 console.warn；
 * 每个工具的 execute 再解析，缺失时抛出带中文指引的错误。
 */
/** Slack 插件配置。 */
export interface SlackConfig {
    token: string;
    defaultChannel: string;
    /** App-Level Token（xapp- 开头），用于 Socket Mode 接收消息。 */
    appToken: string;
    /** Slack Web API 基地址；默认官方 https://slack.com/api/。企业网格（Enterprise Grid）与本地协议级测试可覆盖。 */
    slackApiUrl?: string;
    /** 机器人 user id（U...），用于判断 @ 是否指向本机器人。 */
    botUserId?: string;
    /** 收件箱触发器要唤醒的 DSH 定时任务 id；留空则关闭触发器。 */
    triggerTaskId?: string;
}
/** token 的环境变量名。 */
export declare const ENV_TOKEN = "DSH_SLACK_TOKEN";
/** appToken 的环境变量名。 */
export declare const ENV_APP_TOKEN = "DSH_SLACK_APP_TOKEN";
/**
 * 解析原始配置。永不抛错：非法形状返回 undefined，让插件懒加载不失败。
 */
export declare function parseConfig(raw: unknown): SlackConfig | undefined;
/**
 * 解析 token：config.token 优先，其次环境变量 DSH_SLACK_TOKEN。
 */
export declare function resolveToken(config: SlackConfig | undefined): string;
/**
 * 解析 appToken：config.appToken 优先，其次环境变量 DSH_SLACK_APP_TOKEN。
 */
export declare function resolveAppToken(config: SlackConfig | undefined): string;
/**
 * 解析默认频道。
 */
export declare function resolveDefaultChannel(config: SlackConfig | undefined): string;
/** 令牌格式校验结果。 */
export interface TokenValidationResult {
    valid: boolean;
    kind: 'bot' | 'user' | 'app' | 'unknown';
    reason?: string;
}
/**
 * 校验自定义 Slack Web API 基地址是否为合法的 http/https URL。
 */
export declare function isValidSlackApiUrl(url: string): boolean;
/**
 * 校验 Slack Web API 令牌前缀格式（区分 Bot / User / 误填的 App-Level Token / 未知格式）。
 */
export declare function validateTokenFormat(token: string): TokenValidationResult;
/**
 * 要求 token：缺失时抛出带中文指引的错误（供 execute 使用）。
 */
export declare function requireToken(config: SlackConfig | undefined): string;

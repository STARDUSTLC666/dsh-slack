/**
 * 从 Slack Block Kit blocks 与传统 attachments 提取可读纯文本的兜底模块。
 *
 * 真实线上 Slack 中，机器人告警（GitHub / Sentry / PagerDuty / Workflow）、转发消息与
 * 纯 Block Kit 消息经常携带空的顶层 `text: ""`，正文完全在 `blocks` 或 `attachments` 中。
 * 本模块仅在顶层 `text` 为空时作为兜底提取，避免对正常消息产生重复拼接。
 */
/**
 * 从 Slack 消息的 blocks 与 attachments 中提取兜底可读文本；均为空时返回空字符串。
 * - 同时存在顶层 blocks 与主业务 attachments（如带颜色侧栏的告警卡片）时合并去重，不丢失卡片正文；
 * - 顶层存在 blocks 时自动抑制链接预览（unfurl）附件，但纯转发（仅 unfurl 附件）仍兜底提取。
 */
export declare function extractFallbackMessageText(blocks: unknown, attachments: unknown): string;

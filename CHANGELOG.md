# 更新记录

## 0.6.1+trigger.1 (2026-11-27)

**本 fork 的改动**（基于上游 0.6.1）：

- **收件箱触发器**：消息进收件箱后 `emit('dsh-slack/inbox', message)`；新增 `src/trigger.ts` 订阅该事件，命中 `app_mention`、`<@botUserId>` 或私信时，按 60 秒合并窗口调用 `ctx.schedule.run({ id: triggerTaskId })` 唤醒一条 paused 的 DSH 定时任务。
- **新增配置字段**：`botUserId`（判断 @ 是否指向本机器人）、`triggerTaskId`（要唤醒的任务；留空则关闭触发器）。
- 除上述改动外，工具行为与上游 0.6.1 一致。

## 0.6.1 (2026-11-26)

- **一键 Slack App Manifest**：新增 `slack-app-manifest.yaml` 并纳入 npm 导出与打包清单，一次性预配全部 9 个工具所需 Bot Scopes、Socket Mode 事件订阅及私信双向交互（`messages_tab_read_only_enabled: false`），同步更新中英文 README、使用说明与详细参考文档。
- **生产环境 Slack API 与消息格式对齐**：新增 `extractFallbackMessageText`，自动提取 Block Kit 与彩色卡片（attachments）正文并在历史消息中支持 `bot_profile.name` 回退；增强 `<#C...|name>` 频道提及与 `#私密频道` 自动解析；`slack_history` 的 `oldest` / `latest` 支持保留微秒精度的 ISO-8601 时间戳自动转换；`slack_react` 内置约 92 个高频 Unicode 表情到 Slack shortcode 映射并妥善处理肤色修饰符。
- **传输层与 Socket Mode 生产稳定性优化**：规避 Undici #5645 空 POST 请求体问题，在 `undici@8` 与双版本 undici 环境下为 Socket Mode 代理分发器固定 `allowH2: false`；优化 Socket Mode 15 秒 ping 超时配置、补充 `link_disabled` 告警提示并跟踪 `activeConnections`。
- Add one-click `slack-app-manifest.yaml` (pre-configured with all 9 tools' Bot Scopes, Socket Mode event subscriptions, and `messages_tab_read_only_enabled: false` for DMs), exported and packaged alongside updated bilingual README/USAGE/REFERENCE docs.
- Align production Slack API & Socket Mode behavior: Block Kit and attachment fallback text extraction (`extractFallbackMessageText`) plus `bot_profile.name` fallback, `<#C...|name>` channel mention and `#private-channel` auto-resolution, microsecond-preserving ISO-8601 `oldest`/`latest` history timestamps, ~92 high-frequency Unicode emoji to Slack shortcode mappings with skin-tone safety, Undici #5645 empty POST body stripping, `undici@8` `allowH2: false` / dual-undici Socket Mode proxy dispatcher, and Socket Mode 15s ping timeout, `link_disabled` warnings, and `activeConnections` tracking.

## 0.6.0 (2026-11-26)

- **传输层与代理加固**：新增共享传输模块，按需支持 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`（无代理不接管默认直连，修复空字符串小写环境变量遮蔽），自动转换 `FormData` 保证二进制文件在代理下无损上传；遇到非法或不支持协议（如 `socks5h://`）的代理环境变量时平滑降级告警而不阻断插件加载，且日志不泄露凭据。
- **消息、频道与错误处理升级**：`slack_notify` / `slack_reply` 默认以 Slack 原生 Markdown Block 发送（超 12,000 字、代理/代理对边界及 `invalid_blocks` 自动安全降级纯文本），返回规范化频道 ID 并严格校验 `thread_ts`；`slack_channels` 默认调用 `users.conversations` 排除归档频道、支持 `scope="all"` 及 `channels:read` / `groups:read` 双向缺权降级；重构 `mapSlackError` 覆盖限流秒数、HTTP 429/5xx、网络超时提醒、精确缺失 Scope 与本地校验错误去重前缀。
- **Socket Mode 与收件箱增强**：卸载时即时中止在途 `apps.connections.open` 消除僵尸连接，非法 `slackApiUrl` 严格拒绝启动避免凭据误发公共 Slack，补齐静默 SDK 日志、重连抖动、单实例代理分发器清理以及离线恢复与 `.volatile()` 令牌热更新自动刷新机器人 `user_id`；`slack_inbox` 保留 `thread_ts`、`app_mention`、`file_share`（含无正文文件占位）与 `thread_broadcast`，按 `(channel, ts)` 规范去重并原位升级元数据，并遵守 `exec.signal` 取消信号。
- **新增 4 个交互工具与在线自检**：新增 `slack_history`（频道历史与用户名补全）、`slack_thread`（完整线程上下文）、`slack_upload`（基于 `filesUploadV2` 上传文本或本地文件）与 `slack_react`（表情回应）；`slack_health` 新增 `verify=true` 在线 `auth.test` 权限核验，校验 `token` 前缀（防误填 `xapp-`、兼容 `xoxe.*`）、`slackApiUrl` 与代理环境变量；同步更新双语文档、本地化文案与 CI/发布工作流。
- Harden Slack transport, Socket Mode, inbox, and error handling (`HTTP(S)_PROXY` with binary-safe `FormData` conversion, non-crashing invalid proxy handling, fail-closed invalid `slackApiUrl`, in-flight `apps.connections.open` abort on dispose, silent SDK logger, backoff jitter, `botUserId` recovery & `.volatile()` hot-refresh, native Markdown blocks with >12k/`invalid_blocks` fallback, bidirectional `listChannels` scope fallback, canonical `(channel, ts)` inbox deduplication with `thread_ts`/`app_mention`/`file_share`/`thread_broadcast`, and comprehensive Chinese error mapping).
- Add four new tools (`slack_history`, `slack_thread`, `slack_upload`, `slack_react`) plus online `auth.test` verification (`slack_health({ verify: true })`), token prefix & proxy env checks, all-9-tool argument/render safety, updated bilingual docs, and CI/publish workflow fixes.

## 0.5.8 (2026-11-23)

- 修复 `slack_notify` 省略或留空 `channel` 时未回退实时 `defaultChannel` 的问题，确保在原生设置面板热更新默认频道后立即生效。
- 修复 `slack_health` 在 `appToken` 非 `xapp-` 开头时误报“已配置”的问题，补充 `buildHealthTool` 重导出、启动告警漏项、`invalid_auth` 原生设置热更新提示，以及 `docs/REFERENCE` 语言链接与更新策略文案。
- Allow omitted or empty `channel` in `slack_notify` to fall back to live `.volatile()` `defaultChannel`, clarify invalid `xapp-` prefix diagnostics in `slack_health`, re-export `buildHealthTool`, and align `invalid_auth` and reference docs.

## 0.5.7 (2026-11-20)

- 升级共享更新组件至 0.2.10，移除跨插件右下角浮动提醒，保留工作台及插件详情页更新控制。

- 增大频道单页容量，在分页覆盖上限或游标循环时明确报告不完整，避免静默返回残缺清单。

## 0.5.6 (2026-11-20)

- 通知、线程回复与频道查询遵守宿主取消信号：已取消调用不再发送请求，进行中的 HTTP 请求及时终止，并保留原始取消原因。
- 每次调用独立组合宿主与 SDK 超时信号，避免取消一个请求干扰其他并发请求；既有客户端方法保持兼容。
- Honor caller cancellation before dispatch and during HTTP requests, preserving cancellation reasons and isolating concurrent Slack calls.
- 同步共享更新组件 0.2.9，修复取消窗口和失败响应清理，并确保运行中旧协调器在空闲后接管修复。

## 0.5.5 (2026-11-20)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.7`：对话页「有新版本」提醒浮卡支持无交互 15 秒自动收起（悬停、聚焦、查看记录或确认弹窗时自动暂停，安装成功提示 6 秒收起，安装中/失败/需要重启仍保持常驻不隐藏）。
- Upgrade `@stardustlc/dsh-updates` to `0.2.7`: auto-dismiss idle update reminder cards after 15s and silent complete cards after 6s while pausing on hover/focus/notes/dialogs and keeping active, failed, or restart-required cards pinned.

## 0.5.4 (2026-11-20)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.6`：端到端验收修复浮卡与日历按钮重叠、详情页/工作台挂载时瞬时让位及 `package-moved` / 包管理器报错诊断文案，继续保持过期检查自动刷新与 `bundle-in-use` 指导。
- Upgrade `@stardustlc/dsh-updates` to `0.2.6`: E2E-verified fixes for floating Calendar FAB clearance, immediate reminder yield on native detail/workbench mount, and clearer `package-moved` / package-manager error messages, alongside auto-refresh and `bundle-in-use` guidance.

## 0.5.3 (2026-11-18)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.5`：独立安装插件详情页底栏去重（保留组合包组件委派与对话页热更新卡片），补齐 `bundle-in-use` 组合包占用提示说明，并在检查结果过期或远端版本变更时自动刷新元数据，彻底消除 `check-first` 卡顿。
- Upgrade `@stardustlc/dsh-updates` to `0.2.5`: deduplicate standalone native plugin detail footers while keeping Suite delegation and in-chat reminder cards, surface clear `bundle-in-use` guidance, and automatically refresh expired update checks without `check-first` stalls.

## 0.5.2 (2026-11-18)

- 升级共享更新组件至 `@stardustlc/dsh-updates@0.2.4`：对话页新增一键热更新提醒卡片，自动检查周期缩短至 6 小时，手动热更新后可顺手开启包含兼容功能小版本的空闲自动更新。
- Upgrade `@stardustlc/dsh-updates` to `0.2.4`: add an actionable in-chat hot-update reminder card, 6-hour background update checks, compatible minor+patch idle auto-updates, and a post-update opt-in prompt.

## 0.5.1 (2026-11-18)

- 同步 `@stardustlc/dsh-updates` 0.2.3：侧边栏工作台平时默认隐藏底部更新栏（零高度占用），仅在检测到兼容新版本或执行更新时浮现单行精简提示条；完整更新设置与检查入口统一保留在 DSH「插件」详情页底部。
- Sync `@stardustlc/dsh-updates` 0.2.3: keep the sidebar workbench update footer hidden by default when up-to-date, surfacing a single-line compact strip only for actionable updates or active jobs while retaining full controls in native Plugin Details.

## 0.5.0 (2026-11-18)

- 新增零外部依赖的宿主原生 `Config` 设置表单声明（`token` 与 `appToken` 自动脱敏，令牌与默认频道修改即热生效），优化未配置引导，并重写符合人类直觉的三步上手与日常对话示例。
- Export a zero-dependency native DSH `Config` schema with secret masking and live reload for `token`, `defaultChannel`, and `slackApiUrl`, plus clearer first-run guidance and copy-ready human workflow docs.

## 0.4.14 (2026-11-18)

- 更新区底部新增克制、无打扰的 GitHub 点赞与问题反馈快捷链接，并完善中英文检索关键词。
- Add subtle, non-intrusive GitHub Star and issue feedback links in the update footer, and expand search keywords.

## 0.4.13 (2026-11-18)

- 同步 `@stardustlc/dsh-updates` 0.2.1：恢复 Suite 整包统一更新（移除独立拆包迁移），保留整包与独立插件的原地热更新与失败自动回滚。
- Sync `@stardustlc/dsh-updates` 0.2.1: restore unified Suite bundle updates (removing standalone conversion) while retaining in-place hot reload and automatic rollback.

## 0.4.12 (2026-11-18)

- 深度适配 DSH 0.2.2：补齐 manifestVersion 1 与双语元数据；新增 Cordis 4 `ctx.effect` 工具卸载清理，并为只读查询与健康检查工具声明并发安全。
- Deeply adapt to DSH 0.2.2: add manifestVersion 1 and bilingual locale metadata; add Cordis 4 `ctx.effect` tool unregistration and mark read-only query/health tools concurrency-safe.

## 0.4.11 (2026-11-17)

- 在原生插件详情页单独检查和安装兼容版本。自动安装默认关闭，可为该插件开启空闲时的稳定补丁更新。
- Check and install compatible versions separately from the native plugin details. Automatic installation is off by default. Enable it for this plugin to apply stable patches while idle.

## 0.4.10 (2026-11-14)

- 适配 DSH 0.2.2-rc.3：最低 Harness 版本声明提升至 0.2.2-rc.3，运行时代码未变。
- Support DSH 0.2.2-rc.3: raise the minimum Harness declaration to 0.2.2-rc.3; runtime code is unchanged.

## 0.4.9 (2026-11-04)

- 同步共享界面：嵌入设置时继承宿主底色，输入框跟随主题，空状态保持可读宽度；新版 DSH 可显示插件设置图标。
- Align embedded surfaces, themed inputs, readable empty states and optional native settings icons.


## 0.4.8 (2026-11-03)

- 空 inbox 按 token/格式/Socket/空闲分支精确诊断。
- Empty inbox diagnosis distinguishes token, format, Socket Mode and idle states.

## 0.4.7 (2026-10-30)

- 重整中英文首页：用途、三步流程图、安装入口与操作示例；详细配置与边界集中到完整说明。
- 保留下载统计、独立更新选择、问题反馈和贡献入口；原封面与运行功能保留。
- Refresh bilingual landing pages, workflow artwork, quick starts and reference navigation.


## 0.4.6 (2026-10-30)

- 原生插件列表与详情新增专门生成的鲸鱼娘图标：大头像、独立功能符号、透明留白，适合 30 / 36 px 显示；原封面保留。
- Add purpose-made whale-girl artwork with a distinct function emblem, transparent padding and small-size readability; preserve the original cover.


[返回简介](README.md) · [使用说明](docs/USAGE.md) · [验证记录](docs/VALIDATION.md)

[历史英文记录](docs/CHANGELOG.en.md)

## 0.4.5 (2026-10-29)

- 补齐中英文使用流程：准备、入口、具体操作与结果核对；新增累计 npm 下载徽章并保留月统计。
- Add practical getting-started workflows and lifetime npm download badges alongside monthly counts.

## 0.4.4 (2026-10-29)

- 同步仓库与 npm 的简明介绍、中英文 README 和反馈入口；本次为文档与包元数据更新。
- Sync npm descriptions and both README guides with the repository, including issue and pull-request links.

## 0.4.3 (2026-10-27)

- 修复分批更新时的新旧更新控件混用：保留原页面、草稿与安装保护，空闲后接管旧控制器，兼容旧入口。

## 0.4.2 (2026-10-27)

- 更新控件移至原有工作台或原生插件详情页底部；更新记录与选项原地展开，移除独立更新菜单与页面。
- 保留原页面操作与草稿，自动安装默认关闭；安装前确认，遇到未保存修改或运行任务时暂停。

## 0.4.1 (2026-10-27)

- Keep this component's own update entry visible when installed transitively through Suite. Confirm whole-Suite update scope before opening its controls.
- Keep automatic installation off by default and preserve independent installation behavior.

## 0.4.0 (2026-10-26)

- Add this plugin’s own update controls and independent preferences. Automatic installation stays off until explicitly enabled.
- Confirm manual installs, preserve local sources and disabled state, pause for tasks or unsaved changes, and use native DSH recovery without forced restarts.
- Require the public DSH 0.2.1-rc.3 update APIs; Suite components remain managed through Suite.

## 0.3.5（2026-10-26）

- Socket Mode 重连改为插件管理的有界退避；捕获启动与重连错误，凭据撤销等永久错误停止重试，卸载取消重连。自检区分凭据已配置、连接中、连接成功与认证失败。
- Windows 回归 49 项通过、0 项跳过；宿主与未验收范围见[本次记录](docs/validation-0.3.5.md)。

## 0.3.4 (2026-10-05)

- 标记已读只移除本次展示的消息，保留剩余未读与已读重投去重；发送不隐式重试，缺少消息回执时提示先检查频道。

## 0.3.3 (2026-10-01)

- 更新并对齐 Socket Mode 的传输依赖，修复依赖解析问题。

## 0.3.0 (2026-08-26)

- 新增 `slack_health` 自检（令牌/Socket Mode 配置一键体检）；修复只配置部分字段（如只有 token 没有 appToken）时可选链导致的启动崩溃。

## 0.2.3 (2026-08-15)

- `slack_channels` 自动分页：频道很多时不再只返回第一页。
  - `slack_inbox` 去重 + `drain` 原子消费：Slack 重投的事件不会重复入队，`markRead` 期间新到的消息也不会被误清。
  - WebClient 复用：同一 `token + slackApiUrl` 只创建一个客户端，减少重复初始化。
  - 分页增加页数上限，防止异常 `next_cursor` 导致死循环。
  - 错误映射补充 `not_authed` / `is_archived` / `msg_too_long` / `ratelimited`。

## 更早的改动

完整历史可查阅 [GitHub 提交记录](https://github.com/STARDUSTLC666/dsh-slack/commits/main)。

# 更新记录

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

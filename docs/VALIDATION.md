# dsh-slack 验证记录

## 2026-11-26：0.6.1

### 离线与 CI 验证

- 版本与提交：`dsh-slack@0.6.1`（commit `f3f44a9`，npm 已发布）。
- 自动化测试：126/126 项单元与集成测试通过，9/9 项协议级验收全部通过；GitHub Actions Ubuntu `ci.yml` 与 OIDC `publish.yml` 均通过。

### 真实 Slack 工作区验收

验证环境：真实 Slack Free Plan 工作区（`slack.com`）+ Node `24.16.0`。

- **一键 Manifest 导入**：在 `api.slack.com/apps`（*From a manifest → YAML*）导入随包 `slack-app-manifest.yaml`，**0 errors、0 warnings**（完整包含 13 项 Bot Scopes、5 项 Bot Events 与私信互动开关 `messages_tab_read_only_enabled: false`）。
- **在线健康自检（`slack_health({ verify: true })`）**：Socket Mode 第 1 次尝试即建立连接（`state: "connected"`）；`auth.test` 正常返回工作区与机器人身份及全部 13 项已授予权限。
- **频道枚举（`slack_channels`）**：`scope: "joined"` 与 `scope: "all"` 均准确返回频道列表，正确处理非 ASCII 频道名并携带 `is_private` / `is_member` / `num_members` 元数据。
- **消息通知与线程回复（`slack_notify` / `slack_reply`）**：支持按频道 ID 与 `#频道名` 发送；Slack Web 客户端肉眼确认原生 `MarkdownBlock` 渲染正常（标题、粗体、斜体、行内代码、可点击超链接、带语言标签与 Copy 按钮的 JavaScript 代码块）。
- **表情回应（`slack_react`）**：Unicode 表情 `✅` 与 `👍🏽` 自动映射为 `white_check_mark` 与 `thumbsup::skin-tone-4`，均返回 `ok: true` 并在 Slack 消息下正常展示。
- **文件上传（`slack_upload`）**：通过 `filesUploadV2` 成功上传 57 字节 UTF-8 文本文件（保留缩进的 `initial_comment`）与 69 字节二进制 PNG 图片，均返回有效 `file_id` 与 `permalink`。
- **频道历史与线程读取（`slack_history` / `slack_thread`）**：微秒精度 ISO-8601 `oldest` 查询正常返回消息，正确补全用户/机器人显示名、完整线程回复及上传文件元数据。
- **Socket Mode 双向收件箱与私信（`slack_inbox` + DM）**：实时收到频道 `@提及` 与 App Home 私信（`message.im`）；`message.channels` 与 `app_mention` 按 `(channel, ts)` 去重并保留 `event_type: "app_mention"`；通过 `slack_reply` 分别回复两个线程后，机器人自身回复被自动过滤（`remaining: 0`，零告警）。

### 未验收范围

- 真实 DSH 桌面版 / 网页版宿主界面挂载与 `undici@8` 运行时尚未在本次实测中覆盖。

### English Summary (0.6.1)

- **Offline & CI**: `dsh-slack@0.6.1` (`f3f44a9`, live on npm), 126/126 unit & integration tests passing, 9/9 protocol acceptance checks passing, Ubuntu `ci.yml` and OIDC `publish.yml` green.
- **Live Slack Workspace Verification** (real Slack Free Plan workspace on `slack.com`, Node `24.16.0`):
  - Imported `slack-app-manifest.yaml` via `api.slack.com/apps` (*From a manifest → YAML*) with **0 errors and 0 warnings** (13 bot scopes, 5 bot events, and `messages_tab_read_only_enabled: false`).
  - `slack_health({ verify: true })`: Socket Mode connected on attempt 1 (`state: "connected"`), and `auth.test` returned workspace/bot identity plus all 13 granted scopes.
  - `slack_channels({ scope: 'joined' | 'all' })`: accurately enumerated joined vs workspace channels including non-ASCII names and `is_private` / `is_member` / `num_members`.
  - `slack_notify` & `slack_reply`: succeeded by channel ID and `#name`; visually confirmed native `MarkdownBlock` rendering in Slack Web (headings, bold, italic, inline code, clickable hyperlink, and syntax-labeled JavaScript code block with Copy button).
  - `slack_react`: mapped Unicode `✅` and `👍🏽` to `white_check_mark` and `thumbsup::skin-tone-4`, both accepted (`ok: true`) and displayed in Slack.
  - `slack_upload`: uploaded both a 57-byte UTF-8 text file (preserving indented `initial_comment`) and a 69-byte binary PNG via `filesUploadV2` with valid `file_id` and `permalink`.
  - `slack_history` & `slack_thread`: microsecond ISO-8601 `oldest` query returned messages with resolved user/bot display names, full thread replies, and uploaded file metadata.
  - Socket Mode bidirectional `slack_inbox` + DM: received live `#channel` `@mention` and App Home DM (`message.im`), deduplicated `message.channels` + `app_mention` by `(channel, ts)` while preserving `event_type: "app_mention"`, replied into both threads via `slack_reply`, and filtered out bot self-replies (`remaining: 0`, zero warnings).
- **Remaining unverified scope**: live DSH Desktop/Web host UI mount and `undici@8` runtime.

---

## 2026-10-26：0.3.5

[本次修复、回归与未验收范围](validation-0.3.5.md)。

本页整理原 README 的历史验证说明，保留当时的版本、日期与范围。自动测试、启动检查、浏览器操作和真实服务验收分别记录，不能相互替代。更详细的版本验收文件仍保留在仓库中。

## 原中文记录

验证宿主：官方发布标签源码构建的 Harness `0.2.0-rc.2`（commit `639ed01539`）+ Windows / Node `24.16.0`。43 项插件测试通过；同一个宿主里 18 个插件共同加载，本插件的 5 个工具全部注册，工具 schema 与健康检查契约通过。真实 Slack 登录、Socket Mode 收件和发送尚未验收。

0.3.3 使用支持 Undici 7/8 的官方 Socket Mode SDK 3.1 或更新版本，并显式声明匹配的传输依赖，修复组合安装中旧 SDK 与宿主 Undici 8 的依赖不匹配；npm 包同时包含中英文说明。

> **历史范围说明（v0.2 双向）**：v0.1 只做「agent → Slack」单向通知；v0.2 新增 Socket Mode，
> 支持「Slack 消息 → agent」：`slack_inbox` 收取消息、`slack_reply` 线程回复。
> 后续新增的 9 个工具能力与当前已知限制见 [已知限制与路线图](USAGE.md#已知限制与路线图)。

## Original English record

Validation host: Harness `0.2.0-rc.2` built from its official release tag (commit `639ed01539`), Windows and Node `24.16.0`. All 43 plugin tests pass; all 18 plugins mount together and this plugin registers all five tools, with tool schemas and health-check contracts passing. Real Slack authorization, Socket Mode delivery and sending have not been verified.

Version 0.3.3 requires the official Socket Mode SDK 3.1 or newer, which supports Undici 7/8, and explicitly declares its transport dependency. This fixes combined installations that paired an older SDK with the host's Undici 8. Both language versions of this README are included in the npm package. See [Known Limitations & Roadmap](USAGE.en.md#known-limitations--roadmap) for current scope and limits.

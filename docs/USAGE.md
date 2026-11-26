# dsh-slack 使用说明

[返回简介](../README.md) · [更新记录](../CHANGELOG.md) · [验证记录](VALIDATION.md)

## 最快 3 步用起来

### 第 1 步：创建 Slack App 并获取令牌

**方式一（推荐，30 秒一键导入 Manifest）：**
1. 打开 <https://api.slack.com/apps> → **Create New App** → **From a manifest**，选择你的工作区。
2. 切换到 **YAML** 标签页，直接粘贴仓库根目录的 [`slack-app-manifest.yaml`](../slack-app-manifest.yaml) → **Next** → **Create**。
   - 该清单已按线上最小必需原则预配全部 Bot Token Scopes（含容易遗漏的 `app_mentions:read`）、Socket Mode 开关、5 类收件箱事件，以及 `app_home.messages_tab_read_only_enabled: false`（确保用户可在 Messages 标签页直接给机器人发私信）。
3. 左侧 **Install App** → **Install to Workspace** 完成授权，复制 `xoxb-`（或可轮换 `xoxe.xoxb-`）开头的 **Bot User OAuth Token**。
4. 如需开启双向 Socket Mode 收件箱（`slack_inbox`）：左侧 **Basic Information → App-Level Tokens → Generate Token and Scopes**，勾选 `connections:write`，复制 `xapp-` 开头的 **App-Level Token**。

**方式二（手动逐项勾选权限）：**
1. 打开 <https://api.slack.com/apps> → **Create New App** → **From scratch**，选择工作区。
2. 打开左侧 **OAuth & Permissions**，在 **Bot Token Scopes** 下按需添加权限：
   - **必选基础**：
     - `chat:write`（发送消息与线程回复）
     - `channels:read`（列出公开频道与 `#频道名` 自动解析）
   - **按需扩展（对应新工具与增强能力）**：
     - `groups:read`（列出私密频道；未授予时 `slack_channels` 会自动降级只查公开频道）
     - `channels:history` / `groups:history` / `im:history` / `mpim:history`（`slack_history`、`slack_thread` 以及对应的 `message.*` 事件订阅）
     - `im:read` / `mpim:read`（私信与多人私信会话元数据）
     - `app_mentions:read`（订阅 `app_mention` 事件必需，缺失会被 Slack 拒绝）
     - `files:write`（`slack_upload` 上传文本或本地文件）
     - `reactions:write`（`slack_react` 添加表情回应）
     - `users:read`（可选：读取历史/线程时自动把 `U...` 解析为显示昵称，未授予时静默回退用户 ID）
3. 若允许用户私信机器人，在 **App Home** 勾选 **Messages Tab** 并开启 **Allow users to send Slash commands and messages from the messages tab**（对应 Manifest 的 `messages_tab_read_only_enabled: false`）。
4. 点击顶部 **Install to Workspace** 完成授权，复制 `xoxb-` 开头的 **Bot User OAuth Token**。
5. 如需收件箱，再开启 **Socket Mode**（生成带 `connections:write` 的 `xapp-` 令牌），并在 **Event Subscriptions → Subscribe to bot events** 订阅 `message.channels`、`message.groups`、`message.im`、`message.mpim`、`app_mention`（同时订阅 `app_mention` 与 `message.*` 时会自动按 `(channel, ts)` 去重）。

### 第 2 步：在 DSH 中填写配置（两种方式任选）

**方式 A（推荐）：DSH 原生设置面板**

打开 **DSH → 设置 → 插件 → Slack（`dsh-slack`）**：
- 填入 `token`（`xoxb-...` / `xoxp-...`）与可选 `defaultChannel`（如 `#general` 或频道 ID），**保存后立即生效，无需重启**；
- 如启用双向收件箱，填入 `appToken`（`xapp-...`，所有令牌均自动脱敏保护，更新 `appToken` 后重载插件即可建立长连接）；
- 若网络需经企业代理访问 Slack，插件会自动识别标准环境变量 `HTTPS_PROXY` / `HTTP_PROXY`（未设置代理时不接管默认直连传输）。

**方式 B：环境变量或 `cordis.patch.yml`**

```powershell
# Windows PowerShell
$env:DSH_SLACK_TOKEN = "xoxb-你的机器人令牌"
$env:DSH_SLACK_APP_TOKEN = "xapp-你的App级令牌"
```

或在 `$DSH_HOME/profiles/<name>/cordis.patch.yml` 中配置：

```yaml
- id: slack
  config:
    token: 'xoxb-你的机器人令牌'
    appToken: 'xapp-你的App级令牌'
    defaultChannel: '#general'
```

### 第 3 步：拉机器人进频道并自检

在目标 Slack 频道发送 `/invite @你的机器人`，然后在 DSH 对话里让助手执行 `slack_health`（可传 `verify=true` 做在线 `auth.test` 核验）即可开始使用。

---

## 平时怎么对助手说（可直接复制的自然语言示例）

- **在线连接自检与频道盘点**
  > 跑一下 Slack 在线自检（验证 token 与权限），顺便列出机器人已加入的频道。
- **任务完成后向指定频道发进展卡片（发前审阅）**
  > 把今天修复的问题整理成一段清晰的项目进展，准备发到 `#dev-updates`；先把正文给我确认，不要直接发。
- **回溯频道历史与完整线程**
  > 读取 `#release` 最近 15 条消息，找到关于发版阻塞的那条并拉取整个线程回复，总结目前的结论。
- **上传日志或报告文件并表情确认**
  > 把当前目录的 `test-report.md` 上传到 `#release` 刚才的线程里，再给原消息点一个 `white_check_mark` 表情。
- **整理 Socket Mode 收件箱并起草回复**
  > 查看 Slack 收件箱里最新的 10 条消息，总结大家 `@我` 和线程里的阻塞问题，并针对第一条起草线程回复供我审核。

---

## 常见卡点自检

遇到问题先让助手执行 `slack_health`（默认离线零网络请求；需要核验真实令牌与权限时传 `verify=true` 调用 `auth.test`）：

| 现象 | 常见原因 | 一步修复 |
| :--- | :--- | :--- |
| `token 未配置` 或提示把 `xapp-` 填错了栏 | 未填 `token`，或把 `xapp-` 误填到 `token` 栏 | 在 **DSH「设置 → 插件 → Slack」** 把 `xoxb-...` 填入 `token`（即时生效），`xapp-...` 填入 `appToken` |
| `not_in_channel` | 机器人尚未加入该频道 | 在该 Slack 频道里输入 `/invite @你的机器人` |
| `channel_not_found` | 频道名拼错，或私密频道需要用频道 ID | 运行 `slack_channels`（可试 `scope="all"`）查看带频道 ID 的真实列表 |
| `invalid_auth` / `token_expired` / `token_revoked` | 令牌被撤销或过期 | 在 Slack App 重新生成/安装并更新 `token`，用 `slack_health(verify=true)` 复查 |
| `missing_scope` | 缺少对应工具所需权限（错误信息会直接列出缺失 scope 与已有权限） | 按提示补勾权限后点击 **Reinstall to Workspace**，更新 `token` |
| `slack_inbox` 一直为空 | 没填 `xapp-` 令牌、Socket 未连接，或未订阅事件 | 按空态提示核对：开启 Socket Mode + 订阅 `message.channels` / `message.groups` / `message.im` / `message.mpim` / `app_mention` + 填写 `appToken` |
| 超时或不确定是否已发出 | 网络抖动，插件绝不自动重发以防刷屏 | **先打开 Slack 频道看一眼是否已发出**，确认未送达再重试 |

---

## 配置项与工具参考

### 配置字段

| 字段 | 必填 | 说明 |
| :--- | :--- | :--- |
| `token` | 是* | Slack Bot Token（`xoxb-` / `xoxe.xoxb-`）或 User Token（`xoxp-` / `xoxe.xoxp-`）；留空时回退 `DSH_SLACK_TOKEN`，支持热生效 |
| `appToken` | 否 | App-Level Token（`xapp-`），用于 Socket Mode 接收消息；留空时回退 `DSH_SLACK_APP_TOKEN` |
| `defaultChannel` | 否 | 默认目标频道（如 `#general` 或频道 ID），发信或上传省略 `channel` 时实时回退，支持热生效 |
| `slackApiUrl` | 否 | Slack Web API 基地址（须为 `http://` 或 `https://` URL，默认 `https://slack.com/api/`，企业网格可覆盖） |

### 注册工具清单（共 9 个）

| 工具 | 作用 | 关键参数与所需权限 |
| :--- | :--- | :--- |
| `slack_notify` | 向频道或线程发送 Markdown 消息 | `text` 必填，`channel` 可选（留空实时回退 `defaultChannel`），`thread_ts` 可选（严格校验字符串）；≤12,000 字自动使用原生 Markdown block，返回规范化 `channel` ID 与 `ts`。权限：`chat:write` |
| `slack_reply` | 在原消息线程下回复 | `channel`、`text`、`thread_ts` 必填；返回规范化 `channel` ID 与回复 `ts`。权限：`chat:write` |
| `slack_channels` | 列出机器人可见频道 | `scope` 可选：`joined`（默认，调 `users.conversations` 只列已加入频道）或 `all`（调 `conversations.list` 列工作区可见频道）；自动排除已归档频道、展示公开/私密标签并在缺 `groups:read` 时自动降级查公开频道。权限：`channels:read`（可选 `groups:read`） |
| `slack_inbox` | 读取 Socket Mode 内存收件箱 | `limit`（1–50，默认 10）、`markRead`（原子消费返回消息并返回 `remaining`）；保留 `thread_ts`、`event_type`（`app_mention`）与 `files` 附件摘要，支持 `thread_broadcast` / `file_share`、自动去重与过滤机器人自身消息。需 `appToken` + 事件订阅 |
| `slack_health` | 凭据、配置与连接自检 | `verify` 可选（默认 `false` 不发网络请求；`true` 时调用 `auth.test` 返回工作区、机器人身份与已授予权限）；自动检查 `token`/`appToken` 前缀与 `slackApiUrl` 合法性 |
| `slack_history` | 读取频道历史消息 | `channel` 必填（支持 `#频道名`、`channel:ID` 与 `<#ID|name>` 自动解析），`limit`（1–100，默认 20），可选 `oldest` / `latest`（支持 Slack `ts` 或 ISO-8601 时间如 `2026-11-26T00:00:00Z`）；正文为空的 Block Kit / 告警附件消息自动提取可读文本。权限：`channels:history`（私密频道需 `groups:history`，昵称解析可选 `users:read`） |
| `slack_thread` | 读取完整线程上下文 | `channel`、`thread_ts` 必填，`limit`（1–100，默认 50）；返回父消息与所有回复。权限：同 `slack_history` |
| `slack_upload` | 上传文本或本地文件到频道/线程 | `filename` 必填，`content` 与 `file_path` 二选一，`channel` 可选（留空回退 `defaultChannel`），可选 `title`、`initial_comment`、`thread_ts`；内部自动解析频道 ID 并走官方 `filesUploadV2`。权限：`files:write` |
| `slack_react` | 为消息添加表情回应 | `channel`、`timestamp`、`name`（支持 `thumbsup` / `:white_check_mark:` 或常见 Unicode 表情如 `👍` / `✅` 自动转短码）必填。权限：`reactions:write` |

---

## 已知限制与路线图

- **收件箱为内存队列**：`slack_inbox` 默认最多缓存最近 200 条消息，进程重启后清空；需要回看重启前或更早对话时，请使用 `slack_history` 与 `slack_thread` 直接从 Slack 拉取。
- **不自动重发写操作**：为避免网络抖动造成频道刷屏，发信、回复、上传与表情回应均不自动重试；遇到超时请先确认频道状态再决定是否重试。
- **暂未内置的能力**：RTM（已被 Slack 废弃）、交互组件回调（Block Kit 按钮/弹窗表单）、Slash Command 实时响应与流式消息更新（`chat.startStream`）暂不在当前版本范围，后续按需演进。

## 安装、卸载与开发

```bash
# 安装（桌面版把 web 换为 desktop）
dsh plugin --profile web add dsh-slack

# 卸载
dsh plugin --profile web remove dsh-slack

# 本地构建与离线测试
pnpm install
pnpm test
pnpm run test:protocol
```

## License

MIT

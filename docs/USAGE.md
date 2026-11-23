# dsh-slack 使用说明

[返回简介](../README.md) · [更新记录](../CHANGELOG.md) · [验证记录](VALIDATION.md)

## 最快 3 步用起来

### 第 1 步：创建 Slack App 并获取令牌

**如果你只需要发通知 / 线程回复（单向模式，2 分钟配好）：**
1. 打开 <https://api.slack.com/apps> → **Create New App** → **From scratch**，选择工作区。
2. 打开左侧 **OAuth & Permissions**，在 **Bot Token Scopes** 下添加：
   - `chat:write`（发送消息与线程回复必需）
   - `channels:read`（列出可见公开频道必需；私密频道可加 `groups:read`）
3. 点击顶部 **Install to Workspace** 完成授权，复制 `xoxb-` 开头的 **Bot User OAuth Token**。

**如果你还需要让助手读取群消息与私信（开启双向 Socket Mode 收件箱，可选）：**
1. 在同一个 App 左侧打开 **Socket Mode** → 开启 **Enable Socket Mode**，生成带 `connections:write` 权限的 **App-Level Token**（`xapp-` 开头）。
2. 打开 **Event Subscriptions** → 开启开关，在 **Subscribe to bot events** 添加 `message.channels`（频道消息）与 `message.im`（私信）。

### 第 2 步：在 DSH 中填写配置（两种方式任选）

**方式 A（推荐）：DSH 原生设置面板**

打开 **DSH → 设置 → 插件 → Slack（`dsh-slack`）**：
- 填入 `token`（`xoxb-...`）与可选 `defaultChannel`（如 `#general`），**保存后立即生效，无需重启**；
- 如启用双向收件箱，填入 `appToken`（`xapp-...`，所有令牌均自动脱敏保护，更新 `appToken` 后重载插件即可建立长连接）。

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

在目标 Slack 频道发送 `/invite @你的机器人`，然后在 DSH 对话里让助手检查连接状态即可开始使用。

---

## 平时怎么对助手说（可直接复制的自然语言示例）

- **连接自检与频道盘点**
  > 跑一下 Slack 自检，顺便列出机器人现在能看到哪些频道。
- **任务完成后向指定频道发进展卡片（发前审阅）**
  > 把今天修复的问题整理成一段清晰的项目进展，准备发到 `#dev-updates`；先把正文给我确认，不要直接发。
- **在同一条通知下持续追加线程进度**
  > 先在 `#release` 发一条「开始部署 v1.4」的主消息，等会儿跑完验证后直接在同一条消息的线程里回复部署结果。
- **整理 Socket Mode 收件箱并起草回复**
  > 查看 Slack 收件箱里最新的 10 条消息，总结大家提到的阻塞问题，并帮我针对第一条起草线程回复供我审核。

---

## 常见卡点自检

遇到问题先让助手执行 `slack_health`（同时汇报凭据配置与真实 Socket Mode 连接状态，不发起多余网络请求）：

| 现象 | 常见原因 | 一步修复 |
| :--- | :--- | :--- |
| `token 未配置` | 尚未配置 `token` 且无 `DSH_SLACK_TOKEN` | 打开 **DSH「设置 → 插件 → Slack」**填入 `xoxb-...` 并保存（立即生效） |
| `not_in_channel` | 机器人尚未加入该频道 | 在该 Slack 频道里输入 `/invite @你的机器人` |
| `channel_not_found` | 频道名拼错，或私密频道需要用频道 ID | 让助手运行 `slack_channels` 查看带频道 ID 的真实列表 |
| `invalid_auth` / `missing_scope` | 令牌被撤销，或漏勾 `chat:write` / `channels:read` | 在 Slack App 补齐权限后点 **Reinstall to Workspace**，换上新令牌 |
| `slack_inbox` 一直为空 | 没填 `xapp-` 令牌、Socket 未连接，或未订阅事件 | 按空态提示核对：开启 Socket Mode + 订阅 `message.channels` / `message.im` + 填写 `appToken` |
| 超时或不确定是否已发出 | 网络抖动，插件绝不自动重发以防刷屏 | **先打开 Slack 频道看一眼是否已发出**，确认未送达再重试 |

---

## 配置项与工具参考

### 配置字段

| 字段 | 必填 | 说明 |
| :--- | :--- | :--- |
| `token` | 是* | Slack Bot Token（`xoxb-`）或 User Token（`xoxp-`）；留空时回退 `DSH_SLACK_TOKEN`，支持热生效 |
| `appToken` | 否 | App-Level Token（`xapp-`），用于 Socket Mode 接收消息；留空时回退 `DSH_SLACK_APP_TOKEN` |
| `defaultChannel` | 否 | 默认目标频道（如 `#general` 或频道 ID），支持热生效 |
| `slackApiUrl` | 否 | Slack Web API 基地址（默认 `https://slack.com/api/`，企业网格可覆盖） |

### 注册工具清单

| 工具 | 作用 | 关键参数与说明 |
| :--- | :--- | :--- |
| `slack_notify` | 向频道或线程发送 Markdown 消息 | `text` 必填，`channel` 可选（省略或留空时回退当前 `defaultChannel`），`thread_ts` 可选；返回 `ts` 供线程跟进 |
| `slack_channels` | 列出机器人可见频道 | 自动翻页拉全，同时展示 `#频道名（频道ID）` |
| `slack_inbox` | 读取 Socket Mode 内存收件箱 | `limit`（1–50，默认 10）、`markRead`（原子消费已返回消息并返回 `remaining`）；最多缓存 200 条 |
| `slack_reply` | 在原消息线程下回复 | `channel`、`text`、`thread_ts` 必填 |
| `slack_health` | 连接与凭据自检 | 区分「凭据已填」与「Socket 真正连上」；鉴权失败自动停止盲目重连 |

## 安装、卸载与开发

```bash
# 安装（桌面版把 web 换为 desktop）
dsh plugin --profile web add dsh-slack

# 卸载
dsh plugin --profile web remove dsh-slack

# 本地构建与离线测试
pnpm install
pnpm test
```

## License

MIT

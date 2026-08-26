[English](README.en.md)

# dsh-slack

> **让 agent 进你的 Slack**：发消息、看频道、收消息、回线程，双向通信。

![npm version](https://img.shields.io/npm/v/dsh-slack?label=npm&color=blue) ![npm downloads](https://img.shields.io/npm/dm/dsh-slack) ![license](https://img.shields.io/npm/l/dsh-slack) ![stars](https://img.shields.io/github/stars/STARDUSTLC666/dsh-slack?style=social)

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)


DSH（DeepSeek Harness）社区插件：让 agent 与 Slack 双向通信。

> **v0.2 范围（双向）**：v0.1 只做「agent → Slack」单向通知；v0.2 新增 Socket Mode，
> 支持「Slack 消息 → agent」：`slack_inbox` 收取消息、`slack_reply` 线程回复。
> RTM、交互组件（按钮/弹窗/slash command 回复）不在 v0.2，见下方
> [已知限制与路线图](#已知限制与路线图)。

## 功能

- `slack_notify`：向指定频道（或线程）发送一条 Markdown 文本消息，返回消息 `ts`。
- `slack_channels`：列出机器人当前可见的频道（`conversations.list`，自动沿 `next_cursor` 翻页拉全）。
- `slack_inbox`：读取通过 Socket Mode 收到的消息（内存队列，最多保留 200 条；自动去重，`markRead=true` 原子消费）。
- `slack_reply`：以线程回复形式回复某条收件箱消息（`chat.postMessage` 带 `thread_ts`）。
- WebClient 按 `token + slackApiUrl` 缓存复用，配置变更时自动重建。
- 配置走 `cordis.patch.yml`，令牌支持环境变量回退（`DSH_SLACK_TOKEN` / `DSH_SLACK_APP_TOKEN`）。

### v0.2.3 优化

- `slack_channels` 自动分页：频道很多时不再只返回第一页。
- `slack_inbox` 去重 + `drain` 原子消费：Slack 重投的事件不会重复入队，`markRead` 期间新到的消息也不会被误清。
- WebClient 复用：同一 `token + slackApiUrl` 只创建一个客户端，减少重复初始化。
- 分页增加页数上限，防止异常 `next_cursor` 导致死循环。
- 错误映射补充 `not_authed` / `is_archived` / `msg_too_long` / `ratelimited`。


## 兼容性

在 `@deepseek-ai/dsh@0.1.1-rc.2` 上验证（2026-08-26）。遵循 cordis 组合包补丁模型（`cordis.patch.yml` + `dsh.bundle.patch`），运行时不 import 任何 `@deepseek-ai/*` 内部模块。

## 安装

插件运行在宿主进程内，通过 `dsh plugin` 安装进 profile，重启后生效：

```sh
dsh plugin --profile web add dsh-slack
```

安装后重启你的 dsh Web 服务，`slack_notify` / `slack_channels` / `slack_inbox` / `slack_reply`
四个工具即对模型可见。

## 配置

配置在 profile 的 `cordis.patch.yml` 里按 `id: slack` 覆盖本插件的行（覆盖会整体替换该行的
`config`，不会合并）。可用配置项：

| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `token` | string | 是* | Slack 令牌：机器人令牌（`xoxb-`）或用户令牌（`xoxp-`）。留空时回退到环境变量 `DSH_SLACK_TOKEN`。 |
| `appToken` | string | 否* | App-Level Token（`xapp-` 开头），开启 Socket Mode 后用于接收消息。留空时回退到环境变量 `DSH_SLACK_APP_TOKEN`。 |
| `defaultChannel` | string | 否 | 默认频道（如 `#general`）。模型未特别指定频道时的默认目标，写进 `channel` 参数说明里。 |

`*` `token` 在「配置层」可留空，此时回退环境变量；两者都为空时插件照常加载，但调用发消息/列频道/
回复工具时会返回中文报错。`appToken` 留空则只告警、不崩溃，`slack_inbox` 返回空队列（单向模式）。

**方式一：环境变量（推荐，不写死令牌）**

```sh
# 在启动 dsh 的进程里设置
export DSH_SLACK_TOKEN=xoxb-你的机器人令牌
export DSH_SLACK_APP_TOKEN=xapp-你的App级令牌
```

**方式二：profile 的 cordis.patch.yml 直接覆盖**

在你的 profile 目录（`$DSH_HOME/profiles/web/cordis.patch.yml`）追加：

```yaml
# 覆盖 dsh-slack 的 slack 行配置（整体替换）
- id: slack
  config:
    token: 'xoxb-你的机器人令牌'
    appToken: 'xapp-你的App级令牌'
    defaultChannel: '#general'
```

> 优先级：`config.token` > 环境变量 `DSH_SLACK_TOKEN`；`config.appToken` > 环境变量
> `DSH_SLACK_APP_TOKEN`。

### 创建 Slack App 并拿令牌

1. 打开 <https://api.slack.com/apps>，点 **Create New App**（选 `From scratch`，给 App 起名、选工作区）。
2. 进入 **OAuth & Permissions** 页，在 **Scopes → Bot Token Scopes** 下勾选：
   - `chat:write`（发消息必需）
   - `channels:read`（列频道必需）
3. 回到顶部点 **Install to Workspace**（授权）。
4. 拿到 **Bot User OAuth Token**（以 `xoxb-` 开头）。
5. 把机器人（App）加进它要发消息的频道：在频道里 `/invite @你的机器人`（私有频道必需）。

### 开启 Socket Mode（双向收消息）

要接收 Slack 消息（`slack_inbox` / `slack_reply`），需要开启 Socket Mode 并生成 App-Level Token：

1. 打开 <https://api.slack.com/apps>，进入你的 App。
2. 左侧 **Socket Mode** 页 → 打开开关（**Enable Socket Mode**）。
3. 点 **Generate Token and Scopes** 生成 App-Level Token：给 Token 起名，勾选 `connections:write` scope。
   生成后拿到以 `xapp-` 开头的 App-Level Token（只显示一次，请立即保存）。
4. 进入 **Event Subscriptions** 页，开启事件订阅，在 **Subscribe to bot events → Add Bot User Event** 添加：
   - `message.channels`（公开频道消息）
   - `message.im`（机器人私信）
5. 把 App-Level Token 配进 `appToken`（或环境变量 `DSH_SLACK_APP_TOKEN`）。
6. 重启 dsh Web 服务，插件自动通过 Socket Mode 建立连接并开始收消息。

> 未配置 `appToken` 时插件**不会崩溃**：只打印告警，`slack_inbox` 返回空队列（中文提示）。
> Socket Mode 网络错误由 SDK 自动重连，插件只记录告警、不抛崩。


## 卸载

```bash
dsh plugin --profile web remove dsh-slack
```

卸载后重启 Web 服务。如需彻底清理，可再手动删除自己 profile `cordis.patch.yml` 中的对应插件行。

## 工具清单

### `slack_notify`

向指定频道/线程发送 Markdown 文本（底层 `chat.postMessage`）。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `channel` | string | 是 | 频道名（如 `#general`）或频道 ID。 |
| `text` | string | 是 | 要发送的 Markdown 文本。 |
| `thread_ts` | string | 否 | 回复某条消息所在线程的 `ts`。 |

返回：`{ "ts": "...", "channel": "#general" }`（`ts` 供后续 `thread_ts` 引用）。

### `slack_channels`

列出机器人可见频道（底层 `conversations.list`）。

无参数。返回：`{ "channels": [{ "id": "...", "name": "..." }, ...] }`。

### `slack_inbox`

读取通过 Socket Mode 收到的消息（内存队列，最多保留 200 条，新的在前）。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `limit` | integer | 否 | 最多返回的消息数（默认 10，范围 1-50）。 |
| `markRead` | boolean | 否 | 为 `true` 时，返回后清空收件箱队列（标记已读）。 |

返回：`{ "messages": [{ "ts": "...", "channel": "...", "user": "...", "text": "..." }, ...] }`。

### `slack_reply`

以线程回复形式回复某条收件箱消息（底层 `chat.postMessage` 带 `thread_ts`）。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `channel` | string | 是 | 频道名（如 `#general`）或频道 ID。 |
| `text` | string | 是 | 回复内容（Markdown 文本）。 |
| `thread_ts` | string | 是 | 要回复消息的 `ts`（来自 `slack_inbox` 返回的 `ts`）。 |

返回：`{ "ts": "...", "channel": "#general" }`。

## 错误处理

所有错误信息均为中文，模型与用户都能直接读懂：

- 未配置令牌：`token 未配置：缺少 Slack 机器人令牌（xoxb-）…请在 profile 的 cordis.patch.yml 覆盖 slack 行的 config.token 并重启，或设置环境变量 DSH_SLACK_TOKEN。`
- 未配置 App-Level Token：只告警，`slack_inbox` 返回空队列（含中文提示），不影响其它工具。
- `invalid_auth`：提示检查/重新生成 token。
- `channel_not_found`：提示频道名或频道 ID 错误。
- `not_in_channel`：提示先把机器人 App 邀请进频道。
- `token_revoked` / `account_inactive` / `missing_scope` / `not_authed`：提示权限或令牌失效，需重新安装 App。
- `is_archived`：提示频道已归档，不能发消息。
- `msg_too_long`：提示 Slack 单条消息超过 40,000 字符。
- `ratelimited`：提示请求太频繁，稍后重试。

## 开发与测试

```sh
pnpm install   # 安装依赖并触发 prepare（tsc 构建）
pnpm build     # tsc 编译 src → lib
pnpm test      # 先 build，再用 node:test 跑 test/*.test.mjs
```

测试无需真实 token：参数编译、配置解析（含 env 回退）、工具注册（4 个工具 + 缺配置中文报错）、
注入 fake client 断言 `postMessage` 参数（含 `thread_ts`）、输出 schema 纯 JSON 校验、
收件箱队列容量/清空/去重/原子 drain、Socket Mode 事件解析（fake event 对象）、appToken 缺失不崩。

## 已知限制与路线图

- **v0.1 是单向通知（agent→Slack）**；**v0.2 通过 Socket Mode 实现双向**（`slack_inbox` / `slack_reply`）。
- **不支持** RTM、交互组件（按钮/弹窗/slash command 回复）。
- `slack_inbox` 为进程内存队列：重启即清空，且不持久化；最多保留 200 条，满则丢最旧。
- `channel` 为必填参数，`defaultChannel` 目前只作为说明提示写入 `channel` 参数描述，不替代
  必填的 `channel`。
- 令牌缺失时插件仍会加载（懒加载），错误在工具被调用时才抛出；appToken 缺失则仅告警。

路线图：v0.3 计划引入交互组件（按钮/弹窗）与持久化收件箱。

## 依赖

- 运行时：`@slack/web-api`（官方 WebClient）、`@slack/socket-mode`（Socket Mode 客户端）
- peer（由宿主提供，插件运行时不直接 import）：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`

## License

MIT
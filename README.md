# dsh-slack

DSH（DeepSeek Harness）社区插件：让 agent 向 Slack 发通知/桥接消息。

> **v0.1 范围（单向）**：本版本只做「agent → Slack」的单向通知（发消息、列频道）。
> 双向对话（Slack 消息实时流入 agent）、Socket Mode、RTM、交互组件都不在 v0.1，见下方
> [已知限制与路线图](#已知限制与路线图)。

## 功能

- `slack_notify`：向指定频道（或线程）发送一条 Markdown 文本消息，返回消息 `ts` 供后续引用。
- `slack_channels`：列出机器人当前可见的频道（`conversations.list`）。
- 配置走 `cordis.patch.yml`，令牌支持环境变量回退 `DSH_SLACK_TOKEN`。

## 安装

插件运行在宿主进程内，通过 `dsh plugin` 安装进 profile，重启后生效：

```sh
dsh plugin --profile web add dsh-slack
```

安装后重启你的 dsh Web 服务，`slack_notify` / `slack_channels` 两个工具即对模型可见。

## 配置

配置在 profile 的 `cordis.patch.yml` 里按 `id: slack` 覆盖本插件的行（覆盖会整体替换该行的
`config`，不会合并）。可用配置项：

| 键 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `token` | string | 是* | Slack 令牌：机器人令牌（`xoxb-`）或用户令牌（`xoxp-`）。留空时回退到环境变量 `DSH_SLACK_TOKEN`。 |
| `defaultChannel` | string | 否 | 默认频道（如 `#general`）。模型未特别指定频道时的默认目标，写进 `channel` 参数说明里。 |

`*` `token` 在「配置层」可留空，此时回退环境变量；两者都为空时插件照常加载，但调用工具时会
返回中文报错（懒加载，见[错误处理](#错误处理)）。

**方式一：环境变量（推荐，不写死令牌）**

```sh
# 在启动 dsh 的进程里设置
export DSH_SLACK_TOKEN=xoxb-你的机器人令牌
```

**方式二：profile 的 cordis.patch.yml 直接覆盖**

在你的 profile 目录（`$DSH_HOME/profiles/web/cordis.patch.yml`）追加：

```yaml
# 覆盖 dsh-slack 的 slack 行配置（整体替换）
- id: slack
  config:
    token: 'xoxb-你的机器人令牌'
    defaultChannel: '#general'
```

> 优先级：`config.token` > 环境变量 `DSH_SLACK_TOKEN`。

### 创建 Slack App 并拿令牌

1. 打开 <https://api.slack.com/apps>，点 **Create New App**（选 `From scratch`，给 App 起名、选工作区）。
2. 进入 **OAuth & Permissions** 页，在 **Scopes → Bot Token Scopes** 下勾选：
   - `chat:write`（发消息必需）
   - `channels:read`（列频道必需）
3. 回到顶部点 **Install to Workspace**（授权）。
4. 拿到 **Bot User OAuth Token**（以 `xoxb-` 开头）。
5. 把机器人（App）加进它要发消息的频道：在频道里 `/invite @你的机器人`（私有频道必需）。

## 工具清单

### `slack_notify`

向指定频道/线程发送 Markdown 文本（底层 `chat.postMessage`）。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `channel` | string | 是 | 频道名（如 `#general`）或频道 ID。 |
| `text` | string | 是 | 要发送的 Markdown 文本。 |
| `thread_ts` | string | 否 | 回复某条消息所在线程的 `ts`（即 `slack_notify` 返回的 `ts`）。 |

返回：`{ "ts": "...", "channel": "#general" }`（`ts` 供后续 `thread_ts` 引用）。

### `slack_channels`

列出机器人可见频道（底层 `conversations.list`）。

无参数。返回：`{ "channels": [{ "id": "...", "name": "..." }, ...] }`。

## 错误处理

所有错误信息均为中文，模型与用户都能直接读懂：

- 未配置令牌：`token 未配置：缺少 Slack 机器人令牌（xoxb-）…请在 profile 的 cordis.patch.yml 覆盖 slack 行的 config.token 并重启，或设置环境变量 DSH_SLACK_TOKEN。`
- `invalid_auth`：提示检查/重新生成 token。
- `channel_not_found`：提示频道名或频道 ID 错误。
- `not_in_channel`：提示先把机器人 App 邀请进频道。
- `token_revoked` / `account_inactive` / `missing_scope`：提示权限或令牌失效，需重新安装 App。

## 开发与测试

```sh
pnpm install   # 安装依赖并触发 prepare（tsc 构建）
pnpm build     # tsc 编译 src → lib
pnpm test      # 先 build，再用 node:test 跑 test/*.test.mjs
```

测试无需真实 token：参数编译、配置解析（含 env 回退）、工具注册（2 个工具 + 缺配置中文报错）、
注入 fake client 断言 `postMessage` 参数、输出 schema 纯 JSON 校验。

## 已知限制与路线图

- **v0.1 是单向通知（agent→Slack）**：不能从 Slack 收消息反向驱动 agent。
- **不支持** Socket Mode 实时接收、RTM、交互组件（按钮/弹窗/slash command 回复）。
- `channel` 为必填参数，`defaultChannel` 目前只作为说明提示写入 `channel` 参数描述，不替代
  必填的 `channel`。
- 令牌缺失时插件仍会加载（懒加载），错误在工具被调用时才抛出。

路线图：v0.2 计划引入 Socket Mode（`@slack/socket-mode`）实现「Slack 消息 → agent」双向桥接与
交互组件。

## 依赖

- 运行时：`@slack/web-api`（官方 WebClient）
- peer（由宿主提供，插件运行时不直接 import）：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`

## License

MIT

## 相关插件

- [dsh-calendar](https://github.com/STARDUSTLC666/dsh-calendar) — CalDAV 日历五件套
- [dsh-slack](https://github.com/STARDUSTLC666/dsh-slack) — Slack 通知/收件箱
- [dsh-email](https://github.com/STARDUSTLC666/dsh-email) — 邮件六件套 + Web 设置页

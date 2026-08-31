[中文](README.md)

# dsh-slack

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

DSH (DeepSeek Harness) community plugin: lets the agent communicate with Slack bidirectionally.

> **v0.2 scope (two-way)**: v0.1 only did one-way "agent → Slack" notifications; v0.2 adds Socket Mode,
> enabling "Slack message → agent": `slack_inbox` receives messages, `slack_reply` replies in threads.
> RTM and interactive components (buttons/modals/slash command replies) are out of scope for v0.2 — see
> [Known limitations and roadmap](#known-limitations-and-roadmap) below.

## Features

- `slack_notify`: send a Markdown text message to a channel (or thread), returning the message `ts`.
- `slack_channels`: list the channels currently visible to the bot (`conversations.list`, paginating through `next_cursor` until complete).
- `slack_inbox`: read messages received via Socket Mode (in-memory queue, keeps up to 200; deduplicates retries and consumes atomically with `markRead=true`).
- `slack_reply`: reply to an inbox message as a thread (`chat.postMessage` with `thread_ts`).
- WebClient instances are cached by `token + slackApiUrl` and rebuilt automatically when configuration changes.
- Configuration via `cordis.patch.yml`; tokens support environment-variable fallback (`DSH_SLACK_TOKEN` / `DSH_SLACK_APP_TOKEN`).

### v0.2.3 improvements

- `slack_channels` paginates automatically so large workspaces no longer lose channels after the first page.
- `slack_inbox` deduplicates Slack's at-least-once event deliveries and drains atomically on `markRead`.
- WebClient reuse avoids rebuilding clients on every tool call.
- Pagination has a page cap to prevent loops from a misbehaving `next_cursor`.
- Error mapping adds `not_authed` / `is_archived` / `msg_too_long` / `ratelimited`.


## Compatibility

Verified against `@deepseek-ai/dsh@0.1.2-alpha.2` on 2026-08-31. Built for the cordis patch-bundle plugin model (`cordis.patch.yml` + `dsh.bundle.patch`). No runtime imports of `@deepseek-ai/*` internals.

## Installation

The plugin runs inside the host process, is installed into the profile via `dsh plugin`, and takes effect after a restart:

```sh
dsh plugin --profile web add dsh-slack
```

After installing, restart your dsh Web service; the four tools `slack_notify` / `slack_channels` / `slack_inbox` / `slack_reply` become visible to the model.

## Uninstall

```bash
dsh plugin --profile web remove dsh-slack
```

Then restart the web service. To clean up fully, also remove the plugin entry from your profile `cordis.patch.yml` if you overrode it.


## Configuration

Configuration lives in the profile's `cordis.patch.yml`; override this plugin's line by `id: slack` (overriding replaces that line's `config` wholesale — it does not merge). Available options:

| Key | Type | Required | Description |
| --- | --- | --- | --- |
| `token` | string | yes* | Slack token: bot token (`xoxb-`) or user token (`xoxp-`). When empty, falls back to the `DSH_SLACK_TOKEN` env var. |
| `appToken` | string | no* | App-Level Token (starts with `xapp-`); used to receive messages after enabling Socket Mode. When empty, falls back to the `DSH_SLACK_APP_TOKEN` env var. |
| `defaultChannel` | string | no | Default channel (e.g. `#general`). The default target when the model doesn't specify a channel; written into the `channel` parameter description. |

`*` `token` may be left empty at the "config layer", in which case it falls back to the env var; when both are empty the plugin still loads, but calling the send/list/reply tools returns a Chinese error. An empty `appToken` only warns — no crash — and `slack_inbox` returns an empty queue (one-way mode).

**Method 1: environment variables (recommended, no hard-coded tokens)**

```sh
# 在启动 dsh 的进程里设置
export DSH_SLACK_TOKEN=xoxb-你的机器人令牌
export DSH_SLACK_APP_TOKEN=xapp-你的App级令牌
```

**Method 2: override in the profile's cordis.patch.yml**

In your profile directory (`$DSH_HOME/profiles/web/cordis.patch.yml`) append:

```yaml
# 覆盖 dsh-slack 的 slack 行配置（整体替换）
- id: slack
  config:
    token: 'xoxb-你的机器人令牌'
    appToken: 'xapp-你的App级令牌'
    defaultChannel: '#general'
```

> Priority: `config.token` > env var `DSH_SLACK_TOKEN`; `config.appToken` > env var
> `DSH_SLACK_APP_TOKEN`.

### Create a Slack App and get a token

1. Open <https://api.slack.com/apps>, click **Create New App** (choose `From scratch`, name the app, select the workspace).
2. On the **OAuth & Permissions** page, under **Scopes → Bot Token Scopes** check:
   - `chat:write` (required to send messages)
   - `channels:read` (required to list channels)
3. Back at the top, click **Install to Workspace** (authorize).
4. Grab the **Bot User OAuth Token** (starts with `xoxb-`).
5. Add the bot (App) to the channels it should post in: `/invite @your-bot` in the channel (required for private channels).

### Enable Socket Mode (two-way message receiving)

To receive Slack messages (`slack_inbox` / `slack_reply`), enable Socket Mode and generate an App-Level Token:

1. Open <https://api.slack.com/apps> and open your App.
2. Open the **Socket Mode** page → turn on the toggle (**Enable Socket Mode**).
3. Click **Generate Token and Scopes** to create an App-Level Token: name the token, check the `connections:write` scope.
   Copy the `xapp-` App-Level Token (shown only once — save it immediately).
4. Open the **Event Subscriptions** page, enable events, and under **Subscribe to bot events → Add Bot User Event** add:
   - `message.channels` (public channel messages)
   - `message.im` (bot DMs)
5. Put the App-Level Token into `appToken` (or the `DSH_SLACK_APP_TOKEN` env var).
6. Restart the dsh Web service; the plugin connects automatically via Socket Mode and starts receiving messages.

> Without `appToken` the plugin **won't crash**: it only prints a warning and `slack_inbox` returns an empty queue (with a Chinese hint).
> Socket Mode network errors are auto-reconnected by the SDK; the plugin only logs a warning and never throws.

## Tool reference

### `slack_notify`

Send Markdown text to a channel/thread (underlying `chat.postMessage`).

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `channel` | string | yes | Channel name (e.g. `#general`) or channel ID. |
| `text` | string | yes | The Markdown text to send. |
| `thread_ts` | string | no | The `ts` of the thread to reply to. |

Returns: `{ "ts": "...", "channel": "#general" }` (`ts` for later `thread_ts` reference).

### `slack_channels`

List channels visible to the bot (underlying `conversations.list`).

No parameters. Returns: `{ "channels": [{ "id": "...", "name": "..." }, ...] }`.

### `slack_inbox`

Read messages received via Socket Mode (in-memory queue, keeps up to 200, newest first).

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | integer | no | Maximum number of messages to return (default 10, range 1-50). |
| `markRead` | boolean | no | When `true`, clears the inbox queue after returning (mark as read). |

Returns: `{ "messages": [{ "ts": "...", "channel": "...", "user": "...", "text": "..." }, ...] }`.

### `slack_reply`

Reply to an inbox message as a thread (underlying `chat.postMessage` with `thread_ts`).

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `channel` | string | yes | Channel name (e.g. `#general`) or channel ID. |
| `text` | string | yes | Reply content (Markdown text). |
| `thread_ts` | string | yes | The `ts` of the message to reply to (from `slack_inbox`). |

Returns: `{ "ts": "...", "channel": "#general" }`.

## Error handling

All error messages are in Chinese, readable by both the model and the user:

- Unconfigured token: `token 未配置：缺少 Slack 机器人令牌（xoxb-）…请在 profile 的 cordis.patch.yml 覆盖 slack 行的 config.token 并重启，或设置环境变量 DSH_SLACK_TOKEN。`
- Unconfigured App-Level Token: only a warning; `slack_inbox` returns an empty queue (with a Chinese hint) and other tools are unaffected.
- `invalid_auth`: hints to check/regenerate the token.
- `channel_not_found`: hints the channel name or ID is wrong.
- `not_in_channel`: hints to invite the bot App into the channel first.
- `token_revoked` / `account_inactive` / `missing_scope` / `not_authed`: hints permission or token expiry, reinstall the App.
- `is_archived`: hints the channel is archived and cannot receive messages.
- `msg_too_long`: hints the message exceeds Slack's 40,000-character limit.
- `ratelimited`: hints to retry after a short wait.

## Development and testing

```sh
pnpm install   # 安装依赖并触发 prepare（tsc 构建）
pnpm build     # tsc 编译 src → lib
pnpm test      # 先 build，再用 node:test 跑 test/*.test.mjs
```

Tests need no real token: parameter compilation, config parsing (incl. env fallback), tool registration (4 tools + Chinese error on missing config),
injecting a fake client to assert `postMessage` arguments (incl. `thread_ts`), output schema pure-JSON validation,
inbox queue capacity/clear/deduplication/atomic drain, Socket Mode event parsing (fake event objects), and no-crash on missing appToken.

## Known limitations and roadmap

- **v0.1 is one-way notification (agent→Slack)**; **v0.2 is two-way via Socket Mode** (`slack_inbox` / `slack_reply`).
- **No** RTM or interactive components (buttons/modals/slash command replies).
- `slack_inbox` is an in-process memory queue: cleared on restart, not persisted; keeps up to 200, dropping the oldest when full.
- `channel` is a required parameter; `defaultChannel` is currently only written into the `channel` parameter description as a hint — it does not replace the required `channel`.
- With a missing token the plugin still loads (lazy loading); the error is only thrown when the tool is called; a missing appToken only warns.

Roadmap: v0.3 plans to introduce interactive components (buttons/modals) and a persisted inbox.

## Dependencies

- Runtime: `@slack/web-api` (official WebClient), `@slack/socket-mode` (Socket Mode client)
- peer (provided by the host; not imported directly by the plugin at runtime): `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`

## License

MIT
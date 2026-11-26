# dsh-slack Usage Guide

[Overview](../README.en.md) · [Changelog](../CHANGELOG.md) · [Validation](VALIDATION.md)

## Get Started in 3 Steps

### Step 1: Create Your Slack App & Copy Tokens

**Core outbound & channel scopes (2-minute setup):**
1. Visit <https://api.slack.com/apps> → **Create New App** → **From scratch**, and choose your workspace.
2. Under **OAuth & Permissions → Bot Token Scopes**, add the scopes you need:
   - **Core (required)**:
     - `chat:write` (send channel messages & thread replies)
     - `channels:read` (list public channels & resolve `#channel` names)
   - **Optional (for extended tools & private channels)**:
     - `groups:read` (list private channels; if omitted, `slack_channels` automatically falls back to public channels)
     - `channels:history` / `groups:history` / `im:history` / `mpim:history` (read channel history via `slack_history` and threads via `slack_thread`)
     - `files:write` (upload text or local files via `slack_upload`)
     - `reactions:write` (add emoji reactions via `slack_react`)
     - `users:read` (optional display-name resolution for history/thread senders; silently falls back to user IDs if absent)
3. Click **Install to Workspace** and copy your **`xoxb-`** (or rotating `xoxe.xoxb-`) **Bot User OAuth Token**.

**Optional — for two-way incoming messages (`slack_inbox` via Socket Mode):**
1. Open **Socket Mode** → turn on **Enable Socket Mode**, and generate an **`xapp-` App-Level Token** with `connections:write`.
2. Open **Event Subscriptions** → enable events, and subscribe under **Subscribe to bot events** to:
   - `message.channels` (public channel messages)
   - `message.groups` (private channel messages)
   - `message.im` (direct messages)
   - `message.mpim` (group DMs)
   - `app_mention` (`@bot` mentions; deduplicated by `(channel, ts)` when combined with `message.*`)

### Step 2: Configure in DSH (Choose Either Option)

**Option A (Recommended): Native DSH Settings Form**

Open **DSH → Settings → Plugins → Slack (`dsh-slack`)**:
- Enter `token` (`xoxb-...` / `xoxp-...`) and optional `defaultChannel` (e.g. `#general` or a channel ID) — **both take effect immediately on save without restarting**;
- For Socket Mode inbox, enter `appToken` (`xapp-...`; all tokens are secret-masked, and reloading connects Socket Mode cleanly);
- Corporate proxy environments are supported automatically when standard `HTTPS_PROXY` / `HTTP_PROXY` environment variables are set (left untouched for direct connections).

**Option B: Environment Variables or `cordis.patch.yml`**

```powershell
# Windows PowerShell
$env:DSH_SLACK_TOKEN = "xoxb-your-bot-token"
$env:DSH_SLACK_APP_TOKEN = "xapp-your-app-level-token"
```

Or in `$DSH_HOME/profiles/<name>/cordis.patch.yml`:

```yaml
- id: slack
  config:
    token: 'xoxb-your-bot-token'
    appToken: 'xapp-your-app-level-token'
    defaultChannel: '#general'
```

### Step 3: Invite the Bot & Run a Quick Check

Send `/invite @your-bot` inside the target Slack channel, then ask the assistant in DSH to run `slack_health` (optionally with `verify=true` for live `auth.test` verification).

---

## Copy-Ready Prompts for Everyday Work

- **Verify connection online & discover joined channels**
  > Run an online Slack health check to confirm my token and granted scopes, and list the channels the bot has joined.
- **Review an update before posting to a team channel**
  > Draft a crisp summary of today's fixes for `#dev-updates`. Show me the message first and wait for my confirmation before sending.
- **Inspect channel history & full thread context**
  > Fetch the last 15 messages in `#release`, open the thread about the deployment blocker, and summarize the current status.
- **Upload a report & react with an emoji**
  > Upload `test-report.md` to that `#release` thread and react to the root message with `white_check_mark`.
- **Summarize incoming Socket Mode messages & prepare replies**
  > Check the latest 10 messages in the Slack inbox (including `@mentions` and thread messages), highlight blockers, and draft a thread reply for my review without sending yet.

---

## Quick Troubleshooting Checklist

Run `slack_health` first (offline by default; pass `verify=true` to verify the live token and granted scopes via `auth.test`):

| Symptom | Usual Cause | Quick Fix |
| :--- | :--- | :--- |
| `token 未配置` or invalid prefix | Missing `token`, or `xapp-` pasted into `token` | Put `xoxb-...` in `token` (applies live) and `xapp-...` in `appToken` under **DSH Settings → Plugins → Slack** |
| `not_in_channel` | Bot has not joined the channel | Type `/invite @your-bot` in that Slack channel |
| `channel_not_found` | Typo in name, or private channel requires ID | Run `slack_channels` (or `scope="all"`) to copy the exact channel ID |
| `invalid_auth` / `token_expired` / `token_revoked` | Token revoked or expired | Regenerate/reinstall in Slack App settings, update `token`, and run `slack_health(verify=true)` |
| `missing_scope` | Missing required OAuth scope (error displays exact missing & granted scopes) | Add the reported scope(s), click **Reinstall to Workspace**, and update `token` |
| `slack_inbox` stays empty | Missing `xapp-` token, disconnected socket, or missing event subscriptions | Enable Socket Mode + subscribe to `message.channels` / `message.groups` / `message.im` / `message.mpim` / `app_mention` + set `appToken` |
| Timeout / uncertain send | Network hiccup (writes never auto-retry) | **Check the Slack channel first** before retrying to avoid duplicate messages |

---

## Configuration & Tool Reference

### Configuration Fields

| Field | Required | Description |
| :--- | :--- | :--- |
| `token` | yes* | Slack Bot (`xoxb-` / `xoxe.xoxb-`) or User (`xoxp-` / `xoxe.xoxp-`) token; falls back to `DSH_SLACK_TOKEN` (live-updated) |
| `appToken` | no | App-Level Token (`xapp-`) for Socket Mode inbox; falls back to `DSH_SLACK_APP_TOKEN` |
| `defaultChannel` | no | Default target channel (`#general` or channel ID); live fallback when `channel` is omitted |
| `slackApiUrl` | no | Custom Slack Web API base URL (valid `http://` or `https://` URL; defaults to `https://slack.com/api/`) |

### Registered Tools (9 total)

| Tool | Purpose | Key Details & Scopes |
| :--- | :--- | :--- |
| `slack_notify` | Send Markdown message to channel or thread | `text` required; `channel` optional (live fallback to `defaultChannel`); optional `thread_ts` (strictly validated string); uses Slack Markdown block up to 12,000 chars and returns canonical `channel` ID + `ts`. Scope: `chat:write` |
| `slack_reply` | Reply inside an existing message thread | `channel`, `text`, `thread_ts` required; returns canonical `channel` ID + reply `ts`. Scope: `chat:write` |
| `slack_channels` | List channels visible to the bot | Optional `scope`: `joined` (default, `users.conversations`) or `all` (`conversations.list`); excludes archived channels, displays public/private badges, and falls back to public channels if `groups:read` is absent. Scopes: `channels:read` (optional `groups:read`) |
| `slack_inbox` | Read Socket Mode in-memory inbox | `limit` (1–50, default 10), `markRead` (atomic drain returning `remaining`); preserves `thread_ts`, `event_type` (`app_mention`), and `files`, supports `thread_broadcast` / `file_share`, deduplicates by `(channel, ts)`, and filters bot self-messages |
| `slack_health` | Offline & online health diagnostics | Optional `verify` (`false` by default; `true` calls `auth.test` to verify token, workspace, identity & scopes); validates `token`/`appToken` prefixes and `slackApiUrl` |
| `slack_history` | Read channel message history | `channel` required (`#name` auto-resolved), `limit` (1–100, default 20), optional `oldest` / `latest`. Scopes: `channels:history` / `groups:history` (optional `users:read`) |
| `slack_thread` | Read full thread conversation | `channel` and `thread_ts` required, `limit` (1–100, default 50); returns parent message and replies. Scopes: same as `slack_history` |
| `slack_upload` | Upload text or local file to channel/thread | `filename` required; provide either `content` or `file_path`; optional `channel` (falls back to `defaultChannel`), `title`, `initial_comment`, `thread_ts`; uses `filesUploadV2`. Scope: `files:write` |
| `slack_react` | Add an emoji reaction to a message | `channel`, `timestamp`, and `name` (e.g. `thumbsup` or `:white_check_mark:`) required. Scope: `reactions:write` |

---

## Known Limitations & Roadmap

- **In-memory inbox**: `slack_inbox` holds up to 200 recent messages in memory and resets on restart. Use `slack_history` and `slack_thread` whenever you need older or persisted channel context.
- **No automatic retries on writes**: Outbound posts, replies, uploads, and reactions never auto-retry on timeout/error to prevent duplicate messages. Check Slack before retrying after a timeout.
- **Out of current scope**: Legacy RTM (deprecated by Slack), interactive Block Kit modals/button callbacks, slash command handlers, and streaming chat updates (`chat.startStream`) are not included yet.

## Install, Uninstall & Development

```bash
# Install (use desktop instead of web for DSH Desktop)
dsh plugin --profile web add dsh-slack

# Uninstall
dsh plugin --profile web remove dsh-slack

# Build & run offline tests
pnpm install
pnpm test
pnpm run test:protocol
```

## License

MIT

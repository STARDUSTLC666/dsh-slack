# dsh-slack Usage Guide

[Overview](../README.en.md) · [Changelog](../CHANGELOG.md) · [Validation](VALIDATION.md)

## Get Started in 3 Steps

### Step 1: Create Your Slack App & Copy Tokens

**For outbound notifications & thread replies (2-minute setup):**
1. Visit <https://api.slack.com/apps> → **Create New App** → **From scratch**, and choose your workspace.
2. Under **OAuth & Permissions → Bot Token Scopes**, add:
   - `chat:write` (required for channel messages & thread replies)
   - `channels:read` (required to list public channels; add `groups:read` for private channels)
3. Click **Install to Workspace** and copy your **`xoxb-` Bot User OAuth Token**.

**Optional — for two-way incoming messages (`slack_inbox` via Socket Mode):**
1. Open **Socket Mode** → turn on **Enable Socket Mode**, and generate an **`xapp-` App-Level Token** with `connections:write`.
2. Open **Event Subscriptions** → enable events, and subscribe to `message.channels` and `message.im` under **Subscribe to bot events**.

### Step 2: Configure in DSH (Choose Either Option)

**Option A (Recommended): Native DSH Settings Form**

Open **DSH → Settings → Plugins → Slack (`dsh-slack`)**:
- Enter `token` (`xoxb-...`) and optional `defaultChannel` (e.g. `#general`) — **both take effect immediately on save without restarting**;
- For Socket Mode inbox, enter `appToken` (`xapp-...`; all tokens are secret-masked, and reloading connects Socket Mode cleanly).

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

Send `/invite @your-bot` inside the target Slack channel, then ask the assistant in DSH to check Slack health before posting.

---

## Copy-Ready Prompts for Everyday Work

- **Verify connection & discover channel IDs**
  > Run a Slack health check and list all channels the bot can currently see.
- **Review an update before posting to a team channel**
  > Draft a crisp summary of today's fixes for `#dev-updates`. Show me the message first and wait for my confirmation before sending.
- **Post a parent status & follow up in the same thread**
  > Post "Starting v1.4 deployment" to `#release`, then once verification finishes, post the test summary as a thread reply on that message.
- **Summarize incoming Socket Mode messages & prepare replies**
  > Check the latest 10 messages in the Slack inbox, highlight blockers, and draft a thread reply for the first question without sending it yet.

---

## Quick Troubleshooting Checklist

Run `slack_health` first (distinguishes configured credentials from an active Socket Mode connection without extra network requests):

| Symptom | Usual Cause | Quick Fix |
| :--- | :--- | :--- |
| `token 未配置` | Missing `token` and `DSH_SLACK_TOKEN` | Paste your `xoxb-...` token in **DSH Settings → Plugins → Slack** (applies live) |
| `not_in_channel` | Bot has not joined the channel | Type `/invite @your-bot` in that Slack channel |
| `channel_not_found` | Typo in name, or private channel requires ID | Run `slack_channels` to copy the exact channel ID |
| `invalid_auth` / `missing_scope` | Token revoked or missing `chat:write` / `channels:read` | Add scopes in Slack App settings, click **Reinstall to Workspace**, and update `token` |
| `slack_inbox` stays empty | Missing `xapp-` token, disconnected socket, or missing events | Enable Socket Mode + subscribe to `message.channels` / `message.im` + set `appToken` |
| Timeout / uncertain send | Network hiccup (sends never auto-retry) | **Check the Slack channel first** before retrying to avoid duplicate messages |

---

## Configuration & Tool Reference

### Configuration Fields

| Field | Required | Description |
| :--- | :--- | :--- |
| `token` | yes* | Slack Bot (`xoxb-`) or User (`xoxp-`) token; falls back to `DSH_SLACK_TOKEN` (live-updated) |
| `appToken` | no | App-Level Token (`xapp-`) for Socket Mode inbox; falls back to `DSH_SLACK_APP_TOKEN` |
| `defaultChannel` | no | Default target channel (`#general` or channel ID, live-updated) |
| `slackApiUrl` | no | Custom Slack Web API base URL (defaults to `https://slack.com/api/`) |

### Registered Tools

| Tool | Purpose | Key Details |
| :--- | :--- | :--- |
| `slack_notify` | Send Markdown message to channel or thread | `channel` & `text` required, optional `thread_ts`; returns `ts` |
| `slack_channels` | List channels visible to the bot | Auto-paginates and prints `#name (ID)` |
| `slack_inbox` | Read Socket Mode in-memory inbox | `limit` (1–50, default 10), `markRead` (atomic drain returning `remaining`), up to 200 items |
| `slack_reply` | Reply inside an existing message thread | `channel`, `text`, and `thread_ts` required |
| `slack_health` | Offline & socket connection diagnostics | Stops reconnect loops on `invalid_auth`; backs off on transient network drops |

## Install, Uninstall & Development

```bash
# Install (use desktop instead of web for DSH Desktop)
dsh plugin --profile web add dsh-slack

# Uninstall
dsh plugin --profile web remove dsh-slack

# Build & run offline tests
pnpm install
pnpm test
```

## License

MIT

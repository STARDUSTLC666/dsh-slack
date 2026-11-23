[简体中文](README.md) · **English**

# Slack

> **Bring task notifications, thread replies, and a two-way inbox straight into Slack.**

Slack integration plugin for DeepSeek Harness (`>=0.2.2-rc.3`), supporting channel alerts, thread replies, optional Socket Mode inbox reception, health diagnostics, and controlled backoff reconnects.

[![npm](https://img.shields.io/npm/v/dsh-slack)](https://www.npmjs.com/package/dsh-slack) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-downloads.svg)](https://www.npmjs.com/package/dsh-slack) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-total-downloads.svg)](https://www.npmjs.com/package/dsh-slack)

**[Features](#features) · [Install](#install) · [Get Started in 3 Steps](#get-started-in-3-steps) · [Troubleshooting](#quick-troubleshooting-checklist) · [Full Guide](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/USAGE.en.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-en-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-en-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-en-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-en-light.svg" alt="Bring task notifications and thread replies to Slack. · workflow illustration" width="100%">
</picture>

<a id="what-it-does"></a>
## Features

| Capability | What It Gives You |
| :--- | :--- |
| **Channels & Thread Replies** | Post formatted task updates to channels and keep follow-ups tidy inside threads |
| **Optional Socket Mode Inbox** | Add an `xapp-` App-Level Token to receive channel/DM messages for AI triage and draft replies |
| **Live Masked Settings** | Mask tokens in DSH Settings with instant hot reload for outgoing config (or `DSH_SLACK_TOKEN` / `DSH_SLACK_APP_TOKEN`) |
| **Diagnostics & Backoff** | Built-in health checks, visible channel listing, and controlled backoff reconnects |

## Install

Open **Plugins** in the DSH desktop app and install `dsh-slack`, or use the CLI:

```bash
dsh plugin --profile desktop add dsh-slack
```

For the web profile, replace `desktop` with `web`. Restart DSH once after installing. Requires DSH `>=0.2.2-rc.3`.

<a id="start-using-it"></a>
## Get Started in 3 Steps

1. **Create a Slack App & grab tokens**: At <https://api.slack.com/apps>, grant `chat:write` and `channels:read`, install to your workspace, and copy the `xoxb-` Bot Token (enable Socket Mode + `xapp-` token for two-way inbox support).
2. **Save in DSH Settings**: Open **DSH Settings → Plugins → Slack (`dsh-slack`)** and enter `token` and `defaultChannel` (tokens are masked and outgoing settings apply live).
3. **Invite the bot & verify**: Run `/invite @your-bot` inside your target Slack channel, then ask the assistant to check Slack health and list accessible channels.

### Ready-to-copy prompts

- **Check health and visible channels**
  > Check my Slack connection status and list the channels (with channel IDs) the bot can currently access.
- **Draft a channel update before posting**
  > Summarize our progress for `#engineering` and show me the draft first. Post to Slack only after I confirm.
- **Triage Socket Mode inbox & draft thread replies**
  > Read the latest unread messages in the Slack inbox, summarize what needs action, and draft a thread reply for my review without sending yet.

## Quick Troubleshooting Checklist

| Symptom | Likely Cause | Fix |
| :--- | :--- | :--- |
| `token 未配置` | Missing `xoxb-` / `xoxp-` token | Paste `token` in **DSH Settings → Plugins → Slack** (applies live) or set `DSH_SLACK_TOKEN` |
| `not_in_channel` / `channel_not_found` | Bot has not joined the channel, or private channel needs its ID | Run `/invite @your-bot` in Slack, then ask the assistant to list visible channels |
| `slack_inbox` stays empty | Missing `xapp-` token, Socket Mode off, or missing event subscriptions | Enable Socket Mode, subscribe to `message.channels` / `message.im`, set `appToken`, and reload |
| `invalid_auth` / `missing_scope` | Token revoked or missing `chat:write` / `channels:read` | Add scopes, reinstall the App to your workspace, and update `token` |

## Plugin updates

Check updates at the bottom of native plugin details. Automatic checks are on by default; **automatic installation is off**. Suite-managed components update with their bundle.

## Documentation & Feedback

- [Usage & config](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/USAGE.en.md) · [Full reference](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/REFERENCE.en.md) · [Release notes](https://github.com/STARDUSTLC666/dsh-slack/blob/main/CHANGELOG.md) · [Validation](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/VALIDATION.md)
- If this plugin helps, consider starring the repo. Report bugs in [Issues](https://github.com/STARDUSTLC666/dsh-slack/issues) or open [PRs](https://github.com/STARDUSTLC666/dsh-slack/pulls) (strip credentials first).

## License

[MIT](https://github.com/STARDUSTLC666/dsh-slack/blob/main/LICENSE)

<a id="requirements-and-configuration"></a>

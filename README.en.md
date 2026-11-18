[简体中文](README.md) · **English**

# Slack

**Bring task notifications and thread replies straight into Slack.**

Slack integration plugin for DeepSeek Harness (`>=0.2.2-rc.3`): supports native live Settings forms with secret masking, channel notifications, thread replies, optional Socket Mode inbox reception, health diagnostics, and controlled backoff reconnects.

[![npm](https://img.shields.io/npm/v/dsh-slack)](https://www.npmjs.com/package/dsh-slack) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-downloads.svg)](https://www.npmjs.com/package/dsh-slack) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-total-downloads.svg)](https://www.npmjs.com/package/dsh-slack)

**[Install](#install) · [Get Started in 3 Steps](#get-started-in-3-steps) · [Full Guide](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/USAGE.en.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-en-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-en-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-en-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-en-light.svg" alt="Bring task notifications and thread replies to Slack. · workflow illustration" width="100%">
</picture>

## Install

Open **Plugins** in the DSH desktop app and install `dsh-slack`, or use the CLI:

```bash
dsh plugin --profile desktop add dsh-slack
```

For the web profile, replace `desktop` with `web`. Restart DSH once after installing. Requires DSH `>=0.2.2-rc.3`.

<a id="start-using-it"></a>
## Get Started in 3 Steps

1. **Create a Slack App & grab your token**: At <https://api.slack.com/apps>, grant `chat:write` and `channels:read`, install the App to your workspace, and copy the `xoxb-` Bot Token (for two-way inbox messages, also enable Socket Mode and generate an `xapp-` App-Level Token).
2. **Fill in DSH Settings (`token` applies live)**: Open **DSH Settings → Plugins → Slack (`dsh-slack`)** and enter `token` and `defaultChannel` (tokens are masked; `DSH_SLACK_TOKEN` and `DSH_SLACK_APP_TOKEN` env vars are also supported).
3. **Invite the bot & verify**: Run `/invite @your-bot` inside your target Slack channel, then ask the assistant to check Slack health and visible channels.

## Copy-Ready Prompts for Everyday Work

- **Check Slack health and list accessible channels**
  > Check my Slack connection status and list the channels (with channel IDs) the bot can currently access.
- **Draft and review a channel update before posting**
  > Summarize our progress for `#engineering` and show me the draft first. Post to Slack only after I confirm.
- **Triage Socket Mode inbox & draft thread replies**
  > Read the latest unread messages in the Slack inbox, summarize what needs action, and draft a thread reply for my review without sending yet.

## Quick Troubleshooting Checklist

| Symptom | Likely Cause | Fix |
| :--- | :--- | :--- |
| `token 未配置` | Missing `xoxb-` / `xoxp-` token | Paste `token` in **DSH Settings → Plugins → Slack** (applies live) or set `DSH_SLACK_TOKEN` |
| `not_in_channel` or `channel_not_found` | Bot has not joined the channel, or private channel needs its ID | Run `/invite @your-bot` in Slack, then ask the assistant to list visible channels |
| `slack_inbox` stays empty | Missing `xapp-` token, Socket Mode off, or missing event subscriptions | Enable Socket Mode + subscribe to `message.channels` / `message.im`, set `appToken`, and reload |
| `invalid_auth` / `missing_scope` | Token revoked or missing `chat:write` / `channels:read` | Add scopes, reinstall the App to your workspace, and update `token` |

## Plugin updates

Check updates at the bottom of native plugin details. Automatic checks are on by default; **automatic installation is off**. Suite-managed components update with their bundle.

## Documentation

- [Usage guide and configuration reference](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/USAGE.en.md)
- [Full reference](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/REFERENCE.en.md)
- [Release notes](https://github.com/STARDUSTLC666/dsh-slack/blob/main/CHANGELOG.md)
- [Validation scope and history](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/VALIDATION.md)

## Feedback and contributions

If the plugin helps, a Star makes it easier for others to discover. Report issues in [Issues](https://github.com/STARDUSTLC666/dsh-slack/issues) or open [PRs](https://github.com/STARDUSTLC666/dsh-slack/pulls) (please strip credentials).

## License

[MIT](https://github.com/STARDUSTLC666/dsh-slack/blob/main/LICENSE)

<a id="what-it-does"></a>
<a id="requirements-and-configuration"></a>

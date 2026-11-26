> Full usage reference. The landing page focuses on outcomes, installation and workflows; detailed parameters, limits, update rules and historical validation links remain here.

# dsh-slack

[中文](./REFERENCE.zh.md)

![dsh-slack whale girl plugin cover](https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/assets/cover-whale-girl.png)

Connect Slack to DSH for native Markdown task notifications, channel & thread history reading, file uploads, emoji reactions, a Socket Mode inbox, and thread replies. Includes offline & online (`auth.test`) health checks, proxy-aware transport, and controlled backoff reconnection that stops on permanent auth failures.

[![npm](https://img.shields.io/npm/v/dsh-slack)](https://www.npmjs.com/package/dsh-slack) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-downloads.svg)](https://www.npmjs.com/package/dsh-slack) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-total-downloads.svg)](https://www.npmjs.com/package/dsh-slack)

[Download statistics](https://github.com/STARDUSTLC666/dsh-suite/blob/npm-downloads/README.md)

Feedback and contributions are welcome: report [issues](https://github.com/STARDUSTLC666/dsh-slack/issues) or submit [pull requests](https://github.com/STARDUSTLC666/dsh-slack/pulls).

## What it does

- Send native Markdown notifications to channels or threads (`slack_notify` / `slack_reply`), with automatic plain-text fallback over 12,000 characters and ID-resolution fallback when posting by private channel `#name`.
- List joined or workspace-visible channels (`slack_channels`), excluding archived channels and gracefully falling back to public channels if `groups:read` is absent.
- Read channel message history and full thread discussions (`slack_history` / `slack_thread`) with `#channel` / `<#ID|name>` / `channel:ID` resolution, ISO-8601 time boundaries, Block Kit / attachment fallback extraction, and best-effort user/bot display names.
- Upload text snippets or local files (`slack_upload` via `filesUploadV2`) and add emoji reactions (`slack_react`, automatically translating common Unicode glyphs to Slack shortcodes).
- Receive public/private channel messages, DMs, `@mentions`, thread broadcasts, file shares, and Block Kit messages via Socket Mode (`slack_inbox`), with deduplication and automatic bot self-filtering.
- Run offline configuration checks or live `auth.test` token & scope verification (`slack_health`), including multi-connection Socket Mode hints.

## Install

In DSH Desktop, install `dsh-slack` from the Plugins panel. If the bundled dsh command is available:

```bash
dsh plugin --profile desktop add dsh-slack
```

For the web version, replace `desktop` with `web`. Restart DSH after installation.

## Start using it

1. Visit <https://api.slack.com/apps> → **Create New App → From a manifest**, paste [`slack-app-manifest.yaml`](../slack-app-manifest.yaml) to create a preconfigured Slack App in one click, install it, and copy the Bot (`xoxb-`) and optional App-Level (`xapp-` with `connections:write`) tokens.
2. Enter the tokens in DSH Slack settings and run `slack_health` (optionally with `verify=true`) to check credentials, scopes, and connection state.
3. Verify messaging, history lookup, or incoming inbox events in a test channel before automating team workflows.
4. Review the target channel, thread, and message content before sending. Check Slack before retrying after any network timeout.

## Requirements and configuration

Requires a Bot Token (`xoxb-` / `xoxe.xoxb-`) or User Token (`xoxp-` / `xoxe.xoxp-`). Socket Mode inbox also needs an `xapp-` App-Level Token and event subscriptions; the inbox keeps up to 200 messages in memory.

Detailed configuration, all 9 tool parameters, required Slack scopes, and troubleshooting are in the [usage guide](USAGE.en.md). For standalone development, follow the Node requirement in [package.json](../package.json).

## Documentation

- [Usage and troubleshooting](USAGE.en.md)
- [Changelog](../CHANGELOG.md)
- [Validation scope and history](VALIDATION.md)
- [Report a problem or suggest a feature](https://github.com/STARDUSTLC666/dsh-slack/issues)

## Plugin updates

Requires DSH 0.2.2-rc.3 or newer. Update controls sit at the bottom of the existing workbench, or native plugin details for plugins without a workbench. Checks, release notes and preferences expand in place, with no separate update page or settings menu. Automatic checks are on by default; **automatic installation is off by default**. Only explicit opt-in permits compatible stable updates (minor and patch) while idle with no unsaved changes. Preferences are independent, with per-plugin disable, deferral and ignore controls. No forced DSH restart or upgrade, and local-source installations stay unchanged. Suite components explain and operate on the whole Suite in the same footer.

Older releases need one manual update in native plugin management to acquire these controls. Publishing to npm does not replace an existing user installation.

## License

[MIT](../LICENSE)

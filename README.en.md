# dsh-slack

[中文](README.md)

![dsh-slack whale girl plugin cover](https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/assets/cover-whale-girl.png)

Connect Slack to DSH for task notifications, a Socket Mode inbox and thread replies. Includes account health checks and controlled reconnection, stopping retries with a clear status when authentication fails.

[![npm](https://img.shields.io/npm/v/dsh-slack)](https://www.npmjs.com/package/dsh-slack) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-downloads.svg)](https://www.npmjs.com/package/dsh-slack) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-total-downloads.svg)](https://www.npmjs.com/package/dsh-slack)

[Download statistics](https://github.com/STARDUSTLC666/dsh-suite/blob/npm-downloads/README.md)

Feedback and contributions are welcome: report [issues](https://github.com/STARDUSTLC666/dsh-slack/issues) or submit [pull requests](https://github.com/STARDUSTLC666/dsh-slack/pulls).

## What it does

- Send Markdown notifications to channels or threads.
- List visible channels and read the Socket Mode inbox.
- Reply in threads and check connection or token configuration.

## Install

In DSH Desktop, install `dsh-slack` from the Plugins panel. If the bundled dsh command is available:

```bash
dsh plugin --profile desktop add dsh-slack
```

For the web version, replace `desktop` with `web`. Restart DSH after installation.

## Start using it

1. Configure permissions and Socket Mode for your Slack App, and obtain Bot and App-level tokens.
2. Enter the tokens in DSH Slack settings and check the connection state.
3. Verify incoming messages in your own test channel before asking for summaries or thread replies.
4. Verify the channel, thread and text before sending. Check Slack for the result and inspect connection state before retrying.

## Requirements and configuration

Requires a bot token. Socket Mode also needs an app token and permissions; the inbox is stored in memory.

Detailed configuration, tool arguments and troubleshooting are in the [usage guide](docs/USAGE.en.md). For standalone development, follow the Node requirement in [package.json](package.json).

## Documentation

- [Usage and troubleshooting](docs/USAGE.en.md)
- [Changelog](CHANGELOG.md)
- [Validation scope and history](docs/VALIDATION.md)
- [Report a problem or suggest a feature](https://github.com/STARDUSTLC666/dsh-slack/issues)

## Plugin updates

Requires DSH 0.2.1-rc.3 or newer. Update controls sit at the bottom of the existing workbench, or native plugin details for plugins without a workbench. Checks, release notes and preferences expand in place, with no separate update page or settings menu. Automatic checks are on by default; **automatic installation is off by default**. Only explicit opt-in permits compatible stable patches while idle with no unsaved changes. Preferences are independent, with per-plugin disable, deferral and ignore controls. No forced DSH restart or upgrade, and local-source installations stay unchanged. Suite components explain and operate on the whole Suite in the same footer.

Older releases need one manual update in native plugin management to acquire these controls. Publishing to npm does not replace an existing user installation.

## License

[MIT](LICENSE)

# dsh-slack

[中文](README.md)

![dsh-slack whale girl plugin cover](https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/assets/cover-whale-girl.png)

Connect Slack for notifications, a Socket Mode inbox and thread replies.

[![npm](https://img.shields.io/npm/v/dsh-slack)](https://www.npmjs.com/package/dsh-slack) [![downloads](https://img.shields.io/npm/dm/dsh-slack)](https://www.npmjs.com/package/dsh-slack)

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

Configure your Slack App and tokens, then ask to review the inbox and identify messages that need a reply.

## Requirements and configuration

Requires a bot token. Socket Mode also needs an app token and permissions; the inbox is stored in memory.

Detailed configuration, tool arguments and troubleshooting are in the [usage guide](docs/USAGE.en.md). For standalone development, follow the Node requirement in [package.json](package.json).

## Documentation

- [Usage and troubleshooting](docs/USAGE.en.md)
- [Changelog](CHANGELOG.md)
- [Validation scope and history](docs/VALIDATION.md)
- [Report a problem or suggest a feature](https://github.com/STARDUSTLC666/dsh-slack/issues)

## License

[MIT](LICENSE)

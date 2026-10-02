# dsh-slack

[English](README.en.md)

连接 Slack，发送通知并处理 Socket Mode 收件箱与线程回复。

[![npm](https://img.shields.io/npm/v/dsh-slack)](https://www.npmjs.com/package/dsh-slack) [![downloads](https://img.shields.io/npm/dm/dsh-slack)](https://www.npmjs.com/package/dsh-slack)

## 功能

- 向频道或线程发送 Markdown 通知。
- 读取机器人可见频道和 Socket Mode 收件箱。
- 回复线程，按配置检查连接与令牌。

## 安装

桌面版可在「插件」面板按包名 `dsh-slack` 安装。已配置 dsh 命令时也可使用：

```bash
dsh plugin --profile desktop add dsh-slack
```

网页版把命令中的 `desktop` 改为 `web`。安装后重启 DSH。

## 开始使用

配置 Slack App 和令牌后，可说：“查看 Slack 收件箱，整理需要回复的消息。”

## 依赖与配置

需要 Bot Token。Socket Mode 收消息还需要 App Token 与相应权限；收件箱在内存中保存。

详细配置、工具参数与排错见[使用说明](docs/USAGE.md)。从源码独立开发时，Node 要求以 [package.json](package.json) 为准。

## 文档

- [使用与排错](docs/USAGE.md)
- [更新记录](CHANGELOG.md)
- [验证范围与历史记录](docs/VALIDATION.md)
- [问题反馈与功能建议](https://github.com/STARDUSTLC666/dsh-slack/issues)

## License

[MIT](LICENSE)

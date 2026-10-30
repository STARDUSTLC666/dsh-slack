**简体中文** · [English](README.en.md)

# Slack

**让任务通知和线程回复回到 Slack。**

[![npm](https://img.shields.io/npm/v/dsh-slack)](https://www.npmjs.com/package/dsh-slack) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-downloads.svg)](https://www.npmjs.com/package/dsh-slack) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-total-downloads.svg)](https://www.npmjs.com/package/dsh-slack)

**[安装使用](#安装) · [使用流程](#开始使用) · [完整说明](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/REFERENCE.zh.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-zh-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-zh-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-zh-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-zh-light.svg" alt="让任务通知和线程回复回到 Slack。 · 流程示意" width="100%">
</picture>

## 功能

- 发送频道通知或线程回复。
- 使用机器人可见频道与 Socket Mode 收件箱。
- 检查连接状态，按原因处理失效与重连。

## 安装

在 DSH 桌面版「插件」面板安装 `dsh-slack`。已配置命令行时也可使用：

```bash
dsh plugin --profile desktop add dsh-slack
```

网页版把 `desktop` 改为 `web`；安装后重启对应的 DSH。宿主要求以包声明 `>=0.2.1-rc.3` 为准。

## 开始使用

1. 为自己的 Slack App 配置权限与 Socket Mode，取得 Bot token 和 App-level token。
2. 在 DSH 的 Slack 设置中填写令牌并检查连接状态。
3. 先在自己的测试频道验证收件，再让助手整理消息或准备线程回复。
4. 核对目标频道、线程和正文后发送；在 Slack 中检查结果，断线时先看状态再重试。

可以这样说：

> 先检查 Slack 连接，准备一条项目进展通知，确认频道和正文后再发送。

## 开始前要知道

需要自己的 Slack App、权限和令牌；只能访问机器人有权看到的消息。

配置、完整工具与排错见[详细使用说明](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/REFERENCE.zh.md)。

## 插件更新

在工作台或原生插件详情页底部检查更新。默认自动检查，**默认不自动安装**；是否安装、何时重启由你决定。Suite 管理的组件随整包更新。[查看更新规则](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/REFERENCE.zh.md)。

## 文档

- [详细使用、配置与边界](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/REFERENCE.zh.md)
- [更新记录](https://github.com/STARDUSTLC666/dsh-slack/blob/main/CHANGELOG.md)
- [验证范围与历史](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/VALIDATION.md)

## 反馈与贡献

如果插件帮到了你，欢迎 Star，让更多人发现它。问题和建议请提交 [Issues](https://github.com/STARDUSTLC666/dsh-slack/issues)，也欢迎代码与文档 [PR](https://github.com/STARDUSTLC666/dsh-slack/pulls)。反馈时附上版本与复现步骤，并移除凭据。

## License

[MIT](https://github.com/STARDUSTLC666/dsh-slack/blob/main/LICENSE)

<a id="依赖与配置"></a>

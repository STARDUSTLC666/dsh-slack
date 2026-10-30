> 完整使用说明。首页已按用途、安装和操作流程重新整理；这里保留详细参数、限制、更新规则与历史验证链接。

# dsh-slack

[English](../README.en.md)

![dsh-slack 鲸鱼娘插件封面](https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/assets/cover-whale-girl.png)

连接 Slack，让 DSH 发送任务通知、读取 Socket Mode 收件箱并在线程中回复。支持账号状态自检与受控重连；认证失效会停止重试并显示原因。

[![npm](https://img.shields.io/npm/v/dsh-slack)](https://www.npmjs.com/package/dsh-slack) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-downloads.svg)](https://www.npmjs.com/package/dsh-slack) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-total-downloads.svg)](https://www.npmjs.com/package/dsh-slack)

[下载统计说明](https://github.com/STARDUSTLC666/dsh-suite/blob/npm-downloads/README.md)

欢迎使用，遇到问题或有改进建议，请提交 [issues](https://github.com/STARDUSTLC666/dsh-slack/issues) 和 [PR](https://github.com/STARDUSTLC666/dsh-slack/pulls)。

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

1. 为自己的 Slack App 配置权限与 Socket Mode，取得 Bot token 和 App-level token。
2. 在 DSH 的 Slack 设置中填写令牌并检查连接状态。
3. 先在自己的测试频道验证收件，再让助手整理消息或准备线程回复。
4. 核对目标频道、线程和正文后发送；在 Slack 中检查结果，断线时先看状态再重试。

## 依赖与配置

需要 Bot Token。Socket Mode 收消息还需要 App Token 与相应权限；收件箱在内存中保存。

详细配置、工具参数与排错见[使用说明](USAGE.md)。从源码独立开发时，Node 要求以 [package.json](../package.json) 为准。

## 文档

- [使用与排错](USAGE.md)
- [更新记录](../CHANGELOG.md)
- [验证范围与历史记录](VALIDATION.md)
- [问题反馈与功能建议](https://github.com/STARDUSTLC666/dsh-slack/issues)

## 插件更新

需要 DSH 0.2.1-rc.3 或更新版本。更新控件直接位于原有工作台内容末尾；没有工作台的插件，位于原生插件详情页底部。检查、更新记录和偏好在原地展开，不增加独立更新页面或设置菜单。自动检查默认开启；**自动安装默认关闭**，明确授权后才会在空闲且没有未保存修改时安装兼容的稳定补丁。开关按插件独立保存，可关闭、推迟或忽略提醒；不会强制重启 DSH、升级 DSH 本体或替换本地源码安装。Suite 组件在当前页面底部明确说明并操作 Suite 整包更新。

旧版用户先在官方插件管理中手动更新一次，之后才会获得此入口。发布到 npm 不会直接替换用户已经安装的版本。

## License

[MIT](../LICENSE)

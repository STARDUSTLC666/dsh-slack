> 完整使用说明。首页已按用途、安装和操作流程重新整理；这里保留详细参数、限制、更新规则与历史验证链接。

# dsh-slack

[English](./REFERENCE.en.md)

![dsh-slack 鲸鱼娘插件封面](https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/assets/cover-whale-girl.png)

连接 Slack，让 DSH 发送原生 Markdown 通知、拉取频道历史与线程上下文、上传文件、添加表情回应、读取 Socket Mode 收件箱并在线程中回复。支持离线与在线（`auth.test`）账号自检、代理环境自适应与受控退避重连；认证失效会停止重试并显示原因。

[![npm](https://img.shields.io/npm/v/dsh-slack)](https://www.npmjs.com/package/dsh-slack) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-downloads.svg)](https://www.npmjs.com/package/dsh-slack) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-total-downloads.svg)](https://www.npmjs.com/package/dsh-slack)

[下载统计说明](https://github.com/STARDUSTLC666/dsh-suite/blob/npm-downloads/README.md)

欢迎使用，遇到问题或有改进建议，请提交 [issues](https://github.com/STARDUSTLC666/dsh-slack/issues) 和 [PR](https://github.com/STARDUSTLC666/dsh-slack/pulls)。

## 功能

- 向频道或线程发送原生 Markdown 通知（`slack_notify` / `slack_reply`），超 12,000 字符自动安全降级为纯文本，私密频道按名发送遇 `channel_not_found` 自动回退按 ID 重试。
- 按范围列出机器人已加入或工作区可见频道（`slack_channels`），自动排除归档频道并支持权限不足时降级公开频道。
- 读取频道历史与完整线程上下文（`slack_history` / `slack_thread`），支持 `#频道名` / `<#ID|name>` / `channel:ID` 解析、ISO-8601 时间边界、Block Kit / 告警附件兜底文本提取与发送者昵称补全。
- 上传文本内容或本地文件到频道/线程（`slack_upload`，基于 `filesUploadV2`），以及为消息添加表情回应（`slack_react`，自动将常见 Unicode 表情转为 Slack 短码）。
- 可选 Socket Mode 双向收件箱（`slack_inbox`），支持公开/私密频道、私信、`@提及`、线程广播、文件分享与纯 Block Kit 消息，自动去重并过滤机器人自身消息。
- 连接与凭据自检（`slack_health`），默认离线检查前缀/URL/连接状态（含多实例并发连接提醒），传入 `verify=true` 时在线调用 `auth.test` 核验身份与已授予权限。

## 安装

桌面版可在「插件」面板按包名 `dsh-slack` 安装。已配置 dsh 命令时也可使用：

```bash
dsh plugin --profile desktop add dsh-slack
```

网页版把命令中的 `desktop` 改为 `web`。安装后重启 DSH。

## 开始使用

1. 打开 <https://api.slack.com/apps> → **Create New App → From a manifest**，粘贴仓库根目录的 [`slack-app-manifest.yaml`](../slack-app-manifest.yaml) 一键创建 Slack App，安装后取得 Bot Token（`xoxb-`）和可选 App-Level Token（`xapp-`，需 `connections:write`）。
2. 在 DSH 的 Slack 设置中填写令牌，运行 `slack_health`（可加 `verify=true`）核验连接与权限状态。
3. 先在自己的测试频道验证发信、历史读取或收件，再让助手整理消息、上传附件或准备线程回复。
4. 核对目标频道、线程和正文后发送；在 Slack 中检查结果，断线或超时时先看状态再重试。

## 依赖与配置

需要 Bot Token（`xoxb-` / `xoxe.xoxb-`）或 User Token（`xoxp-` / `xoxe.xoxp-`）。Socket Mode 收消息还需要 `xapp-` App-Level Token 与事件订阅；收件箱在内存中保存最近 200 条消息。

详细配置、9 个工具参数、权限清单与排错见[使用说明](USAGE.md)。从源码独立开发时，Node 要求以 [package.json](../package.json) 为准。

## 文档

- [使用与排错](USAGE.md)
- [更新记录](../CHANGELOG.md)
- [验证范围与历史记录](VALIDATION.md)
- [问题反馈与功能建议](https://github.com/STARDUSTLC666/dsh-slack/issues)

## 插件更新

需要 DSH 0.2.2-rc.3 或更新版本。更新控件直接位于原有工作台内容末尾；没有工作台的插件，位于原生插件详情页底部。检查、更新记录和偏好在原地展开，不增加独立更新页面或设置菜单。自动检查默认开启；**自动安装默认关闭**，明确授权后才会在空闲且没有未保存修改时安装兼容的稳定更新（小版本与补丁）。开关按插件独立保存，可关闭、推迟或忽略提醒；不会强制重启 DSH、升级 DSH 本体或替换本地源码安装。Suite 组件在当前页面底部明确说明并操作 Suite 整包更新。

旧版用户先在官方插件管理中手动更新一次，之后才会获得此入口。发布到 npm 不会直接替换用户已经安装的版本。

## License

[MIT](../LICENSE)

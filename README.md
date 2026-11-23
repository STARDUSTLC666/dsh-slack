**简体中文** · [English](README.en.md)

# Slack

> **让任务通知、线程回复与双向收件箱自然融入你的 Slack 工作区。**

DeepSeek Harness（`>=0.2.2-rc.3`）Slack 集成插件，支持频道发信、线程跟进、可选 Socket Mode 双向收件箱、连接诊断与受控退避重连。

[![npm](https://img.shields.io/npm/v/dsh-slack)](https://www.npmjs.com/package/dsh-slack) [![downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-downloads.svg)](https://www.npmjs.com/package/dsh-slack) [![total downloads](https://raw.githubusercontent.com/STARDUSTLC666/dsh-suite/npm-downloads/assets/dsh-slack-total-downloads.svg)](https://www.npmjs.com/package/dsh-slack)

**[核心能力](#核心能力) · [安装](#安装) · [最快 3 步用起来](#最快-3-步用起来) · [常见卡点](#常见卡点自检) · [完整说明](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/USAGE.md)**

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-zh-mobile-dark.svg">
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-zh-mobile-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-zh-dark.svg">
  <img src="https://raw.githubusercontent.com/STARDUSTLC666/dsh-slack/main/docs/assets/intro/workflow-zh-light.svg" alt="让任务通知和线程回复回到 Slack。 · 流程示意" width="100%">
</picture>

## 核心能力

| 能力 | 说明 |
| :--- | :--- |
| **频道通知与线程回复** | 发布进展摘要到指定频道，并在原消息线程内持续跟进或草拟回复 |
| **可选 Socket Mode 收件箱** | 配置 `xapp-` App-Level Token 后可接收频道/私信未读消息，交由助手按优先级汇总 |
| **原生设置热生效与脱敏** | 令牌自动脱敏，发信配置保存即生效；同步支持环境变量 `DSH_SLACK_TOKEN` / `DSH_SLACK_APP_TOKEN` |
| **连接诊断与受控重连** | 内置连接健康自检、可见频道枚举与受控退避重连，减少排查成本 |

## 安装

在 DSH 桌面版「插件」面板搜索安装 `dsh-slack`，或使用命令行：

```bash
dsh plugin --profile desktop add dsh-slack
```

网页版把 `desktop` 改为 `web`；安装后重启一次 DSH。宿主要求 `>=0.2.2-rc.3`。

<a id="开始使用"></a>
## 最快 3 步用起来

1. **创建 Slack App 拿令牌**：在 <https://api.slack.com/apps> 勾选 `chat:write`、`channels:read` 并安装到工作区，复制 `xoxb-` 令牌（需收件箱时再开 Socket Mode 获取 `xapp-`）。
2. **填入原生设置**：打开 DSH「**设置 → 插件 → Slack（dsh-slack）**」填入 `token` 与 `defaultChannel`（令牌自动脱敏，发信配置保存即生效）。
3. **拉机器人进频道并自检**：在目标频道输入 `/invite @你的机器人`，回到 DSH 对话先跑一次连接自检，即可开始发信或读取收件箱。

### 常用对话示例

- **首次连接与可见频道自检**
  > 先检查一下 Slack 连接状态，并列出机器人当前能看到的所有频道和频道 ID。
- **发布进展通知（先审稿再发）**
  > 帮我整理刚才的任务结果，准备发到 `#engineering` 频道；先把草稿给我看一眼，我确认后再发送。
- **汇总收件箱并起草线程回复（Socket Mode）**
  > 读取 Slack 收件箱里最新的未处理消息，帮我按优先级总结，并为需要回复的那条起草线程回复，先别直接发。

## 常见卡点自检

| 遇到的现象 | 原因定位 | 解决方法 |
| :--- | :--- | :--- |
| `token 未配置` | 尚未填写 `xoxb-` / `xoxp-` 令牌 | 在「设置 → 插件 → Slack」填入 `token`（保存即生效）或设置 `DSH_SLACK_TOKEN` |
| `not_in_channel` / `channel_not_found` | 机器人未加入目标频道，或私密/重名频道需用 ID | 在频道内运行 `/invite @你的机器人`，再让助手列出频道获取准确 ID |
| `slack_inbox` 一直为空 | 未配 `xapp-` 令牌、未开 Socket Mode 或漏订事件 | 开启 Socket Mode 并订阅 `message.channels` / `message.im`，填好 `appToken` 后重载 |
| `invalid_auth` / `missing_scope` | 令牌失效或漏勾 `chat:write` / `channels:read` | 在 Slack 后台补勾权限并 Reinstall to Workspace，然后更新 `token` |

## 插件更新

在原生插件详情页底部检查更新。默认自动检查，**默认不自动安装**；是否安装、何时重启由你决定。Suite 管理的组件随整包更新。

## 文档与反馈

- [使用说明与参数参考](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/USAGE.md) · [详细参考](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/REFERENCE.zh.md) · [更新记录](https://github.com/STARDUSTLC666/dsh-slack/blob/main/CHANGELOG.md) · [验证范围](https://github.com/STARDUSTLC666/dsh-slack/blob/main/docs/VALIDATION.md)
- 欢迎 Star，问题与建议请提交 [Issues](https://github.com/STARDUSTLC666/dsh-slack/issues) 或 [PR](https://github.com/STARDUSTLC666/dsh-slack/pulls)（反馈前请移除凭据）。

## License

[MIT](https://github.com/STARDUSTLC666/dsh-slack/blob/main/LICENSE)

<a id="依赖与配置"></a>

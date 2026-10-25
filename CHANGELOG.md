# 更新记录

[返回简介](README.md) · [使用说明](docs/USAGE.md) · [验证记录](docs/VALIDATION.md)

[历史英文记录](docs/CHANGELOG.en.md)

## 0.3.5（2026-10-26）

- Socket Mode 重连改为插件管理的有界退避；捕获启动与重连错误，凭据撤销等永久错误停止重试，卸载取消重连。自检区分凭据已配置、连接中、连接成功与认证失败。
- Windows 回归 49 项通过、0 项跳过；宿主与未验收范围见[本次记录](docs/validation-0.3.5.md)。

## 0.3.4 (2026-10-05)

- 标记已读只移除本次展示的消息，保留剩余未读与已读重投去重；发送不隐式重试，缺少消息回执时提示先检查频道。

## 0.3.3 (2026-10-01)

- 更新并对齐 Socket Mode 的传输依赖，修复依赖解析问题。

## 0.3.0 (2026-08-26)

- 新增 `slack_health` 自检（令牌/Socket Mode 配置一键体检）；修复只配置部分字段（如只有 token 没有 appToken）时可选链导致的启动崩溃。

## 0.2.3 (2026-08-15)

- `slack_channels` 自动分页：频道很多时不再只返回第一页。
  - `slack_inbox` 去重 + `drain` 原子消费：Slack 重投的事件不会重复入队，`markRead` 期间新到的消息也不会被误清。
  - WebClient 复用：同一 `token + slackApiUrl` 只创建一个客户端，减少重复初始化。
  - 分页增加页数上限，防止异常 `next_cursor` 导致死循环。
  - 错误映射补充 `not_authed` / `is_archived` / `msg_too_long` / `ratelimited`。

## 更早的改动

完整历史可查阅 [GitHub 提交记录](https://github.com/STARDUSTLC666/dsh-slack/commits/main)。

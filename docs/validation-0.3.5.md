# 0.3.5 验证记录

日期：2026-10-26。官方 Windows 宿主：DSH 0.2.1-rc.3。

## 行为变化

Socket Mode 重连改为插件管理的有界退避；捕获启动与重连错误，凭据撤销等永久错误停止重试，卸载取消重连。自检区分凭据已配置、连接中、连接成功与认证失败。

## 验证与限制

- Windows 本地：49 项，49 通过、0 跳过；没有把跳过计为通过。
- 真实 Slack SDK 的 token_revoked 重连故障在严格未处理异常模式下复现并回归；官方 RC.3 检查未配置状态。未配置真实 Slack 账号，线上收发未验收。
- GitHub 的跨平台 CI 和 npm 发布完整性以该版本工作流及 registry 为准；本记录不把本地测试等同于已发布。

## English

Socket Mode uses caught, bounded reconnect backoff. Permanent authentication errors stop retries; disposal cancels reconnects. Health distinguishes configured credentials from an active connection.

Runtime/account limits are listed above. Synthetic peers and model adapters do not establish live account delivery or model quality.

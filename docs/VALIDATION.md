# dsh-slack 验证记录

本页整理原 README 的历史验证说明，保留当时的版本、日期与范围。自动测试、启动检查、浏览器操作和真实服务验收分别记录，不能相互替代。更详细的版本验收文件仍保留在仓库中。

## 原中文记录

验证宿主：官方发布标签源码构建的 Harness `0.2.0-rc.2`（commit `639ed01539`）+ Windows / Node `24.16.0`。43 项插件测试通过；同一个宿主里 18 个插件共同加载，本插件的 5 个工具全部注册，工具 schema 与健康检查契约通过。真实 Slack 登录、Socket Mode 收件和发送尚未验收。

0.3.3 使用支持 Undici 7/8 的官方 Socket Mode SDK 3.1 或更新版本，并显式声明匹配的传输依赖，修复组合安装中旧 SDK 与宿主 Undici 8 的依赖不匹配；npm 包同时包含中英文说明。

> **v0.2 范围（双向）**：v0.1 只做「agent → Slack」单向通知；v0.2 新增 Socket Mode，
> 支持「Slack 消息 → agent」：`slack_inbox` 收取消息、`slack_reply` 线程回复。
> RTM、交互组件（按钮/弹窗/slash command 回复）不在 v0.2，见下方
> [已知限制与路线图](USAGE.md#已知限制与路线图)。

## Original English record

Validation host: Harness `0.2.0-rc.2` built from its official release tag (commit `639ed01539`), Windows and Node `24.16.0`. All 43 plugin tests pass; all 18 plugins mount together and this plugin registers all five tools, with tool schemas and health-check contracts passing. Real Slack authorization, Socket Mode delivery and sending have not been verified.

Version 0.3.3 requires the official Socket Mode SDK 3.1 or newer, which supports Undici 7/8, and explicitly declares its transport dependency. This fixes combined installations that paired an older SDK with the host's Undici 8. Both language versions of this README are included in the npm package.

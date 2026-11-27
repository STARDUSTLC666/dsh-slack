# dsh-slack（fork：收件箱触发器）

> 本项目 fork 自 [STARDUSTLC666/dsh-slack](https://github.com/STARDUSTLC666/dsh-slack)，原作者 stardustlc，MIT 许可。本仓库基于上游 **0.6.1**。
>
> 我们只加了一件事：**收件箱触发器**——Slack 里有人 @ 机器人、或给它发私信时，自动唤醒一条 DSH 定时任务，让 agent 立刻处理；没有消息时不产生回合、不消耗 token。其余工具（发消息、读历史、传文件、表情回应、在线自检）与上游一致，用法见上游文档。

## 它解决什么

dsh-slack 把 Slack 消息收进一个进程内收件箱，但只有 agent 回合才会去消费它。想让它“随时能被叫醒”，常规做法是让一条定时任务每几分钟跑一次，绝大多数轮次都在空转。

这个 fork 在消息进收件箱后发一个宿主事件（`dsh-slack/inbox`），并用一个独立模块（`src/trigger.ts`）订阅它：命中 @ / 私信 / `app_mention` 时调用 DSH 的 `schedule` 服务，把一条已有任务立刻投递出去。任务本身保持 **paused**，不按点跑。

## 相对上游的改动

| 文件 | 改动 |
| :-- | :-- |
| `src/index.ts` | 消息进收件箱后 `ctx.emit('dsh-slack/inbox', message)`；apply 里装触发器 |
| `src/trigger.ts`（新增） | 订阅事件，命中时 `ctx.schedule.run({ id })`，60 秒合并窗口 |
| `src/config.ts`、`src/host-config.ts` | 新增 `botUserId`、`triggerTaskId` 两个配置字段 |
| `src/types.ts` | 给最小 Context 形状补上 `emit` / `get` |

除此之外没有改动上游逻辑。

## 安装

本仓库不发 npm，用本地目录安装：

```bash
# 1. 取代码
git clone https://github.com/itstartstosnow/dsh-slack-fork-trigger.git dsh-slack
# 2. 装进 profile（desktop 换成你的 profile 名）
dsh plugin --profile desktop add link:/绝对路径/dsh-slack
```

或在 DSH 插件页「添加插件」里填本地目录。装完重启一次 DSH。

profile 里原来从 npm 装的 `dsh-slack` 要先移除，否则两个同名包会打架。

## 配置

全部写在 `~/.dsh/profiles/<name>/cordis.patch.yml`：

```yaml
- id: slack
  config:
    token: 'xoxb-...'          # Bot User OAuth Token（OAuth & Permissions）
    appToken: 'xapp-...'       # App-Level Token，scope connections:write；Socket Mode 必须开启
    defaultChannel: '#general'
    botUserId: 'U0XXXXXXX'     # 机器人的 user id，auth.test 或 slack_health 能看到
    triggerTaskId: 'schedule-...'  # 要唤醒的定时任务 id
```

- `token` 决定能不能发消息；
- `appToken` 决定能不能收消息（Socket Mode），触发器依赖它；
- `triggerTaskId` 留空则关闭触发器，插件行为退化成上游。

`config` 是整体替换，这一行要写全所有字段。

## 创建被唤醒的任务

在 DSH 里新建一条定时任务，投递目标选「新建一个会话并复用」，然后立刻 **暂停**——它只由触发器投递。指令用这份：

```text
你是 Slack 值守助手。当 Slack 里有人 @ 你或给你发私信时，触发器会叫醒你；用户也可能直接在本地 DSH 对话里跟你对话。按以下规则执行：

1. 调用 slack_inbox（markRead=true，limit=20）取新消息。只看 @DSH Slack（用户 ID 填你的 botUserId）的提及和发给它的私信；@ 的是别的应用或别人的消息一律忽略，普通频道闲聊也忽略。

若没有需要处理的消息：什么都不做，输出「本轮无消息」后停止，不要写其他任何解释或回复。

2. 对每条消息用 slack_thread 读上下文，判断消息意图：
   - 仅需要回复（生成总结、问问题等）：先读 slack_history / slack_thread，再用 slack_reply 在线程里用中文简短回答，回完即结束。
   - 需要操作（修改或创建文件、执行命令、上传文件、往其他频道发消息）：暂不要执行，也不要把方案发到 Slack。把提案写成本轮的最终回复——就是你在这个 DSH 会话里的输出，内容包括：谁在哪个频道/线程提的、要做什么、涉及哪些文件或命令、影响范围、详细计划，最后问用户是否要确认执行。Slack 线程里则只需回复一句「需要执行操作，请到 DSH 里查看并确认」。
3. 每次唤醒检查本会话历史里是否已有对这些提案的确认（用户在 DSH 里直接回复的确认）还未执行。能对上号的才执行，执行完再回到对应 Slack 线程回报结果。没有确认就绝不动手。
4. 意图不明确时在 Slack 线程里问清楚。
```

把机器人 user id 换成实际值，任务 id 填进 `triggerTaskId`。

## 放开权限，让它直接在 Slack 上干活

上面那份指令只回复、不执行：需要动文件或跑命令时，只把方案写进 DSH 会话等你确认。

如果你就是要“Slack 上 @ 一句，它就动手”，把第 2 条里「暂不要执行…」那段换成允许直接调用工具，例如：

```text
   - 需要操作（修改或创建文件、执行命令、上传文件）：直接执行，执行完在对应 Slack 线程里回报结果。危险操作（删除、推送、对外发布、花钱）仍然先提案、等确认。
```

这时频道里任何能 @ 到机器人的人都能触发本机操作，成员越杂越要把这条边界写死。

## 工作方式

1. Slack 通过 Socket Mode 推来消息，dsh-slack 解析后入队，并 `emit('dsh-slack/inbox', message)`；
2. 触发器只认三类：`app_mention` 事件、正文里出现 `<@botUserId>`、私信频道（id 以 `D` 开头）；
3. 命中后按 60 秒窗口合并（与 `schedule` 的手动投递下限一致），到点调 `ctx.schedule.run({ id: triggerTaskId })`；
4. agent 在任务的会话里醒来，读 `slack_inbox`，按指令回复。

空闲时不产生任何回合，也不消耗 token。

## 限制

- 依赖 Socket Mode：`appToken` 缺失或连接断开时什么都收不到。
- 依赖 `schedule` 服务：没有它触发器只会 warn，不会唤醒任务。
- 收件箱在内存里，DSH 重启后其中未处理的消息会丢；Slack 侧历史仍在，可用 `slack_history` 补看。
- 线程与频道的一视同仁由 dsh-slack 的收件箱决定：它只收机器人所在会话的事件。

## 许可与致谢

MIT。原始版权归 stardustlc 与 [STARDUSTLC666/dsh-slack](https://github.com/STARDUSTLC666/dsh-slack) 的贡献者；本 fork 的改动同样以 MIT 发布。

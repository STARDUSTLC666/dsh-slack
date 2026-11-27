# dsh-slack (fork: inbox trigger)

> A fork of [STARDUSTLC666/dsh-slack](https://github.com/STARDUSTLC666/dsh-slack) by stardustlc, MIT licensed. Based on upstream **0.6.1**.
>
> It adds one thing: an **inbox trigger** — when someone mentions the bot or DMs it on Slack, a paused DSH schedule task is delivered immediately so the agent can answer; with no messages there are no turns and no tokens spent. Every other tool (notify, history, upload, reactions, health) behaves exactly as upstream; see the upstream docs for them.

## Why

dsh-slack queues incoming Slack messages in an in-process inbox that only an agent turn consumes. The usual workaround is a schedule task that runs every few minutes; almost every turn is idle.

This fork emits a host event (`dsh-slack/inbox`) whenever a message is queued, and a separate module (`src/trigger.ts`) subscribes to it: on a mention, a DM, or an `app_mention` event it calls DSH's `schedule` service and delivers an existing task immediately. The task itself stays **paused**.

## Changes against upstream

| File | Change |
| :-- | :-- |
| `src/index.ts` | `ctx.emit('dsh-slack/inbox', message)` after queueing; installs the trigger |
| `src/trigger.ts` (new) | Subscribes to the event and calls `ctx.schedule.run({ id })`, 60-second coalescing window |
| `src/config.ts`, `src/host-config.ts` | Two new config fields: `botUserId`, `triggerTaskId` |
| `src/types.ts` | Minimal context shape gains `emit` / `get` |

Nothing else about upstream behaviour is touched.

## Install

No npm package; install from the directory:

```bash
git clone https://github.com/itstartstosnow/dsh-slack-fork-trigger.git dsh-slack
dsh plugin --profile desktop add link:/absolute/path/dsh-slack
```

Or add the local directory from the DSH Plugins page. Restart DSH once afterwards. Remove the npm-installed `dsh-slack` first, or the two copies will fight over the same package name.

## Configure

`~/.dsh/profiles/<name>/cordis.patch.yml`:

```yaml
- id: slack
  config:
    token: 'xoxb-...'              # Bot User OAuth Token (OAuth & Permissions)
    appToken: 'xapp-...'           # App-Level Token with connections:write; Socket Mode must be on
    defaultChannel: '#general'
    botUserId: 'U0XXXXXXX'         # the bot's user id (auth.test / slack_health)
    triggerTaskId: 'schedule-...'  # the task to wake
```

`token` enables sending, `appToken` enables receiving (Socket Mode) and is required by the trigger, and an empty `triggerTaskId` turns the trigger off so the plugin behaves like upstream. A patch replaces the whole `config`: restate every field.

## Create the task to wake

Create a schedule task in DSH whose target is "new session, reused", then **pause** it — only the trigger delivers it. The prompt template is in the Chinese README; briefly: read `slack_inbox`, answer mentions and DMs in their threads, and for anything that needs files or commands, write a proposal in the DSH session instead of executing it.

Put the bot user id into the prompt and the task id into `triggerTaskId`.

## Letting it actually work from Slack

The recommended prompt is reply-only. To let a mention execute work directly, replace that branch with permission to call tools, keeping destructive actions proposal-only. Anyone who can mention the bot can then run local work, so keep channel membership tight.

## How it works

1. Slack pushes messages over Socket Mode; dsh-slack parses and queues them, then emits `dsh-slack/inbox`;
2. The trigger accepts three kinds: `app_mention` events, message text containing `<@botUserId>`, and DM channels (id starting with `D`);
3. Hits are coalesced over a 60-second window (the schedule service's manual delivery floor) and then delivered with `ctx.schedule.run({ id })`;
4. The agent wakes in the task's session, reads `slack_inbox`, and answers.

Idle time costs nothing: no turns, no tokens.

## Limits

- Requires Socket Mode; without `appToken` nothing arrives.
- Requires the `schedule` service; without it the trigger only warns.
- The inbox is in memory: unread messages are lost when DSH restarts (Slack history remains, readable with `slack_history`).
- Coverage is whatever dsh-slack's inbox sees: conversations the bot is a member of.

## License and credits

MIT. Original copyright belongs to stardustlc and the contributors of [STARDUSTLC666/dsh-slack](https://github.com/STARDUSTLC666/dsh-slack); this fork's changes are released under the same licence.

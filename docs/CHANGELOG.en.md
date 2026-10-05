# Historical release notes

[Current changelog](../CHANGELOG.md) · [Overview](../README.en.md)

These English notes preserve the earlier translations. The main changelog contains the consolidated version history.

## 0.3.4 (2026-10-05)

- Mark only displayed inbox messages as read, preserving unread entries and retry deduplication. Disable implicit send retries; missing receipts prompt channel inspection.

## 0.3.0 (2026-08-26)

- new `slack_health` self-check (one-call token / Socket Mode config health); fixed a startup crash from optional chaining when only some config fields are set (e.g. token without appToken).

## 0.2.3 (2026-08-15)

- `slack_channels` paginates automatically so large workspaces no longer lose channels after the first page.
  - `slack_inbox` deduplicates Slack's at-least-once event deliveries and drains atomically on `markRead`.
  - WebClient reuse avoids rebuilding clients on every tool call.
  - Pagination has a page cap to prevent loops from a misbehaving `next_cursor`.
  - Error mapping adds `not_authed` / `is_archived` / `msg_too_long` / `ratelimited`.

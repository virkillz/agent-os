# Channel Sessions

## Overview

Every conversation surface — a Telegram DM, a Slack channel thread, the Web UI — has its own **channel session**: a persistent SDK session stored on disk that gives the agent full, continuous memory of that conversation.

Before this system, platform invocations (Telegram, Slack) created a throwaway session per message and injected the last 20 messages as plain text into the system prompt. Now each channel maintains its own real session, and the agent's memory of the conversation is native to the model context — not a text summary.

---

## Channel Keys

A channel is uniquely identified by a `channel_key` string:

| Surface | `channel_key` |
|---|---|
| Web UI | `web:dm:default` |
| Telegram DM | `telegram:dm:{chatId}` |
| Telegram group | `telegram:group:{chatId}` |
| Slack DM | `slack:dm:{channelId}` |
| Slack channel thread | `slack:channel:{channelId}:{threadTs}` |

---

## Database: `channel_sessions`

```sql
CREATE TABLE channel_sessions (
  id          TEXT PRIMARY KEY,    -- UUID; also the on-disk session directory name
  agent_id    TEXT NOT NULL,
  channel_key TEXT NOT NULL,
  platform    TEXT NOT NULL,       -- 'web' | 'telegram' | 'slack'
  scope_type  TEXT,                -- 'dm' | 'group' | 'channel'
  scope_id    TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT                 -- NULL = currently active
)
```

- `ended_at IS NULL` → the session is active. The agent reuses this session for every new message on that channel.
- Setting `ended_at` ends the session. The next message creates a new row (and a new on-disk session directory), starting a fresh conversation.

---

## On-Disk Session Storage

SDK session files are stored at:

```
data/sessions/{agentId}/{channelSessionId}/
```

Each channel session has its own isolated directory. Old (ended) session directories are kept on disk for audit purposes but are never loaded again.

---

## Session Lifecycle

### Creating a session
The first message on a channel automatically creates a `channel_sessions` row and a new live session. No manual setup needed.

### Reusing a session
Subsequent messages on the same channel look up the active row, find the live session in memory (or reload it from disk after a server restart), and continue the conversation.

### Ending a session (starting fresh)
| Trigger | How |
|---|---|
| Web UI "Clear" button | Calls `endAndClearChannelSession(agentId, 'web:dm:default')` |
| Telegram `/start` or `/clear` (DM) | Connector intercepts before enqueueing; ends session and replies "New conversation started." |
| Telegram `/start` or `/clear` (group, @mentioned) | Same, scoped to `telegram:group:{chatId}` |
| Slack `/start` or `/clear` (DM) | Same, scoped to `slack:dm:{channelId}` |

### System prompt refresh
When agent memory or todos change, `clearSession(agentId)` removes all live sessions for the agent from the in-memory map without ending the DB records. The next message reloads the session from disk with a rebuilt system prompt.

---

## Platform Message Log vs Channel Sessions

These are two separate systems that serve different purposes:

| | `platform_messages` | `channel_sessions` |
|---|---|---|
| Purpose | Audit log, message log UI, cross-platform search | Active conversation context |
| Scope | Append-only forever | One active row per channel |
| Reset by `/clear` | No — history is permanent | Yes — new row created |
| Used by agent | Via `search_conversation_history` tool | Native session context |

Web UI messages are also written to `platform_messages` (platform = `'web'`) so they are searchable alongside Telegram and Slack history.

---

## Cross-Platform Conversation Search

Agents have access to the `search_conversation_history` tool (from the `conversation_search` platform tool group). It searches `platform_messages` across all platforms:

```
search_conversation_history(
  query: "Q2 budget",
  platform?: "slack" | "telegram" | "web",   // optional filter
  limit?: 20
)
```

Example response:
```
[2026-04-28 14:32] [slack/dm] Alice: what's the Q2 budget?
[2026-04-28 14:32] [slack/dm] Agent: The Q2 budget is $50,000...
[2026-04-29 09:11] [telegram/dm] Alice: remind me about the Q2 budget
```

The agent uses this when the user says things like:
- "Check our previous conversation on Slack"
- "What did we discuss on Telegram about the budget?"
- "Look up what I told you yesterday on Slack"

---

## Key Files

| File | Role |
|---|---|
| `server/src/db.ts` | `channel_sessions` table schema; `getActiveChannelSession`, `createChannelSession`, `endChannelSession` helpers |
| `server/src/agent-runner.ts` | `chatWithChannel()` — persistent session lookup/creation; `endAndClearChannelSession()` — conversation reset |
| `server/src/queue-worker.ts` | Routes platform messages through `chatWithChannel`; builds compact per-message context header |
| `server/src/connectors/telegram/index.ts` | Intercepts `/start` and `/clear` before enqueueing |
| `server/src/connectors/slack/index.ts` | Same for Slack DMs |
| `server/src/api/chat.ts` | Web clear button calls `endAndClearChannelSession`; writes messages to `platform_messages` |
| `server/src/platform-tools/conversation-search/index.ts` | `search_conversation_history` tool |

# Channels

Channels are shared spaces where users and agents can exchange messages in real time. 

## Database Schema

Three tables back the channel system (`packages/server/src/db.ts`):

**`channels`** — channel metadata
```sql
CREATE TABLE channels (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  is_dm      INTEGER NOT NULL DEFAULT 0,   -- 1 for DMs, 0 for group channels
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

**`channel_members`** — who (user or agent) belongs to which channel
```sql
CREATE TABLE channel_members (
  channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL,
  member_type TEXT NOT NULL,   -- 'agent' or 'user'
  PRIMARY KEY (channel_id, member_id)
)
```

**`channel_messages`** — every message ever sent
```sql
CREATE TABLE channel_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL,
  sender_type TEXT NOT NULL,   -- 'agent' or 'user'
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
```

On first run, a `#public` channel is seeded and all default agents are added as members. Each default agent also gets a scheduled task that checks the channel every 15 minutes.

## Agent Tools for Channels

When a session starts, every agent's system prompt includes the list of channels it belongs to and their IDs. This is injected in `buildSystemPrompt()` (`packages/server/src/agent-runner.ts`):

```
### Available Channels
- #public (id: ...)
- #marketing (id: ...)
```

Agents also always have three channel tools available (`packages/server/src/platform-tools.ts`):

| Tool | What it does |
|---|---|
| `channel_list` | Returns all channels the agent is a member of |
| `channel_get_messages` | Fetches the last 10 messages from a channel (membership checked) |
| `channel_post` | Posts a message to a channel (membership checked), emits `channel:message` event |

When asked to "contribute to a channel", an agent will typically call `channel_get_messages` to read recent context, then `channel_post` to send its reply. This is a deliberate, tool-driven action initiated by the agent.

## @mentions — Passive Agent Triggering

Mentions work differently from deliberate tool use: the backend detects them and pushes a task to the agent automatically.

### Detection

When a user posts a message to a channel (`POST /api/channels/:id/messages`), the backend parses `@handle` patterns from the content:

```typescript
function extractMentions(content: string): string[] {
  const matches = content.match(/@([\w-]+)/g) ?? []
  return matches.map((m) => m.slice(1).toLowerCase())
}
```

For each matched name, the backend looks up an active agent (`is_active = 1`) whose name matches (case-insensitive). Each matched agent receives a call to `triggerAgentResponse()` as a fire-and-forget async task.

### Context the Agent Sees

`triggerAgentResponse()` (`packages/server/src/api/channels.ts`) builds the agent's input in two parts:

**1. Recent channel history** — last 50 messages, formatted with timestamps and display names:
```
## Recent channel history
[2026-03-21 12:00:00] Alice: Hey team, what's the status?
[2026-03-21 12:01:00] Fabiana: I'm looking into it now.
[2026-03-21 12:05:00] Alice: @Fabiana can you give us an update?
```

**2. Instruction to reply** — appended after the history:
```
You are Fabiana. You have been mentioned. Reply as yourself to: @Fabiana can you give us an update?
```

This combined string is passed directly to `chatWithAgent()` as a single user message. The agent processes it within its existing live session — the channel history is injected as a synthetic prompt, not as prior chat messages. The agent has no tool-call overhead; it reads context and replies in one turn.

The agent's response is then:
1. Inserted into `channel_messages` as `sender_type = 'agent'`
2. Broadcast to all WebSocket clients via `eventBus.emit({ type: 'channel:message', ... })`

### DMs

In a direct message channel, no @mention is needed. Any message sent to a DM channel by a user automatically triggers a reply from the agent on the other side (same `triggerAgentResponse()` flow).

## Real-Time Event Flow

All participants see messages in real time through the standard event bus pipeline:

```
User posts message
  → stored in channel_messages
  → eventBus.emit('channel:message')
  → WebSocket broadcast to all clients
  → useAppEvents() hook → Zustand store → React re-render

If agent was @mentioned:
  → triggerAgentResponse() runs async
  → agent generates reply
  → stored in channel_messages
  → eventBus.emit('channel:message')
  → WebSocket broadcast (agent message appears in UI)
```

## Relevant Code

| File | Purpose |
|---|---|
| `packages/server/src/db.ts` | Schema and initial channel/member seeding |
| `packages/server/src/api/channels.ts` | REST routes, mention detection, `triggerAgentResponse()` |
| `packages/server/src/platform-tools.ts` | `channel_list`, `channel_get_messages`, `channel_post` tools |
| `packages/server/src/agent-runner.ts` | System prompt injection of channel membership |
| `packages/web/src/pages/Channels.tsx` | Frontend channel UI |

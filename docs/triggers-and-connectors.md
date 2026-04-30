# Triggers & Connectors

## 1. Overview

Agents behave like digital employees — reachable from multiple surfaces (web UI, Slack, Telegram) and invocable by both timers and humans. This document describes the unified architecture for all agent invocation paths.

---

## 2. Terminology

| Term | Definition |
|---|---|
| **Trigger** | A registered invocation source for an agent — a scheduler, a web UI chat session, a Slack DM conversation, a channel, etc. Each trigger is a persistent row in `agent_triggers`. |
| **Invocation** | A single act of waking an agent from a trigger and running a prompt through the AI harness |
| **Connector** | A long-running service that bridges an external platform (Slack, Telegram) to the trigger system |
| **Platform Message** | A message received from or sent to an external platform, stored in the DB |
| **Conversation Context** | The native conversation memory maintained by a persistent channel session for a given conversation surface |
| **Trigger Registry** | The `agent_triggers` table — the single source of truth listing every invocation source for every agent |

---

## 3. Trigger Types

```
Triggers
├── Scheduler          — cron timer fires
├── InternalChat       — user sends message via web UI
├── SlackDM            — Slack user DMs the agent's bot
├── SlackChannel       — agent @mentioned in Slack channel or thread
├── TelegramDM         — Telegram user messages the bot
└── TelegramGroup      — agent @mentioned in Telegram group
```

Every trigger, regardless of source, produces the same output: an **invocation** — a prompt sent to the agent with a constructed context.

### 3.1 What Triggers an Invocation vs What Is Only Stored

Not every platform event triggers agent invocation. Events are classified:

| Event | Triggers invocation? | Stored in DB? | Included in session context? |
|---|---|---|---|
| DM message | Yes | Yes | Yes (persistent DM session) |
| @mention in channel | Yes | Yes | Yes (new thread session) |
| @mention in thread | Yes | Yes | Yes (existing thread session) |
| Channel message (no mention) | No | Yes | No (not in any thread session) |
| Thread reply where agent has not participated | No | Yes | No (agent not in thread) |
| Thread reply where agent has previously participated | No* | Yes | Yes (agent is in thread session) |
| Reply to agent message (Telegram) | Yes | Yes | Yes (group session) |
| Reaction added/removed | No | Yes (`message_type = 'reaction'`) | No |

\* `auto_follow_threads` exists in the config schema but is not currently implemented in connector handlers. Agents only respond to explicit @mentions or replies to their own messages.

---

## 4. Trigger Registry

### 4.1 The `agent_triggers` Table

Every invocation source for every agent is a row in `agent_triggers`. This is the single place to list, inspect, enable/disable, and preview-prompt all triggers across all source types.

```sql
CREATE TABLE agent_triggers (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  -- 'scheduler' | 'internal_chat' | 'slack_dm' | 'slack_channel' | 'telegram_dm' | 'telegram_group'
  label         TEXT NOT NULL,     -- human-readable: "Daily Report", "Slack DM — @john", "#marketing"
  source_id     TEXT,              -- for type='scheduler': references agent_schedules.id
  platform      TEXT,              -- 'slack' | 'telegram' | NULL for internal triggers
  scope_type    TEXT,              -- 'dm' | 'channel' | 'group' | NULL
  scope_id      TEXT,              -- platform's channel/user/group ID
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_fired_at TEXT,
  fire_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_agent_triggers_agent ON agent_triggers(agent_id);
```

### 4.2 Row Lifecycle — How Triggers Are Created

| Event | Trigger row created |
|---|---|
| Agent is created or seeded | Auto-insert one `internal_chat` row |
| `agent_schedule` row created | Auto-insert one `scheduler` row linked via `source_id` |
| `agent_schedule` row deleted | Delete the corresponding `scheduler` trigger row |
| Integration config adds a Slack channel_id | Auto-insert one `slack_channel` row per channel |
| First message arrives from a new Slack/Telegram scope | Auto-insert platform trigger row (self-registering) |
| Integration deleted | Delete all associated platform trigger rows |

Scheduler triggers are always explicitly created. Platform triggers self-register on first contact — an operator doesn't need to pre-configure every possible Slack user who might DM the agent.

### 4.3 Linking Invocations to Triggers

The `invocation_queue` table references `agent_triggers`:

```sql
-- Add to invocation_queue:
trigger_id TEXT REFERENCES agent_triggers(id)
```

When an invocation completes successfully, the trigger row is updated:

```sql
UPDATE agent_triggers
SET last_fired_at = datetime('now'), fire_count = fire_count + 1
WHERE id = ?
```

This gives a full audit trail: trigger → invocation history → responses.

### 4.4 Prompt Preview

Every trigger can produce a preview of the exact prompt that would be constructed if it fired right now. This is the primary debugging and transparency tool.

```
GET /api/agents/:id/triggers/:tid/preview-prompt
```

Returns:
```json
{
  "system_prompt": "You are an AI agent working for Rascal Inc...",
  "trigger_context_addendum": "[Trigger Context — Scheduler]\nYou are running a scheduled task...",
  "trigger_prompt": "Generate the daily report...",
  "conversation_history": [],
  "history_window": 0
}
```

Notes per trigger type:
- **scheduler**: Shows the scheduler prompt text in `trigger_prompt`. `conversation_history` is always empty.
- **internal_chat**: Includes last 20 messages from `chat_messages` in `conversation_history`.
- **slack_\* / telegram_\***: Minimal preview — shows platform/scope info in `trigger_context_addendum`. Full conversation context is handled natively by the persistent channel session, not injected into the preview.

### 4.5 Trigger List Display

The agent UI shows a Triggers tab with one row per `agent_triggers` entry:

```
Triggers for Fabiana

TYPE         LABEL                           LAST FIRED    FIRED
─────────────────────────────────────────────────────────────────────
[scheduler]  Daily Report to Admin           2h ago        12x      [preview] [disable]
[scheduler]  Monitor #public every 15min     14m ago       847x     [preview] [disable]
[internal]   Web UI Chat                     1d ago        23x      [preview]
[slack_dm]   Slack DM — @john               3h ago        8x       [preview] [disable]
[slack_dm]   Slack DM — @alice              never         0x       [preview] [disable]
[slack_ch]   Slack — #marketing             5h ago        31x      [preview] [disable]
[tg_group]   Telegram — Marketing Team      2d ago        4x       [preview] [disable]
```

Clicking **preview** opens a modal with the full constructed prompt. Clicking **disable** sets `enabled = 0` on the trigger row, preventing future invocations from that source without deleting the conversation history.

---

## 5. Invocation Model

### 5.1 Unified Invocation Pipeline

Triggers follow one of two paths depending on the source:

**Platform triggers** (Slack, Telegram, Web UI) → `chatWithChannel()`:
```
chatWithChannel(agent, channelKey, platform, message, model, scopeType, scopeId) →
  1. Look up active channel_session for (agent_id, channel_key)
  2. Create new channel_session row + on-disk session directory if none exists
  3. Build system prompt  (platform prompt + identity + tools + memory + todos)
  4. Send message through persistent Pi SDK session (liveSessions map)
  5. Run prompt
  6. Return response
  7. Store outbound message to platform_messages
  8. Deliver response via connector.sendMessage()
```

**Scheduler triggers** → `invokeAgent()`:
```
invokeAgent(agent, prompt, model, opts) →
  1. Build system prompt  (platform prompt + identity + tools + memory + todos)
  2. Append systemPromptAddendum if provided (not used for schedulers)
  3. Wrap prompt with task delimiter
  4. Create fresh isolated Pi SDK session
  5. Run prompt
  6. Return response
  7. Clean up session (not persisted in liveSessions)
```

### 5.2 Session Strategy

| Trigger | Session |
|---|---|
| Scheduler | Fresh isolated session per run — no history needed |
| InternalChat | Persistent channel session (`web:dm:default`) |
| SlackDM | Persistent channel session per DM (`slack:dm:{channelId}`) |
| SlackChannel | Persistent channel session per thread (`slack:channel:{channelId}:{threadTs}`) |
| TelegramDM | Persistent channel session per DM (`telegram:dm:{chatId}`) |
| TelegramGroup | Persistent channel session per group (`telegram:group:{chatId}`) |

**Rationale:** Platform triggers (Slack, Telegram) use the same persistent channel session model as the web UI. Each conversation surface gets its own `channel_sessions` row and on-disk SDK session directory. The agent retains full native conversation memory across messages — history is not injected as plain text. See [channel-sessions.md](channel-sessions.md) for details.

### 5.3 Trigger Context Header

For platform triggers (Slack, Telegram), the queue worker prepends a compact one-line header to the user message so the agent knows who sent it and can reference the message ID for reactions. The channel session itself maintains full conversation memory — no history injection is needed.

```
[Slack #marketing | From: John Smith | msg_id:C12345678:1743254400.123456]
Can you pull last week's sales numbers?
```

```
[Telegram DM | From: John Smith | msg_id:123456789:42]
Can you break that down by region?
```

For scheduler triggers, the task prompt is wrapped with a task delimiter:

```
------------------------
Now your current task is:
[schedule prompt text]
```

Internal chat has no header (the web UI message is sent directly to the persistent `web:dm:default` channel session).

---

## 6. Conversation History Model

### 6.1 Principle

**All messages — incoming and outgoing — on all platforms are stored in the DB** in the `platform_messages` table. This serves as an audit log and enables cross-platform search.

For **platform triggers** (Slack, Telegram, Web UI), the agent uses **persistent channel sessions** (`channel_sessions` table). Each conversation surface has its own on-disk SDK session directory, giving the agent native conversation memory across messages. The `platform_messages` table is not used for context injection — the SDK session handles history natively.

For **scheduler triggers**, there is no conversation history — each run uses a fresh isolated session.

### 6.2 Conversation Scope

For persistent channel sessions, each conversation surface is identified by a `channel_key`:

| Platform | Situation | `channel_key` | Session directory |
|---|---|---|---|
| Web UI | Direct chat | `web:dm:default` | One session for all web chat |
| SlackDM | 1:1 with user | `slack:dm:{channelId}` | One session per DM |
| SlackChannel | @mention (creates thread) | `slack:channel:{channelId}:{threadTs}` | One session per thread |
| TelegramDM | 1:1 with user | `telegram:dm:{chatId}` | One session per DM |
| TelegramGroup | @mention in group | `telegram:group:{chatId}` | One session per group |

**Threading rule for Slack channels:** The agent always replies in a thread. If the @mention is not already in a thread, the agent's reply creates one (using the message `ts` as `thread_ts`). All subsequent conversation stays in that thread. This keeps channels clean and gives each conversation a focused scope.

### 6.3 Platform Messages as Audit Log

The `platform_messages` table stores every inbound and outbound message for audit, search, and the trigger preview endpoint. It is **not** injected into the agent's context window — the persistent channel session handles that natively.

Example query results:

```
[2026-03-22 09:00] john (user): Can you pull last week's sales numbers?
[2026-03-22 09:02] Fabiana (agent): Here are the numbers: ...
[2026-03-22 09:05] john (user): Can you break that down by region?
```

### 6.4 Configurable Window

The `history_window` config field exists in the connector config schema but is currently not used for context injection (since persistent channel sessions manage their own history). It may be used in future for limiting the `search_conversation_history` tool results.

### 6.5 Reactions in Context

Reactions are stored as `message_type = 'reaction'` in `platform_messages`. The `include_reactions_in_history` config field exists in the schema but reactions are not currently surfaced to the agent via the persistent session. They are available via the `search_conversation_history` tool.

### 6.6 Internal Tool: `get_conversation_history`

Agents can proactively query conversation history beyond what is injected. Useful for tasks like "summarize last week's discussion in #general."

```typescript
// Tool name: get_conversation_history
// Parameters:
{
  platform: 'slack' | 'telegram'
  scope_type: 'dm' | 'channel' | 'group'
  scope_id: string        // channel_id, chat_id, group_id, thread_id
  limit?: number          // default 50, max 200
  before?: string         // ISO timestamp — fetch messages before this time
  include_reactions?: boolean  // default false
}
// Returns:
{
  messages: Array<{
    sender: string
    sender_type: 'user' | 'agent'
    message_type: 'message' | 'reaction'
    content: string
    reply_to?: { sender: string; content: string }  // populated for quote-replies
    timestamp: string
  }>
  total_count: number
}
```

### 6.7 Agent Reaction Tool: `add_reaction`

Agents can add emoji reactions to platform messages. Useful for acknowledging receipt, expressing agreement, or signaling task completion without a text reply.

```typescript
// Tool name: add_reaction
// Parameters:
{
  platform: 'slack' | 'telegram'
  message_id: string   // external_msg_id of the platform message
  emoji: string        // e.g. '👍', '✅', '👀'
}
// Returns:
{
  success: true
}
```

Both platforms support this: Slack via `reactions.add`, Telegram via `setMessageReaction` (Bot API 7.0+).

---

## 7. Database Schema

### 7.1 Agent Triggers

See §4.1 for the full `agent_triggers` schema.

### 7.2 Agent Channels

Stores per-agent credentials and configuration for each external platform.

```sql
CREATE TABLE agent_channels (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,   -- 'slack' | 'telegram'
  config      TEXT NOT NULL,   -- JSON blob (see per-platform schema below)
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, platform)
);
```

**Slack config JSON:**
```json
{
  "app_token": "xapp-...",
  "bot_token": "xoxb-...",
  "dm_enabled": true,
  "channel_ids": ["C12345", "C67890"],
  "history_window": 20,
  "auto_follow_threads": false,
  "include_reactions_in_history": false
}
```

**Telegram config JSON:**
```json
{
  "bot_token": "123456:ABC-...",
  "dm_enabled": true,
  "group_ids": ["-1001234567890"],
  "history_window": 20,
  "auto_follow_threads": false,
  "include_reactions_in_history": false
}
```

### 7.3 Platform Messages

Stores all messages and reactions received from and sent to external platforms.

```sql
CREATE TABLE platform_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL,      -- 'slack' | 'telegram'
  message_type    TEXT NOT NULL DEFAULT 'message',  -- 'message' | 'reaction'
  direction       TEXT NOT NULL,      -- 'inbound' | 'outbound'
  scope_type      TEXT NOT NULL,      -- 'dm' | 'channel' | 'group'
  scope_id        TEXT NOT NULL,      -- channel_id, chat_id, group_id
  thread_id       TEXT,               -- Slack: thread_ts; Telegram: not used (NULL)
  external_msg_id TEXT,               -- platform's own message ID (for dedup and reply reference)
  reply_to_msg_id TEXT,               -- external_msg_id of quoted/replied-to message, if any
  sender_id       TEXT NOT NULL,      -- platform user ID or agent ID
  sender_name     TEXT NOT NULL,      -- display name at time of message
  sender_type     TEXT NOT NULL,      -- 'user' | 'agent'
  content         TEXT NOT NULL,      -- message text, or emoji name for reactions
  raw_payload     TEXT,               -- full JSON from platform (for debugging)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform, external_msg_id)   -- prevent duplicate processing
);

CREATE INDEX idx_platform_messages_scope
  ON platform_messages(agent_id, platform, scope_id, created_at);

CREATE INDEX idx_platform_messages_thread
  ON platform_messages(agent_id, platform, thread_id, created_at);
```

### 7.4 Invocation Queue

Manages queued invocations and tracks cooldown state per agent.

```sql
CREATE TABLE invocation_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trigger_id      TEXT REFERENCES agent_triggers(id),  -- which trigger fired this invocation
  trigger_type    TEXT NOT NULL,   -- 'scheduler' | 'internal_chat' | 'slack_dm' | 'slack_channel' | 'telegram_dm' | 'telegram_group'
  payload         TEXT NOT NULL,   -- JSON: all data needed to construct the invocation
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'processing' | 'done' | 'failed'
  retry_count     INTEGER NOT NULL DEFAULT 0,
  retry_after     TEXT,            -- ISO timestamp; NULL means ready to process
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at    TEXT
);

CREATE INDEX idx_invocation_queue_ready
  ON invocation_queue(agent_id, status, retry_after);

CREATE INDEX idx_invocation_queue_trigger
  ON invocation_queue(trigger_id, created_at);
```

---

## 8. Queue & Cooldown Mechanism

### 8.1 Per-Agent Invocation Queue

Each agent has its own invocation queue. This ensures:
- Messages are processed sequentially per agent (no concurrent invocations from the same agent)
- A burst of Slack messages doesn't spawn parallel agent runs
- Rate limit responses are handled gracefully with retry

### 8.2 Queue Worker

A single queue worker polls `invocation_queue` every few seconds:

```
1. SELECT pending rows WHERE retry_after IS NULL OR retry_after <= now()
   ORDER BY created_at ASC (FIFO per agent)
2. Group by agent_id, take one per agent (no parallel runs per agent)
3. Mark row as 'processing'
4. If platform trigger: run chatWithChannel() with persistent session + message header
   If scheduler trigger: run invokeAgent() with fresh isolated session
5. On success: mark 'done', store response, deliver via reply channel
6. On 429 from AI provider: mark back to 'pending', set retry_after = now() + cooldown
7. On hard error (>3 retries): mark 'failed', emit error event
```

### 8.3 Cooldown Strategy

When a 429 (rate limit) is received from the AI provider:

```
Retry 1:  wait 10s
Retry 2:  wait 30s
Retry 3:  wait 60s
Retry 4+: wait 120s, emit agent:warning event to notify operator
```

Cooldown is tracked at the invocation queue row level (`retry_after` + `retry_count`). There is no global per-agent lock — just row-level scheduling. Multiple agents can process concurrently; each agent is sequential.

Note: Platform-level rate limits (e.g. Slack's 1 message/sec per channel) are handled separately within the connector's `sendMessage` implementation, not in the invocation queue.

---

## 9. Connector Architecture

### 9.1 Connection Mode

**Slack: Socket Mode**

Socket Mode is used for both development and production. The Slack app opens a persistent WebSocket connection to Slack's servers — no public URL required. Slack's Bolt SDK handles reconnection automatically. This is the right fit because:
- This project is a persistent Node.js server, not a stateless/serverless deployment
- No public URL dependency simplifies both local dev and production setup
- Socket Mode is production-ready per Slack's own documentation

Config requires an App-Level Token (`xapp-...`) in addition to the bot token.

**Telegram: Long Polling**

Telegraf's built-in long polling is used. The bot repeatedly calls `getUpdates` with Telegram holding the request open until an update arrives, then immediately re-polls. No public URL needed. Simple and reliable for a persistent server. Webhook mode (requiring a public HTTPS URL) is not used.

### 9.2 File Structure

```
packages/server/src/connectors/
├── types.ts              — shared interfaces (Connector, InboundMessage, SlackChannelConfig, TelegramChannelConfig)
├── loader.ts             — starts/stops connectors based on DB config
├── slack/
│   ├── index.ts          — SlackConnector class (Socket Mode via Bolt)
│   ├── context.ts        — SlackTriggerMeta type
│   └── format.ts         — formats agent response as Slack markdown
└── telegram/
    ├── index.ts          — TelegramConnector class (long polling via Telegraf)
    ├── context.ts        — TelegramTriggerMeta type
    └── format.ts         — formats agent response for Telegram
```

### 9.3 Connector Interface

```typescript
interface Connector {
  platform: 'slack' | 'telegram'
  agentId: string
  start(): Promise<void>
  stop(): Promise<void>
  sendMessage(scopeId: string, threadId: string | null, text: string): Promise<void>
  addReaction(externalMsgId: string, emoji: string): Promise<void>
}
```

### 9.4 Connector Loader

On server startup, `connectorLoader.start()`:
1. Queries `agent_channels` for all enabled channels
2. Instantiates the appropriate `Connector` for each row
3. Calls `connector.start()` on each
4. Subscribes to `channel:config_updated` events to hot-reload connectors

When a channel is added/updated/removed via API, the loader stops the old connector (if any) and starts a new one.

### 9.5 Inbound Message Flow

```
[Slack Socket Mode / Telegram long poll] receives event
  ↓
Connector.handleEvent(event)
  ├─ Deduplicate via external_msg_id (UNIQUE constraint on platform_messages)
  ├─ Store inbound message to platform_messages
  │   ├─ Capture reply_to_msg_id if this is a quote-reply
  │   └─ Store thread_id (Slack thread_ts) if present
  ├─ Determine if agent should respond (see §3.1 table)
  │   ├─ DM: always
  │   ├─ Channel @mention: always
  │   ├─ Thread @mention: always
  │   ├─ Quote-reply to agent message: always
  │   ├─ Thread reply (agent participated, auto_follow_threads=true): yes
  │   └─ Reaction: never
  ├─ If responding: enqueue to invocation_queue with trigger context + prompt
  └─ Acknowledge to platform immediately (return control to polling loop)
  ↓
Queue worker picks up invocation
  ↓
chatWithChannel(agent, channelKey, platform, message, model, scopeType, scopeId)
  ├─ Look up active channel_session for (agent_id, channel_key)
  ├─ Create new channel_session row + on-disk session directory if none exists
  ├─ Build system prompt (includes global platform prompt + identity + tools + memory)
  ├─ Prepend compact message header with sender info and msg_id
  ├─ Send message through persistent Pi SDK session (liveSessions map)
  ├─ Store response to platform_messages (outbound)
  └─ Call connector.sendMessage(scope_id, thread_id, response)
```

---

## 10. Threading Behavior (Slack)

| Situation | Agent behavior |
|---|---|
| @mention in channel, no thread | Agent replies in a new thread on that message. All subsequent replies stay in that thread. |
| @mention inside an existing thread | Agent replies in that same thread. Thread root message is prepended to context. |
| Reply in agent's thread, no @mention, `auto_follow_threads=false` (default) | Stored, not responded to. |
| Reply in agent's thread, no @mention, `auto_follow_threads=true` | Treated as implicit mention; agent responds. |

Agents never post to the channel top-level in response to a message. This keeps channels clean.

---

## 11. Routing

Each agent integration has its own bot token — there is no shared bot across agents. Routing is implicit: a message arriving on Slack app token `xapp-abc` belongs to the agent whose integration holds that token.

For channels with multiple agents present: agents only respond when @mentioned by their bot username. If two agents are in the same channel and both are @mentioned in one message, both enqueue separate invocations and both respond in the same thread.

---

## 12. API Endpoints

```
# Trigger registry
GET    /api/agents/:id/triggers              — list all triggers for agent
GET    /api/agents/:id/triggers/:tid         — get single trigger
PATCH  /api/agents/:id/triggers/:tid         — enable/disable trigger
DELETE /api/agents/:id/triggers/:tid         — remove trigger (does not delete history)
GET    /api/agents/:id/triggers/:tid/preview-prompt  — preview constructed prompt

# Trigger invocation history
GET    /api/agents/:id/triggers/:tid/invocations     — list past invocations for trigger
       ?status=failed&limit=20

# Channels (manages connectors + creates trigger rows)
GET    /api/agents/:id/channels              — list channels for agent
POST   /api/agents/:id/channels              — create channel (starts connector)
GET    /api/agents/:id/channels/:cid         — get channel (tokens masked in response)
PATCH  /api/agents/:id/channels/:cid         — update config or enable/disable
DELETE /api/agents/:id/channels/:cid         — delete channel (stops connector)
POST   /api/agents/:id/channels/:cid/restart — restart connector

# Platform message log
GET    /api/agents/:id/platform-messages     — query stored platform messages
       ?platform=slack&scope_id=C123&thread_id=xxx&limit=50

# Invocation queue summary
GET    /api/agents/:id/invocations/summary   — queue status counts for agent
```

No webhook endpoints. Slack uses Socket Mode (outbound WebSocket); Telegram uses long polling.

---

## 13. Events

Add to `event-bus.ts`:

```typescript
| { type: 'connector:started'; agentId: string; platform: string }
| { type: 'connector:stopped'; agentId: string; platform: string }
| { type: 'connector:error'; agentId: string; platform: string; error: string }
| { type: 'invocation:queued'; agentId: string; triggerType: string; queueId: number }
| { type: 'invocation:completed'; agentId: string; triggerType: string; queueId: number }
| { type: 'invocation:failed'; agentId: string; triggerType: string; queueId: number; error: string }
| { type: 'invocation:rate_limited'; agentId: string; retryAfter: string }
```

---

## 14. Open Questions

1. **File/media attachments**: If a user sends an image or file in Slack/Telegram, how should the agent handle it? Store a reference, pass a URL to the agent?

2. **Cross-platform DM**: Can a user on Slack trigger an agent that responds on Telegram? Not planned — each integration is self-contained.

3. **Platform-level rate limits on outbound messages**: Slack enforces 1 msg/sec per channel. The connector's `sendMessage` handles this internally, separate from the AI provider cooldown in the invocation queue.

4. **Telegram thread support**: Telegram groups don't have threads the same way Slack does (only "topics" in supergroups). Scope for Telegram group conversations is the group itself, not a thread.

# Agent Lifecycle

Agents in agent-os are **reactive** — they run when triggered by one of several entry points. The `is_active` flag on each agent acts as a global kill switch: when `false`, the agent ignores all triggers.

---

## Trigger Matrix

| Trigger | Behavior |
|---------|----------|
| **Direct chat** | Always responds (unless `is_active = false`) |
| **Scheduler (cron fires)** | Enqueues to invocation queue → agent executes task prompt |
| **Slack DM / @mention** | Connector stores message → enqueues invocation → agent responds via Slack |
| **Telegram DM / @mention** | Connector stores message → enqueues invocation → agent responds via Telegram |
| **`is_active = false`** | Agent ignores all of the above |

---

## Triggering Paths

### 1. Direct Chat (Human → Agent)

The user opens an agent's chat page (`/agents/:id/chat`) and sends a message.

```
User types in AgentChat page
  → POST /api/agents/:id/chat { message }
  → chat.ts persists to chat_messages
  → chatWithAgent(agent, message, model)  — awaits reply
  → Pi SDK persistent session (liveSessions map)
  → agent:thinking → [LLM runs] → agent:reply → agent:idle
  → reply persisted to chat_messages
  → res.json({ reply })
```

This is the only **synchronous** path — the HTTP response waits for the full reply. It uses a **persistent session** per agent (`liveSessions` map in `agent-runner.ts`), so conversation context is retained across messages.

### 2. Scheduler (cron-based)

Defined per-agent in `agent_schedules`. The scheduler polls every 60 seconds.

```
setInterval (60s)
  → query agent_schedules WHERE enabled = 1 AND next_run_at <= now
  → for each due schedule:
      → check agent.is_active — skip if false
      → advance next_run_at (crash-safe — done before firing)
      → emit schedule:fired event (UI notification)
      → look up associated trigger row in agent_triggers
      → enqueueInvocation({ agentId, triggerId, triggerType: 'scheduler', prompt })
```

The enqueued invocation is picked up by the queue worker (see below).

### 3. External Platform (Slack / Telegram)

External messages arrive via connectors — long-running services that bridge Slack (Socket Mode) and Telegram (long polling) to the invocation queue.

```
[Slack Socket Mode / Telegram long poll] receives event
  → Connector normalizes to InboundMessage
  → Store inbound message to platform_messages table
  → Determine if agent should respond (DM: always, @mention: always, etc.)
  → If responding: enqueueInvocation() with trigger context + conversation scope
  → Queue worker picks up invocation
  → chatWithChannel() looks up/creates persistent channel session
  → Prepends compact message header with sender info
  → Persistent Pi SDK session runs the prompt (full conversation memory)
  → Response stored to platform_messages (outbound)
  → Connector delivers reply via platform API (sendMessage)
```

---

## Invocation Queue

All non-interactive triggers (scheduler, Slack, Telegram) flow through a unified invocation pipeline:

```
enqueueInvocation()
  → invocation_queue table (status: 'pending')
  → queue worker polls every 5s
  → picks one pending row per agent (no parallel runs per agent)
  → marks 'processing'
  → calls invokeAgent(agent, prompt, model, opts)
  → on success: marks 'done', updates trigger stats (last_fired_at, fire_count)
  → on error: retries with exponential backoff (10s → 30s → 60s → 120s, max 3 retries)
  → on hard failure: marks 'failed', emits invocation:failed event
```

The queue worker deduplicates — only one invocation per agent processes at a time.

---

## Session Model

There are two session strategies:

| Path | Session | Function |
|------|---------|----------|
| Direct chat | **Persistent channel session** — `web:dm:default` channel key, retains context across messages | `chatWithAgent()` → `chatWithChannel()` |
| Slack / Telegram | **Persistent channel session** — per-conversation surface (DM, thread, group), retains native context | `chatWithChannel()` |
| Scheduler | **Fresh isolated** — new session per invocation, never stored in `liveSessions` | `invokeAgent()` → `runScheduledTask()` |

All paths converge on `buildSystemPrompt()` in `agent-runner.ts` to assemble the system prompt from the layered composition (see [system-prompt.md](system-prompt.md)).

For platform triggers (Slack, Telegram), the queue worker prepends a **compact message header** with sender info and message ID to the user message, then routes through `chatWithChannel()` so the agent has full persistent conversation memory.

For scheduler triggers, the queue worker appends the task prompt with a `------------------------\nNow your current task is:` wrapper to a fresh isolated session.

- **Session creation**: `createLiveSession()` in `agent-runner.ts`
- **Session reset**: `clearSession()` evicts all live sessions for an agent from `liveSessions` — happens on error, agent update, or explicit `DELETE /api/agents/:id/chat`
- **Channel session reset**: `endAndClearChannelSession()` ends a specific `channel_sessions` row and evicts its live session — used by `/clear` or `/start` commands

The system prompt is assembled **once at session creation**. For persistent sessions, changes to memory, todos, or the platform prompt after creation won't reflect until the session is reset.

---

## `is_active` Flag

Setting `is_active = false` on an agent causes all trigger paths to skip it:

- Direct chat handler checks `is_active` before calling `chatWithAgent`
- Scheduler skips inactive agents before enqueuing
- Queue worker checks `is_active` before processing invocations

An inactive agent's persistent session remains in memory but is not invoked. Toggling back to `is_active = true` resumes normal behavior immediately.

---

## Summary

| Trigger | Who initiates | Async? | Session | Entry point |
|---------|---------------|--------|---------|-------------|
| Direct chat | Human via UI | No (awaits) | Persistent channel (`web:dm:default`) | `POST /api/agents/:id/chat` → `chatWithAgent()` |
| Scheduler | Clock (60s poll) | Yes (queued) | Fresh isolated | `scheduler.ts` → `invocation_queue` → `invokeAgent()` |
| Slack DM / @mention | External user | Yes (queued) | Persistent channel (per DM/thread) | Slack connector → `invocation_queue` → `chatWithChannel()` |
| Telegram DM / @mention | External user | Yes (queued) | Persistent channel (per DM/group) | Telegram connector → `invocation_queue` → `chatWithChannel()` |

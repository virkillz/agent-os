# Agent Lifecycle

Agents in rascal-inc are **reactive** — they run when triggered by one of four entry points. The `is_active` flag on each agent acts as a global kill switch: when `false`, the agent ignores all triggers.

---

## Trigger Matrix

| Trigger | Behavior |
|---------|----------|
| **DM** | Always responds (unless `is_active = false`) |
| **Group chat @mention** | Reads channel history → responds |
| **Group chat (no mention)** | Ignored |
| **Scheduler (cron fires)** | Reads `#public` history → decides whether to respond + works on todos |
| **`is_active = false`** | Agent ignores all of the above |

---

## Four Triggering Paths

### 1. Direct Message (Human → Agent)

The user opens a DM channel with the agent and sends a message.

```
User sends message in DM channel
  → POST /api/channels/:id/messages { content }
  → channels.ts persists message, detects agent is recipient
  → chatWithAgent(agent, message, model)           [fire-and-forget]
  → Pi SDK session.prompt(message)
  → agent:thinking → [LLM runs] → agent:reply → agent:idle
  → reply persisted to channel_messages
  → WS broadcasts channel:message event
```

### 2. Group Channel @mention

A message containing `@agentName` is posted to a group channel.

```
User posts "@alice can you research X" in #public
  → POST /api/channels/:id/messages { content }
  → channels.ts parses @mentions from content
  → for each mentioned agent:
      → fetch recent channel history (last N messages)
      → chatWithAgent(agent, contextualPrompt, model)   [fire-and-forget]
      → reply posted back to same channel
      → WS broadcasts channel:message event
```

The agent receives the full recent channel history as context, not just the triggering message.

### 3. Scheduler (cron-based)

Defined per-agent in `agent_schedules`. The scheduler polls every 60 seconds.

```
setInterval (60s)
  → query agent_schedules WHERE enabled = 1 AND next_run_at <= now
  → for each due schedule:
      → check agent.is_active — skip if false
      → check skip_if_no_todos — skip if true and todo list is empty
      → advance next_run_at (crash-safe — done before firing)
      → emit schedule:fired event (UI notification)
      → fetch recent #public channel history
      → chatWithAgent(agent, scheduledPrompt + channelContext, model)
      → reply persisted to channel_messages (posted to #public)
```

`skip_if_no_todos = true` is useful for agents whose scheduled runs only make sense when they have pending work. If the todo list is empty, the cron fires and exits immediately.

### 4. Direct Agent Chat (legacy path)

The original per-agent chat page (`/agents/:id/chat`) remains available as a direct interface to an agent, bypassing the channel system. This uses `chat_messages` rather than `channel_messages` and is kept for backward compatibility.

```
User types in AgentChat page
  → POST /api/agents/:id/chat { message }
  → chat.ts persists to chat_messages
  → chatWithAgent(agent, message, model)  — synchronous (awaits reply)
  → reply persisted to chat_messages
  → res.json({ reply })
```

This is the only **synchronous** path — the HTTP response waits for the full reply.

---

## Session Model

All paths converge on `chatWithAgent()` in `agent-runner.ts`. This function manages a **persistent Pi SDK session per agent** (the `liveSessions` map).

- **First call**: creates a new session (`createLiveSession`), assembles the system prompt from the 3-layer composition (see [system-prompt.md](system-prompt.md)).
- **Subsequent calls**: reuses the existing session — the LLM retains conversation context across all trigger types.
- **Session reset**: happens on explicit `DELETE /api/agents/:id/chat` or on error.

The system prompt is assembled **once at session creation**. If memory, todos, or role assignments change after a session is live, those changes won't reflect until the session is reset.

---

## `is_active` Flag

Setting `is_active = false` on an agent causes all trigger paths to skip it:

- DM handler checks `is_active` before calling `chatWithAgent`
- Group chat @mention handler skips inactive agents during mention resolution
- Scheduler skips inactive agents before firing

An inactive agent's sessions remain in memory but are not invoked. Toggling back to `is_active = true` resumes normal behavior immediately.

---

## Summary

| Trigger | Who initiates | Async? | Channel? | Entry point |
|---------|---------------|--------|----------|-------------|
| DM | Human via UI | Yes | DM channel | `POST /api/channels/:id/messages` |
| @mention | Human via UI | Yes | Group channel | `POST /api/channels/:id/messages` |
| Scheduler | Clock (60s poll) | Yes | #public | `scheduler.ts` setInterval |
| Direct chat | Human via UI | No (awaits) | chat_messages | `POST /api/agents/:id/chat` |

# Agent Messaging & Self-Scheduling

## Problem Statement

Agents currently have no way to:
1. Send a message directly to a human user (e.g., "send daily report to admin")
2. Create their own schedules at runtime (e.g., "remind me to do X every morning")

This document covers how to implement both capabilities.

---

## Part 1: Admin / Owner Identity

### Decision

**Admin = Owner. There is exactly one admin in the system.**

The `users` table already has `is_admin BOOLEAN`. The `/setup` endpoint creates the first (and only) admin. The system must enforce that only one admin can ever exist — attempting to promote a second user to admin is rejected.

When agents refer to "admin" or "owner" they mean the same person: `SELECT * FROM users WHERE is_admin = 1`.

### Enforcement

In `api/users.ts`, on any route that creates a user or sets `is_admin=1`, add a guard:

```typescript
const existingAdmin = db.prepare("SELECT id FROM users WHERE is_admin = 1").get();
if (existingAdmin) {
  return res.status(409).json({ error: "An admin already exists. The system only supports one admin." });
}
```

This applies to:
- `POST /setup` — already only runs once (returns 409 if any user exists), so no change needed here
- `POST /api/users` (create user by admin) — new users are never admin, so no change needed
- Any future "promote to admin" route — must check this guard first

### How tools resolve "admin"

Any tool that needs to find the admin simply queries:
```typescript
const admin = db.prepare("SELECT id, display_name FROM users WHERE is_admin = 1").get();
```

No extra settings key, no `is_owner` column needed.

---

## Part 2: `send_direct_message` Tool

### What it does

An agent calls this tool to send a message to a human user. It:
1. Resolves the target user (defaults to owner if no user specified)
2. Finds or creates a DM channel between the agent and that user
3. Posts the message to that channel
4. Emits a WebSocket event so the user sees it in real-time

### Safety constraint

To prevent agent-to-agent infinite loops, this tool **only allows sending to human users** (`users` table). Sending to another agent ID is rejected.

### Tool Interface

```typescript
// Tool name: send_direct_message
// Parameters:
{
  message: string;          // The message content (required)
  user_id?: string;         // Target user ID. Defaults to owner if omitted.
}
// Returns:
{
  success: true;
  channel_id: string;       // The DM channel that was used
  message_id: number;
}
```

### Backend Implementation

**File: `packages/server/src/platform-tools.ts`**

Add `send_direct_message` to `buildAgentTools()`:

```typescript
send_direct_message: {
  description: "Send a direct message to a human user. Use this to notify humans of results, reports, or alerts. Can only message human users, not other AI agents. If no user_id is provided, defaults to the workspace owner.",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "The message to send" },
      user_id: { type: "string", description: "Target user ID. Omit to send to workspace owner." }
    },
    required: ["message"]
  },
  handler: async ({ message, user_id }) => {
    const db = getDb();

    // Resolve target user — defaults to the single admin
    let targetUserId = user_id;
    if (!targetUserId) {
      const admin = db.prepare("SELECT id FROM users WHERE is_admin = 1").get() as { id: string } | undefined;
      if (!admin) throw new Error("No admin user found. Please complete setup.");
      targetUserId = admin.id;
    }

    // Verify target is a human user (not an agent) — prevent loops
    const targetUser = db.prepare("SELECT id, display_name FROM users WHERE id=?").get(targetUserId) as { id: string; display_name: string } | undefined;
    if (!targetUser) throw new Error(`User ${targetUserId} not found. Note: you can only message human users, not agents.`);

    // Find or create DM channel between this agent and the user
    const channelId = findOrCreateDmChannel(db, agentId, 'agent', targetUserId, 'user');

    // Insert the message
    const result = db.prepare(
      "INSERT INTO channel_messages (channel_id, sender_id, sender_type, content) VALUES (?, ?, 'agent', ?)"
    ).run(channelId, agentId, message);

    // Get agent name for event
    const agent = db.prepare("SELECT name FROM agents WHERE id=?").get(agentId) as { name: string };

    // Emit WebSocket event
    eventBus.emit({
      type: 'channel:message',
      channelId,
      senderId: agentId,
      senderType: 'agent',
      senderName: agent.name,
      content: message,
      messageId: result.lastInsertRowid as number
    });

    return { success: true, channel_id: channelId, message_id: result.lastInsertRowid };
  }
}
```

**Helper: `findOrCreateDmChannel(db, id1, type1, id2, type2)`**

Add to `platform-tools.ts` (or a shared `db-helpers.ts`):

```typescript
function findOrCreateDmChannel(db, agentId: string, agentType: string, userId: string, userType: string): string {
  // Find existing DM channel with both members
  const existing = db.prepare(`
    SELECT cm1.channel_id
    FROM channel_members cm1
    JOIN channel_members cm2 ON cm1.channel_id = cm2.channel_id
    JOIN channels c ON c.id = cm1.channel_id
    WHERE c.is_dm = 1
      AND cm1.member_id = ? AND cm1.member_type = ?
      AND cm2.member_id = ? AND cm2.member_type = ?
  `).get(agentId, agentType, userId, userType) as { channel_id: string } | undefined;

  if (existing) return existing.channel_id;

  // Create new DM channel
  const channelId = crypto.randomUUID();
  db.prepare("INSERT INTO channels (id, name, is_dm) VALUES (?, '', 1)").run(channelId);
  db.prepare("INSERT INTO channel_members (channel_id, member_id, member_type) VALUES (?, ?, ?)").run(channelId, agentId, agentType);
  db.prepare("INSERT INTO channel_members (channel_id, member_id, member_type) VALUES (?, ?, ?)").run(channelId, userId, userType);

  return channelId;
}
```

### Tool Documentation (injected into system prompt)

Add to the tools documentation block in `buildSystemPrompt()`:

```
## send_direct_message
Send a direct message to a human user. Use this to proactively notify the workspace owner or a specific user about reports, alerts, or task completions. You cannot message other AI agents with this tool.

Parameters:
- message (required): The message content
- user_id (optional): Target user ID. If omitted, message goes to the workspace owner/admin.

Example: If asked to "send a daily report to admin", call send_direct_message with just the message — no user_id needed.
```

---

## Part 3: `create_schedule` Tool

### What it does

An agent calls this tool to create a recurring scheduled task for itself. It:
1. Validates the cron expression
2. Inserts a new `agent_schedules` row for the calling agent
3. The scheduler picks it up on its next 60-second poll

By default it creates the schedule **for itself** (the calling agent). There is no parameter to schedule another agent — that avoids cross-agent side-effects.

### Tool Interface

```typescript
// Tool name: create_schedule
// Parameters:
{
  label: string;             // Human-readable name, e.g. "Daily report to admin"
  cron: string;              // Cron expression, e.g. "0 11 * * *" (daily at 11am)
  prompt: string;            // The task prompt to run on schedule
}
// Returns:
{
  success: true;
  schedule_id: number;
  next_run_at: string;       // ISO timestamp of first scheduled run
}
```

### Backend Implementation

**File: `packages/server/src/platform-tools.ts`**

Add `create_schedule` to `buildAgentTools()`:

```typescript
create_schedule: {
  description: "Create a recurring scheduled task for yourself. Use this to set up reports, reminders, or recurring actions on a cron schedule.",
  parameters: {
    type: "object",
    properties: {
      label:  { type: "string", description: "A short name for this schedule, e.g. 'Daily report to admin'" },
      cron:   { type: "string", description: "Cron expression, e.g. '0 11 * * *' for daily at 11am UTC" },
      prompt: { type: "string", description: "The task instructions that will run on this schedule" }
    },
    required: ["label", "cron", "prompt"]
  },
  handler: async ({ label, cron, prompt }) => {
    // Validate cron expression
    let nextRun: Date;
    try {
      const parsed = CronExpressionParser.parse(cron);
      nextRun = parsed.next().toDate();
    } catch {
      throw new Error(`Invalid cron expression: "${cron}". Example: "0 11 * * *" for daily at 11am.`);
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO agent_schedules (agent_id, cron, prompt, label, enabled, next_run_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(agentId, cron, prompt, label, nextRun.toISOString());

    // Emit event so frontend schedule list updates in real-time
    eventBus.emit({ type: 'schedule:created', agentId, scheduleId: result.lastInsertRowid as number, label });

    return {
      success: true,
      schedule_id: result.lastInsertRowid,
      next_run_at: nextRun.toISOString()
    };
  }
}
```

**Note:** `CronExpressionParser` is already imported in `scheduler.ts` — move it to a shared utility or import in platform-tools.

### Tool Documentation (injected into system prompt)

Add to the tools documentation block in `buildSystemPrompt()`:

```
## create_schedule
Create a recurring scheduled task for yourself. The task will run automatically on the specified cron schedule.

Parameters:
- label (required): A short descriptive name, e.g. "Daily sales report"
- cron (required): A standard 5-field cron expression (minute hour day month weekday).
  Common examples:
    "0 11 * * *"    — every day at 11:00 AM UTC
    "0 9 * * 1"     — every Monday at 9:00 AM UTC
    "0 */4 * * *"   — every 4 hours
    "30 8 1 * *"    — 1st of every month at 8:30 AM UTC
- prompt (required): The task instructions that will run at each scheduled time

Example: If asked to "send report to admin via DM everyday at 11", create a schedule with:
  label: "Daily report to admin"
  cron: "0 11 * * *"
  prompt: "Generate a brief status report and send it to the admin using send_direct_message."
```

---

## Part 4: EventBus Addition

Add `schedule:created` to the `AppEvent` union in `event-bus.ts`:

```typescript
| { type: 'schedule:created'; agentId: string; scheduleId: number; label: string }
```

The frontend `useAppEvents()` handler should call `store.loadSchedules(agentId)` when this event fires, so the agent's schedule list refreshes without a page reload.

---

## Part 5: Frontend — DM Notifications

The user needs to know when an agent has sent them a DM.

### Notification Badge

The existing `channel:message` WebSocket event already fires for DM messages. The frontend needs to:

1. Track unread DM channels in Zustand store (e.g., `unreadDmChannels: Set<string>`)
2. On `channel:message` event, if `channelId` is a DM channel and the user is not currently viewing it, increment unread count
3. Show a badge on the navigation icon for DMs/Channels

### DM Inbox

The Channels page (`AgentChat.tsx` or a dedicated page) should surface DM conversations. The existing channel list API already returns `is_dm` — filter these out and display them separately as "Direct Messages."

---

## Part 6: End-to-End Example

**User prompt to agent:** *"Send a daily report to admin via DM every day at 11am"*

**Agent execution:**

1. Agent calls `create_schedule`:
   ```json
   {
     "label": "Daily report to admin",
     "cron": "0 11 * * *",
     "prompt": "Generate a brief status summary of your current todos and recent activity. Then use send_direct_message to deliver it to the admin."
   }
   ```
   → Schedule row created, `next_run_at` set to next 11:00 AM UTC.
   → `schedule:created` event emitted, frontend refreshes schedules list.

2. At 11:00 AM UTC, scheduler fires the schedule, calls `runScheduledTask()` with the prompt.

3. Within that task session, agent calls `send_direct_message`:
   ```json
   {
     "message": "Good morning! Here's your daily status report:\n\n- 3 open todos\n- Completed: 'Write blog post'\n..."
   }
   ```
   → System queries `SELECT id FROM users WHERE is_admin = 1`.
   → Finds or creates DM channel between this agent and the admin.
   → Inserts message into `channel_messages`.
   → Emits `channel:message` event → frontend shows notification badge.

4. User opens DMs, reads the report.

---

## Implementation Checklist

### Backend
- [ ] `api/users.ts`: Enforce single-admin constraint on setup/create routes
- [ ] `scheduler.ts`: Remove `skip_if_no_todos` logic
- [ ] `db.ts`: Remove `skip_if_no_todos` column from schema and `ScheduleRow` type
- [ ] `api/schedules.ts`: Remove `skip_if_no_todos` from PATCH allowed fields
- [ ] `platform-tools.ts`: Add `send_direct_message` tool with user validation and DM channel creation
- [ ] `platform-tools.ts`: Add `create_schedule` tool with cron validation
- [ ] `platform-tools.ts`: Add `findOrCreateDmChannel()` helper
- [ ] `event-bus.ts`: Add `schedule:created` event type

### Frontend
- [ ] `api.ts`: Remove `skip_if_no_todos` from `Schedule` type and API helpers
- [ ] `store.ts`: Remove `skip_if_no_todos` from `patchSchedule` type; add `unreadDmChannels` state + handle `schedule:created` event
- [ ] `AgentSettings.tsx`: Remove all `skip_if_no_todos` UI (toggle in form, edit form, and schedule list row)
- [ ] `useAppEvents.ts`: Handle `schedule:created` → reload schedules for agent
- [ ] Channels/DM UI: Surface DM conversations separately from group channels
- [ ] Navigation: Show unread badge when agent sends a DM

### System Prompt
- [ ] `agent-runner.ts`: Add `send_direct_message` and `create_schedule` docs to tools section of `buildSystemPrompt()`

---

## Open Questions

1. **Timezone for cron**: Should cron be interpreted in UTC or the server's local timezone? Currently the scheduler uses `new Date()` (server local). Consider adding a `timezone` parameter to `create_schedule` or document that all crons are UTC.

2. **Schedule deletion/management by agent**: Should agents also be able to list and delete their own schedules? This could be useful but adds surface area. Defer to Phase 2 of this feature.

3. **Rate limiting**: Should there be a limit on how many schedules an agent can create? Without limits, a misbehaving agent could create thousands of schedules. Consider a per-agent max (e.g., 20) enforced in the tool handler.

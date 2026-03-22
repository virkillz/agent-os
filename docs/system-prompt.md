# Agent System Prompt Composition

Every AI agent's system prompt is assembled from three layers, evaluated in order, plus a dynamic injection of memory and todos at session start.

---

## The 3 Layers

```
┌─────────────────────────────────────────────────────┐
│  Layer 1 — Platform Prompt                          │
│  Applied to all agents. Contains {company_name}     │
│  and {working_directory}. References SOP.md.        │
├─────────────────────────────────────────────────────┤
│  Layer 2 — Role Prompt(s)                           │
│  From roles assigned to this agent. Multiple roles  │
│  are concatenated in assignment order.              │
├─────────────────────────────────────────────────────┤
│  Layer 3 — Identity Prompt                          │
│  The agent's own system_prompt field. Personal      │
│  voice, focus, quirks, working style.               │
├─────────────────────────────────────────────────────┤
│  Dynamic — Memory + Todos                           │
│  Injected at session creation. Current memories     │
│  and open todo items appended as context.           │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1 — Platform Prompt

Stored in the `settings` table under the key `platform_prompt`. Editable by admins in Settings → Workspace.

Default template:

```
You are an AI agent working for {company_name}. You have access to the working directory at {working_directory}. Follow the Standard Operating Procedure in SOP.md and your job description.
```

The `{company_name}` and `{working_directory}` placeholders are interpolated at session creation time.

**SOP.md** lives at `workspace/SOP.md`. It is a plain file — no special handling. Agents read it through their filesystem tools when the platform prompt directs them to.

---

## Layer 2 — Role Prompt

Roles are defined in the `roles` table and assigned to agents via the `agent_roles` junction table. Each role has:

- `name` — display name (e.g. "Writer", "Editor")
- `description` — shown in the UI
- `prompt` — injected into the system prompt

An agent can hold multiple roles. Their prompts are concatenated in assignment order. If an agent has no roles, this layer is empty.

### Default Tech Magazine Roles

The platform seeds these roles on first run:

| Role | Purpose |
|------|---------|
| Writer | Drafts articles, posts, and copy |
| Editor | Reviews and refines written content |
| Researcher | Gathers information, summarizes sources |
| Publisher | Schedules and publishes finalized content |
| Art Director | Directs visual style, prompts image generation |

---

## Layer 3 — Identity Prompt

The agent's `system_prompt` field. This is the most specific layer — it defines the agent's individual voice, personality, focus area, and working style. It should complement rather than duplicate the role prompt.

Example for an agent named "Alex" assigned the Writer role:

```
You are Alex, a tech journalist with a dry wit and a weakness for obscure analogies.
You write in first person. You prefer short punchy sentences.
You never use the word "utilize".
```

---

## Dynamic Context — Memory + Todos

Appended to the assembled system prompt at session creation (not on every message):

```
## Your Memory
- [remembered fact 1]
- [remembered fact 2]

## Your Open Todos
- [ ] [todo item 1]
- [ ] [todo item 2]
```

If memory and todos are both empty, this section is omitted.

Because this is injected once at session creation, changes to memory or todos after a session is live won't be visible to the agent until the session is reset (via `DELETE /api/agents/:id/chat`).

---

## Assembly in Code

The full prompt is assembled in `agent-runner.ts` → `buildSystemPrompt(agent)`:

```typescript
// Pseudocode
const platform = interpolate(settings.platform_prompt, { company_name, working_directory })
const roles    = agent.roles.map(r => r.prompt).join('\n\n')
const identity = agent.system_prompt

const memory   = formatMemory(agent.memories)
const todos    = formatTodos(agent.todos)

return [platform, roles, identity, memory, todos].filter(Boolean).join('\n\n---\n\n')
```

---

## Editing Prompts

| What to change | Where |
|----------------|-------|
| Platform-wide behavior | Settings → Workspace → Platform Prompt |
| Job function behavior | Roles page → edit role prompt |
| Individual agent personality | Roster → agent edit → System Prompt |
| Company policy | `workspace/SOP.md` (file in workspace) |

# Agent System Prompt Composition

Every AI agent's system prompt is assembled from multiple layers by `buildSystemPrompt()` in `agent-runner.ts`. The prompt is built once at session creation.

---

## Prompt Layers

```
┌─────────────────────────────────────────────────────┐
│  Layer 1 — Identity Prompt                          │
│  The agent's own system_prompt field. Personal      │
│  voice, focus, quirks. Supports {working_directory} │
│  and {project_dir} interpolation.                   │
├─────────────────────────────────────────────────────┤
│  Layer 2 — Role Prompt(s)                           │
│  From roles assigned to this agent. Multiple roles  │
│  are concatenated, each prefixed with "## Role:".   │
├─────────────────────────────────────────────────────┤
│  Layer 3 — Tools Block                              │
│  "How You Work" section describing available        │
│  platform tools and plugin tools.                   │
├─────────────────────────────────────────────────────┤
│  Layer 4 — Directory                                │
│  List of all agents on the platform (name, id,      │
│  role) for team awareness.                          │
├─────────────────────────────────────────────────────┤
│  Layer 5 — Memory                                   │
│  Persistent memory entries for this agent.          │
├─────────────────────────────────────────────────────┤
│  Layer 6 — Open Todos                               │
│  Current open todo items for this agent.            │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1 — Identity Prompt

The agent's `system_prompt` field from the database. This is the most foundational layer — it defines the agent's name, personality, focus area, and working style.

Two template variables are interpolated at session creation:
- `{working_directory}` — resolves to the workspace directory path (`data/workspace/`)
- `{project_dir}` — resolves to the parent of the workspace directory (the data dir)

Example for the default agent "Clive":

```
You are Clive, the Tech Support agent for this platform. You have full access to the agentos source code located at {project_dir}.
```

---

## Layer 2 — Role Prompt(s)

Roles are defined in the `roles` table and assigned to agents via the `agent_roles` junction table. Each role has:

- `name` — display name (e.g. "Writer", "Editor")
- `description` — shown in the UI
- `prompt` — injected into the system prompt

An agent can hold multiple roles. Each role's prompt is prefixed with `## Role: <name>` and concatenated. If an agent has no roles, this layer is empty.

### Default Roles

The platform seeds these roles on first run:

| Role | Purpose |
|------|---------|
| Writer | Drafts articles, posts, and copy |
| Editor | Reviews and refines written content |
| Researcher | Gathers information, summarizes sources |
| Publisher | Schedules and publishes finalized content |
| Art Director | Directs visual style, prompts image generation |

---

## Layer 3 — Tools Block

A `## How You Work` section describing the agent's available tools. This is assembled from two sources:

1. **Platform tools** — built-in tool groups (memory, todos, scheduling, agent-mgmt, platform-comms, messaging, board). Each group provides a `systemPrompt()` section describing its tools. Active tools = defaults + agent's `model_config.tools`, minus `model_config.disabledTools`.

2. **Plugin tools** — dynamically loaded plugins (e.g. elevenlabs, gemini-image, remotion). Listed as `### Plugin Tools` with name and description for each.

---

## Layer 4 — Directory

A `## Directory` section listing all agents on the platform:

```
## Directory

### Available Team Members
- Fabiana (id: abc-123) — Assistant
- Clive (id: def-456) — Tech Support
```

This gives each agent awareness of other team members for collaboration and delegation.

---

## Layer 5 — Memory

Persistent memory entries from the `agent_memory` table, formatted as:

```
## Your Memory
- [remembered fact 1]
- [remembered fact 2]
```

If the agent has no memory entries, this section is omitted.

---

## Layer 6 — Open Todos

Open (uncompleted) todo items from the `agent_todos` table, formatted as:

```
## Your Open Todos
[1] Write the Q1 summary
[2] Review Alice's draft
```

Each item is prefixed with its database ID so the agent can reference it when completing tasks. If there are no open todos, this section is omitted.

---

## Assembly in Code

The full prompt is assembled in `agent-runner.ts` → `buildSystemPrompt(agent, workspaceDir)`:

```typescript
// Simplified from actual implementation
const identityBlock = agent.system_prompt
  .replace(/{working_directory}/g, workspaceDir)
  .replace(/{project_dir}/g, path.dirname(workspaceDir))

const roleBlock = roles.map(r => `## Role: ${r.name}\n${r.prompt}`).join('\n\n')

const toolsBlock = `## How You Work\n\n...` + toolSections.join('\n\n')

const agentsBlock = `## Directory\n\n### Available Team Members\n` + agents.map(...)

const memoryBlock = `## Your Memory\n` + memories.map(m => `- ${m.content}`).join('\n')

const todoBlock = `## Your Open Todos\n` + todos.map(t => `[${t.id}] ${t.text}`).join('\n')

return [identityBlock, roleBlock, toolsBlock, agentsBlock, memoryBlock, todoBlock]
  .filter(Boolean)
  .join('\n\n')
```

---

## Platform Prompt Addendum

For non-interactive triggers (Slack, Telegram), the queue worker appends a **system prompt addendum** after the base prompt. This addendum contains:

- Trigger context (platform, scope, sender info)
- Conversation history (last N messages from `platform_messages` table)

This addendum is not part of `buildSystemPrompt()` — it's appended by the queue worker via the `systemPromptAddendum` option on `invokeAgent()`.

---

## Editing Prompts

| What to change | Where |
|----------------|-------|
| Individual agent personality | Roster → agent → Settings → System Prompt |
| Job function behavior | Settings → Roles → edit role prompt |
| Platform-wide behavior | Settings → Prompt (global platform prompt) |
| Company policy | `workspace/SOP.md` (file in workspace — agents read it via filesystem tools) |

---

## Staleness

Because memory, todos, and the directory are injected once at session creation, changes made after a persistent session is live won't be visible to the agent until the session is reset (via `DELETE /api/agents/:id/chat` or on error). Fresh sessions (scheduler, Slack, Telegram) always get the latest state.

# Agent System Prompt Composition

Every AI agent's system prompt is assembled from multiple layers by `buildSystemPrompt()` in `agent-runner.ts`. The prompt is built once at session creation.

---

## Prompt Layers

```
┌─────────────────────────────────────────────────────┐
│  Layer 0 — Platform Prompt (global base)            │
│  Global platform_prompt from settings. Applied to   │
│  all agents. Supports {working_directory} and       │
│  {project_dir} interpolation.                       │
├─────────────────────────────────────────────────────┤
│  Layer 1 — Identity Prompt                          │
│  The agent's own system_prompt field. Personal      │
│  voice, focus, quirks. Supports {working_directory} │
│  and {project_dir} interpolation.                   │
├─────────────────────────────────────────────────────┤
│  Layer 2 — Tools Block                              │
│  "How You Work" section describing available        │
│  platform tools and plugin tools.                   │
├─────────────────────────────────────────────────────┤
│  Layer 3 — Memory                                   │
│  Persistent memory entries for this agent.          │
├─────────────────────────────────────────────────────┤
│  Layer 4 — Open Todos                               │
│  Current open todo items for this agent.            │
└─────────────────────────────────────────────────────┘
```

---

## Layer 0 — Platform Prompt

A global platform-wide prompt stored in the `settings` table under `platform_prompt`. Applied to **all** agents as the base layer. Supports the same template variables as the identity prompt.

Default if unset:

```
You are an AI agent. You have access to the working directory at {working_directory}.
```

Set via **Settings → Prompt** in the web UI.

---

## Layer 1 — Identity Prompt

The agent's `system_prompt` field from the database. This defines the agent's name, personality, focus area, and working style.

Two template variables are interpolated at session creation:
- `{working_directory}` — resolves to the workspace directory path (`data/workspace/`)
- `{project_dir}` — resolves to the parent of the workspace directory (the data dir)

Example for the default agent "Clive":

```
You are Clive, the Tech Support agent for this platform. You have full access to the agentos source code located at {project_dir}.
```

---

## Layer 2 — Tools Block

A `## How You Work` section describing the agent's available tools. This is assembled from two sources:

1. **Platform tools** — built-in tool groups (memory, todos, scheduling, agent-mgmt, platform-comms, messaging, board). Each group provides a `systemPrompt()` section describing its tools. Active tools = defaults + agent's `model_config.tools`, minus `model_config.disabledTools`.

2. **Plugin tools** — dynamically loaded plugins (e.g. elevenlabs, gemini-image, remotion). Listed as `### Plugin Tools` with name and description for each.

---

## Layer 3 — Memory

Persistent memory entries from the `agent_memory` table, formatted as:

```
## Your Memory
- [remembered fact 1]
- [remembered fact 2]
```

If the agent has no memory entries, this section is omitted.

---

## Layer 4 — Open Todos

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
const platformPromptRaw = getSetting('platform_prompt') ?? 'You are an AI agent...'
const platformBlock = platformPromptRaw
  .replace(/{working_directory}/g, workspaceDir)
  .replace(/{project_dir}/g, path.dirname(workspaceDir))

const identityBlock = agent.system_prompt
  .trim()
  .replace(/{working_directory}/g, workspaceDir)
  .replace(/{project_dir}/g, path.dirname(workspaceDir))

const toolsBlock = `## How You Work\n\n...` + toolSections.join('\n\n')

const memoryBlock = memories.length
  ? `## Your Memory\n${memories.map(m => `- ${m.content}`).join('\n')}`
  : ''

const todoBlock = todos.length
  ? `## Your Open Todos\n${todos.map(t => `[${t.id}] ${t.text}`).join('\n')}`
  : ''

return [platformBlock, identityBlock, toolsBlock, memoryBlock, todoBlock]
  .filter(Boolean)
  .join('\n\n')
```

---

## Platform Message Header

For **platform triggers** (Slack, Telegram), the queue worker prepends a compact one-line header to the user message (not the system prompt):

```
[Slack #marketing | From: John Smith | msg_id:C12345678:1743254400.123456]
Can you pull last week's sales numbers?
```

The persistent channel session handles conversation memory natively — no history is injected into the system prompt.

For **scheduler triggers**, the task prompt is wrapped with a delimiter when passed to `invokeAgent()`:

```
------------------------
Now your current task is:
[schedule prompt text]
```

The `systemPromptAddendum` option on `invokeAgent()` exists for adding extra context to the system prompt, but is not currently used by platform triggers.

---

## Editing Prompts

| What to change | Where |
|----------------|-------|
| Individual agent personality | Roster → agent → Settings → System Prompt |
| Platform-wide behavior | Settings → Prompt (global platform prompt) |
| Company policy | `workspace/SOP.md` (file in workspace — agents read it via filesystem tools) |

---

## Staleness

Because memory, todos, and the platform prompt are injected once at session creation, changes made after a persistent session is live won't be visible to the agent until the session is reset (via `DELETE /api/agents/:id/chat`, `/clear` command, or on error). Scheduler invocations always get the latest state.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start both server (port 3000) and web (port 5173) in dev mode
npm run debug        # Server with --debug flag (logs all agent events/tool calls) + web
npm run build        # Production build (server tsc, then web vite build)
npm run reset        # Wipe data/ directory for a fresh database
```

Server and web are npm workspaces under `packages/`:
```bash
npm run dev --workspace=packages/server    # Server only
npm run dev --workspace=packages/web       # Web only
```

## Architecture

AgentOS is a platform for running autonomous AI agents as virtual employees. It's a monorepo with two packages:

- **packages/server** — Express + SQLite backend (Node 22.5+, uses built-in `DatabaseSync`)
- **packages/web** — React + Vite + Tailwind frontend (Zustand for state)

### Core Runtime Flow

Agents are powered by the `@mariozechner/pi-coding-agent` SDK. The runtime maintains one persistent `AgentSession` per agent for interactive chat, and creates isolated sessions for scheduled/triggered invocations.

**System prompt composition** (layered in order): assigned role prompts → agent identity prompt (with `{working_directory}` and `{project_dir}` interpolation) → platform tools/plugin descriptions → agent directory → memory → open todos.

### Event-Driven Architecture

All state changes flow through an in-memory `EventBus` → WebSocket broadcast to frontend. The frontend listens via `useAppEvents()` hook and updates Zustand store.

### Key Backend Components

| File | Purpose |
|------|---------|
| `server/src/index.ts` | CLI entry (`agentos init`, `agentos start`), bootstraps all services |
| `server/src/server.ts` | Express app, mounts routers, initializes WS/queue/connectors |
| `server/src/db.ts` | SQLite schema, migrations, WAL mode, foreign keys enabled |
| `server/src/agent-runner.ts` | Agent session management, system prompt assembly, model/account selection |
| `server/src/event-bus.ts` | Typed pub/sub for all domain events |
| `server/src/scheduler.ts` | Polls `agent_schedules` every 60s, enqueues due tasks |
| `server/src/queue-worker.ts` | Polls `invocation_queue` every 5s, processes one agent at a time with retry (max 3, exponential backoff) |
| `server/src/platform-tools/` | Built-in tool groups: memory, todos, scheduling, agent-mgmt, platform-comms |
| `server/src/plugin-loader.ts` | Loads plugins from `server/src/plugins/`, manages env config |
| `server/src/connectors/` | Slack and Telegram connectors — bridge external messages to invocation queue |

### Tool System

Two types of tools are composed for each agent:
1. **Platform tools** — built-in groups (memory, todos, scheduling, agent-mgmt). Each group in `platform-tools/<group>/index.ts` implements `PlatformTool` interface. Tools resolved per-agent via `availableByDefault` + agent's `model_config.tools` / `disabledTools`.
2. **Plugins** — dynamic, opt-in (elevenlabs, gemini-image, youtube, remotion, brave-search). Configured via `.env` vars and plugin API.

### Async Invocation Pipeline

Non-interactive triggers (scheduled tasks, Slack/Telegram messages) go through:
`enqueueInvocation()` → `invocation_queue` table → queue worker polls → agent executes → response delivered via connector (if platform message) or stored in chat history.

### Frontend

React app with react-router-dom. Pages: Dashboard, Agents (roster/chat/settings/memory/todos/schedule), Workspace, Channels, Board, Notifications, Settings. State in Zustand store (`store.ts`), API client in `api.ts`.

### Data Storage

SQLite database at `data/agentos.db`. Agent sessions stored at `data/sessions/{agentId}/`. Workspace files in `data/workspace/`. Database uses migrations at startup; schema includes agents, chat_messages, agent_memory, agent_todos, agent_schedules, invocation_queue, platform_messages, agent_integrations, and more.

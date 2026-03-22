# Server Source Overview

## Entry Points

- **index.ts** — App entry point. Starts the HTTP server.
- **server.ts** — Express app setup. Mounts all routers, middleware, and initializes core services.

## Core Infrastructure

- **db.ts** — SQLite connection singleton. Defines schema via `CREATE TABLE IF NOT EXISTS` on startup.
- **event-bus.ts** — In-memory pub/sub. All domain events flow through here to reach the WebSocket layer.
- **ws.ts** — WebSocket server. Subscribes to `EventBus` and broadcasts typed events to connected clients.
- **auth.ts** — Authentication middleware and helpers.

## Agent Runtime

- **agent-runner.ts** — Wraps the `pi-coding-agent` SDK. Maintains one persistent `AgentSession` per agent. Assembles system prompts dynamically from agent config, memory, and todos.
- **scheduler.ts** — Polls `agent_schedules` table on cron intervals and fires synthetic chat messages to trigger scheduled agent runs.
- **platform-tools.ts** — Registers platform-level tools (e.g. memory, todos) that agents can call during their sessions.

## Plugin System

- **plugin-loader.ts** — Discovers and loads plugin packages at startup, registers their tools with the agent runtime.
- **plugins/index.ts** — Plugin registry and shared plugin utilities.
- **plugins/types.ts** — Shared TypeScript types for the plugin interface.
- **plugins/elevenlabs/** — Text-to-speech plugin (ElevenLabs API).
- **plugins/gemini-image/** — Image generation plugin (Gemini API).
- **plugins/youtube/** — YouTube data/search plugin.
- **plugins/remotion/** — Video rendering plugin (Remotion).
- **plugins/brave-search/** — Web search plugin (Brave Search API).

## API Routers (`api/`)

- **agents.ts** — CRUD for agents.
- **chat.ts** — Send messages, stream responses, fetch chat history.
- **memory.ts** — Read/write agent memory entries.
- **todos.ts** — Manage per-agent todo items.
- **schedules.ts** — Manage per-agent cron schedules.
- **settings.ts** — Read/write global app settings.
- **workspace.ts** — Workspace-level configuration and file operations.
- **plugins.ts** — List available plugins and their status.
- **users.ts** — User management.
- **roles.ts** — Role and permission management.
- **channels.ts** — Channel management.
- **boards.ts** — Board management.

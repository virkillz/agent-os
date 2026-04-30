# Architecture

## Overview

agent-os is a Node.js monorepo with two packages:

- `packages/server` — Express + WebSocket backend (port 3000)
- `packages/web` — React + Vite frontend (port 5173, proxies `/api` and `/ws` to backend)

SQLite is the single source of truth. There is no caching layer — all routes query via the `getDb()` singleton.

---

## Data Flow

All real-time state changes follow one path:

```
Backend action
  → EventBus.emit(event)
  → WebSocket broadcast to all clients
  → useAppEvents() hook on frontend
  → Zustand store update
  → React re-render
```

The `EventBus` (`server/src/event-bus.ts`) is an in-memory pub/sub. The WebSocket server (`server/src/ws.ts`) subscribes to all events and broadcasts typed payloads to connected clients.

---

## WebSocket Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `agent:created` | `{ agentId }` | New agent created |
| `agent:thinking` | `{ agentId }` | Agent starts processing |
| `agent:reply` | `{ agentId, preview }` | Agent produces output |
| `agent:idle` | `{ agentId }` | Agent finishes |
| `agent:error` | `{ agentId, error }` | Agent encountered an error |
| `todo:created` | `{ agentId, todo }` | Todo item created |
| `todo:updated` | `{ agentId, todo }` | Todo item updated |
| `todo:deleted` | `{ agentId, todoId }` | Todo item deleted |
| `memory:created` | `{ agentId, entry }` | Memory entry created |
| `memory:deleted` | `{ agentId, entryId }` | Memory entry deleted |
| `schedule:fired` | `{ agentId, scheduleId, label }` | Cron schedule triggered |
| `schedule:created` | `{ agentId, scheduleId, label }` | New schedule created |
| `workspace:change` | `{ path, action }` | File created/updated/deleted in workspace |
| `chat:message` | `{ agentId, agentName, role, content, messageId }` | Chat message logged |
| `notification:created` | `{ notification }` | System notification |
| `provider_account:cooldown` | `{ accountId, provider, cooldownMinutes }` | Provider rate-limited |
| `invocation:queued` | `{ agentId, triggerType, queueId }` | Task queued |
| `invocation:completed` | `{ agentId, triggerType, queueId }` | Queued task completed |
| `invocation:failed` | `{ agentId, triggerType, queueId, error }` | Queued task failed |
| `invocation:rate_limited` | `{ agentId, retryAfter }` | Invocation rate-limited |
| `connector:started` | `{ agentId, platform }` | Slack/Telegram connector started |
| `connector:stopped` | `{ agentId, platform }` | Connector stopped |
| `connector:error` | `{ agentId, platform, error }` | Connector error |
| `channel:config_updated` | `{ agentId, platform }` | Channel config changed (hot-reload) |
| `board:card_moved` | `{ cardId, boardId, laneId, title }` | Card moved on kanban |
| `connected` | — | WebSocket client connected (welcome ping) |
| `plugin:configured` | `{ pluginId }` | Plugin configured |

---

## Module Map

### Backend

```
server/src/
├── index.ts              # CLI entry (agentos init, agentos start), bootstraps all services
├── server.ts             # Express app: mounts routers, WS init, queue worker, connectors
├── ws.ts                 # WebSocket server on /ws, broadcasts events to connected clients
├── db.ts                 # SQLite schema, migrations, WAL mode, foreign keys, seed data
├── auth.ts               # scrypt password hashing, session middleware (requireAuth, requireAdmin)
├── agent-runner.ts       # Pi SDK session lifecycle: chatWithAgent(), chatWithChannel(), invokeAgent(), buildSystemPrompt()
├── scheduler.ts          # 60s cron poll, enqueues due tasks to invocation_queue
├── queue-worker.ts       # 5s poll on invocation_queue, processes one agent at a time with retry
├── event-bus.ts          # Typed AppEvent union, emit(), on()
├── notification-service.ts # Maps domain events to persistent notifications
├── platform-tools.ts     # Composes platform tools + plugin tools for each agent
├── platform-tools/
│   ├── loader.ts         # Registry: getDefaultToolIds(), getToolsForIds(), getSystemPromptSections()
│   ├── types.ts          # PlatformTool interface
│   ├── memory/           # memory_add tool
│   ├── todos/            # Todo management tools
│   ├── scheduling/       # Schedule management tools
│   ├── platform-comms/   # send_direct_message
│   ├── conversation-search/ # search_conversation_history tool
│   └── board/            # Kanban board tools (not yet wired to API)
├── connectors/
│   ├── loader.ts         # Starts/stops connectors based on agent_channels table
│   ├── types.ts          # Connector interface, InboundMessage, TriggerContext
│   ├── slack/
│   │   ├── index.ts      # SlackConnector (Socket Mode via Bolt SDK)
│   │   ├── context.ts    # SlackTriggerMeta type
│   │   └── format.ts     # Slack markdown formatting
│   └── telegram/
│       ├── index.ts      # TelegramConnector (long polling via Telegraf)
│       ├── context.ts    # TelegramTriggerMeta type
│       └── format.ts     # Telegram text formatting
├── plugin-loader.ts      # Loads plugins from plugins/, manages env config
├── plugins/              # Optional plugins: brave-search, elevenlabs, gemini-image, youtube, remotion, hacker-news, fetch-content
├── mcp-client.ts         # MCP (Model Context Protocol) client integration
└── api/
    ├── agents.ts         # Agent CRUD, is_active toggle, session file browser
    ├── chat.ts           # Direct agent chat (chat_messages + platform_messages tables)
    ├── memory.ts         # Agent memory CRUD
    ├── todos.ts          # Agent todo CRUD
    ├── schedules.ts      # Agent schedule CRUD
    ├── triggers.ts       # Trigger registry: list, enable/disable, preview prompt, invocation history
    ├── channels.ts       # Slack/Telegram channel CRUD, platform message query, connector restart
    ├── users.ts          # Human user CRUD, auth, login/logout, avatar upload
    ├── plugins.ts        # Plugin registry, configure/remove
    ├── platform-tools.ts # List available platform tools
    ├── skills.ts         # List/install/uninstall skills
    ├── notifications.ts  # Notifications list, mark read
    ├── connection-profiles.ts # LLM connection profile management (replaces provider-accounts)
    ├── mcp.ts            # MCP server registry, agent↔server junction
    ├── workspace.ts      # Workspace file browser
    └── settings.ts       # Company settings, platform prompt, provider API keys
```

### Frontend

```
web/src/
├── App.tsx               # Auth gate: first-run → onboarding, then login, then layout + routing
├── store.ts              # Zustand state: agents, memory, todos, schedules, notifications, plugins, workspace, MCP servers
├── api.ts                # Typed fetch client organized by domain + all shared TypeScript types
├── hooks/
│   └── useAppEvents.ts   # WebSocket event listener hook
├── contexts/
│   └── ThemeContext.tsx   # Theme provider
├── components/
│   ├── Layout.tsx         # Top bar nav: logo, back, settings, notifications, user profile
│   ├── AgentProfileCard.tsx
│   ├── AgentDetailModal.tsx
│   ├── NotificationCenter.tsx
│   ├── PageHeader.tsx
│   └── agent-settings/    # Settings sub-components per tab
│       ├── ProfileSection.tsx
│       ├── AvatarSection.tsx
│       ├── PromptSection.tsx
│       ├── PlatformToolsSection.tsx
│       ├── SkillsSection.tsx
│       ├── PluginsSection.tsx
│       ├── McpSection.tsx
│       ├── ConnectionSection.tsx
│       ├── ChannelsSection.tsx
│       ├── SessionsSection.tsx
│       ├── ScheduleSection.tsx
│       ├── MemorySection.tsx
│       ├── TodosSection.tsx
│       ├── TriggersSection.tsx
│       └── TerminateSection.tsx
└── pages/
    ├── Login.tsx          # Username/password gate
    ├── Onboarding.tsx     # First-run setup wizard
    ├── Dashboard.tsx      # Overview dashboard (home page)
    ├── Roster.tsx         # Agent list
    ├── Users.tsx          # Human user management
    ├── AgentProfile.tsx   # Agent profile view
    ├── AgentChat.tsx      # Direct agent chat
    ├── AgentSettings.tsx  # Agent configuration (tabs for all sub-components above)
    ├── AgentMemory.tsx    # Agent memory viewer/editor
    ├── AgentTodos.tsx     # Agent todo list
    ├── AgentSchedule.tsx  # Agent schedule management
    ├── Workspace.tsx      # Workspace file browser
    ├── Explorer.tsx       # Session file explorer
    ├── Board.tsx          # Kanban board (frontend only — API not yet wired)
    ├── Skills.tsx         # Skill manager (install/uninstall)
    ├── Plugins.tsx        # Plugin manager
    ├── Notifications.tsx  # Notification center page
    └── settings/
        ├── Provider.tsx   # Provider API key management
        ├── Extensions.tsx # Plugin management
        ├── Mcp.tsx        # MCP server management
        ├── Skills.tsx     # Built-in skill toggles
        ├── Prompt.tsx     # Global platform prompt
        └── Appearance.tsx # Theme/background selection
```

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `settings` | Key/value store: company_name, platform_prompt, default model, etc. |
| `agents` | AI agent profiles: name, role, description, system_prompt, model_config, avatar, is_active, is_default |
| `users` | Human employees: username, password_hash, display_name, avatar, bio, is_admin |
| `sessions` | Auth tokens linked to users |
| `roles` | Named roles with prompt text (schema exists but not currently used in system prompt) |
| `agent_roles` | Junction: agents ↔ roles (many-to-many) (schema exists but not currently used) |

### Per-Agent Data

| Table | Purpose |
|-------|---------|
| `chat_messages` | Direct chat history (user/assistant messages per agent) |
| `agent_memory` | Persistent memory entries (injected into system prompt) |
| `agent_todos` | Todo items with completion state |
| `agent_schedules` | Cron schedules with prompt, label, enabled flag, last/next run timestamps |

### Trigger & Invocation Pipeline

| Table | Purpose |
|-------|---------|
| `agent_triggers` | Registry of all invocation sources per agent (internal_chat, scheduler, slack_dm, slack_channel, telegram_dm, telegram_group) |
| `invocation_queue` | Task queue with status (pending/processing/done/failed), retry logic, exponential backoff |

### Platform Integrations

| Table | Purpose |
|-------|---------|
| `agent_channels` | Per-agent Slack/Telegram credentials and config (JSON blob) |
| `platform_messages` | All inbound/outbound messages from external platforms (with thread, reply, reaction support) |

### Infrastructure

| Table | Purpose |
|-------|---------|
| `provider_accounts` | Legacy API key accounts per provider with cooldown timestamps (superseded by connection_profiles) |
| `connection_profiles` | LLM connection profiles: provider type, base URL, API key, model ID, default flag |
| `mcp_servers` | MCP (Model Context Protocol) server definitions |
| `agent_mcp_servers` | Junction: agents ↔ MCP servers (many-to-many, with enabled flag) |
| `plugins` | Plugin registry with configured flag |
| `notifications` | System notifications (agent, schedule, error, dm types) |
| `notification_reads` | Per-user read state for notifications |
| `channel_sessions` | Persistent conversation sessions per (agent, channel_key) — see channel-sessions.md |

---

## Auth

Token-based auth using cookie sessions + SQLite. Passwords are hashed with `scrypt` (random 16-byte salt, verified with `timingSafeEqual`).

- Auth tokens stored in the `sessions` table
- Cookie-based session tracking via `cookieParser`
- First-run setup wizard creates initial admin user

No JWT, no OAuth. Designed for single-server local deployment.

---

## Plugin System

Plugins implement the `AgentOSPlugin` interface with `config`, `getTools(ctx)`, optional `setup()`, and optional `healthCheck()`. Built-in plugins are statically imported in `plugins/index.ts` (Brave Search, ElevenLabs, Gemini Image, YouTube, Remotion, Hacker News, Fetch Content). Plugins are configured via environment variables in `.env` and assigned per-agent via the agent's `model_config.tools` array.

---

## Agent System Prompt

See [system-prompt.md](system-prompt.md) for the layered composition (platform prompt → identity → tools → memory → todos).

## Agent Lifecycle

See [agent-lifecycle.md](agent-lifecycle.md) for how and when agents are triggered.

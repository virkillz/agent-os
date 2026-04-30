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
| `plugin:configured` | `{ pluginId }` | Plugin configured |

---

## Module Map

### Backend

```
server/src/
├── index.ts              # CLI entry (agentos init, agentos start), bootstraps all services
├── server.ts             # Express app: mounts routers, WS init, queue worker, connectors
├── db.ts                 # SQLite schema, migrations, WAL mode, foreign keys, seed data
├── agent-runner.ts       # Pi SDK session lifecycle: chatWithAgent(), invokeAgent(), buildSystemPrompt()
├── scheduler.ts          # 60s cron poll, enqueues due tasks to invocation_queue
├── queue-worker.ts       # 5s poll on invocation_queue, processes one agent at a time with retry
├── event-bus.ts          # Typed AppEvent union, emit(), on()
├── notification-service.ts # Maps domain events to persistent notifications
├── account-pool.ts       # Provider account selection with cooldown management
├── platform-tools.ts     # Composes platform tools + plugin tools for each agent
├── platform-tools/
│   ├── loader.ts         # Registry: getDefaultToolIds(), getToolsForIds(), getSystemPromptSections()
│   ├── types.ts          # PlatformTool interface
│   ├── memory/           # memory_add tool
│   ├── todos/            # Todo management tools
│   ├── scheduling/       # Schedule management tools
│   ├── agent-mgmt/       # create_agent, manage agents
│   ├── platform-comms/   # send_direct_message
│   ├── messaging/        # Messaging tools
│   └── board/            # Kanban board tools
├── connectors/
│   ├── loader.ts         # Starts/stops connectors based on agent_channels table
│   ├── slack/index.ts    # SlackConnector (Socket Mode via Bolt SDK)
│   └── telegram/index.ts # TelegramConnector (long polling via Telegraf)
├── plugin-loader.ts      # Loads plugins from plugins/, manages env config
├── plugins/              # Optional plugins: remotion, elevenlabs, gemini-image, etc.
└── api/
    ├── agents.ts         # Agent CRUD, is_active toggle, role assignment
    ├── chat.ts           # Direct agent chat (chat_messages table)
    ├── memory.ts         # Agent memory CRUD
    ├── todos.ts          # Agent todo CRUD
    ├── schedules.ts      # Agent schedule CRUD
    ├── triggers.ts       # Trigger registry: list, enable/disable, preview prompt, invocation history
    ├── integrations.ts   # Slack/Telegram integration CRUD, platform message query
    ├── roles.ts          # Role CRUD, default role seeding
    ├── users.ts          # Human user CRUD, auth, login/logout, avatar upload
    ├── plugins.ts        # Plugin registry, configure/remove
    ├── platform-tools.ts # List available platform tools
    ├── skills.ts         # List available skills
    ├── notifications.ts  # Notifications list, mark read
    ├── provider-accounts.ts # Provider account key management
    ├── workspace.ts      # Workspace file browser
    └── settings.ts       # Company settings, default model, platform prompt
```

### Frontend

```
web/src/
├── App.tsx               # Auth gate: first-run → onboarding, then login, then layout
├── store.ts              # Zustand state: agents, memory, todos, schedules, notifications, plugins, workspace
├── api.ts                # Typed fetch client organized by domain
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
│   └── agent-settings/    # Settings sub-components: Profile, Prompt, Model, Plugins, etc.
└── pages/
    ├── Login.tsx          # Username/password gate
    ├── Onboarding.tsx     # First-run setup wizard
    ├── Dashboard.tsx      # Overview dashboard (home page)
    ├── Roster.tsx         # Agent list
    ├── Users.tsx          # Human user management
    ├── AgentProfile.tsx   # Agent profile view
    ├── AgentChat.tsx      # Direct agent chat
    ├── AgentSettings.tsx  # Agent configuration (tools, plugins, model, integrations, triggers)
    ├── AgentMemory.tsx    # Agent memory viewer/editor
    ├── AgentTodos.tsx     # Agent todo list
    ├── AgentSchedule.tsx  # Agent schedule management
    ├── Workspace.tsx      # Workspace file browser
    ├── Notifications.tsx  # Notification center page
    └── settings/
        ├── Company.tsx    # Company name, description
        ├── Provider.tsx   # Default model provider
        ├── ProviderAccounts.tsx # API key account management
        ├── Model.tsx      # Default model selection, thinking level
        ├── Extensions.tsx # Plugin management
        ├── Skills.tsx     # Built-in skill toggles
        ├── Roles.tsx      # Role CRUD
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
| `roles` | Named roles with prompt text |
| `agent_roles` | Junction: agents ↔ roles (many-to-many) |

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
| `provider_accounts` | Multiple API key accounts per provider with cooldown timestamps |
| `plugins` | Plugin registry with configured flag |
| `notifications` | System notifications (agent, schedule, error, dm types) |
| `notification_reads` | Per-user read state for notifications |

---

## Auth

Token-based auth using cookie sessions + SQLite. Passwords are hashed with `bcrypt`.

- Auth tokens stored in the `sessions` table
- Cookie-based session tracking via `cookieParser`
- First-run setup wizard creates initial admin user

No JWT, no OAuth. Designed for single-server local deployment.

---

## Plugin System

Plugins implement `ToolDefinition` from the Pi SDK. They interact with external APIs and are installed at the platform level, then assigned per-agent via the agent's `model_config.tools` array.

---

## Agent System Prompt

See [system-prompt.md](system-prompt.md) for the layered composition (identity → roles → tools → directory → memory/todos).

## Agent Lifecycle

See [agent-lifecycle.md](agent-lifecycle.md) for how and when agents are triggered.

# Architecture

## Overview

rascal-inc is a Node.js monorepo with two packages:

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
| `agent:thinking` | `{ agentId }` | Agent starts processing |
| `agent:reply` | `{ agentId, message }` | Agent produces output |
| `agent:idle` | `{ agentId }` | Agent finishes |
| `channel:message` | `{ channelId, message }` | New message in any channel |
| `board:card_moved` | `{ boardId, cardId, fromLane, toLane }` | Card moved on kanban |
| `employee:status` | `{ employeeId, type, status }` | Online/offline/active status |
| `schedule:fired` | `{ agentId, scheduleId, label }` | Cron schedule triggered |
| `notification` | `{ title, body, type }` | System notification |

---

## Module Map

### Backend

```
server/src/
├── index.ts            # CLI entry (starts server, opens browser)
├── server.ts           # Express app: mounts routers, auth middleware, WS upgrade
├── db.ts               # Schema init, getDb(), typed query helpers
├── auth.ts             # bcrypt password hashing, express-session, requireAuth/requireAdmin
├── agent-runner.ts     # Pi SDK session lifecycle, chatWithAgent(), buildSystemPrompt()
├── scheduler.ts        # 60s cron poll, fires agent triggers, skip_if_no_todos logic
├── event-bus.ts        # Typed AppEvent union, emit(), subscribe()
├── platform-tools.ts   # Workspace filesystem tools exposed to agents
└── api/
    ├── agents.ts       # Agent CRUD, is_active toggle, role assignment
    ├── chat.ts         # Legacy direct chat (chat_messages table)
    ├── channels.ts     # Channels, DMs, messages, @mention resolution
    ├── boards.ts       # Boards, lanes, cards, lane rule enforcement
    ├── roles.ts        # Role CRUD, default role seeding
    ├── users.ts        # Human user CRUD, login endpoint
    ├── plugins.ts      # Plugin registry, per-agent assignment
    ├── memory.ts       # Agent memory CRUD
    ├── todos.ts        # Agent todo CRUD
    ├── schedules.ts    # Agent schedule CRUD
    ├── settings.ts     # Company settings, provider keys, platform prompt
    └── workspace.ts    # Workspace file browser
```

### Frontend

```
web/src/
├── App.tsx             # Auth gate: redirects to /login if no session
├── store.ts            # Zustand AppState: agents, users, channels, boards, roles
├── api.ts              # Typed fetch client organized by domain
├── components/
│   ├── Layout.tsx      # Sidebar nav: Employees, Board, Channels, Workspace, Settings
│   └── NotificationCenter.tsx
└── pages/
    ├── Login.tsx        # Username/password gate
    ├── Onboarding.tsx   # First-run wizard
    ├── Roster.tsx        # Employees list (humans + AI agents)
    ├── AgentChat.tsx     # Legacy direct agent DM
    ├── Channels.tsx      # Channel list + message view + @mention input
    ├── Board.tsx         # Kanban: drag cards, manage lanes, lane rules
    ├── Roles.tsx         # Role management + assign to agents
    └── Settings.tsx      # Providers, platform prompt, company info
```

---

## Database Schema

### Core tables (existed pre-refactor)

| Table | Purpose |
|-------|---------|
| `settings` | Key/value store: company_name, platform_prompt, provider keys, etc. |
| `agents` | AI agent profiles: name, system_prompt, model config, is_active |
| `agent_memory` | Per-agent key/value memory |
| `agent_todos` | Per-agent todo items |
| `agent_schedules` | Cron schedules per agent (with skip_if_no_todos) |
| `plugins` | Plugin registry |
| `chat_messages` | Legacy direct chat history (kept for backward compat) |

### New tables (added in platform pivot)

| Table | Purpose |
|-------|---------|
| `users` | Human employees: username, password_hash, display_name, is_admin |
| `roles` | Named roles with prompt text |
| `agent_roles` | Junction: agents ↔ roles (many-to-many) |
| `channels` | Group channels and DM channels (is_dm flag) |
| `channel_members` | Junction: channels ↔ employees (agent or user) |
| `channel_messages` | All channel + DM messages |
| `boards` | Kanban boards |
| `lanes` | Lanes within a board (ordered by position) |
| `cards` | Cards (tasks) on a board, assigned to an employee |
| `lane_rules` | Allow-list rules controlling who can move cards into a lane |

### Dropped tables

`templates`, `pipeline_projects`, `human_gates` — removed in the platform pivot.

---

## Auth

Session-based auth using `express-session` + SQLite session store. Passwords are hashed with `bcrypt`.

- `requireAuth` middleware: blocks unauthenticated requests with 401
- `requireAdmin` middleware: blocks non-admin users with 403
- Sessions are stored in the `sessions` table in SQLite

No JWT, no OAuth. Designed for single-server local deployment.

---

## Lane Rules

Lane rules are an **additive allow-list** on the destination lane:

- If a lane has **no rules** → any employee can move a card there
- If a lane has **any rules** → only matching employees can move a card there
- Rule types:
  - `admin_only` — only platform admins
  - `role` — employees holding a specific role
  - `employee` — a specific named employee (agent or user)

Rule checking happens in `api/boards.ts` on `PATCH /api/boards/:id/cards/:cardId/move`.

---

## Plugin System

Plugins implement `ToolDefinition` from the Pi SDK. They interact with external APIs and are installed at the platform level, then assigned per-agent.

Default plugins: `brave-search`, `elevenlabs`, `gemini-image`, `youtube`, `remotion`, `sql_memory`, `kanban`

The `kanban` plugin gives agents the ability to read board state, create cards, and move cards — enabling autonomous participation in project work.

---

## Agent System Prompt

See [system-prompt.md](system-prompt.md) for the full 3-layer composition (platform prompt → role prompts → identity prompt → memory/todos).

## Agent Lifecycle

See [agent-lifecycle.md](agent-lifecycle.md) for how and when agents are triggered.

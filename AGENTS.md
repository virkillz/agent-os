# Agent OS — Agent Guide

This file is the single source of truth for AI coding agents working on Agent OS. Read it before making any changes.

---

## Project Overview

Agent OS is a Node.js monorepo platform for running autonomous AI agents as "virtual employees" for an organization. Agents live on Slack and Telegram, run on schedules, manage their own memory and todos, and coordinate with each other. The project provides a runtime backend and a web UI to manage everything.

- **Repository root:** `/Users/asani/Projects/agent-os`
- **Language:** TypeScript (strict mode enabled)
- **Module system:** ES modules (`"type": "module"` in all `package.json` files)
- **Node.js requirement:** 22.5+ (uses built-in `node:sqlite` / `DatabaseSync`)

---

## Workspace Structure

This is an **npm workspaces** monorepo with two packages under `packages/`:

| Package | Path | Port | Purpose |
|---------|------|------|---------|
| `@agentos/server` | `packages/server` | 3000 | Express + SQLite + WebSocket backend |
| `@agentos/web` | `packages/web` | 5173 | React + Vite + Tailwind frontend |

**Root-level files:**
- `package.json` — workspace definition, orchestration scripts
- `.env` — environment variables for API keys and plugin config (gitignored, never commit)
- `data/` — SQLite DB (`agentos.db`), agent session files, workspace files (gitignored)
- `docs/` — Architecture and design documentation (Markdown)

---

## Technology Stack

### Backend (`packages/server`)
- **Runtime:** Node.js 22.5+ (built-in `node:sqlite`)
- **Framework:** Express 4.19.2
- **Database:** SQLite via `DatabaseSync` (WAL mode, foreign keys enabled) — **no ORM**, raw SQL only
- **Real-time:** `ws` library for WebSocket server on `/ws`
- **Agent SDK:** `@mariozechner/pi-ai` and `@mariozechner/pi-coding-agent`
- **Connectors:** Slack (`@slack/bolt`, Socket Mode), Telegram (`telegraf`, long polling)
- **Scheduling:** `cron-parser` + `setInterval` polling loop
- **Auth:** Custom session-based auth (`scrypt` password hashing, SQLite session store, cookie `agentos_session`)
- **Dev runner:** `tsx` (TypeScript execution without pre-compilation)
- **Build:** `tsc` (outputs to `dist/`)

### Frontend (`packages/web`)
- **Framework:** React 18.3.1 + React Router DOM 6.23.1
- **Build tool:** Vite 5.2.11
- **Styling:** Tailwind CSS 3.4.3 + custom glassmorphism design system in `index.css`
- **State management:** Zustand 4.5.2
- **Icons:** Lucide React
- **API client:** Custom lightweight `fetch` wrapper (`api.ts`), no React Query
- **Real-time:** Native WebSocket via `useAppEvents.ts` hook

---

## Build and Development Commands

All commands run from the repository root unless noted.

```bash
# Install dependencies
npm install

# Start both server and web in development mode
# Server runs on :3000, web dev server on :5173 (with API proxy to :3000)
npm run dev

# Development with verbose agent event / tool call logging
npm run debug

# Production build (server tsc, then web vite build)
npm run build

# Wipe data/ directory for a fresh database start
npm run reset
```

### Package-specific commands

```bash
# Server only
npm run dev --workspace=packages/server     # tsx watch mode
npm run build --workspace=packages/server   # tsc → dist/
npm run start --workspace=packages/server   # node dist/index.js

# Web only
npm run dev --workspace=packages/web        # vite dev server
npm run build --workspace=packages/web      # tsc && vite build
npm run preview --workspace=packages/web    # vite preview
```

### CLI Entry Point

The server package exposes a global CLI via `bin/agentos.js`:

```bash
npx agentos init    # Initialize company directory (creates .env, data/, agentos.json)
npx agentos start   # Start the server
```

In dev mode, `tsx watch src/index.ts start --dir ../../` is used. In production, `bin/agentos.js` auto-detects whether to run via `tsx` (if `src/` exists) or the compiled `dist/index.js`.

---

## Code Style Guidelines

### TypeScript & Imports
- **Strict mode** is enabled in both packages.
- **Server imports:** Must use `.js` extensions for ESM compatibility (`import { getDb } from './db.js'`).
- **Web imports:** Standard `.ts` / `.tsx` extensions (Vite bundler resolution).
- Prefer `type` imports (`import type { ... }`) where possible.

### Server Conventions
- **No ORM** — all database access is via raw SQL using `getDb().prepare(...).run()/.get()/.all()`.
- **Singleton pattern** for shared state: `eventBus`, `pluginLoader`, `platformToolLoader`, `connectorLoader`.
- API routes are organized as factory functions exporting `create*Router()` — not nested in classes.
- Use `AuthRequest` interface (extends Express `Request` with `user?`) for authenticated routes.

### Frontend Conventions
- **PascalCase** for components and pages (`AgentChat.tsx`, `Layout.tsx`).
- **camelCase** for utilities (`api.ts`, `store.ts`).
- **No component library** — all UI is hand-rolled with Tailwind + custom CSS classes.
- **No form library** — forms use plain React state.
- **No data fetching library** — all data is fetched imperatively through Zustand actions.
- Dark glassmorphism aesthetic is defined in `index.css` via CSS variables (`--s0`, `--s1`, `--accent`, etc.).

### File Organization
```
packages/server/src/
  index.ts              # CLI entry, bootstraps all services
  server.ts             # Express app factory, mounts routers, WS init
  db.ts                 # SQLite schema, migrations, WAL mode
  auth.ts               # scrypt hashing, sessions, middleware
  event-bus.ts          # In-memory typed pub/sub
  agent-runner.ts       # Pi SDK session lifecycle, system prompt assembly
  scheduler.ts          # 60s cron poll
  queue-worker.ts       # 5s poll on invocation_queue with retry logic
  api/                  # Express routers (one file per domain)
  connectors/           # Slack & Telegram bridge
  platform-tools/       # Built-in tool groups (memory, todos, scheduling, etc.)
  plugins/              # Built-in plugins (brave-search, youtube, etc.)

packages/web/src/
  App.tsx               # Root: auth gate, routing, background init
  main.tsx              # React root entry
  api.ts                # Central fetch client + all TypeScript types
  store.ts              # Zustand global store
  index.css             # Tailwind directives + design system
  hooks/                # Custom hooks (useAppEvents.ts)
  contexts/             # ThemeContext.tsx
  components/           # Reusable components + agent-settings/
  pages/                # Route-level pages + settings/
```

---

## Testing Instructions

**There are currently no automated tests in this project.**

- No test framework is installed (no Jest, Vitest, Mocha, Playwright, or Cypress).
- No test scripts are defined in any `package.json`.
- If you add tests, prefer **Vitest** for consistency with the Vite-based frontend, and place tests co-located with source files or in `__tests__/` directories.

**Manual testing workflow:**
1. `npm run dev` to start both server and web.
2. Open `http://localhost:5173` and complete first-run onboarding (creates admin user).
3. Create an agent and test direct chat.
4. Configure Slack/Telegram integrations via the agent's Settings → Integrations tab.
5. Use `npm run debug` to see verbose agent event and tool call logs.

---

## Architecture Overview

### Event-Driven Real-time Flow

All state changes follow one path:

```
Backend action
  → EventBus.emit(event)
  → WebSocket broadcast to all clients
  → useAppEvents() hook on frontend
  → Zustand store update
  → React re-render
```

SQLite is the single source of truth. There is no caching layer.

### Agent Runtime

Agents are powered by the `@mariozechner/pi-coding-agent` SDK.

- **Direct chat** (`POST /api/agents/:id/chat`): Synchronous HTTP path. Uses a **persistent** `LiveSession` per agent retained in `liveSessions` map.
- **Scheduler / Slack / Telegram**: Asynchronous. Enqueued to `invocation_queue`, processed by queue worker. Uses **fresh isolated** sessions per run.

**System prompt composition** (assembled once at session creation):
1. Identity prompt (agent's `system_prompt`, with `{working_directory}` / `{project_dir}` interpolation)
2. Assigned role prompts
3. Tools block (platform tools + plugin tools)
4. Directory (list of all agents)
5. Memory entries
6. Open todos

For platform triggers, a context addendum (platform metadata + conversation history) is appended.

### Invocation Queue

- Polls every 5 seconds.
- Processes **one invocation per agent at a time** (no parallel runs per agent).
- Retry with exponential backoff on failure: 10s → 30s → 60s → 120s (max 3 retries).
- Supports rate-limit cooldown (`retry_after`).

### Plugin System

- Plugins implement `AgentOSPlugin` interface with `config`, `getTools(ctx)`, optional `setup()`, and optional `healthCheck()`.
- Built-in plugins are statically imported in `plugins/index.ts`: Brave Search, ElevenLabs, Gemini Image, YouTube, Remotion, Hacker News, Fetch Content.
- Plugins are configured via environment variables in `.env`.

### Connectors

- **Slack:** Socket Mode via Bolt SDK (persistent WebSocket, no public URL needed).
- **Telegram:** Long polling via Telegraf (no public URL needed).
- Connectors self-register triggers on first contact.
- Hot-reload when channel config is updated via `channel:config_updated` event.

### Session Files

Agent conversations are persisted as JSONL files under `data/sessions/<agent-id>/`. Each file is a tree (supports branching). Old messages are compacted (summarized) when approaching context limits but **never deleted** from disk.

---

## Database & Migrations

- **Engine:** Node.js built-in `node:sqlite` (`DatabaseSync`)
- **File:** `data/agentos.db` (WAL mode enabled)
- **Schema management:** Raw `CREATE TABLE IF NOT EXISTS` statements in `packages/server/src/db.ts`, plus additive `ALTER TABLE` migrations.
- **Migrations run automatically on startup** inside `initDb()`.

**Key tables:** `settings`, `agents`, `users`, `roles`, `agent_roles`, `chat_messages`, `agent_memory`, `agent_todos`, `agent_schedules`, `agent_triggers`, `invocation_queue`, `agent_channels`, `platform_messages`, `provider_accounts`, `plugins`, `notifications`, `sessions`, `mcp_servers`, `agent_mcp_servers`.

---

## Security Considerations

- **Passwords:** Hashed with `scrypt` (random 16-byte salt) — not bcrypt. Verified with `timingSafeEqual`.
- **Sessions:** UUID tokens stored in SQLite `sessions` table. Cookie-based (`agentos_session`). No JWT, no OAuth.
- **Auth middleware:** `requireAuth` and `requireAdmin` Express middlewares in `auth.ts`.
- **First-run setup:** Onboarding wizard at `/api/setup` creates the initial admin user. After setup, `firstRun` is false and the endpoint is locked.
- **Secrets:** Stored in `.env` (gitignored). Never commit API keys or bot tokens.
- **File uploads:** Avatar uploads use `multer` and are stored in `data/user_avatars/`.
- **No HTTPS enforcement** in the app itself — designed for single-server local deployment or reverse-proxy deployment.

---

## Environment Variables

Copy relevant vars into `.env` to enable plugins:

| Variable | Enables |
|----------|---------|
| `OPENROUTER_API_KEY` | Default LLM provider fallback |
| `BRAVE_SEARCH_API_KEY` | Brave Search plugin |
| `GEMINI_API_KEY` | Gemini Image plugin |
| `ELEVENLABS_API_KEY` | ElevenLabs plugin |
| `YOUTUBE_API_KEY` | YouTube plugin |

Connector tokens (Slack app/bot tokens, Telegram bot tokens) are stored per-agent in the `agent_channels` table, not in `.env`.

---

## Deployment Notes

- **No Dockerfile, docker-compose, or CI/CD configs** exist in the repository.
- Deployment is direct Node.js execution:
  ```bash
  npm run build
  npm run start --workspace=packages/server
  ```
- The frontend is built into static files by Vite and served from the backend's static file middleware in production.
- The `data/` directory must be persisted between restarts (contains DB and session files).

---

## Common Pitfalls

1. **Import extensions in server:** Forgetting `.js` on relative imports will break ESM at runtime.
2. **Session staleness:** Persistent chat sessions cache the system prompt at creation time. Changes to memory, todos, or roles after session creation won't reflect until the session is reset (via `DELETE /api/agents/:id/chat` or on error).
3. **Database locking:** `DatabaseSync` is synchronous and blocking. Long-running queries will block the event loop.
4. **No transaction wrapper:** Most API handlers run SQL without explicit `BEGIN/COMMIT` transactions. If you need atomicity, wrap multiple statements in a transaction manually.
5. **Queue worker deduplication:** Only one invocation processes per agent at a time. If you enqueue many tasks for the same agent, they serialize through the queue.

---

## Documentation References

Detailed design docs live in `docs/`:
- `architecture.md` — Full module map, data flow, WebSocket events, database schema
- `agent-lifecycle.md` — Trigger matrix, session model, invocation queue
- `system-prompt.md` — Prompt layer composition
- `session-files.md` — JSONL file format, compaction, branching
- `triggers-and-connectors.md` — Connector architecture, platform message model, threading behavior

When in doubt, check `docs/architecture.md` first.

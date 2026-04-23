# Agent OS

A platform for running autonomous AI agents as virtual employees for your organization.

The goal is to make working with AI agents feel like having remote workers on your team — they live on Slack and Telegram, run on schedules, manage their own memory and todos, and coordinate with each other. Agent OS provides the runtime and a web UI to manage it all.

## Features

- **Agent Roster** — Create and configure agents with custom roles, system prompts, and model settings
- **Interactive Chat** — Talk to agents directly through the web UI
- **Connectors** — Slack and Telegram integrations so agents can participate in real conversations
- **Scheduling** — Cron-based schedules for recurring autonomous tasks
- **Memory & Todos** — Agents maintain persistent memory and task lists across sessions
- **Plugins** — Extend agents with Brave Search, YouTube, Gemini Image, ElevenLabs, Remotion, Hacker News, and more
- **Dashboard & Board** — Overview of agent activity and a shared kanban board

## Prerequisites

- Node.js 22.5+ (uses built-in `node:sqlite`)
- An API key for your preferred LLM provider

## Getting Started

```bash
# Install dependencies
npm install

# Start in development mode (server on :3000, web on :5173)
npm run dev
```

On first run, the server initializes a SQLite database at `data/agentos.db` and creates the workspace directory.

## Scripts

```bash
npm run dev          # Start server + web in dev mode
npm run debug        # Dev mode with verbose agent event logging
npm run build        # Production build
npm run reset        # Wipe data/ directory for a fresh start
```

## Project Structure

```
packages/
  server/            # Express + SQLite backend
    src/
      connectors/    # Slack, Telegram bridges
      platform-tools/# Built-in agent tools (memory, todos, scheduling, messaging, board)
      plugins/       # Opt-in plugins (brave-search, youtube, gemini-image, etc.)
  web/               # React + Vite + Tailwind frontend
data/                # SQLite DB, agent sessions, workspace files (gitignored)
docs/                # Architecture and design docs
```

## How It Works

Each agent gets a persistent session for interactive chat and isolated sessions for scheduled or triggered invocations. Non-interactive work flows through an invocation queue with retry and exponential backoff.

All state changes propagate through an in-memory event bus to the frontend via WebSocket, so the UI stays live.

## Configuration

Plugins are configured through environment variables. Copy the relevant vars into your `.env` file to enable them:

| Plugin | Required Env Var |
|--------|-----------------|
| Brave Search | `BRAVE_SEARCH_API_KEY` |
| Gemini Image | `GEMINI_API_KEY` |
| ElevenLabs | `ELEVENLABS_API_KEY` |
| YouTube | `YOUTUBE_API_KEY` |

Connectors (Slack, Telegram) are configured per-agent through the web UI's integration settings.

## License

MIT

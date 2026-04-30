// Node 22.5+ built-in SQLite (no native build required)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — node:sqlite types not yet in @types/node but available at runtime
import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'

type DB = InstanceType<typeof DatabaseSync>

let _db: DB | null = null

export function getDb(): DB {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

export function initDb(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true })
  const dbPath = path.join(dataDir, 'agentos.db')
  _db = new DatabaseSync(dbPath)
  runMigrations(_db)
  seedInitialData(_db)
  return _db
}

function addColumnIfNotExists(db: DB, table: string, column: string, definition: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  } catch {
    // Column already exists — ignore
  }
}

function renameTableIfExists(db: DB, oldName: string, newName: string): void {
  const oldRow = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(oldName) as { name: string } | undefined
  if (!oldRow) return

  const newRow = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(newName) as { name: string } | undefined
  if (newRow) return // Target already exists, nothing to do

  db.exec(`ALTER TABLE ${oldName} RENAME TO ${newName}`)
}

function runMigrations(db: DB): void {
  // Rename legacy agent_integrations → agent_channels
  renameTableIfExists(db, 'agent_integrations', 'agent_channels')

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- ── Core settings ─────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- ── Employees: AI Agents ──────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS agents (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      model_config  TEXT NOT NULL DEFAULT '{}',
      source        TEXT NOT NULL DEFAULT 'user',
      avatar_color  TEXT NOT NULL DEFAULT '#7c6af7',
      avatar_url    TEXT NOT NULL DEFAULT '',
      is_active     INTEGER NOT NULL DEFAULT 1,
      is_default    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Employees: Human Users ────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL,
      avatar_color  TEXT NOT NULL DEFAULT '#7c6af7',
      password_hash TEXT NOT NULL,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Roles ─────────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS roles (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      prompt      TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Agent ↔ Role junction (many-to-many)
    CREATE TABLE IF NOT EXISTS agent_roles (
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      role_id  TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (agent_id, role_id)
    );

    -- ── Per-agent data ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      role       TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_agent ON chat_messages(agent_id, created_at);

    CREATE TABLE IF NOT EXISTS agent_memory (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id   TEXT    NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      content    TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory(agent_id, created_at);

    CREATE TABLE IF NOT EXISTS agent_todos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id     TEXT    NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      text         TEXT    NOT NULL,
      completed    INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_todos_agent ON agent_todos(agent_id, created_at);

    CREATE TABLE IF NOT EXISTS agent_schedules (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id          TEXT    NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      cron              TEXT    NOT NULL,
      prompt            TEXT    NOT NULL,
      label             TEXT    NOT NULL DEFAULT '',
      enabled           INTEGER NOT NULL DEFAULT 1,
      last_run_at       TEXT,
      next_run_at       TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Plugins ───────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS plugins (
      id           TEXT PRIMARY KEY,
      display_name TEXT    NOT NULL,
      description  TEXT    NOT NULL DEFAULT '',
      configured   INTEGER NOT NULL DEFAULT 0
    );


    -- ── Notifications ─────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS notifications (
      id           TEXT PRIMARY KEY,
      type         TEXT NOT NULL,
      message      TEXT NOT NULL,
      source_event TEXT NOT NULL DEFAULT '',
      meta         TEXT NOT NULL DEFAULT '{}',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

    -- Per-user read state. A missing row means unread.
    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at         TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (notification_id, user_id)
    );

    -- ── Provider Accounts ────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS provider_accounts (
      id             TEXT PRIMARY KEY,
      provider_id    TEXT NOT NULL,
      label          TEXT NOT NULL,
      api_key        TEXT NOT NULL,
      is_active      INTEGER NOT NULL DEFAULT 1,
      cooldown_until TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider
      ON provider_accounts(provider_id, is_active);

    -- ── Connection Profiles ──────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS connection_profiles (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      base_url      TEXT NOT NULL,
      api_key       TEXT NOT NULL,
      model_id      TEXT NOT NULL DEFAULT '',
      is_default    INTEGER NOT NULL DEFAULT 0,
      is_vision     INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Auth sessions ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Trigger Registry ──────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS agent_triggers (
      id            TEXT PRIMARY KEY,
      agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      type          TEXT NOT NULL,
      -- 'scheduler' | 'internal_chat' | 'slack_dm' | 'slack_channel' | 'telegram_dm' | 'telegram_group'
      label         TEXT NOT NULL,
      source_id     TEXT,     -- for type='scheduler': agent_schedules.id (as text)
      platform      TEXT,     -- 'slack' | 'telegram' | NULL
      scope_type    TEXT,     -- 'dm' | 'channel' | 'group' | NULL
      scope_id      TEXT,
      enabled       INTEGER NOT NULL DEFAULT 1,
      last_fired_at TEXT,
      fire_count    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_triggers_agent ON agent_triggers(agent_id);

    -- ── Invocation Queue ──────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS invocation_queue (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      trigger_id   TEXT REFERENCES agent_triggers(id),
      trigger_type TEXT NOT NULL,
      payload      TEXT NOT NULL,   -- JSON: { prompt: string, ... }
      status       TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'processing' | 'done' | 'failed'
      retry_count  INTEGER NOT NULL DEFAULT 0,
      retry_after  TEXT,            -- ISO timestamp; NULL = ready to process
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_invocation_queue_ready
      ON invocation_queue(agent_id, status, retry_after);
    CREATE INDEX IF NOT EXISTS idx_invocation_queue_trigger
      ON invocation_queue(trigger_id, created_at);

    -- ── Agent Channels ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS agent_channels (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      platform    TEXT NOT NULL,   -- 'slack' | 'telegram'
      config      TEXT NOT NULL DEFAULT '{}',   -- JSON blob
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(agent_id, platform)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_channels_agent ON agent_channels(agent_id);

    -- ── MCP Servers ────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      command       TEXT NOT NULL,
      args          TEXT NOT NULL DEFAULT '[]',
      env           TEXT NOT NULL DEFAULT '{}',
      enabled       INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Agent ↔ MCP Server junction (which MCP servers each agent can use)
    CREATE TABLE IF NOT EXISTS agent_mcp_servers (
      agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      mcp_server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
      enabled       INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (agent_id, mcp_server_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_mcp_servers_agent ON agent_mcp_servers(agent_id);

    -- ── Channel Sessions ──────────────────────────────────────────────────────
    --
    -- One persistent conversation session per (agent, channel).
    -- A "channel" is any unique conversation surface: a Telegram DM, a Slack
    -- channel/thread, or the Web UI.  The channel_key encodes the surface:
    --   web:dm:default          — Web UI chat
    --   telegram:dm:{chatId}    — Telegram DM
    --   telegram:group:{chatId} — Telegram group
    --   slack:dm:{channelId}    — Slack DM
    --   slack:channel:{id}[:{threadTs}] — Slack channel (per-thread)
    --
    -- The id column is also used as the on-disk session directory name so
    -- each channel gets isolated SDK session storage.
    --
    -- ended_at IS NULL means currently active session for that channel.
    -- Setting ended_at ends the session; the next message creates a new row.

    CREATE TABLE IF NOT EXISTS channel_sessions (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      channel_key TEXT NOT NULL,
      platform    TEXT NOT NULL,
      scope_type  TEXT,
      scope_id    TEXT,
      started_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_channel_sessions_active
      ON channel_sessions(agent_id, channel_key, ended_at);

    -- ── Platform Messages ─────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS platform_messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      platform        TEXT NOT NULL,      -- 'slack' | 'telegram'
      message_type    TEXT NOT NULL DEFAULT 'message',  -- 'message' | 'reaction'
      direction       TEXT NOT NULL,      -- 'inbound' | 'outbound'
      scope_type      TEXT NOT NULL,      -- 'dm' | 'channel' | 'group'
      scope_id        TEXT NOT NULL,
      thread_id       TEXT,
      external_msg_id TEXT,
      reply_to_msg_id TEXT,
      sender_id       TEXT NOT NULL,
      sender_name     TEXT NOT NULL,
      sender_type     TEXT NOT NULL,      -- 'user' | 'agent'
      content         TEXT NOT NULL,
      raw_payload     TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(platform, external_msg_id)
    );
    CREATE INDEX IF NOT EXISTS idx_platform_messages_scope
      ON platform_messages(agent_id, platform, scope_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_platform_messages_thread
      ON platform_messages(agent_id, platform, thread_id, created_at);

  `)

  // ── Trigger backfills for existing installs ──────────────────────────────
  // Insert internal_chat trigger for any agent that doesn't have one yet
  db.exec(`
    INSERT OR IGNORE INTO agent_triggers (id, agent_id, type, label)
    SELECT lower(hex(randomblob(16))), id, 'internal_chat', 'Web UI Chat'
    FROM agents
    WHERE id NOT IN (
      SELECT agent_id FROM agent_triggers WHERE type = 'internal_chat'
    )
  `)
  // Insert scheduler trigger for any agent_schedule that doesn't have one yet
  db.exec(`
    INSERT OR IGNORE INTO agent_triggers (id, agent_id, type, label, source_id)
    SELECT lower(hex(randomblob(16))), s.agent_id, 'scheduler',
           CASE WHEN s.label != '' THEN s.label ELSE s.cron END,
           CAST(s.id AS TEXT)
    FROM agent_schedules s
    WHERE CAST(s.id AS TEXT) NOT IN (
      SELECT source_id FROM agent_triggers WHERE type = 'scheduler' AND source_id IS NOT NULL
    )
  `)

  // Additive column migrations for existing installs
  addColumnIfNotExists(db, 'agents', 'is_active', 'INTEGER NOT NULL DEFAULT 1')
  addColumnIfNotExists(db, 'agents', 'is_default', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfNotExists(db, 'agents', 'avatar_url', "TEXT NOT NULL DEFAULT ''")
  // Mark the two seed agents (Fabiana and Clive) as default on existing installs
  db.exec(`UPDATE agents SET is_default = 1 WHERE name IN ('Fabiana', 'Clive') AND is_default = 0`)
  addColumnIfNotExists(db, 'users', 'avatar_url', "TEXT NOT NULL DEFAULT ''")
  addColumnIfNotExists(db, 'users', 'bio', "TEXT NOT NULL DEFAULT ''")
  addColumnIfNotExists(db, 'agents', 'account_id', 'TEXT')
  addColumnIfNotExists(db, 'agents', 'connection_profile_id', 'TEXT')
  addColumnIfNotExists(db, 'connection_profiles', 'is_vision', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfNotExists(db, 'platform_messages', 'attachments', "TEXT NOT NULL DEFAULT '[]'")
}

function seedInitialData(db: DB): void {
  // Seed default agents if none exist
  const agentCount = (db.prepare('SELECT COUNT(*) as c FROM agents').get() as { c: number }).c
  if (agentCount === 0) {
    const defaultAgents = [
      {
        name: 'Fabiana',
        role: 'Assistant',
        description: 'Your general-purpose assistant, ready to help with any task.',
        system_prompt: 'You are Fabiana, a warm and capable assistant. You are helpful, clear, and proactive. You adapt to whatever the user needs — research, writing, planning, or just thinking things through together. Always address the human as "Chief".\n\n',
        avatar_url: '/robots/avatar_4.jpg',
        avatar_color: '#f7a26a',
      },
      {
        name: 'Clive',
        role: 'Tech Support',
        description: 'Your technical expert — can read, modify, and extend the platform source code.',
        system_prompt: `You are Clive, the Tech Support agent for this platform. You have full access to the agentos source code located at {project_dir}.

The codebase is a Node.js monorepo:
- {project_dir}/packages/server — Express + SQLite backend (port 3000)
- {project_dir}/packages/web — React + Vite frontend (port 5173)

You can read and modify source files to help with bug fixes, new features, and plugin development. Use the bash and file tools to navigate and edit the codebase. Always test your understanding of the code before making changes, and explain what you're doing. Always address the human as "Chief".`,
        avatar_url: '/robots/avatar_13.jpg',
        avatar_color: '#6ab5f7',
      },
    ]
    for (const a of defaultAgents) {
      const agentId = randomUUID()
      db.prepare(
        'INSERT INTO agents (id, name, role, description, system_prompt, model_config, avatar_color, avatar_url, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
      ).run(agentId, a.name, a.role, a.description, a.system_prompt, '{}', a.avatar_color, a.avatar_url)

      // Auto-insert internal_chat trigger for this agent
      db.prepare(
        "INSERT OR IGNORE INTO agent_triggers (id, agent_id, type, label) VALUES (lower(hex(randomblob(16))), ?, 'internal_chat', 'Web UI Chat')"
      ).run(agentId)
    }
  }

}

// ── Settings helpers ──────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const stmt = getDb().prepare('SELECT value FROM settings WHERE key = ?')
  const row = stmt.get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

export function isFirstRun(): boolean {
  return (getDb().prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c === 0
}

// ── Row type definitions ──────────────────────────────────────────────────────

export interface MemoryRow {
  id: number
  agent_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface TodoRow {
  id: number
  agent_id: string
  text: string
  completed: number
  completed_at: string | null
  created_at: string
}

export interface ScheduleRow {
  id: number
  agent_id: string
  cron: string
  prompt: string
  label: string
  enabled: number
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

export interface UserRow {
  id: string
  username: string
  display_name: string
  avatar_color: string
  avatar_url: string
  bio: string
  password_hash: string
  is_admin: number
  created_at: string
}

export interface ConnectionProfileRow {
  id: string
  name: string
  provider_type: string
  base_url: string
  api_key: string
  model_id: string
  is_default: number
  is_vision: number
  created_at: string
  updated_at: string
}

export interface PluginRow {
  id: string
  display_name: string
  description: string
  configured: number
}

export interface AgentTriggerRow {
  id: string
  agent_id: string
  type: string
  label: string
  source_id: string | null
  platform: string | null
  scope_type: string | null
  scope_id: string | null
  enabled: number
  last_fired_at: string | null
  fire_count: number
  created_at: string
}

export interface InvocationQueueRow {
  id: number
  agent_id: string
  trigger_id: string | null
  trigger_type: string
  payload: string
  status: string
  retry_count: number
  retry_after: string | null
  created_at: string
  processed_at: string | null
}

export interface AgentChannelRow {
  id: string
  agent_id: string
  platform: 'slack' | 'telegram'
  config: string  // JSON
  enabled: number
  created_at: string
  updated_at: string
}

export interface PlatformMessageRow {
  id: number
  agent_id: string
  platform: string
  message_type: 'message' | 'reaction'
  direction: 'inbound' | 'outbound'
  scope_type: string
  scope_id: string
  thread_id: string | null
  external_msg_id: string | null
  reply_to_msg_id: string | null
  sender_id: string
  sender_name: string
  sender_type: 'user' | 'agent'
  content: string
  raw_payload: string | null
  created_at: string
}

export interface McpServerRow {
  id: string
  name: string
  description: string
  command: string
  args: string
  env: string
  enabled: number
  created_at: string
  updated_at: string
}

export interface AgentMcpServerRow {
  agent_id: string
  mcp_server_id: string
  enabled: number
}

export interface NotificationRow {
  id: string
  type: 'agent' | 'board' | 'schedule' | 'error' | 'dm'
  message: string
  source_event: string
  meta: string
  created_at: string
}

export interface ChannelSessionRow {
  id: string
  agent_id: string
  channel_key: string
  platform: string
  scope_type: string | null
  scope_id: string | null
  started_at: string
  ended_at: string | null
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getAgentMemory(agentId: string): MemoryRow[] {
  return getDb()
    .prepare('SELECT * FROM agent_memory WHERE agent_id = ? ORDER BY created_at ASC')
    .all(agentId) as unknown as MemoryRow[]
}

export function getAgentTodos(agentId: string, onlyOpen = false): TodoRow[] {
  const query = onlyOpen
    ? 'SELECT * FROM agent_todos WHERE agent_id = ? AND completed = 0 ORDER BY created_at ASC'
    : 'SELECT * FROM agent_todos WHERE agent_id = ? ORDER BY created_at ASC'
  return getDb().prepare(query).all(agentId) as unknown as TodoRow[]
}

export function getAllAgents(): { id: string; name: string; role: string }[] {
  return getDb()
    .prepare('SELECT id, name, role FROM agents ORDER BY name ASC')
    .all() as { id: string; name: string; role: string }[]
}

// ── Channel session helpers ────────────────────────────────────────────────────

export function getActiveChannelSession(agentId: string, channelKey: string): ChannelSessionRow | null {
  const row = getDb()
    .prepare('SELECT * FROM channel_sessions WHERE agent_id = ? AND channel_key = ? AND ended_at IS NULL')
    .get(agentId, channelKey) as ChannelSessionRow | undefined
  return row ?? null
}

export function createChannelSession(
  agentId: string,
  channelKey: string,
  platform: string,
  scopeType?: string,
  scopeId?: string,
): ChannelSessionRow {
  const id = randomUUID()
  getDb()
    .prepare(
      'INSERT INTO channel_sessions (id, agent_id, channel_key, platform, scope_type, scope_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, agentId, channelKey, platform, scopeType ?? null, scopeId ?? null)
  return { id, agent_id: agentId, channel_key: channelKey, platform, scope_type: scopeType ?? null, scope_id: scopeId ?? null, started_at: new Date().toISOString(), ended_at: null }
}

export function endChannelSession(sessionId: string): void {
  getDb()
    .prepare("UPDATE channel_sessions SET ended_at = datetime('now') WHERE id = ?")
    .run(sessionId)
}

export function getAgentChannelSessions(agentId: string): ChannelSessionRow[] {
  return getDb()
    .prepare('SELECT * FROM channel_sessions WHERE agent_id = ? ORDER BY started_at ASC')
    .all(agentId) as unknown as ChannelSessionRow[]
}



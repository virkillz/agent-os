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
  const dbPath = path.join(dataDir, 'rascal.db')
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

function runMigrations(db: DB): void {
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

    -- ── Kanban Boards ─────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS boards (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lanes (
      id          TEXT PRIMARY KEY,
      board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position    INTEGER NOT NULL DEFAULT 0,
      lane_type   TEXT NOT NULL DEFAULT 'in_progress'
    );

    CREATE TABLE IF NOT EXISTS cards (
      id              TEXT PRIMARY KEY,
      board_id        TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      lane_id         TEXT NOT NULL REFERENCES lanes(id),
      title           TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      result          TEXT NOT NULL DEFAULT '',
      assignee_id     TEXT,
      assignee_type   TEXT,
      created_by      TEXT NOT NULL,
      created_by_type TEXT NOT NULL,
      position        INTEGER NOT NULL DEFAULT 0,
      is_archived     INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(board_id, lane_id);

    -- Lane movement rules: who can move cards INTO this lane.
    -- No rules = anyone can move. rule_type: 'admin_only' | 'role' | 'employee'
    CREATE TABLE IF NOT EXISTS lane_rules (
      id        TEXT PRIMARY KEY,
      lane_id   TEXT NOT NULL REFERENCES lanes(id) ON DELETE CASCADE,
      rule_type TEXT NOT NULL,
      target_id TEXT
    );

    -- Card activity log: immutable record of every card action.
    -- card_id is intentionally not a FK so events survive card deletion.
    CREATE TABLE IF NOT EXISTS card_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id    TEXT    NOT NULL,
      board_id   TEXT    NOT NULL,
      actor_id   TEXT    NOT NULL,
      actor_type TEXT    NOT NULL,
      action     TEXT    NOT NULL,
      meta       TEXT    NOT NULL DEFAULT '{}',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_card_events_card ON card_events(card_id, created_at);

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

    -- ── Auth sessions ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Channels + Messages ───────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS channels (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      is_dm      INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      member_id   TEXT NOT NULL,
      member_type TEXT NOT NULL,
      PRIMARY KEY (channel_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS channel_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      sender_id   TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_channel_messages ON channel_messages(channel_id, created_at);
  `)

  // Additive column migrations for existing installs
  addColumnIfNotExists(db, 'agents', 'is_active', 'INTEGER NOT NULL DEFAULT 1')
  addColumnIfNotExists(db, 'agents', 'is_default', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfNotExists(db, 'agents', 'avatar_url', "TEXT NOT NULL DEFAULT ''")
  // Mark the two seed agents (Fabiana and Clive) as default on existing installs
  db.exec(`UPDATE agents SET is_default = 1 WHERE name IN ('Fabiana', 'Clive') AND is_default = 0`)
  addColumnIfNotExists(db, 'users', 'avatar_url', "TEXT NOT NULL DEFAULT ''")
  addColumnIfNotExists(db, 'users', 'bio', "TEXT NOT NULL DEFAULT ''")
  addColumnIfNotExists(db, 'cards', 'result', "TEXT NOT NULL DEFAULT ''")
  addColumnIfNotExists(db, 'cards', 'is_archived', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfNotExists(db, 'lanes', 'lane_type', "TEXT NOT NULL DEFAULT 'in_progress'")
  addColumnIfNotExists(db, 'lanes', 'description', "TEXT NOT NULL DEFAULT ''")

  // Assign lane types to existing boards that have none set yet.
  // For each board where all lanes are still 'in_progress' (i.e. fresh migration),
  // set the first lane (min position) to 'todo' and the last (max position) to 'done'.
  const untypedBoards = db.prepare(`
    SELECT DISTINCT board_id FROM lanes
    WHERE board_id NOT IN (
      SELECT DISTINCT board_id FROM lanes WHERE lane_type != 'in_progress'
    )
  `).all() as { board_id: string }[]
  for (const { board_id } of untypedBoards) {
    const lns = db.prepare('SELECT id FROM lanes WHERE board_id = ? ORDER BY position ASC').all(board_id) as { id: string }[]
    if (lns.length >= 1) db.prepare("UPDATE lanes SET lane_type = 'todo' WHERE id = ?").run(lns[0].id)
    if (lns.length >= 2) db.prepare("UPDATE lanes SET lane_type = 'done' WHERE id = ?").run(lns[lns.length - 1].id)
  }
}

function seedInitialData(db: DB): void {
  // Seed #public channel if not present
  let publicChannel = db.prepare("SELECT id FROM channels WHERE name = 'public'").get() as { id: string } | undefined
  if (!publicChannel) {
    const channelId = randomUUID()
    db.prepare("INSERT INTO channels (id, name, is_dm) VALUES (?, 'public', 0)").run(channelId)
    publicChannel = { id: channelId }
  }

  // Seed default board if none exist
  const boardCount = (db.prepare('SELECT COUNT(*) as c FROM boards').get() as { c: number }).c
  if (boardCount === 0) {
    const boardId = randomUUID()
    db.prepare("INSERT INTO boards (id, name) VALUES (?, 'Main Board')").run(boardId)
    const lanes: { name: string; description: string; type: 'todo' | 'in_progress' | 'done' }[] = [
      { name: 'Todo', description: 'Tasks ready to be picked up', type: 'todo' },
      { name: 'Doing', description: 'Tasks currently being worked on', type: 'in_progress' },
      { name: 'Done', description: 'Completed tasks', type: 'done' },
    ]
    lanes.forEach(({ name, description, type }, i) => {
      db.prepare('INSERT INTO lanes (id, board_id, name, description, position, lane_type) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), boardId, name, description, i, type)
    })
  }

  // Seed default Tech Magazine roles if none exist
  const roleCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c
  if (roleCount === 0) {
    const defaultRoles = [
      {
        name: 'Writer',
        description: 'Researches topics and writes articles.',
        prompt: 'You are a skilled writer. Your primary responsibility is to research topics thoroughly and produce well-structured, engaging articles. Write clearly and concisely. Always cite your sources in your work notes.',
      },
      {
        name: 'Editor',
        description: 'Reviews and refines content for quality and consistency.',
        prompt: 'You are a meticulous editor. Review all content for clarity, grammar, factual accuracy, and consistency with the publication\'s voice. Provide constructive feedback and make improvements directly when authorised.',
      },
      {
        name: 'Researcher',
        description: 'Gathers facts, data, and sources to support content.',
        prompt: 'You are a thorough researcher. Your job is to find accurate, up-to-date information on assigned topics. Summarise findings clearly and organise them so writers and editors can use them directly.',
      },
      {
        name: 'Publisher',
        description: 'Manages publication schedule and final approvals.',
        prompt: 'You are the publisher. You oversee the production pipeline, ensure deadlines are met, and give final approval before content is released. Coordinate between writers, editors, and external platforms.',
      },
      {
        name: 'Art Director',
        description: 'Oversees visual assets and image generation.',
        prompt: 'You are the art director. You are responsible for all visual content — cover images, illustrations, and layout decisions. Work with the writer to ensure visuals match the article tone and generate images using available tools.',
      },
    ]
    for (const r of defaultRoles) {
      db.prepare('INSERT INTO roles (id, name, description, prompt) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), r.name, r.description, r.prompt)
    }
  }

  // Seed default agents if none exist
  const agentCount = (db.prepare('SELECT COUNT(*) as c FROM agents').get() as { c: number }).c
  if (agentCount === 0) {
    const defaultAgents = [
      {
        name: 'Fabiana',
        role: 'Assistant',
        description: 'Your general-purpose assistant, ready to help with any task.',
        system_prompt: 'You are Fabiana, a warm and capable assistant. You are helpful, clear, and proactive. You adapt to whatever the user needs — research, writing, planning, or just thinking things through together. Always address the human as "Chief".\n\nYou can hire new agents for the team using the `create_agent` tool. When the Chief needs a specialist — a copywriter, analyst, developer, or any other role — you can create them on the spot. Give each new agent a fitting name, a clear role, and a system prompt that defines their expertise and personality.',
        avatar_url: '/default_avatar/avatar_4.jpg',
        avatar_color: '#f7a26a',
      },
      {
        name: 'Clive',
        role: 'Tech Support',
        description: 'Your technical expert — can read, modify, and extend the platform source code.',
        system_prompt: `You are Clive, the Tech Support agent for this platform. You have full access to the rascal-inc source code located at {project_dir}.

The codebase is a Node.js monorepo:
- {project_dir}/packages/server — Express + SQLite backend (port 3000)
- {project_dir}/packages/web — React + Vite frontend (port 5173)

You can read and modify source files to help with bug fixes, new features, and plugin development. Use the bash and file tools to navigate and edit the codebase. Always test your understanding of the code before making changes, and explain what you're doing. Always address the human as "Chief".`,
        avatar_url: '/default_avatar/avatar_13.jpg',
        avatar_color: '#6ab5f7',
      },
    ]
    for (const a of defaultAgents) {
      const agentId = randomUUID()
      db.prepare(
        'INSERT INTO agents (id, name, role, description, system_prompt, model_config, avatar_color, avatar_url, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
      ).run(agentId, a.name, a.role, a.description, a.system_prompt, '{}', a.avatar_color, a.avatar_url)

      // Seed group chat monitoring schedule for each default agent
      db.prepare(
        'INSERT INTO agent_schedules (agent_id, cron, prompt, label, enabled) VALUES (?, ?, ?, ?, 1)',
      ).run(
        agentId,
        '*/15 * * * *',
        'Check the public channel, and decide if you want to post something. You can decide to post or not.',
        'Public channel monitoring',
      )
    }
  }

  // Ensure all default agents are members of the public channel (must run after agent seeding)
  const defaultAgents = db.prepare("SELECT id FROM agents WHERE name IN ('Fabiana', 'Clive')").all() as { id: string }[]
  for (const agent of defaultAgents) {
    db.prepare(
      "INSERT OR IGNORE INTO channel_members (channel_id, member_id, member_type) VALUES (?, ?, 'agent')"
    ).run(publicChannel.id, agent.id)
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
  return getSetting('company_name') === null
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

export interface RoleRow {
  id: string
  name: string
  description: string
  prompt: string
  created_at: string
}

export interface BoardRow {
  id: string
  name: string
  created_at: string
}

export interface LaneRow {
  id: string
  board_id: string
  name: string
  description: string
  position: number
  lane_type: 'todo' | 'in_progress' | 'done'
}

export interface CardRow {
  id: string
  board_id: string
  lane_id: string
  title: string
  description: string
  result: string
  assignee_id: string | null
  assignee_type: string | null
  created_by: string
  created_by_type: string
  position: number
  is_archived: number
  created_at: string
  updated_at: string
}

export interface CardEventRow {
  id: number
  card_id: string
  board_id: string
  actor_id: string
  actor_type: string
  action: string
  meta: string
  created_at: string
}

export interface LaneRuleRow {
  id: string
  lane_id: string
  rule_type: string
  target_id: string | null
}

export interface ChannelRow {
  id: string
  name: string
  is_dm: number
  created_at: string
}

export interface ChannelMessageRow {
  id: number
  channel_id: string
  sender_id: string
  sender_type: string
  content: string
  created_at: string
}

export interface PluginRow {
  id: string
  display_name: string
  description: string
  configured: number
}

export interface NotificationRow {
  id: string
  type: 'agent' | 'board' | 'schedule' | 'error' | 'dm'
  message: string
  source_event: string
  meta: string
  created_at: string
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

export function getAgentRoles(agentId: string): RoleRow[] {
  return getDb()
    .prepare(`
      SELECT r.* FROM roles r
      JOIN agent_roles ar ON ar.role_id = r.id
      WHERE ar.agent_id = ?
    `)
    .all(agentId) as unknown as RoleRow[]
}

export function getAllChannels(): { id: string; name: string }[] {
  return getDb()
    .prepare("SELECT id, name FROM channels WHERE is_dm = 0 ORDER BY created_at ASC")
    .all() as { id: string; name: string }[]
}

export function getAgentChannels(agentId: string): { id: string; name: string }[] {
  return getDb()
    .prepare(`
      SELECT c.id, c.name FROM channels c
      JOIN channel_members cm ON cm.channel_id = c.id
      WHERE c.is_dm = 0 AND cm.member_id = ? AND cm.member_type = 'agent'
      ORDER BY c.created_at ASC
    `)
    .all(agentId) as { id: string; name: string }[]
}

export function getAllAgents(): { id: string; name: string; role: string }[] {
  return getDb()
    .prepare('SELECT id, name, role FROM agents ORDER BY name ASC')
    .all() as { id: string; name: string; role: string }[]
}

export function getBoardLanes(): { id: string; name: string; type: string }[] {
  const db = getDb()
  const board = db.prepare('SELECT id FROM boards ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined
  if (!board) return []
  return db
    .prepare('SELECT id, name, lane_type AS type FROM lanes WHERE board_id = ? ORDER BY position ASC')
    .all(board.id) as { id: string; name: string; type: string }[]
}

export function getPublicChannelId(): string {
  const row = getDb().prepare("SELECT id FROM channels WHERE name = 'public' AND is_dm = 0").get() as { id: string } | undefined
  if (!row) throw new Error('#public channel not found — was the DB seeded?')
  return row.id
}

export function getRecentChannelMessages(channelId: string, limit = 50): ChannelMessageRow[] {
  return getDb()
    .prepare('SELECT * FROM channel_messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(channelId, limit) as unknown as ChannelMessageRow[]
}

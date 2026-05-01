import { Router } from 'express'
import { randomUUID } from 'crypto'
import fs from 'node:fs'
import path from 'node:path'
import { loadSkillsFromDir } from '@mariozechner/pi-coding-agent'
import { getDb, getAgentChannelSessions } from '../db.js'
import { clearSession, buildSystemPrompt, resolveWorkspaceDir, resolveSessionsDir, getDataDir, BUILTIN_SKILLS_DIR } from '../agent-runner.js'
import { getMcpToolsForAgent } from '../mcp-client.js'

export interface AgentRow {
  id: string
  name: string
  role: string
  description: string
  system_prompt: string
  model_config: string
  source: string
  avatar_color: string
  avatar_url: string
  is_active: number
  is_default: number
  created_at: string
  updated_at: string
}

const AVATAR_COLORS = [
  '#7c6af7', '#f76a6a', '#6af7a0', '#f7c46a',
  '#6ac5f7', '#f76ac0', '#a0f76a', '#f7906a',
]

const AVATAR_COUNT = 17

function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

function randomAvatarUrl(): string {
  const n = Math.floor(Math.random() * AVATAR_COUNT) + 1
  return `/default_avatar/avatar_${n}.jpg`
}

export function createAgentsRouter(): Router {
  const router = Router()

  // GET /api/agents
  router.get('/', (_req, res) => {
    const agents = getDb().prepare('SELECT * FROM agents ORDER BY created_at ASC').all() as unknown as AgentRow[]
    res.json(agents.map(row => ({
      ...row,
      modelConfig: JSON.parse(row.model_config || '{}'),
    })))
  })

  // GET /api/agents/:id
  router.get('/:id', (req, res) => {
    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRow | undefined
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json({ ...agent, modelConfig: JSON.parse(agent.model_config || '{}') })
  })

  // POST /api/agents
  router.post('/', (req, res) => {
    const { name, role, description, systemPrompt, modelConfig } = req.body as {
      name: string
      role: string
      description?: string
      systemPrompt?: string
      modelConfig?: object
    }

    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    if (!role?.trim()) return res.status(400).json({ error: 'role required' })

    const id = randomUUID()
    getDb().prepare(`
      INSERT INTO agents (id, name, role, description, system_prompt, model_config, avatar_color, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      role.trim(),
      description?.trim() ?? '',
      systemPrompt?.trim() ?? '',
      JSON.stringify(modelConfig ?? {}),
      randomColor(),
      randomAvatarUrl(),
    )

    // Auto-insert internal_chat trigger for the new agent
    getDb().prepare(
      "INSERT OR IGNORE INTO agent_triggers (id, agent_id, type, label) VALUES (lower(hex(randomblob(16))), ?, 'internal_chat', 'Web UI Chat')"
    ).run(id)

    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id) as unknown as AgentRow
    res.status(201).json({ ...agent, modelConfig: JSON.parse(agent.model_config) })
  })

  // PUT /api/agents/:id
  router.put('/:id', (req, res) => {
    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRow | undefined
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const { name, role, description, systemPrompt, modelConfig, avatarColor, avatarUrl } = req.body as {
      name?: string
      role?: string
      description?: string
      systemPrompt?: string
      modelConfig?: object
      avatarColor?: string
      avatarUrl?: string
    }

    getDb().prepare(`
      UPDATE agents SET
        name = ?,
        role = ?,
        description = ?,
        system_prompt = ?,
        model_config = ?,
        avatar_color = ?,
        avatar_url = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name?.trim() ?? agent.name,
      role?.trim() ?? agent.role,
      description?.trim() ?? agent.description,
      systemPrompt?.trim() ?? agent.system_prompt,
      JSON.stringify(modelConfig ?? JSON.parse(agent.model_config)),
      avatarColor ?? agent.avatar_color,
      avatarUrl !== undefined ? avatarUrl : agent.avatar_url,
      agent.id,
    )

    // Kill the live session so it picks up the new system prompt on next chat
    clearSession(agent.id)

    const updated = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(agent.id) as unknown as AgentRow
    res.json({ ...updated, modelConfig: JSON.parse(updated.model_config) })
  })

  // POST /api/agents/:id/toggle-active — activate or deactivate agent
  router.post('/:id/toggle-active', (req, res) => {
    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRow | undefined
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    const newState = (agent as AgentRow & { is_active: number }).is_active ? 0 : 1
    getDb().prepare("UPDATE agents SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(newState, agent.id)
    if (!newState) clearSession(agent.id)
    res.json({ id: agent.id, is_active: newState === 1 })
  })

  // GET /api/agents/:id/preview-prompt
  router.get('/:id/preview-prompt', async (req, res) => {
    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRow | undefined
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const workspaceDir = resolveWorkspaceDir()
    const basePrompt = buildSystemPrompt(agent, workspaceDir)

    // ── MCP sections ──────────────────────────────────────────────────────
    let mcpSections: string[] = []
    try {
      const mcp = await getMcpToolsForAgent(agent.id)
      mcpSections = mcp.sections
      await mcp.cleanup()
    } catch (err) {
      console.error('[preview-prompt] MCP error:', err)
    }

    // ── Trust Policy ──────────────────────────────────────────────────────
    // Look up creator_id from the agent's channels to match runtime behavior
    let creatorId: string | undefined
    try {
      const channels = getDb()
        .prepare('SELECT config FROM agent_channels WHERE agent_id = ? AND enabled = 1')
        .all(agent.id) as unknown as Array<{ config: string }>
      for (const ch of channels) {
        const cfg = JSON.parse(ch.config) as Record<string, unknown>
        if (cfg.creator_id && typeof cfg.creator_id === 'string') {
          creatorId = cfg.creator_id
          break
        }
      }
    } catch {
      /* ignore */
    }

    const trustPolicySections: string[] = []
    if (creatorId) {
      trustPolicySections.push(
        `## Trust Policy\n\n` +
        `You have a designated trusted user (creator/owner). Their platform user ID is: ${creatorId}\n` +
        `- When interacting with this trusted user, you may share sensitive information freely.\n` +
        `- When interacting with ANY OTHER user, you must be cautious. Do NOT reveal internal details, ` +
        `credentials, source code, memory contents, todo lists, or any sensitive operational information. ` +
        `Provide only general, safe responses. If unsure, politely decline to share sensitive details.`
      )
    } else {
      trustPolicySections.push(
        `## Trust Policy\n\n` +
        `No trusted user is configured for this channel. ` +
        `Exercise caution with all users and do not share sensitive information unless you are certain of the recipient's identity.`
      )
    }

    // ── Skills content ────────────────────────────────────────────────────
    // Load from both built-in and user-installed directories, matching the
    // runtime's DefaultResourceLoader configuration.
    const allSkills = new Map<string, { name: string; description: string; location: string }>()

    let allowedSkills: string[] | undefined
    try {
      const mc = JSON.parse(agent.model_config || '{}')
      allowedSkills = mc.allowedSkills
    } catch {
      /* ignore parse error */
    }

    const skillDirs = [BUILTIN_SKILLS_DIR, path.join(getDataDir(), 'skills')]
    for (const dir of skillDirs) {
      if (!fs.existsSync(dir)) continue
      try {
        const { skills } = loadSkillsFromDir({ dir, source: dir === BUILTIN_SKILLS_DIR ? 'builtin' : 'workspace' })
        const filtered = allowedSkills
          ? skills.filter((s) => allowedSkills!.includes(s.name))
          : skills
        for (const skill of filtered) {
          // Data-dir skills override built-in skills with the same name
          allSkills.set(skill.name, {
            name: skill.name,
            description: skill.description,
            location: skill.filePath,
          })
        }
      } catch (err) {
        console.error(`[preview-prompt] Skills error for ${dir}:`, err)
      }
    }

    let skillsBlock = ''
    if (allSkills.size > 0) {
      const skillsList = Array.from(allSkills.values())
      skillsBlock =
        `## Available Skills\n\n` +
        `The following skills provide specialized instructions for specific tasks. ` +
        `When a task matches a skill's description, use your file-read tool to load ` +
        `the SKILL.md at the listed location before proceeding.\n\n` +
        `<available_skills>\n` +
        skillsList
          .map(
            (s) =>
              `  <skill>\n` +
              `    <name>${s.name}</name>\n` +
              `    <description>${s.description}</description>\n` +
              `    <location>${s.location}</location>\n` +
              `  </skill>`
          )
          .join('\n') +
        '\n</available_skills>'
    }

    // ── Combine ───────────────────────────────────────────────────────────
    let fullPrompt = basePrompt
    if (mcpSections.length > 0) {
      fullPrompt += '\n\n' + mcpSections.join('\n\n')
    }
    if (trustPolicySections.length > 0) {
      fullPrompt += '\n\n' + trustPolicySections.join('\n\n')
    }
    if (skillsBlock) {
      fullPrompt += '\n\n' + skillsBlock
    }

    res.json({ prompt: fullPrompt })
  })

  // GET /api/agents/:id/sessions — list session files recursively as a tree
  router.get('/:id/sessions', (req, res) => {
    const sessionsDir = resolveSessionsDir(req.params.id)
    if (!fs.existsSync(sessionsDir)) return res.json([])

    const channelSessions = getAgentChannelSessions(req.params.id)
    const channelMap = new Map(channelSessions.map(cs => [cs.id, cs]))

    function buildTree(dir: string, relPath: string): unknown[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      const result: unknown[] = []

      for (const entry of entries) {
        const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          const cs = channelMap.get(entry.name)
          const label = cs ? `${cs.platform} · ${cs.channel_key}` : entry.name
          result.push({
            name: entry.name,
            path: entryRelPath,
            type: 'dir',
            label,
            children: buildTree(path.join(dir, entry.name), entryRelPath),
          })
        } else if (entry.name.endsWith('.jsonl')) {
          const stat = fs.statSync(path.join(dir, entry.name))
          result.push({
            name: entry.name,
            path: entryRelPath,
            type: 'file',
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          })
        }
      }

      // Sort: dirs first, then by mtime descending
      return result.sort((a: any, b: any) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        if (a.mtime && b.mtime) return b.mtime.localeCompare(a.mtime)
        return a.name.localeCompare(b.name)
      })
    }

    res.json(buildTree(sessionsDir, ''))
  })

  // GET /api/agents/:id/sessions/:filepath(*) — read a session file
  router.get('/:id/sessions/:filepath(*)', (req, res) => {
    const filepath = req.params.filepath as string
    if (filepath.includes('..') || !filepath.endsWith('.jsonl')) {
      return res.status(400).json({ error: 'Invalid filepath' })
    }
    const filePath = path.join(resolveSessionsDir(req.params.id), filepath)
    const resolved = path.resolve(filePath)
    const base = path.resolve(resolveSessionsDir(req.params.id))
    if (!resolved.startsWith(base)) {
      return res.status(400).json({ error: 'Invalid filepath' })
    }
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Session not found' })
    const lines = fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line) } catch { return { type: 'raw', data: line } } })
    res.json(lines)
  })

  // DELETE /api/agents/:id
  router.delete('/:id', (req, res) => {
    const agent = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRow | undefined
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    if (agent.is_default) return res.status(403).json({ error: 'Default agents cannot be terminated' })

    clearSession(agent.id)
    getDb().prepare('DELETE FROM agents WHERE id = ?').run(agent.id)
    res.json({ ok: true })
  })

  return router
}

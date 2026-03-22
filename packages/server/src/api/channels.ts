import { Router } from 'express'
import { randomUUID } from 'crypto'
import {
  getDb,
  getPublicChannelId,
  type ChannelRow,
  type ChannelMessageRow,
} from '../db.js'
import { requireAuth, requireAdmin, type AuthRequest } from '../auth.js'
import { eventBus } from '../event-bus.js'
import { chatWithAgent, type AgentRecord } from '../agent-runner.js'
import { getSetting } from '../db.js'
import type { AgentRow } from './agents.js'

// ── @mention detection ────────────────────────────────────────────────────────

/** Extract all @usernames mentioned in a message. */
function extractMentions(content: string): string[] {
  const matches = content.match(/@([\w-]+)/g) ?? []
  return matches.map((m) => m.slice(1).toLowerCase())
}

function getDefaultModel() {
  const stored = getSetting('default_model')
  if (stored) {
    try { return JSON.parse(stored) } catch { /* fall through */ }
  }
  return { provider: 'openrouter', modelId: 'moonshotai/kimi-k2.5', thinkingLevel: 'low' }
}

/** Build context string from recent channel messages to pass to the agent. */
function buildChannelContext(channelId: string, limit = 50): string {
  const db = getDb()
  const messages = db
    .prepare('SELECT * FROM channel_messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(channelId, limit) as unknown as ChannelMessageRow[]
  messages.reverse()

  if (!messages.length) return ''

  const lines = messages.map((m) => {
    const name = m.sender_type === 'agent'
      ? (db.prepare('SELECT name FROM agents WHERE id = ?').get(m.sender_id) as { name: string } | undefined)?.name ?? m.sender_id
      : (db.prepare('SELECT display_name FROM users WHERE id = ?').get(m.sender_id) as { display_name: string } | undefined)?.display_name ?? m.sender_id
    return `[${m.created_at}] ${name}: ${m.content}`
  })

  return `## Recent channel history\n${lines.join('\n')}`
}

/** Trigger an agent to respond in a channel (async, fire-and-forget). */
async function triggerAgentResponse(
  agent: AgentRow,
  channelId: string,
  triggerMessage: string,
): Promise<void> {
  const context = buildChannelContext(channelId)
  const prompt = context
    ? `${context}\n\nYou are ${agent.name}. You have been mentioned. Reply as yourself to: ${triggerMessage}`
    : `You are ${agent.name}. Reply as yourself to: ${triggerMessage}`

  const agentRecord: AgentRecord = {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    description: agent.description,
    system_prompt: agent.system_prompt,
    model_config: agent.model_config,
    source: agent.source,
  }

  try {
    const reply = await chatWithAgent(agentRecord, prompt, getDefaultModel())

    const msgId = (getDb()
      .prepare('INSERT INTO channel_messages (channel_id, sender_id, sender_type, content) VALUES (?, ?, ?, ?)')
      .run(channelId, agent.id, 'agent', reply) as { lastInsertRowid: number | bigint }).lastInsertRowid as number

    eventBus.emit({
      type: 'channel:message',
      channelId,
      senderId: agent.id,
      senderType: 'agent',
      senderName: agent.name,
      content: reply,
      messageId: msgId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    eventBus.emit({ type: 'agent:error', agentId: agent.id, error: msg })
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createChannelsRouter(): Router {
  const router = Router()

  // GET /api/channels/dms — list all DM channels the current user is a member of
  router.get('/dms', requireAuth, (req: AuthRequest, res) => {
    const userId = req.user!.id
    const db = getDb()

    const rows = db.prepare(`
      SELECT c.id, c.name, c.is_dm, c.created_at,
             cm_other.member_id AS partner_id, cm_other.member_type AS partner_type
      FROM channels c
      JOIN channel_members cm_me  ON cm_me.channel_id  = c.id AND cm_me.member_id  = ?
      JOIN channel_members cm_other ON cm_other.channel_id = c.id AND cm_other.member_id != ?
      WHERE c.is_dm = 1
      ORDER BY c.created_at ASC
    `).all(userId, userId) as { id: string; name: string; is_dm: number; created_at: string; partner_id: string; partner_type: string }[]

    const enriched = rows.map((row) => {
      let partner_name = row.partner_id
      let partner_avatar_color = '#7c6af7'
      if (row.partner_type === 'agent') {
        const agent = db.prepare('SELECT name, avatar_color FROM agents WHERE id = ?').get(row.partner_id) as { name: string; avatar_color: string } | undefined
        if (agent) { partner_name = agent.name; partner_avatar_color = agent.avatar_color }
      } else {
        const user = db.prepare('SELECT display_name, avatar_color FROM users WHERE id = ?').get(row.partner_id) as { display_name: string; avatar_color: string } | undefined
        if (user) { partner_name = user.display_name; partner_avatar_color = user.avatar_color }
      }
      return { ...row, partner_name, partner_avatar_color }
    })

    res.json(enriched)
  })

  // GET /api/channels — list all non-DM channels
  router.get('/', requireAuth, (_req, res) => {
    const channels = getDb()
      .prepare('SELECT * FROM channels WHERE is_dm = 0 ORDER BY created_at ASC')
      .all() as unknown as ChannelRow[]
    res.json(channels)
  })

  // POST /api/channels (admin only)
  router.post('/', requireAdmin, (req: AuthRequest, res) => {
    const { name } = req.body as { name?: string }
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-')
    const existing = getDb().prepare('SELECT id FROM channels WHERE name = ?').get(slug)
    if (existing) return res.status(409).json({ error: 'Channel name already exists' })
    const id = randomUUID()
    getDb().prepare("INSERT INTO channels (id, name, is_dm) VALUES (?, ?, 0)").run(id, slug)
    res.status(201).json(getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id))
  })

  // DELETE /api/channels/:id (admin only; cannot delete #public)
  router.delete('/:id', requireAdmin, (req, res) => {
    const channel = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id) as unknown as ChannelRow | undefined
    if (!channel) return res.status(404).json({ error: 'Channel not found' })
    if (channel.name === 'public') return res.status(400).json({ error: 'Cannot delete #public channel' })
    getDb().prepare('DELETE FROM channels WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  })

  // GET /api/channels/:id/messages
  router.get('/:id/messages', requireAuth, (req, res) => {
    const channel = getDb().prepare('SELECT id FROM channels WHERE id = ?').get(req.params.id)
    if (!channel) return res.status(404).json({ error: 'Channel not found' })
    const limit = Math.min(Number(req.query.limit ?? 100), 500)
    const messages = getDb()
      .prepare('SELECT * FROM channel_messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT ?')
      .all(req.params.id, limit) as unknown as ChannelMessageRow[]
    res.json(messages)
  })

  // POST /api/channels/:id/messages — send a message
  router.post('/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    const channel = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id) as unknown as ChannelRow | undefined
    if (!channel) return res.status(404).json({ error: 'Channel not found' })

    const { content } = req.body as { content?: string }
    if (!content?.trim()) return res.status(400).json({ error: 'content required' })

    const sender = req.user!
    const msgId = (getDb()
      .prepare('INSERT INTO channel_messages (channel_id, sender_id, sender_type, content) VALUES (?, ?, ?, ?)')
      .run(req.params.id, sender.id, 'user', content.trim()) as { lastInsertRowid: number | bigint }).lastInsertRowid as number

    eventBus.emit({
      type: 'channel:message',
      channelId: req.params.id,
      senderId: sender.id,
      senderType: 'user',
      senderName: sender.display_name,
      content: content.trim(),
      messageId: msgId,
    })

    // Check for @mentions and trigger active agents
    const mentions = extractMentions(content.trim())
    if (mentions.length > 0) {
      const agents = getDb()
        .prepare('SELECT * FROM agents WHERE is_active = 1')
        .all() as unknown as AgentRow[]
      for (const agent of agents) {
        if (mentions.includes(agent.name.toLowerCase())) {
          // Fire-and-forget; response arrives via WS
          triggerAgentResponse(agent, req.params.id, content.trim()).catch(() => {})
        }
      }
    }

    res.status(201).json({ id: msgId })
  })

  // ── DMs ───────────────────────────────────────────────────────────────────

  // GET /api/channels/dm/:partnerId — get or create DM channel with a partner
  router.get('/dm/:partnerId', requireAuth, (req: AuthRequest, res) => {
    const myId = req.user!.id
    const partnerId = req.params.partnerId

    // Find existing DM between these two
    const existing = getDb()
      .prepare(`
        SELECT c.* FROM channels c
        JOIN channel_members cm1 ON cm1.channel_id = c.id AND cm1.member_id = ?
        JOIN channel_members cm2 ON cm2.channel_id = c.id AND cm2.member_id = ?
        WHERE c.is_dm = 1
        LIMIT 1
      `)
      .get(myId, partnerId) as unknown as ChannelRow | undefined

    if (existing) return res.json(existing)

    // Create new DM channel
    const id = randomUUID()
    getDb().prepare("INSERT INTO channels (id, name, is_dm) VALUES (?, ?, 1)").run(id, `dm-${id}`)
    getDb().prepare('INSERT INTO channel_members (channel_id, member_id, member_type) VALUES (?, ?, ?)').run(id, myId, 'user')

    // Partner can be a user or an agent
    const partnerUser = getDb().prepare('SELECT id FROM users WHERE id = ?').get(partnerId)
    const partnerType = partnerUser ? 'user' : 'agent'
    getDb().prepare('INSERT INTO channel_members (channel_id, member_id, member_type) VALUES (?, ?, ?)').run(id, partnerId, partnerType)

    res.status(201).json(getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id))
  })

  // POST /api/channels/dm/:channelId/messages — send DM (handles agent auto-reply)
  router.post('/dm/:channelId/messages', requireAuth, async (req: AuthRequest, res) => {
    const channel = getDb().prepare('SELECT * FROM channels WHERE id = ? AND is_dm = 1').get(req.params.channelId) as unknown as ChannelRow | undefined
    if (!channel) return res.status(404).json({ error: 'DM channel not found' })

    const { content } = req.body as { content?: string }
    if (!content?.trim()) return res.status(400).json({ error: 'content required' })

    const sender = req.user!
    const msgId = (getDb()
      .prepare('INSERT INTO channel_messages (channel_id, sender_id, sender_type, content) VALUES (?, ?, ?, ?)')
      .run(req.params.channelId, sender.id, 'user', content.trim()) as { lastInsertRowid: number | bigint }).lastInsertRowid as number

    eventBus.emit({
      type: 'channel:message',
      channelId: req.params.channelId,
      senderId: sender.id,
      senderType: 'user',
      senderName: sender.display_name,
      content: content.trim(),
      messageId: msgId,
    })

    // If the other member is an active agent, trigger response
    const otherMember = getDb()
      .prepare("SELECT * FROM channel_members WHERE channel_id = ? AND member_id != ?")
      .get(req.params.channelId, sender.id) as { member_id: string; member_type: string } | undefined

    if (otherMember?.member_type === 'agent') {
      const agent = getDb().prepare('SELECT * FROM agents WHERE id = ? AND is_active = 1').get(otherMember.member_id) as AgentRow | undefined
      if (agent) {
        triggerAgentResponse(agent, req.params.channelId, content.trim()).catch(() => {})
      }
    }

    res.status(201).json({ id: msgId })
  })

  // PATCH /api/channels/:id/messages/:msgId — edit a message
  router.patch('/:id/messages/:msgId', requireAuth, (req, res) => {
    const { content } = req.body as { content: string }
    if (!content?.trim()) return res.status(400).json({ error: 'content required' })
    const result = getDb()
      .prepare('UPDATE channel_messages SET content = ? WHERE id = ? AND channel_id = ?')
      .run(content.trim(), req.params.msgId, req.params.id) as { changes: number }
    if (result.changes === 0) return res.status(404).json({ error: 'Message not found' })
    res.json({ ok: true })
  })

  // DELETE /api/channels/:id/messages/:msgId — delete a single message
  router.delete('/:id/messages/:msgId', requireAuth, (req, res) => {
    const result = getDb()
      .prepare('DELETE FROM channel_messages WHERE id = ? AND channel_id = ?')
      .run(req.params.msgId, req.params.id) as { changes: number }
    if (result.changes === 0) return res.status(404).json({ error: 'Message not found' })
    res.json({ ok: true })
  })

  // GET /api/channels/:id/members — list agent members of a channel
  router.get('/:id/members', requireAuth, (req, res) => {
    const channel = getDb().prepare('SELECT id FROM channels WHERE id = ? AND is_dm = 0').get(req.params.id)
    if (!channel) return res.status(404).json({ error: 'Channel not found' })
    const members = getDb()
      .prepare(`
        SELECT a.id, a.name, a.role, a.avatar_color FROM agents a
        JOIN channel_members cm ON cm.member_id = a.id
        WHERE cm.channel_id = ? AND cm.member_type = 'agent'
        ORDER BY a.name ASC
      `)
      .all(req.params.id)
    res.json(members)
  })

  // POST /api/channels/:id/members — add an agent to a channel
  router.post('/:id/members', requireAdmin, (req, res) => {
    const { agentId } = req.body as { agentId?: string }
    if (!agentId) return res.status(400).json({ error: 'agentId required' })
    const channel = getDb().prepare('SELECT id FROM channels WHERE id = ? AND is_dm = 0').get(req.params.id)
    if (!channel) return res.status(404).json({ error: 'Channel not found' })
    const agent = getDb().prepare('SELECT id FROM agents WHERE id = ?').get(agentId)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    getDb()
      .prepare('INSERT OR IGNORE INTO channel_members (channel_id, member_id, member_type) VALUES (?, ?, ?)')
      .run(req.params.id, agentId, 'agent')
    res.status(201).json({ ok: true })
  })

  // DELETE /api/channels/:id/members/:agentId — remove an agent from a channel
  router.delete('/:id/members/:agentId', requireAdmin, (req, res) => {
    getDb()
      .prepare("DELETE FROM channel_members WHERE channel_id = ? AND member_id = ? AND member_type = 'agent'")
      .run(req.params.id, req.params.agentId)
    res.json({ ok: true })
  })

  // GET /api/channels/public — convenience shortcut
  router.get('/public', requireAuth, (_req, res) => {
    try {
      const id = getPublicChannelId()
      const channel = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id)
      res.json(channel)
    } catch {
      res.status(500).json({ error: 'Public channel not found' })
    }
  })

  return router
}

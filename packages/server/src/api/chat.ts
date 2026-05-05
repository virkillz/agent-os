import { Router } from 'express'
import { getDb } from '../db.js'
import { endAndClearChannelSession } from '../agent-runner.js'
import { enqueueInvocation } from '../queue-worker.js'
import type { AgentRow } from './agents.js'

interface MessageRow {
  id: number
  agent_id: string
  role: 'user' | 'assistant'
  content: string
  attachments: string
  created_at: string
}

export function createChatRouter(): Router {
  const router = Router()

  // GET /api/agents/:id/chat — fetch history
  router.get('/:id/chat', (req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM chat_messages WHERE agent_id = ? ORDER BY created_at ASC')
      .all(req.params.id) as unknown as MessageRow[]
    const messages = rows.map((r) => ({
      ...r,
      attachments: JSON.parse(r.attachments || '[]'),
    }))
    res.json(messages)
  })

  // POST /api/agents/:id/chat — send message (async via queue)
  router.post('/:id/chat', (req, res) => {
    const agent = getDb()
      .prepare('SELECT * FROM agents WHERE id = ?')
      .get(req.params.id) as AgentRow | undefined

    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const { message } = req.body as { message: string }
    if (!message?.trim()) return res.status(400).json({ error: 'message required' })

    const db = getDb()
    const trimmed = message.trim()

    // Persist user message immediately so it appears in history right away
    db.prepare('INSERT INTO chat_messages (agent_id, role, content) VALUES (?, ?, ?)')
      .run(agent.id, 'user', trimmed)

    db.prepare(`
      INSERT INTO platform_messages
        (agent_id, platform, message_type, direction, scope_type, scope_id,
         sender_id, sender_name, sender_type, content)
      VALUES (?, 'web', 'message', 'inbound', 'dm', 'default', 'user', 'User', 'user', ?)
    `).run(agent.id, trimmed)

    // Enqueue — agent runs decoupled from this HTTP request; reply delivered via chat:message WebSocket event
    const queueId = enqueueInvocation({
      agentId: agent.id,
      triggerId: null,
      triggerType: 'internal_chat',
      prompt: trimmed,
      webChat: true,
    })

    res.json({ ok: true, queueId })
  })

  // DELETE /api/agents/:id/chat — clear history and end the web channel session
  router.delete('/:id/chat', (req, res) => {
    getDb()
      .prepare('DELETE FROM chat_messages WHERE agent_id = ?')
      .run(req.params.id)

    // End the channel session so the next message starts a fresh conversation
    endAndClearChannelSession(req.params.id, 'web:dm:default')

    res.json({ ok: true })
  })

  // PATCH /api/agents/:id/chat/:msgId — edit a message
  router.patch('/:id/chat/:msgId', (req, res) => {
    const { content } = req.body as { content: string }
    if (!content?.trim()) return res.status(400).json({ error: 'content required' })
    const result = getDb()
      .prepare('UPDATE chat_messages SET content = ? WHERE id = ? AND agent_id = ?')
      .run(content.trim(), req.params.msgId, req.params.id) as { changes: number }
    if (result.changes === 0) return res.status(404).json({ error: 'Message not found' })
    res.json({ ok: true })
  })

  // DELETE /api/agents/:id/chat/:msgId — delete a single message
  router.delete('/:id/chat/:msgId', (req, res) => {
    const result = getDb()
      .prepare('DELETE FROM chat_messages WHERE id = ? AND agent_id = ?')
      .run(req.params.msgId, req.params.id) as { changes: number }
    if (result.changes === 0) return res.status(404).json({ error: 'Message not found' })
    res.json({ ok: true })
  })

  return router
}

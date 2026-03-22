import { Router } from 'express'
import { getDb, getSetting } from '../db.js'
import { chatWithAgent, clearSession, type AgentRecord } from '../agent-runner.js'
import type { AgentRow } from './agents.js'

interface MessageRow {
  id: number
  agent_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

function getDefaultModel() {
  const stored = getSetting('default_model')
  if (stored) {
    try { return JSON.parse(stored) } catch { /* fall through */ }
  }
  return { provider: 'openrouter', modelId: 'moonshotai/kimi-k2.5', thinkingLevel: 'low' }
}

export function createChatRouter(): Router {
  const router = Router()

  // GET /api/agents/:id/chat — fetch history
  router.get('/:id/chat', (req, res) => {
    const messages = getDb()
      .prepare('SELECT * FROM chat_messages WHERE agent_id = ? ORDER BY created_at ASC')
      .all(req.params.id) as unknown as MessageRow[]
    res.json(messages)
  })

  // POST /api/agents/:id/chat — send message
  router.post('/:id/chat', async (req, res) => {
    const agent = getDb()
      .prepare('SELECT * FROM agents WHERE id = ?')
      .get(req.params.id) as AgentRow | undefined

    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const { message } = req.body as { message: string }
    if (!message?.trim()) return res.status(400).json({ error: 'message required' })

    // Persist user message
    getDb()
      .prepare('INSERT INTO chat_messages (agent_id, role, content) VALUES (?, ?, ?)')
      .run(agent.id, 'user', message.trim())

    try {
      const agentRecord: AgentRecord = {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        description: agent.description,
        system_prompt: agent.system_prompt,
        model_config: agent.model_config,
        source: agent.source,
      }

      const reply = await chatWithAgent(agentRecord, message.trim(), getDefaultModel())

      // Persist assistant reply
      getDb()
        .prepare('INSERT INTO chat_messages (agent_id, role, content) VALUES (?, ?, ?)')
        .run(agent.id, 'assistant', reply)

      res.json({ reply })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[chat] Error for agent ${agent.name} (${agent.id}):`, err)
      res.status(500).json({ error: msg })
    }
  })

  // DELETE /api/agents/:id/chat — clear history and reset session
  router.delete('/:id/chat', (req, res) => {
    getDb()
      .prepare('DELETE FROM chat_messages WHERE agent_id = ?')
      .run(req.params.id)

    clearSession(req.params.id)

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

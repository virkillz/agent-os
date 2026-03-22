import { Router } from 'express'
import { getDb, type MemoryRow } from '../db.js'
import { clearSession } from '../agent-runner.js'
import { eventBus } from '../event-bus.js'

export function createMemoryRouter(): Router {
  const router = Router()

  // GET /api/agents/:id/memory
  router.get('/:id/memory', (req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM agent_memory WHERE agent_id = ? ORDER BY created_at ASC')
      .all(req.params.id) as unknown as MemoryRow[]
    res.json(rows)
  })

  // POST /api/agents/:id/memory
  router.post('/:id/memory', (req, res) => {
    const { content } = req.body as { content?: string }
    if (!content?.trim()) {
      res.status(400).json({ error: 'content is required' })
      return
    }
    const db = getDb()
    const result = db
      .prepare('INSERT INTO agent_memory (agent_id, content) VALUES (?, ?)')
      .run(req.params.id, content.trim())
    const row = db
      .prepare('SELECT * FROM agent_memory WHERE id = ?')
      .get(result.lastInsertRowid) as unknown as MemoryRow
    clearSession(req.params.id)
    eventBus.emit({ type: 'memory:created', agentId: req.params.id, entry: row })
    res.status(201).json(row)
  })

  // PUT /api/agents/:id/memory/:entryId
  router.put('/:id/memory/:entryId', (req, res) => {
    const { content } = req.body as { content?: string }
    if (!content?.trim()) {
      res.status(400).json({ error: 'content is required' })
      return
    }
    const db = getDb()
    db.prepare(
      "UPDATE agent_memory SET content = ?, updated_at = datetime('now') WHERE id = ? AND agent_id = ?"
    ).run(content.trim(), req.params.entryId, req.params.id)
    const row = db
      .prepare('SELECT * FROM agent_memory WHERE id = ?')
      .get(req.params.entryId) as unknown as MemoryRow | undefined
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    clearSession(req.params.id)
    res.json(row)
  })

  // DELETE /api/agents/:id/memory/:entryId
  router.delete('/:id/memory/:entryId', (req, res) => {
    getDb()
      .prepare('DELETE FROM agent_memory WHERE id = ? AND agent_id = ?')
      .run(req.params.entryId, req.params.id)
    clearSession(req.params.id)
    eventBus.emit({ type: 'memory:deleted', agentId: req.params.id, entryId: Number(req.params.entryId) })
    res.json({ ok: true })
  })

  return router
}

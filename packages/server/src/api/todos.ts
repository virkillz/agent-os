import { Router } from 'express'
import { getDb, type TodoRow } from '../db.js'
import { clearSession } from '../agent-runner.js'
import { eventBus } from '../event-bus.js'

export function createTodosRouter(): Router {
  const router = Router()

  // GET /api/agents/:id/todos
  router.get('/:id/todos', (req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM agent_todos WHERE agent_id = ? ORDER BY created_at ASC')
      .all(req.params.id) as unknown as TodoRow[]
    res.json(rows)
  })

  // POST /api/agents/:id/todos
  router.post('/:id/todos', (req, res) => {
    const { text } = req.body as { text?: string }
    if (!text?.trim()) {
      res.status(400).json({ error: 'text is required' })
      return
    }
    const db = getDb()
    const result = db
      .prepare('INSERT INTO agent_todos (agent_id, text) VALUES (?, ?)')
      .run(req.params.id, text.trim())
    const row = db
      .prepare('SELECT * FROM agent_todos WHERE id = ?')
      .get(result.lastInsertRowid) as unknown as TodoRow
    clearSession(req.params.id)
    eventBus.emit({ type: 'todo:created', agentId: req.params.id, todo: row })
    res.status(201).json(row)
  })

  // PATCH /api/agents/:id/todos/:todoId
  router.patch('/:id/todos/:todoId', (req, res) => {
    const { completed, text } = req.body as { completed?: boolean; text?: string }
    const db = getDb()
    const existing = db
      .prepare('SELECT * FROM agent_todos WHERE id = ? AND agent_id = ?')
      .get(req.params.todoId, req.params.id) as unknown as TodoRow | undefined
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    if (text !== undefined) {
      db.prepare('UPDATE agent_todos SET text = ? WHERE id = ?').run(text.trim(), req.params.todoId)
    }
    if (completed !== undefined) {
      const completedInt = completed ? 1 : 0
      const completedAt = completed ? "datetime('now')" : 'NULL'
      db.prepare(
        `UPDATE agent_todos SET completed = ?, completed_at = ${completedAt} WHERE id = ?`
      ).run(completedInt, req.params.todoId)
    }

    const row = db
      .prepare('SELECT * FROM agent_todos WHERE id = ?')
      .get(req.params.todoId) as unknown as TodoRow
    clearSession(req.params.id)
    eventBus.emit({ type: 'todo:updated', agentId: req.params.id, todo: row })
    res.json(row)
  })

  // DELETE /api/agents/:id/todos/:todoId
  router.delete('/:id/todos/:todoId', (req, res) => {
    getDb()
      .prepare('DELETE FROM agent_todos WHERE id = ? AND agent_id = ?')
      .run(req.params.todoId, req.params.id)
    clearSession(req.params.id)
    eventBus.emit({ type: 'todo:deleted', agentId: req.params.id, todoId: Number(req.params.todoId) })
    res.json({ ok: true })
  })

  return router
}

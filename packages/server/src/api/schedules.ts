import { Router } from 'express'
import { CronExpressionParser } from 'cron-parser'
import { getDb, type ScheduleRow } from '../db.js'
import { buildSystemPrompt, resolveWorkspaceDir, type AgentRecord } from '../agent-runner.js'

function computeNextRun(cron: string): string {
  return CronExpressionParser.parse(cron).next().toDate().toISOString()
}

export function createSchedulesRouter(): Router {
  const router = Router()

  // GET /api/agents/:id/schedules
  router.get('/:id/schedules', (req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM agent_schedules WHERE agent_id = ? ORDER BY created_at ASC')
      .all(req.params.id) as unknown as ScheduleRow[]
    res.json(rows)
  })

  // POST /api/agents/:id/schedules
  router.post('/:id/schedules', (req, res) => {
    const { cron, prompt, label } = req.body as { cron?: string; prompt?: string; label?: string }
    if (!cron?.trim() || !prompt?.trim()) {
      res.status(400).json({ error: 'cron and prompt are required' })
      return
    }
    let nextRun: string
    try {
      nextRun = computeNextRun(cron)
    } catch {
      res.status(400).json({ error: 'Invalid cron expression' })
      return
    }
    const db = getDb()
    const result = db
      .prepare(
        'INSERT INTO agent_schedules (agent_id, cron, prompt, label, next_run_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(req.params.id, cron.trim(), prompt.trim(), label?.trim() ?? '', nextRun)
    const row = db
      .prepare('SELECT * FROM agent_schedules WHERE id = ?')
      .get(result.lastInsertRowid) as unknown as ScheduleRow
    res.status(201).json(row)
  })

  // PATCH /api/agents/:id/schedules/:sid
  router.patch('/:id/schedules/:sid', (req, res) => {
    const db = getDb()
    const existing = db
      .prepare('SELECT * FROM agent_schedules WHERE id = ? AND agent_id = ?')
      .get(req.params.sid, req.params.id) as unknown as ScheduleRow | undefined
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const updates = req.body as Partial<Pick<ScheduleRow, 'cron' | 'prompt' | 'label' | 'enabled'>>


    if (updates.cron !== undefined) {
      try {
        computeNextRun(updates.cron)
      } catch {
        res.status(400).json({ error: 'Invalid cron expression' })
        return
      }
      const nextRun = computeNextRun(updates.cron)
      db.prepare('UPDATE agent_schedules SET cron = ?, next_run_at = ? WHERE id = ?')
        .run(updates.cron, nextRun, req.params.sid)
    }
    if (updates.prompt !== undefined) {
      db.prepare('UPDATE agent_schedules SET prompt = ? WHERE id = ?').run(updates.prompt, req.params.sid)
    }
    if (updates.label !== undefined) {
      db.prepare('UPDATE agent_schedules SET label = ? WHERE id = ?').run(updates.label, req.params.sid)
    }
    if (updates.enabled !== undefined) {
      db.prepare('UPDATE agent_schedules SET enabled = ? WHERE id = ?').run(updates.enabled, req.params.sid)
    }

    const row = db
      .prepare('SELECT * FROM agent_schedules WHERE id = ?')
      .get(req.params.sid) as unknown as ScheduleRow
    res.json(row)
  })

  // GET /api/agents/:id/schedules/:sid/preview
  router.get('/:id/schedules/:sid/preview', (req, res) => {
    const db = getDb()
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRecord | undefined
    const row = db
      .prepare('SELECT * FROM agent_schedules WHERE id = ? AND agent_id = ?')
      .get(req.params.sid, req.params.id) as unknown as ScheduleRow | undefined
    if (!agent || !row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const systemPrompt = buildSystemPrompt(agent, resolveWorkspaceDir())
    const prompt = `${systemPrompt}\n\n------------------------\nNow your current task is:\n${row.prompt}`
    res.json({ prompt })
  })

  // DELETE /api/agents/:id/schedules/:sid
  router.delete('/:id/schedules/:sid', (req, res) => {
    getDb()
      .prepare('DELETE FROM agent_schedules WHERE id = ? AND agent_id = ?')
      .run(req.params.sid, req.params.id)
    res.json({ ok: true })
  })

  return router
}

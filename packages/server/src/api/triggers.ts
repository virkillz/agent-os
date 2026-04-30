import { Router } from 'express'
import { getDb, type AgentTriggerRow } from '../db.js'
import { buildSystemPrompt, resolveWorkspaceDir, type AgentRecord } from '../agent-runner.js'

export function createTriggersRouter(): Router {
  const router = Router()

  // GET /api/agents/:id/triggers
  router.get('/:id/triggers', (req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM agent_triggers WHERE agent_id = ? ORDER BY created_at ASC')
      .all(req.params.id) as unknown as AgentTriggerRow[]
    res.json(rows)
  })

  // GET /api/agents/:id/triggers/:tid
  router.get('/:id/triggers/:tid', (req, res) => {
    const row = getDb()
      .prepare('SELECT * FROM agent_triggers WHERE id = ? AND agent_id = ?')
      .get(req.params.tid, req.params.id) as unknown as AgentTriggerRow | undefined
    if (!row) return res.status(404).json({ error: 'Trigger not found' })
    res.json(row)
  })

  // PATCH /api/agents/:id/triggers/:tid — enable/disable
  router.patch('/:id/triggers/:tid', (req, res) => {
    const db = getDb()
    const row = db
      .prepare('SELECT * FROM agent_triggers WHERE id = ? AND agent_id = ?')
      .get(req.params.tid, req.params.id) as unknown as AgentTriggerRow | undefined
    if (!row) return res.status(404).json({ error: 'Trigger not found' })

    const { enabled } = req.body as { enabled?: number }
    if (enabled !== undefined) {
      db.prepare('UPDATE agent_triggers SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, row.id)
    }

    const updated = db
      .prepare('SELECT * FROM agent_triggers WHERE id = ?')
      .get(row.id) as unknown as AgentTriggerRow
    res.json(updated)
  })

  // DELETE /api/agents/:id/triggers/:tid
  router.delete('/:id/triggers/:tid', (req, res) => {
    const db = getDb()
    const row = db
      .prepare('SELECT * FROM agent_triggers WHERE id = ? AND agent_id = ?')
      .get(req.params.tid, req.params.id) as unknown as AgentTriggerRow | undefined
    if (!row) return res.status(404).json({ error: 'Trigger not found' })

    // Prevent deletion of internal_chat trigger (it's permanent)
    if (row.type === 'internal_chat') {
      return res.status(400).json({ error: 'Cannot delete the internal chat trigger' })
    }

    // Clear FK references in invocation_queue so the DELETE succeeds
    db.prepare('UPDATE invocation_queue SET trigger_id = NULL WHERE trigger_id = ?').run(row.id)
    db.prepare('DELETE FROM agent_triggers WHERE id = ?').run(row.id)
    res.json({ ok: true })
  })

  // GET /api/agents/:id/triggers/:tid/preview-prompt
  router.get('/:id/triggers/:tid/preview-prompt', (req, res) => {
    const db = getDb()
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as unknown as AgentRecord | undefined
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const trigger = db
      .prepare('SELECT * FROM agent_triggers WHERE id = ? AND agent_id = ?')
      .get(req.params.tid, req.params.id) as unknown as AgentTriggerRow | undefined
    if (!trigger) return res.status(404).json({ error: 'Trigger not found' })

    const workspaceDir = resolveWorkspaceDir()
    const systemPrompt = buildSystemPrompt(agent, workspaceDir, true)

    // Build trigger context addendum based on trigger type
    let triggerContextAddendum = ''
    if (trigger.type === 'scheduler') {
      // Look up the schedule prompt
      const schedule = trigger.source_id
        ? db.prepare('SELECT prompt, label, cron FROM agent_schedules WHERE id = ?').get(Number(trigger.source_id)) as
            | { prompt: string; label: string; cron: string }
            | undefined
        : undefined

      triggerContextAddendum = [
        '[Trigger Context — Scheduler]',
        'You are running a scheduled task. No reply is needed — complete the task and use',
        'available tools (send_direct_message) if you need to communicate results.',
      ].join('\n')

      return res.json({
        system_prompt: systemPrompt,
        trigger_context_addendum: triggerContextAddendum,
        trigger_prompt: schedule?.prompt ?? '(schedule not found)',
        conversation_history: [],
        history_window: 0,
      })
    }

    if (trigger.type === 'internal_chat') {
      // Pull last 20 chat messages
      const history = db.prepare(
        'SELECT role, content, created_at FROM chat_messages WHERE agent_id = ? ORDER BY created_at DESC LIMIT 20'
      ).all(req.params.id) as { role: string; content: string; created_at: string }[]

      return res.json({
        system_prompt: systemPrompt,
        trigger_context_addendum: '',
        conversation_history: history.reverse().map((m) => ({
          sender: m.role === 'assistant' ? agent.name : 'user',
          sender_type: m.role === 'assistant' ? 'agent' : 'user',
          content: m.content,
          timestamp: m.created_at,
        })),
        history_window: 20,
        total_history_available: history.length,
      })
    }

    // Platform triggers (Slack/Telegram) — minimal preview for now
    res.json({
      system_prompt: systemPrompt,
      trigger_context_addendum: `[Trigger Context — ${trigger.type}]\nPlatform: ${trigger.platform ?? 'unknown'}, Scope: ${trigger.scope_type ?? 'unknown'} (${trigger.scope_id ?? 'unknown'})`,
      conversation_history: [],
      history_window: 20,
    })
  })

  // GET /api/agents/:id/invocations/summary — queue status counts for this agent
  router.get('/:id/invocations/summary', (req, res) => {
    const rows = getDb()
      .prepare('SELECT status, COUNT(*) as count FROM invocation_queue WHERE agent_id = ? GROUP BY status')
      .all(req.params.id) as { status: string; count: number }[]
    const summary: Record<string, number> = { pending: 0, processing: 0, done: 0, failed: 0 }
    for (const r of rows) summary[r.status] = (r.count as number)
    res.json(summary)
  })

  // GET /api/agents/:id/triggers/:tid/invocations — recent invocations for this trigger
  router.get('/:id/triggers/:tid/invocations', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100)
    const status = req.query.status as string | undefined

    let query = 'SELECT * FROM invocation_queue WHERE trigger_id = ?'
    const params: (string | number)[] = [req.params.tid]
    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }
    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    const rows = getDb().prepare(query).all(...params)
    res.json(rows)
  })

  return router
}

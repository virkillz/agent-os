import { Router } from 'express'
import { getDb, type AgentIntegrationRow, type PlatformMessageRow } from '../db.js'
import { eventBus } from '../event-bus.js'

// Mask sensitive token fields in config before sending to client
function maskConfig(platform: string, rawConfig: string): Record<string, unknown> {
  try {
    const cfg = JSON.parse(rawConfig) as Record<string, unknown>
    if (platform === 'slack') {
      if (cfg.app_token) cfg.app_token = '***'
      if (cfg.bot_token) cfg.bot_token = '***'
    } else if (platform === 'telegram') {
      if (cfg.bot_token) cfg.bot_token = '***'
    }
    return cfg
  } catch {
    return {}
  }
}

export function createIntegrationsRouter(): Router {
  const router = Router()

  // GET /api/agents/:id/integrations
  router.get('/:id/integrations', (req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM agent_integrations WHERE agent_id = ? ORDER BY created_at ASC')
      .all(req.params.id) as unknown as AgentIntegrationRow[]

    res.json(rows.map((r) => ({
      ...r,
      config: maskConfig(r.platform, r.config),
    })))
  })

  // POST /api/agents/:id/integrations
  router.post('/:id/integrations', (req, res) => {
    const db = getDb()
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const { platform, config } = req.body as { platform?: string; config?: Record<string, unknown> }
    if (!platform || !['slack', 'telegram'].includes(platform)) {
      return res.status(400).json({ error: 'platform must be "slack" or "telegram"' })
    }

    const configStr = JSON.stringify(config ?? {})
    try {
      db.prepare(
        'INSERT INTO agent_integrations (agent_id, platform, config) VALUES (?, ?, ?)'
      ).run(req.params.id, platform, configStr)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE')) {
        return res.status(409).json({ error: `Integration for ${platform} already exists` })
      }
      throw err
    }

    const created = db
      .prepare('SELECT * FROM agent_integrations WHERE agent_id = ? AND platform = ?')
      .get(req.params.id, platform) as unknown as AgentIntegrationRow

    eventBus.emit({ type: 'integration:config_updated', agentId: req.params.id, platform })
    res.status(201).json({ ...created, config: maskConfig(platform, created.config) })
  })

  // GET /api/agents/:id/integrations/:iid
  router.get('/:id/integrations/:iid', (req, res) => {
    const row = getDb()
      .prepare('SELECT * FROM agent_integrations WHERE id = ? AND agent_id = ?')
      .get(req.params.iid, req.params.id) as unknown as AgentIntegrationRow | undefined
    if (!row) return res.status(404).json({ error: 'Integration not found' })
    res.json({ ...row, config: maskConfig(row.platform, row.config) })
  })

  // PATCH /api/agents/:id/integrations/:iid
  router.patch('/:id/integrations/:iid', (req, res) => {
    const db = getDb()
    const row = db
      .prepare('SELECT * FROM agent_integrations WHERE id = ? AND agent_id = ?')
      .get(req.params.iid, req.params.id) as unknown as AgentIntegrationRow | undefined
    if (!row) return res.status(404).json({ error: 'Integration not found' })

    const { config, enabled } = req.body as { config?: Record<string, unknown>; enabled?: number }

    if (config !== undefined) {
      // Merge new config values onto the existing config (allows partial updates without re-sending tokens)
      const existing = JSON.parse(row.config) as Record<string, unknown>
      const merged: Record<string, unknown> = { ...existing }
      for (const [k, v] of Object.entries(config)) {
        // If value is '***', keep the existing value (client didn't change it)
        if (v !== '***') merged[k] = v
      }
      db.prepare("UPDATE agent_integrations SET config = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(merged), row.id)
    }

    if (enabled !== undefined) {
      db.prepare("UPDATE agent_integrations SET enabled = ?, updated_at = datetime('now') WHERE id = ?")
        .run(enabled ? 1 : 0, row.id)
    }

    const updated = db
      .prepare('SELECT * FROM agent_integrations WHERE id = ?')
      .get(row.id) as unknown as AgentIntegrationRow

    eventBus.emit({ type: 'integration:config_updated', agentId: req.params.id, platform: updated.platform })
    res.json({ ...updated, config: maskConfig(updated.platform, updated.config) })
  })

  // DELETE /api/agents/:id/integrations/:iid
  router.delete('/:id/integrations/:iid', (req, res) => {
    const db = getDb()
    const row = db
      .prepare('SELECT * FROM agent_integrations WHERE id = ? AND agent_id = ?')
      .get(req.params.iid, req.params.id) as unknown as AgentIntegrationRow | undefined
    if (!row) return res.status(404).json({ error: 'Integration not found' })

    // Delete associated platform trigger rows
    db.prepare('DELETE FROM agent_triggers WHERE agent_id = ? AND platform = ?').run(req.params.id, row.platform)
    db.prepare('DELETE FROM agent_integrations WHERE id = ?').run(row.id)

    eventBus.emit({ type: 'integration:config_updated', agentId: req.params.id, platform: row.platform })
    res.json({ ok: true })
  })

  // GET /api/agents/:id/platform-messages
  router.get('/:id/platform-messages', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const { platform, scope_id, thread_id } = req.query as Record<string, string | undefined>

    let query = 'SELECT * FROM platform_messages WHERE agent_id = ?'
    const params: (string | number)[] = [req.params.id]

    if (platform) { query += ' AND platform = ?'; params.push(platform) }
    if (scope_id) { query += ' AND scope_id = ?'; params.push(scope_id) }
    if (thread_id) { query += ' AND thread_id = ?'; params.push(thread_id) }

    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    const rows = getDb().prepare(query).all(...params) as unknown as PlatformMessageRow[]
    res.json(rows.reverse())
  })

  return router
}

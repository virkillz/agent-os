import { Router } from 'express'
import { getDb, type McpServerRow, type AgentMcpServerRow } from '../db.js'
import { eventBus } from '../event-bus.js'
import { randomUUID } from 'crypto'

export function createMcpRouter(): Router {
  const router = Router()

  // GET /api/mcp — list all MCP servers
  router.get('/', (_req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM mcp_servers ORDER BY name ASC')
      .all() as unknown as McpServerRow[]
    res.json(rows.map(formatRow))
  })

  // POST /api/mcp — create an MCP server
  router.post('/', (req, res) => {
    const { name, description, command, args, env } = req.body as {
      name?: string
      description?: string
      command?: string
      args?: string[]
      env?: Record<string, string>
    }
    if (!name?.trim() || !command?.trim()) {
      return res.status(400).json({ error: '"name" and "command" are required' })
    }
    const id = randomUUID()
    const db = getDb()
    db.prepare(
      `INSERT INTO mcp_servers (id, name, description, command, args, env) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, name.trim(), description?.trim() ?? '', command.trim(), JSON.stringify(args ?? []), JSON.stringify(env ?? {}))
    const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as unknown as McpServerRow
    eventBus.emit({ type: 'mcp:created', mcpServerId: id } as any)
    res.json(formatRow(row))
  })

  // PUT /api/mcp/:id — update an MCP server
  router.put('/:id', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id) as unknown as McpServerRow | undefined
    if (!row) return res.status(404).json({ error: 'MCP server not found' })

    const { name, description, command, args, env, enabled } = req.body as {
      name?: string
      description?: string
      command?: string
      args?: string[]
      env?: Record<string, string>
      enabled?: boolean
    }

    const sets: string[] = []
    const vals: (string | number)[] = []

    if (name !== undefined) { sets.push('name = ?'); vals.push(name.trim()) }
    if (description !== undefined) { sets.push('description = ?'); vals.push(description.trim()) }
    if (command !== undefined) { sets.push('command = ?'); vals.push(command.trim()) }
    if (args !== undefined) { sets.push('args = ?'); vals.push(JSON.stringify(args)) }
    if (env !== undefined) { sets.push('env = ?'); vals.push(JSON.stringify(env)) }
    if (enabled !== undefined) { sets.push('enabled = ?'); vals.push(enabled ? 1 : 0) }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')")
      vals.push(req.params.id)
      db.prepare(`UPDATE mcp_servers SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    }

    const updated = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id) as unknown as McpServerRow
    eventBus.emit({ type: 'mcp:updated', mcpServerId: req.params.id } as any)
    res.json(formatRow(updated))
  })

  // DELETE /api/mcp/:id — delete an MCP server
  router.delete('/:id', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(req.params.id) as unknown as McpServerRow | undefined
    if (!row) return res.status(404).json({ error: 'MCP server not found' })
    db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(req.params.id)
    eventBus.emit({ type: 'mcp:deleted', mcpServerId: req.params.id } as any)
    res.json({ ok: true })
  })

  // ── Agent-MCP association routes ─────────────────────────────────────────────

  // GET /api/mcp/agents/:agentId — list MCP servers for an agent
  router.get('/agents/:agentId', (req, res) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT ms.*, ams.enabled as agent_enabled
      FROM mcp_servers ms
      LEFT JOIN agent_mcp_servers ams ON ams.mcp_server_id = ms.id AND ams.agent_id = ?
      ORDER BY ms.name ASC
    `).all(req.params.agentId) as unknown as (McpServerRow & { agent_enabled: number | null })[]
    res.json(rows.map(r => ({
      ...formatRow(r),
      agentEnabled: r.agent_enabled === 1,
    })))
  })

  // PUT /api/mcp/agents/:agentId/:mcpServerId — toggle MCP server for agent
  router.put('/agents/:agentId/:mcpServerId', (req, res) => {
    const { enabled } = req.body as { enabled: boolean }
    const db = getDb()
    if (enabled) {
      db.prepare(
        `INSERT OR REPLACE INTO agent_mcp_servers (agent_id, mcp_server_id, enabled) VALUES (?, ?, 1)`
      ).run(req.params.agentId, req.params.mcpServerId)
    } else {
      db.prepare(
        `DELETE FROM agent_mcp_servers WHERE agent_id = ? AND mcp_server_id = ?`
      ).run(req.params.agentId, req.params.mcpServerId)
    }
    eventBus.emit({ type: 'agent:mcp-updated', agentId: req.params.agentId, mcpServerId: req.params.mcpServerId } as any)
    res.json({ ok: true })
  })

  return router
}

function formatRow(row: McpServerRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    command: row.command,
    args: JSON.parse(row.args || '[]'),
    env: JSON.parse(row.env || '{}'),
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

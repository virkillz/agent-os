import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getDb, type RoleRow } from '../db.js'
import { requireAuth, requireAdmin, type AuthRequest } from '../auth.js'

export function createRolesRouter(): Router {
  const router = Router()

  // GET /api/roles
  router.get('/', requireAuth, (_req, res) => {
    const roles = getDb().prepare('SELECT * FROM roles ORDER BY name ASC').all() as unknown as RoleRow[]
    res.json(roles)
  })

  // GET /api/roles/:id
  router.get('/:id', requireAuth, (req, res) => {
    const role = getDb().prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id) as unknown as RoleRow | undefined
    if (!role) return res.status(404).json({ error: 'Role not found' })
    res.json(role)
  })

  // POST /api/roles (admin only)
  router.post('/', requireAdmin, (req: AuthRequest, res) => {
    const { name, description, prompt } = req.body as {
      name?: string
      description?: string
      prompt?: string
    }
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })

    const existing = getDb().prepare('SELECT id FROM roles WHERE name = ?').get(name.trim())
    if (existing) return res.status(409).json({ error: 'Role name already exists' })

    const id = randomUUID()
    getDb()
      .prepare('INSERT INTO roles (id, name, description, prompt) VALUES (?, ?, ?, ?)')
      .run(id, name.trim(), description?.trim() ?? '', prompt?.trim() ?? '')

    const role = getDb().prepare('SELECT * FROM roles WHERE id = ?').get(id) as unknown as RoleRow
    res.status(201).json(role)
  })

  // PUT /api/roles/:id (admin only)
  router.put('/:id', requireAdmin, (req: AuthRequest, res) => {
    const role = getDb().prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id) as unknown as RoleRow | undefined
    if (!role) return res.status(404).json({ error: 'Role not found' })

    const { name, description, prompt } = req.body as {
      name?: string
      description?: string
      prompt?: string
    }

    getDb()
      .prepare('UPDATE roles SET name = ?, description = ?, prompt = ? WHERE id = ?')
      .run(name?.trim() ?? role.name, description?.trim() ?? role.description, prompt?.trim() ?? role.prompt, role.id)

    const updated = getDb().prepare('SELECT * FROM roles WHERE id = ?').get(role.id) as unknown as RoleRow
    res.json(updated)
  })

  // DELETE /api/roles/:id (admin only)
  router.delete('/:id', requireAdmin, (req: AuthRequest, res) => {
    const role = getDb().prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id) as unknown as RoleRow | undefined
    if (!role) return res.status(404).json({ error: 'Role not found' })
    getDb().prepare('DELETE FROM roles WHERE id = ?').run(role.id)
    res.json({ ok: true })
  })

  // GET /api/roles/agent/:agentId — roles assigned to an agent
  router.get('/agent/:agentId', requireAuth, (req, res) => {
    const roles = getDb()
      .prepare(`
        SELECT r.* FROM roles r
        JOIN agent_roles ar ON ar.role_id = r.id
        WHERE ar.agent_id = ?
        ORDER BY r.name ASC
      `)
      .all(req.params.agentId) as unknown as RoleRow[]
    res.json(roles)
  })

  // PUT /api/roles/agent/:agentId — replace role assignments for an agent (admin only)
  router.put('/agent/:agentId', requireAdmin, (req: AuthRequest, res) => {
    const agent = getDb().prepare('SELECT id FROM agents WHERE id = ?').get(req.params.agentId)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const { roleIds } = req.body as { roleIds?: string[] }
    if (!Array.isArray(roleIds)) return res.status(400).json({ error: 'roleIds must be an array' })

    const db = getDb()
    db.prepare('DELETE FROM agent_roles WHERE agent_id = ?').run(req.params.agentId)
    for (const roleId of roleIds) {
      const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(roleId)
      if (role) {
        db.prepare('INSERT OR IGNORE INTO agent_roles (agent_id, role_id) VALUES (?, ?)').run(req.params.agentId, roleId)
      }
    }

    const roles = db
      .prepare(`
        SELECT r.* FROM roles r
        JOIN agent_roles ar ON ar.role_id = r.id
        WHERE ar.agent_id = ?
        ORDER BY r.name ASC
      `)
      .all(req.params.agentId) as unknown as RoleRow[]
    res.json(roles)
  })

  return router
}

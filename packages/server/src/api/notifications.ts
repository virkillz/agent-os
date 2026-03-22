import { Router } from 'express'
import { getDb } from '../db.js'
import { requireAuth, requireAdmin, type AuthRequest } from '../auth.js'

export function createNotificationsRouter(): Router {
  const router = Router()

  // GET /api/notifications?limit=50&offset=0
  router.get('/', requireAuth, (req: AuthRequest, res) => {
    const limit = Math.min(Number((req.query as Record<string, string>).limit) || 50, 200)
    const offset = Number((req.query as Record<string, string>).offset) || 0
    const userId = req.user!.id
    const rows = getDb().prepare(`
      SELECT n.*,
             CASE WHEN nr.notification_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
      FROM notifications n
      LEFT JOIN notification_reads nr
             ON nr.notification_id = n.id AND nr.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset)
    res.json(rows)
  })

  // POST /api/notifications/:id/read
  router.post('/:id/read', requireAuth, (req: AuthRequest, res) => {
    const db = getDb()
    const exists = db.prepare('SELECT id FROM notifications WHERE id = ?').get(req.params.id)
    if (!exists) { res.status(404).json({ error: 'Not found' }); return }
    db.prepare(
      `INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)`
    ).run(req.params.id, req.user!.id)
    res.json({ ok: true })
  })

  // POST /api/notifications/read-all
  router.post('/read-all', requireAuth, (req: AuthRequest, res) => {
    getDb().prepare(`
      INSERT OR IGNORE INTO notification_reads (notification_id, user_id)
      SELECT id, ? FROM notifications
    `).run(req.user!.id)
    res.json({ ok: true })
  })

  // DELETE /api/notifications/:id  (admin only)
  router.delete('/:id', requireAdmin, (req: AuthRequest, res) => {
    getDb().prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  })

  return router
}

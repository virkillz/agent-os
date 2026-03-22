import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getDb, type ProviderAccountRow } from '../db.js'
import { removeCooldown } from '../account-pool.js'
import { requireAuth } from '../auth.js'

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return '•••••••••••••••' + key.slice(-4)
}

function toPublic(row: ProviderAccountRow) {
  return {
    id: row.id,
    providerId: row.provider_id,
    label: row.label,
    maskedKey: maskKey(row.api_key),
    isActive: row.is_active === 1,
    cooldownUntil: row.cooldown_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createProviderAccountsRouter() {
  const router = Router()

  // GET /api/provider-accounts — list all accounts (keys masked)
  router.get('/', requireAuth, (_req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM provider_accounts ORDER BY provider_id ASC, created_at ASC')
      .all() as unknown as ProviderAccountRow[]
    res.json(rows.map(toPublic))
  })

  // POST /api/provider-accounts — create account
  router.post('/', requireAuth, (req, res) => {
    const { providerId, label, apiKey } = req.body as { providerId?: string; label?: string; apiKey?: string }
    if (!providerId || !label || !apiKey) {
      res.status(400).json({ error: 'providerId, label, and apiKey are required' })
      return
    }
    const id = randomUUID()
    getDb()
      .prepare('INSERT INTO provider_accounts (id, provider_id, label, api_key) VALUES (?, ?, ?, ?)')
      .run(id, providerId.trim(), label.trim(), apiKey.trim())
    const row = getDb().prepare('SELECT * FROM provider_accounts WHERE id = ?').get(id) as ProviderAccountRow
    res.status(201).json(toPublic(row))
  })

  // PUT /api/provider-accounts/:id — update label or rotate key
  router.put('/:id', requireAuth, (req, res) => {
    const { id } = req.params
    const row = getDb().prepare('SELECT * FROM provider_accounts WHERE id = ?').get(id) as ProviderAccountRow | undefined
    if (!row) { res.status(404).json({ error: 'Not found' }); return }

    const { label, apiKey, isActive } = req.body as { label?: string; apiKey?: string; isActive?: boolean }
    const newLabel = label?.trim() ?? row.label
    const newKey = apiKey?.trim() ?? row.api_key
    const newActive = isActive !== undefined ? (isActive ? 1 : 0) : row.is_active

    getDb()
      .prepare("UPDATE provider_accounts SET label = ?, api_key = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newLabel, newKey, newActive, id)

    const updated = getDb().prepare('SELECT * FROM provider_accounts WHERE id = ?').get(id) as ProviderAccountRow
    res.json(toPublic(updated))
  })

  // DELETE /api/provider-accounts/:id — hard delete
  router.delete('/:id', requireAuth, (req, res) => {
    const { id } = req.params
    const row = getDb().prepare('SELECT id FROM provider_accounts WHERE id = ?').get(id)
    if (!row) { res.status(404).json({ error: 'Not found' }); return }
    getDb().prepare('DELETE FROM provider_accounts WHERE id = ?').run(id)
    res.json({ ok: true })
  })

  // POST /api/provider-accounts/:id/clear-cooldown — manually lift cooldown
  router.post('/:id/clear-cooldown', requireAuth, (req, res) => {
    const { id } = req.params
    const row = getDb().prepare('SELECT id FROM provider_accounts WHERE id = ?').get(id)
    if (!row) { res.status(404).json({ error: 'Not found' }); return }
    removeCooldown(id)
    res.json({ ok: true })
  })

  return router
}

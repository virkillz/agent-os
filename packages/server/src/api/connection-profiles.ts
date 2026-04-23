import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getDb, type ConnectionProfileRow } from '../db.js'
import { requireAuth } from '../auth.js'

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return '•••••••••••••••' + key.slice(-4)
}

function toPublic(row: ConnectionProfileRow) {
  return {
    id: row.id,
    name: row.name,
    providerType: row.provider_type,
    baseUrl: row.base_url,
    maskedKey: maskKey(row.api_key),
    modelId: row.model_id,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const PROVIDER_PRESETS: { id: string; label: string; baseUrl: string }[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'google', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'xai', label: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'together', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  { id: 'fireworks', label: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1' },
  { id: 'perplexity', label: 'Perplexity', baseUrl: 'https://api.perplexity.ai' },
  { id: 'ollama', label: 'Ollama (Local)', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lm-studio', label: 'LM Studio (Local)', baseUrl: 'http://localhost:1234/v1' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', baseUrl: '' },
]

export function createConnectionProfilesRouter(): Router {
  const router = Router()

  router.get('/', requireAuth, (_req, res) => {
    const rows = getDb()
      .prepare('SELECT * FROM connection_profiles ORDER BY is_default DESC, created_at ASC')
      .all() as unknown as ConnectionProfileRow[]
    res.json(rows.map(toPublic))
  })

  router.get('/presets', requireAuth, (_req, res) => {
    res.json(PROVIDER_PRESETS)
  })

  router.post('/fetch-models', requireAuth, async (req, res) => {
    const { baseUrl, apiKey } = req.body as { baseUrl?: string; apiKey?: string }
    if (!baseUrl) {
      res.status(400).json({ error: 'baseUrl is required' })
      return
    }
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/models`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
      const fetchRes = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
      if (!fetchRes.ok) {
        const text = await fetchRes.text().catch(() => '')
        res.status(502).json({ error: `Provider returned ${fetchRes.status}: ${text.slice(0, 200)}` })
        return
      }
      const data = await fetchRes.json() as { data?: { id: string }[]; models?: { id: string }[] }
      const models = (data.data ?? data.models ?? []) as { id: string }[]
      const ids = models.map((m) => m.id).sort()
      res.json(ids)
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to fetch models' })
    }
  })

  router.post('/', requireAuth, (req, res) => {
    const { name, providerType, baseUrl, apiKey, modelId, isDefault } = req.body as {
      name?: string
      providerType?: string
      baseUrl?: string
      apiKey?: string
      modelId?: string
      isDefault?: boolean
    }
    if (!name?.trim() || !providerType?.trim() || !baseUrl?.trim()) {
      res.status(400).json({ error: 'name, providerType, and baseUrl are required' })
      return
    }
    if (providerType !== 'ollama' && providerType !== 'lm-studio' && !apiKey?.trim()) {
      res.status(400).json({ error: 'apiKey is required for this provider' })
      return
    }
    const id = randomUUID()
    const db = getDb()
    if (isDefault) {
      db.prepare("UPDATE connection_profiles SET is_default = 0, updated_at = datetime('now')").run()
    }
    db.prepare(
      `INSERT INTO connection_profiles (id, name, provider_type, base_url, api_key, model_id, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name.trim(), providerType.trim(), baseUrl.trim(), apiKey?.trim() ?? '', modelId?.trim() ?? '', isDefault ? 1 : 0)
    const row = db.prepare('SELECT * FROM connection_profiles WHERE id = ?').get(id) as unknown as ConnectionProfileRow
    res.status(201).json(toPublic(row))
  })

  router.put('/:id', requireAuth, (req, res) => {
    const { id } = req.params
    const db = getDb()
    const row = db.prepare('SELECT * FROM connection_profiles WHERE id = ?').get(id) as unknown as ConnectionProfileRow | undefined
    if (!row) { res.status(404).json({ error: 'Not found' }); return }

    const { name, providerType, baseUrl, apiKey, modelId, isDefault } = req.body as {
      name?: string
      providerType?: string
      baseUrl?: string
      apiKey?: string
      modelId?: string
      isDefault?: boolean
    }
    const newName = name?.trim() ?? row.name
    const newProviderType = providerType?.trim() ?? row.provider_type
    const newBaseUrl = baseUrl?.trim() ?? row.base_url
    const newKey = apiKey !== undefined ? apiKey.trim() : row.api_key
    const newModelId = modelId !== undefined ? modelId.trim() : row.model_id
    const newDefault = isDefault !== undefined ? (isDefault ? 1 : 0) : row.is_default

    if (newDefault) {
      db.prepare("UPDATE connection_profiles SET is_default = 0, updated_at = datetime('now')").run()
    }

    db.prepare(
      `UPDATE connection_profiles
       SET name = ?, provider_type = ?, base_url = ?, api_key = ?, model_id = ?, is_default = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(newName, newProviderType, newBaseUrl, newKey, newModelId, newDefault, id)

    const updated = db.prepare('SELECT * FROM connection_profiles WHERE id = ?').get(id) as unknown as ConnectionProfileRow
    res.json(toPublic(updated))
  })

  router.put('/:id/default', requireAuth, (req, res) => {
    const { id } = req.params
    const db = getDb()
    const row = db.prepare('SELECT id FROM connection_profiles WHERE id = ?').get(id)
    if (!row) { res.status(404).json({ error: 'Not found' }); return }
    db.prepare("UPDATE connection_profiles SET is_default = 0, updated_at = datetime('now')").run()
    db.prepare("UPDATE connection_profiles SET is_default = 1, updated_at = datetime('now') WHERE id = ?").run(id)
    res.json({ ok: true })
  })

  router.delete('/:id', requireAuth, (req, res) => {
    const { id } = req.params
    const db = getDb()
    const row = db.prepare('SELECT id FROM connection_profiles WHERE id = ?').get(id)
    if (!row) { res.status(404).json({ error: 'Not found' }); return }
    db.prepare('DELETE FROM connection_profiles WHERE id = ?').run(id)
    res.json({ ok: true })
  })

  return router
}

import { Router } from 'express'
import { getDb, type PluginRow } from '../db.js'
import { eventBus } from '../event-bus.js'
import { pluginLoader } from '../plugin-loader.js'
import fs from 'fs'

let _envFilePath = ''
export function setPluginsEnvFilePath(p: string) { _envFilePath = p }

function readEnv(): Record<string, string> {
  if (!_envFilePath || !fs.existsSync(_envFilePath)) return {}
  const lines = fs.readFileSync(_envFilePath, 'utf-8').split('\n')
  const result: Record<string, string> = {}
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match) result[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return result
}

function writeEnvKey(key: string, value: string) {
  if (!_envFilePath) return
  let content = fs.existsSync(_envFilePath) ? fs.readFileSync(_envFilePath, 'utf-8') : ''
  const regex = new RegExp(`^${key}=.*$`, 'm')
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`)
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`
  }
  fs.writeFileSync(_envFilePath, content)
  process.env[key] = value
}

function removeEnvKey(key: string) {
  if (!_envFilePath || !fs.existsSync(_envFilePath)) return
  let content = fs.readFileSync(_envFilePath, 'utf-8')
  content = content.replace(new RegExp(`^${key}=.*\\n?`, 'm'), '')
  fs.writeFileSync(_envFilePath, content)
  delete process.env[key]
}

/**
 * Seed plugin rows from the plugin loader registry.
 * Replaces the old BUILT_IN_PLUGINS hardcoded array.
 */
export function seedBuiltInPlugins() {
  pluginLoader.seedDb()
}

export function createPluginsRouter(): Router {
  const router = Router()

  // GET /api/plugins
  router.get('/', (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM plugins ORDER BY id ASC').all() as unknown as PluginRow[]
    const env = readEnv()

    // Only return plugins that are registered in the loader (filter out stale DB rows)
    const registeredRows = rows.filter((row) => !!pluginLoader.get(row.id))

    res.json(registeredRows.map((row) => {
      const plugin = pluginLoader.get(row.id)!
      const envVars = plugin.config.env
      const hasAllRequired = envVars
        .filter((e) => e.required)
        .every((e) => !!env[e.key])

      return {
        ...row,
        configured: row.configured === 1,
        envVars: envVars.map((e) => ({
          key: e.key,
          required: e.required,
          description: e.description,
          hasValue: !!env[e.key],
        })),
        hasAllRequired,
        toolIds: plugin.config.toolIds,
      }
    }))
  })

  // POST /api/plugins/:id/configure  — body: { key: string, value: string }
  // Supports setting any env var declared by the plugin (not just a single apiKey)
  router.post('/:id/configure', async (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM plugins WHERE id = ?').get(req.params.id) as unknown as PluginRow | undefined
    if (!row) return res.status(404).json({ error: 'Plugin not found' })

    const { key, value } = req.body as { key?: string; value?: string }
    if (!key?.trim() || !value?.trim()) {
      return res.status(400).json({ error: '"key" and "value" are required' })
    }

    const plugin = pluginLoader.get(row.id)
    const validKeys = plugin?.config.env.map((e) => e.key) ?? []
    if (!validKeys.includes(key)) {
      return res.status(422).json({
        error: `"${key}" is not a declared env var for plugin "${row.id}". Valid keys: ${validKeys.join(', ')}`,
      })
    }

    writeEnvKey(key, value.trim())

    // Recheck if all required vars are now set
    const allConfigured = (plugin?.config.env ?? [])
      .filter((e) => e.required)
      .every((e) => !!process.env[e.key])

    if (allConfigured) {
      db.prepare('UPDATE plugins SET configured = 1 WHERE id = ?').run(row.id)
      // Run setup if this plugin has one
      pluginLoader.runSetup(row.id).catch((err) =>
        console.warn(`  [plugin:${row.id}] setup() failed:`, err),
      )
    }

    eventBus.emit({ type: 'plugin:configured', pluginId: row.id })
    res.json({ ok: true, configured: allConfigured })
  })

  // DELETE /api/plugins/:id/configure?key=ENV_VAR_NAME — remove a single env var
  router.delete('/:id/configure', (req, res) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM plugins WHERE id = ?').get(req.params.id) as unknown as PluginRow | undefined
    if (!row) return res.status(404).json({ error: 'Plugin not found' })

    const key = req.query.key as string | undefined
    const plugin = pluginLoader.get(row.id)
    const validKeys = plugin?.config.env.map((e) => e.key) ?? []

    if (key) {
      // Remove a specific key
      if (!validKeys.includes(key)) {
        return res.status(422).json({ error: `"${key}" is not a declared env var for this plugin` })
      }
      removeEnvKey(key)
    } else {
      // Remove all keys for this plugin
      for (const envVar of plugin?.config.env ?? []) {
        removeEnvKey(envVar.key)
      }
    }

    db.prepare('UPDATE plugins SET configured = 0 WHERE id = ?').run(row.id)
    res.json({ ok: true })
  })

  // GET /api/plugins/:id/health — run the plugin's health check
  router.get('/:id/health', async (req, res) => {
    const plugin = pluginLoader.get(req.params.id)
    if (!plugin) return res.status(404).json({ error: 'Plugin not found' })

    if (!plugin.healthCheck) {
      return res.json({ ok: true, message: 'No health check defined for this plugin' })
    }

    try {
      const result = await plugin.healthCheck()
      res.json(result)
    } catch (err) {
      res.json({ ok: false, message: String(err) })
    }
  })

  return router
}

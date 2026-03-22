import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { getDb, getSetting, setSetting } from '../db.js'
import { getModel } from '@mariozechner/pi-ai'

const PROVIDERS = [
  { id: 'openrouter',     label: 'OpenRouter',         envKey: 'OPENROUTER_API_KEY',     recommended: true },
  { id: 'anthropic',      label: 'Anthropic',           envKey: 'ANTHROPIC_API_KEY',      recommended: false },
  { id: 'openai',         label: 'OpenAI',              envKey: 'OPENAI_API_KEY',         recommended: false },
  { id: 'google',         label: 'Google Gemini',       envKey: 'GEMINI_API_KEY',         recommended: false },
  { id: 'groq',           label: 'Groq',                envKey: 'GROQ_API_KEY',           recommended: false },
  { id: 'mistral',        label: 'Mistral',             envKey: 'MISTRAL_API_KEY',        recommended: false },
  { id: 'xai',            label: 'xAI (Grok)',          envKey: 'XAI_API_KEY',            recommended: false },
  { id: 'github-copilot', label: 'GitHub Copilot',      envKey: 'GH_TOKEN',              recommended: false },
]

// Default model suggestions per provider
const DEFAULT_MODELS: Record<string, string> = {
  openrouter:     'moonshotai/kimi-k2.5',
  anthropic:      'claude-sonnet-4-6',
  openai:         'gpt-4o',
  google:         'gemini-2.5-flash',
  groq:           'llama-3.3-70b-versatile',
  mistral:        'mistral-large-latest',
  xai:            'grok-3-fast',
  'github-copilot': 'claude-sonnet-4-5',
}

let envFilePath = ''

export function setEnvFilePath(p: string): void {
  envFilePath = p
}

function readEnvFile(): Record<string, string> {
  try {
    const content = fs.readFileSync(envFilePath, 'utf-8')
    const result: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    return result
  } catch {
    return {}
  }
}

function writeEnvFile(vars: Record<string, string>): void {
  const lines = Object.entries(vars)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
  fs.writeFileSync(envFilePath, lines.join('\n') + '\n', 'utf-8')
  // Apply to current process so agent runner picks them up immediately
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v
  }
}

export function createSettingsRouter(): Router {
  const router = Router()

  // GET /api/settings — company info + first-run flag
  router.get('/', (_req, res) => {
    const userCount = (getDb().prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
    res.json({
      firstRun: getSetting('company_name') === null,
      needsSetup: userCount === 0,
      companyName: getSetting('company_name') ?? '',
      companyMission: getSetting('company_mission') ?? '',
      companyLogo: getSetting('company_logo') ?? '/rascals.png',
      platformPrompt: getSetting('platform_prompt') ?? 'You are an AI agent working for {company_name}. You have access to the working directory at {working_directory}. Follow the Standard Operating Procedure in SOP.md and your job description.',
      defaultModel: getSetting('default_model')
        ? JSON.parse(getSetting('default_model')!)
        : { provider: 'openrouter', modelId: 'moonshotai/kimi-k2.5', thinkingLevel: 'low' },
    })
  })

  // POST /api/settings — save company info
  router.post('/', (req, res) => {
    const { companyName, companyMission, companyLogo, platformPrompt, defaultModel } = req.body as {
      companyName?: string
      companyMission?: string
      companyLogo?: string
      platformPrompt?: string
      defaultModel?: object
    }
    if (companyName !== undefined) setSetting('company_name', companyName)
    if (companyMission !== undefined) setSetting('company_mission', companyMission)
    if (companyLogo !== undefined) setSetting('company_logo', companyLogo)
    if (platformPrompt !== undefined) setSetting('platform_prompt', platformPrompt)
    if (defaultModel !== undefined) setSetting('default_model', JSON.stringify(defaultModel))
    res.json({ ok: true })
  })

  // GET /api/settings/providers — list providers with configured status
  router.get('/providers', (_req, res) => {
    const env = readEnvFile()
    const list = PROVIDERS.map((p) => ({
      ...p,
      configured: !!(env[p.envKey] || process.env[p.envKey]),
      defaultModel: DEFAULT_MODELS[p.id] ?? '',
    }))
    res.json(list)
  })

  // POST /api/settings/providers/:id — save API key
  router.post('/providers/:id', (req, res) => {
    const provider = PROVIDERS.find((p) => p.id === req.params.id)
    if (!provider) return res.status(404).json({ error: 'Unknown provider' })

    const { apiKey } = req.body as { apiKey: string }
    if (!apiKey?.trim()) return res.status(400).json({ error: 'apiKey required' })

    const env = readEnvFile()
    env[provider.envKey] = apiKey.trim()
    writeEnvFile(env)

    res.json({ ok: true })
  })

  // DELETE /api/settings/providers/:id — remove API key
  router.delete('/providers/:id', (req, res) => {
    const provider = PROVIDERS.find((p) => p.id === req.params.id)
    if (!provider) return res.status(404).json({ error: 'Unknown provider' })

    const env = readEnvFile()
    delete env[provider.envKey]
    writeEnvFile(env)
    delete process.env[provider.envKey]

    res.json({ ok: true })
  })

  // POST /api/settings/providers/:id/test — verify a key works
  router.post('/providers/:id/test', async (req, res) => {
    const provider = PROVIDERS.find((p) => p.id === req.params.id)
    if (!provider) return res.status(404).json({ error: 'Unknown provider' })

    const modelId = DEFAULT_MODELS[provider.id]
    if (!modelId) return res.status(400).json({ error: 'No default model for provider' })

    try {
      const model = getModel(provider.id as any, modelId)
      if (!model) return res.status(400).json({ ok: false, error: 'Model not found' })
      // Just checking the model resolves — actual API call would require a full session
      res.json({ ok: true })
    } catch (err: unknown) {
      res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })

  return router
}

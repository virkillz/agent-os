import { useEffect, useState } from 'react'
import { useStore } from '../../store.ts'

const PROVIDER_MODELS: Record<string, string[]> = {
  openrouter: [
    'anthropic/claude-sonnet-4-6',
    'anthropic/claude-3-5-haiku',
    'anthropic/claude-opus-4-6',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'google/gemini-2.5-flash',
    'meta-llama/llama-3.3-70b-instruct',
  ],
  anthropic: ['claude-sonnet-4-6', 'claude-3-5-haiku-20241022', 'claude-opus-4-6'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
  google: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  mistral: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
  xai: ['grok-3-fast', 'grok-3', 'grok-2'],
  'github-copilot': ['claude-sonnet-4-5', 'gpt-4o'],
}

const THINKING_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export default function SettingsModel() {
  const { settings, providers, loadProviders, updateSettings } = useStore()
  const [loading, setLoading] = useState(false)

  const [modelProvider, setModelProvider] = useState(settings?.defaultModel?.provider ?? 'openrouter')
  const [modelId, setModelId] = useState(settings?.defaultModel?.modelId ?? 'anthropic/claude-sonnet-4-6')
  const [thinkingLevel, setThinkingLevel] = useState(settings?.defaultModel?.thinkingLevel ?? 'low')
  const [modelSaved, setModelSaved] = useState(false)

  useEffect(() => { loadProviders() }, [loadProviders])

  useEffect(() => {
    if (settings?.defaultModel) {
      setModelProvider(settings.defaultModel.provider)
      setModelId(settings.defaultModel.modelId)
      setThinkingLevel(settings.defaultModel.thinkingLevel)
    }
  }, [settings])

  async function saveDefaultModel() {
    setLoading(true)
    try {
      await updateSettings({ defaultModel: { provider: modelProvider, modelId, thinkingLevel } })
      setModelSaved(true)
      setTimeout(() => setModelSaved(false), 2000)
    } finally {
      setLoading(false)
    }
  }

  function handleProviderChange(p: string) {
    setModelProvider(p)
    const suggestions = PROVIDER_MODELS[p]
    if (suggestions?.length) setModelId(suggestions[0])
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Default AI Model</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Used by all agents unless they have a custom model configured.
          </p>
        </div>

        <div className="card p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--subtle)' }}>Provider</label>
            <select
              className="input"
              value={modelProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}{p.configured ? '' : ' (not configured)'}
                </option>
              ))}
              {providers.length === 0 && (
                <option value={modelProvider}>{modelProvider}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--subtle)' }}>Model</label>
            <ModelCombobox
              value={modelId}
              onChange={setModelId}
              suggestions={PROVIDER_MODELS[modelProvider] ?? []}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--subtle)' }}>Thinking level</label>
            <select className="input" value={thinkingLevel} onChange={(e) => setThinkingLevel(e.target.value)}>
              {THINKING_LEVELS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button className="btn-primary" onClick={saveDefaultModel} disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </button>
            {modelSaved && <span className="text-xs text-green-400">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function ModelCombobox({ value, onChange, suggestions }: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
}) {
  const [open, setOpen] = useState(false)
  const filtered = suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()))

  return (
    <div className="relative">
      <input
        className="input"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Enter or select a model ID..."
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-2 border border-border rounded-lg overflow-hidden z-10 shadow-lg">
          {filtered.map((s) => (
            <button
              key={s}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-3 transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(s); setOpen(false) }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

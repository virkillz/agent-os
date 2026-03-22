import { useEffect, useState } from 'react'
import { useStore } from '../../store.ts'
import { type Agent } from '../../api.ts'

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

export function ModelSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: { modelConfig: object }) => Promise<unknown>
}) {
  const { settings, providers, loadProviders } = useStore()
  const hasCustom = !!(agent.modelConfig?.provider || agent.modelConfig?.modelId)

  const [useCustom, setUseCustom] = useState(hasCustom)
  const [provider, setProvider] = useState(
    agent.modelConfig?.provider ?? settings?.defaultModel?.provider ?? 'openrouter'
  )
  const [modelId, setModelId] = useState(
    agent.modelConfig?.modelId ?? settings?.defaultModel?.modelId ?? ''
  )
  const [thinkingLevel, setThinkingLevel] = useState(
    agent.modelConfig?.thinkingLevel ?? settings?.defaultModel?.thinkingLevel ?? 'low'
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  function handleProviderChange(p: string) {
    setProvider(p)
    const suggestions = PROVIDER_MODELS[p]
    if (suggestions?.length) setModelId(suggestions[0])
  }

  async function handleSave() {
    setSaving(true)
    try {
      const modelConfig = useCustom ? { provider, modelId, thinkingLevel } : undefined
      await onSave({ modelConfig: modelConfig as any })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const defaultLabel = settings?.defaultModel
    ? `${settings.defaultModel.provider} / ${settings.defaultModel.modelId}`
    : 'Not configured'

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              AI Model
            </p>
            <p className="text-xs text-muted">
              Override the default model for this agent. Default:{' '}
              <span className="text-subtle">{defaultLabel}</span>
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              className={`w-10 h-5 rounded-full transition-colors relative ${useCustom ? 'bg-accent' : 'bg-white/[0.07]'}`}
              onClick={() => setUseCustom((v) => !v)}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useCustom ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </div>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              Use custom model
            </span>
          </label>

          {useCustom && (
            <div className="space-y-4 pl-4 border-l-2 border-accent/30">
              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Provider</label>
                <select
                  className="input"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.configured ? '' : ' (not configured)'}
                    </option>
                  ))}
                  {providers.length === 0 && <option value={provider}>{provider}</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">Model</label>
                <div className="relative">
                  <input
                    className="input"
                    value={modelId}
                    onChange={(e) => {
                      setModelId(e.target.value)
                      setOpen(true)
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    placeholder="Enter or select a model ID..."
                  />
                  {open && (PROVIDER_MODELS[provider] ?? []).length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10"
                      style={{
                        background: 'rgba(8,18,40,0.92)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      }}
                    >
                      {(PROVIDER_MODELS[provider] ?? [])
                        .filter((s) => s.toLowerCase().includes(modelId.toLowerCase()))
                        .map((s) => (
                          <button
                            key={s}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.07] transition-colors"
                            style={{ color: 'var(--text-primary)' }}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setModelId(s)
                              setOpen(false)
                            }}
                          >
                            {s}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-subtle mb-1.5">
                  Thinking level
                </label>
                <select
                  className="input"
                  value={thinkingLevel}
                  onChange={(e) => setThinkingLevel(e.target.value)}
                >
                  {THINKING_LEVELS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            {saved && <span className="text-xs text-green-400">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

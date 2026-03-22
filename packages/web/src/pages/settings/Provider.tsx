import { useEffect, useRef, useState } from 'react'
import { api, type Provider } from '../../api.ts'
import { useStore } from '../../store.ts'

export default function SettingsProvider() {
  const { providers, loadProviders } = useStore()

  useEffect(() => { loadProviders() }, [loadProviders])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>AI Providers</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Configure API keys for the LLM providers you want to use.
          </p>
        </div>
        <div className="space-y-2">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} onSaved={loadProviders} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ProviderCard({ provider, onSaved }: { provider: Provider; onSaved: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleExpand() {
    setExpanded((v) => !v)
    setApiKey('')
    setError('')
    if (!expanded) setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function handleSave() {
    if (!apiKey.trim()) { setError('API key is required'); return }
    setSaving(true)
    setError('')
    try {
      await api.settings.saveProviderKey(provider.id, apiKey.trim())
      setSaved(true)
      setApiKey('')
      setExpanded(false)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    setError('')
    try {
      await api.settings.removeProviderKey(provider.id)
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to remove')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-2 transition-colors"
        onClick={handleExpand}
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${provider.configured ? 'bg-green-400' : 'bg-surface-3'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{provider.label}</span>
            {provider.recommended && (
              <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-medium">
                Recommended
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {provider.configured ? 'Configured' : 'Not configured'} · {provider.envKey}
          </div>
        </div>
        <ChevronIcon open={expanded} />
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div className="relative">
            <input
              ref={inputRef}
              className="input pr-10"
              type={showKey ? 'text' : 'password'}
              placeholder="Paste your API key..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: 'var(--muted)' }}
              onClick={() => setShowKey((v) => !v)}
              type="button"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {saved && <p className="text-xs text-green-400">Saved!</p>}

          <div className="flex items-center gap-2">
            <button className="btn-primary text-xs px-3 py-1.5" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : provider.configured ? 'Update key' : 'Save key'}
            </button>
            {provider.configured && (
              <button
                className="btn-ghost text-xs px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={handleRemove}
                disabled={removing}
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      style={{ color: 'var(--muted)' }}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

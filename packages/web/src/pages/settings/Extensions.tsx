import { useEffect, useState } from 'react'
import { useStore } from '../../store.ts'
import type { Plugin, PluginEnvVar } from '../../api.ts'

const PLUGIN_ICONS: Record<string, string> = {
  'brave-search':  '🔍',
  elevenlabs:      '🎙️',
  'gemini-image':  '🖼️',
  youtube:         '▶️',
  remotion:        '🎬',
}

export default function SettingsExtensions() {
  const { plugins, loadPlugins } = useStore()

  useEffect(() => { loadPlugins() }, [loadPlugins])

  const configured = plugins.filter(p => p.configured || p.envVars.length === 0)
  const unconfigured = plugins.filter(p => !p.configured && p.envVars.length > 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Extensions</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Connect external services. Extensions expose tool definitions that agents can call.
          </p>
        </div>

        {configured.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Configured</h3>
            <div className="space-y-2">
              {configured.map(p => <PluginCard key={p.id} plugin={p} />)}
            </div>
          </div>
        )}

        {unconfigured.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Available</h3>
            <div className="space-y-2">
              {unconfigured.map(p => <PluginCard key={p.id} plugin={p} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PluginCard({ plugin }: { plugin: Plugin }) {
  const { removePluginConfig } = useStore()
  const [expanded, setExpanded] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    setRemoving(true)
    try {
      await removePluginConfig(plugin.id)
    } finally {
      setRemoving(false)
    }
  }

  const hasEnvVars = plugin.envVars.length > 0

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors"
      >
        <span className="text-xl w-7 text-center flex-shrink-0">{PLUGIN_ICONS[plugin.id] ?? '🔌'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{plugin.display_name}</span>
            {plugin.configured ? (
              <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full">Configured</span>
            ) : !hasEnvVars ? (
              <span className="text-[10px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-full">Ready</span>
            ) : (
              <span className="text-[10px] bg-surface-3 px-1.5 py-0.5 rounded-full" style={{ color: 'var(--muted)' }}>Not configured</span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{plugin.description}</p>
        </div>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          style={{ color: 'var(--muted)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4">
          {!hasEnvVars ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No API key required — this extension runs locally and is always available.
            </p>
          ) : (
            <>
              {plugin.envVars.map(envVar => (
                <EnvVarRow key={envVar.key} pluginId={plugin.id} envVar={envVar} />
              ))}
              {plugin.configured && (
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="mt-3 px-3 py-1.5 text-xs border border-red-400/30 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  {removing ? 'Removing...' : 'Remove all keys'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function EnvVarRow({ pluginId, envVar }: { pluginId: string; envVar: PluginEnvVar }) {
  const { configurePlugin } = useStore()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!value.trim()) return
    setSaving(true)
    setError('')
    try {
      await configurePlugin(pluginId, envVar.key, value.trim())
      setValue('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-2 mb-1">
        <code className="text-xs" style={{ color: 'rgb(var(--accent))' }}>{envVar.key}</code>
        {envVar.required
          ? <span className="text-xs" style={{ color: 'var(--muted)' }}>required</span>
          : <span className="text-xs" style={{ color: 'var(--muted)' }}>optional</span>
        }
        {envVar.hasValue && <span className="text-xs text-green-400">✓ set</span>}
      </div>
      <p className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>{envVar.description}</p>
      <div className="flex gap-2">
        <input
          type="password"
          className="input flex-1"
          placeholder={envVar.hasValue ? '••••••••••••' : 'Paste value…'}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        <button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className="btn-primary text-xs px-3"
        >
          {saving ? '…' : envVar.hasValue ? 'Update' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

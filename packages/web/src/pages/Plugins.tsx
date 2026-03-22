import { useEffect, useState } from 'react'
import { useStore } from '../store.ts'
import type { Plugin, PluginEnvVar } from '../api.ts'

const PLUGIN_ICONS: Record<string, string> = {
  'brave-search':  '🔍',
  elevenlabs:      '🎙️',
  'gemini-image':  '🖼️',
  youtube:         '▶️',
  remotion:        '🎬',
}

function EnvVarRow({
  pluginId,
  envVar,
}: {
  pluginId: string
  envVar: PluginEnvVar
}) {
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
        <code className="text-xs text-purple-400">{envVar.key}</code>
        {envVar.required
          ? <span className="text-xs text-gray-500">required</span>
          : <span className="text-xs text-gray-600">optional</span>
        }
        {envVar.hasValue && (
          <span className="text-xs text-green-400">✓ set</span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-1.5">{envVar.description}</p>
      <div className="flex gap-2">
        <input
          type="password"
          className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          placeholder={envVar.hasValue ? '••••••••••••' : 'Paste value…'}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        <button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm transition-colors"
        >
          {saving ? '…' : envVar.hasValue ? 'Update' : 'Save'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
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
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-750 transition-colors"
      >
        <span className="text-2xl w-8 text-center">{PLUGIN_ICONS[plugin.id] ?? '🔌'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{plugin.display_name}</span>
            {plugin.configured ? (
              <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">Configured</span>
            ) : !hasEnvVars ? (
              <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">Ready</span>
            ) : (
              <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Not configured</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{plugin.description}</p>
        </div>
        <span className="text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 p-4">
          {!hasEnvVars ? (
            <p className="text-sm text-gray-400">
              No API key required — this plugin runs locally and is always available.
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
                  className="mt-3 px-3 py-2 bg-gray-700 hover:bg-red-900 hover:text-red-300 disabled:opacity-50 rounded-lg text-sm transition-colors"
                >
                  {removing ? '…' : 'Remove all keys'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Plugins() {
  const { plugins, loadPlugins } = useStore()

  useEffect(() => { loadPlugins() }, [loadPlugins])

  const configured = plugins.filter(p => p.configured || p.envVars.length === 0)
  const unconfigured = plugins.filter(p => !p.configured && p.envVars.length > 0)

  return (
    <div className="p-6 max-w-2xl mx-auto bg-gray-900/80 backdrop-blur-md mt-6 rounded-md">
      <h1 className="text-2xl font-bold mb-1">Plugins</h1>
      <p className="text-sm text-gray-400 mb-6">
        Connect external services. Plugins expose tool definitions that agents can call.
      </p>

      {configured.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Configured</h2>
          <div className="space-y-2">
            {configured.map(p => <PluginCard key={p.id} plugin={p} />)}
          </div>
        </div>
      )}

      {unconfigured.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Available</h2>
          <div className="space-y-2">
            {unconfigured.map(p => <PluginCard key={p.id} plugin={p} />)}
          </div>
        </div>
      )}
    </div>
  )
}

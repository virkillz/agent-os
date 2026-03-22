import { useEffect, useState } from 'react'
import { api, type Agent, type Plugin as ApiPlugin } from '../../api.ts'

export function PluginsSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: { modelConfig: object }) => Promise<unknown>
}) {
  const [plugins, setPlugins] = useState<ApiPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const enabledTools: string[] = agent.modelConfig?.tools ?? []

  useEffect(() => {
    api.plugins.list().then(setPlugins).finally(() => setLoading(false))
  }, [])

  function isEnabled(plugin: ApiPlugin): boolean {
    return plugin.toolIds.length > 0 && plugin.toolIds.every((id) => enabledTools.includes(id))
  }

  async function toggle(plugin: ApiPlugin, currentlyEnabled: boolean) {
    setSaving(plugin.id)
    try {
      let next: string[]
      if (currentlyEnabled) {
        next = enabledTools.filter((id) => !plugin.toolIds.includes(id))
      } else {
        next = [...new Set([...enabledTools, ...plugin.toolIds])]
      }
      await onSave({ modelConfig: { ...agent.modelConfig, tools: next } })
    } finally {
      setSaving(null)
    }
  }

  const configured = plugins.filter((p: ApiPlugin) => p.configured)
  const unconfigured = plugins.filter((p: ApiPlugin) => !p.configured)

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <p className="text-xs text-muted mb-5">
          Control which plugins this agent can use. Configure plugin API keys from the{' '}
          <a href="/settings/plugins" className="text-accent hover:underline">
            Plugins page
          </a>
          .
        </p>

        {loading && <p className="text-sm text-muted py-4">Loading…</p>}

        {!loading && plugins.length === 0 && (
          <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-gray-700 rounded-xl">
            No plugins available.
          </div>
        )}

        {configured.length > 0 && (
          <div className="space-y-2">
            {configured.map((plugin) => {
              const enabled = isEnabled(plugin)
              return (
                <div
                  key={plugin.id}
                  className="flex items-center gap-3 rounded-lg px-4 py-3"
                  style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {plugin.display_name}
                    </div>
                    {plugin.description && (
                      <p className="text-xs text-muted truncate">{plugin.description}</p>
                    )}
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--subtle)' }}>
                      Tools: {plugin.toolIds.join(', ')}
                    </p>
                  </div>
                  <button
                    onClick={() => toggle(plugin, enabled)}
                    disabled={saving === plugin.id}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                      enabled ? 'bg-accent' : 'bg-white/[0.07]'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {unconfigured.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Not configured</p>
            <div className="space-y-2">
              {unconfigured.map((plugin) => (
                <div
                  key={plugin.id}
                  className="flex items-center gap-3 rounded-lg px-4 py-3 opacity-40"
                  style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {plugin.display_name}
                    </div>
                    {plugin.description && (
                      <p className="text-xs text-muted truncate">{plugin.description}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted flex-shrink-0">Needs API key</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api, type Agent, type PlatformToolGroup, type PlatformToolEntry } from '../../api.ts'

export function PlatformToolsSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: { modelConfig: object }) => Promise<unknown>
}) {
  const [groups, setGroups] = useState<PlatformToolGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const enabledTools: string[] = agent.modelConfig?.tools ?? []
  const disabledTools: string[] = agent.modelConfig?.disabledTools ?? []

  useEffect(() => {
    api.platformTools.list().then(setGroups).finally(() => setLoading(false))
  }, [])

  function isEnabled(entry: PlatformToolEntry): boolean {
    if (entry.availableByDefault) {
      return !disabledTools.includes(entry.id)
    }
    return enabledTools.includes(entry.id)
  }

  async function toggle(entry: PlatformToolEntry, currentlyEnabled: boolean) {
    setSaving(entry.id)
    try {
      let nextTools = [...enabledTools]
      let nextDisabled = [...disabledTools]

      if (entry.availableByDefault) {
        // Toggle default tool: add/remove from disabledTools
        if (currentlyEnabled) {
          nextDisabled = [...new Set([...nextDisabled, entry.id])]
        } else {
          nextDisabled = nextDisabled.filter(id => id !== entry.id)
        }
      } else {
        // Toggle non-default tool: add/remove from tools
        if (currentlyEnabled) {
          nextTools = nextTools.filter(id => id !== entry.id)
        } else {
          nextTools = [...new Set([...nextTools, entry.id])]
        }
      }

      await onSave({
        modelConfig: { ...agent.modelConfig, tools: nextTools, disabledTools: nextDisabled },
      })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <p className="text-xs text-muted mb-5">
          Control which platform tools this agent can use. Default tools are on by default and can be disabled individually.
        </p>

        {loading && <p className="text-sm text-muted py-4">Loading…</p>}

        {!loading && groups.length === 0 && (
          <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-gray-700 rounded-xl">
            No platform tools available.
          </div>
        )}

        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.id}>
              {/* Group header */}
              <div className="mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                  {group.displayName}
                </span>
                <p className="text-[10px] text-muted mt-0.5">{group.description}</p>
              </div>

              {/* Per-tool rows */}
              <div className="space-y-1.5">
                {group.tools.map((entry) => {
                  const enabled = isEnabled(entry)
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 rounded-lg px-4 py-2.5"
                      style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {entry.displayName}
                          </span>
                          {entry.availableByDefault && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide"
                              style={{
                                background: 'rgba(245,158,11,0.12)',
                                color: 'rgb(var(--accent))',
                                border: '1px solid rgba(245,158,11,0.2)',
                              }}
                            >
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--subtle)' }}>
                          {entry.id}
                        </p>
                      </div>
                      <button
                        onClick={() => toggle(entry, enabled)}
                        disabled={saving === entry.id}
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
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

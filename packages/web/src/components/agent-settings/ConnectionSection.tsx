import { useEffect, useState } from 'react'
import { api, type Agent, type ConnectionProfile } from '../../api.ts'

export function ConnectionSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: { modelConfig: object }) => Promise<unknown>
}) {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [selectedId, setSelectedId] = useState(agent.modelConfig?.connectionProfileId ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.connectionProfiles.list().then(setProfiles).catch(() => setProfiles([]))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const modelConfig = {
        ...agent.modelConfig,
        connectionProfileId: selectedId || undefined,
      }
      await onSave({ modelConfig })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Connection Profile
            </p>
            <p className="text-xs text-muted">
              Choose which connection profile this agent uses to connect to the AI provider.
              If none is selected, the agent will use the built-in default.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Profile</label>
            <select
              className="input"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              <option value="">Built-in default</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.providerType}){p.isDefault ? ' — Default' : ''}
                </option>
              ))}
            </select>
            {profiles.length === 0 && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
                No profiles yet. <a href="/settings/provider" className="text-accent hover:underline">Create one in Settings -&gt; Provider</a>.
              </p>
            )}
          </div>

          {selectedId && (() => {
            const profile = profiles.find(p => p.id === selectedId)
            if (!profile) return null
            return (
              <div className="card p-3 space-y-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="text-xs" style={{ color: 'var(--text-primary)' }}>{profile.name}</div>
                <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
                  Provider: {profile.providerType} · Base URL: {profile.baseUrl}
                </div>
                {profile.modelId && (
                  <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
                    Model: {profile.modelId}
                  </div>
                )}
              </div>
            )
          })()}

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

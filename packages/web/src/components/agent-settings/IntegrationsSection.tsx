import { useEffect, useState } from 'react'
import { api, type Integration } from '../../api.ts'
import { XIcon } from './icons.tsx'

const PLATFORM_LABELS: Record<string, string> = { slack: 'Slack', telegram: 'Telegram' }
const PLATFORM_ICONS: Record<string, string> = { slack: '🔗', telegram: '✈️' }

type FormState = {
  platform: 'slack' | 'telegram'
  // Slack
  app_token: string
  bot_token: string
  channel_ids: string
  dm_enabled: boolean
  // Telegram
  tg_bot_token: string
  group_ids: string
  tg_dm_enabled: boolean
}

const DEFAULT_FORM: FormState = {
  platform: 'slack',
  app_token: '',
  bot_token: '',
  channel_ids: '',
  dm_enabled: true,
  tg_bot_token: '',
  group_ids: '',
  tg_dm_enabled: true,
}

function buildConfig(f: FormState): Record<string, unknown> {
  if (f.platform === 'slack') {
    return {
      app_token: f.app_token,
      bot_token: f.bot_token,
      dm_enabled: f.dm_enabled,
      channel_ids: f.channel_ids.split(',').map(s => s.trim()).filter(Boolean),
    }
  }
  return {
    bot_token: f.tg_bot_token,
    dm_enabled: f.tg_dm_enabled,
    group_ids: f.group_ids.split(',').map(s => s.trim()).filter(Boolean),
  }
}

export function IntegrationsSection({ agentId }: { agentId: string }) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    setLoading(true)
    api.integrations.list(agentId)
      .then(setIntegrations)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [agentId])

  async function handleCreate() {
    setSaving(true)
    setSaveError('')
    try {
      const created = await api.integrations.create(agentId, {
        platform: form.platform,
        config: buildConfig(form),
      })
      setIntegrations(prev => [...prev, created])
      setShowForm(false)
      setForm(DEFAULT_FORM)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(i: Integration) {
    const updated = await api.integrations.patch(agentId, i.id, { enabled: i.enabled ? 0 : 1 })
    setIntegrations(prev => prev.map(x => x.id === updated.id ? updated : x))
  }

  async function handleDelete(i: Integration) {
    if (!confirm(`Remove ${PLATFORM_LABELS[i.platform]} integration?`)) return
    await api.integrations.delete(agentId, i.id)
    setIntegrations(prev => prev.filter(x => x.id !== i.id))
  }

  const availablePlatforms = (['slack', 'telegram'] as const).filter(
    p => !integrations.find(i => i.platform === p)
  )

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8">
      <div
        className="w-full max-w-4xl rounded-2xl p-6 animate-zoom-in"
        style={{
          background: 'rgba(8,18,40,0.90)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted">
            Connect this agent to external platforms. Each integration activates a live connector.
          </p>
          {availablePlatforms.length > 0 && !showForm && (
            <button
              className="btn-primary text-xs px-3 py-1.5"
              onClick={() => { setShowForm(true); setForm({ ...DEFAULT_FORM, platform: availablePlatforms[0] }) }}
            >
              + Add integration
            </button>
          )}
        </div>

        {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

        {/* Add form */}
        {showForm && (
          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                New Integration
              </h4>
              <button
                className="p-1 rounded hover:bg-white/[0.07] text-muted"
                onClick={() => { setShowForm(false); setSaveError('') }}
              >
                <XIcon />
              </button>
            </div>

            {/* Platform selector */}
            <div className="flex gap-2 mb-4">
              {availablePlatforms.map(p => (
                <button
                  key={p}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: form.platform === p ? 'rgba(var(--accent), 0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${form.platform === p ? 'rgba(var(--accent), 0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: form.platform === p ? 'var(--text-primary)' : 'var(--muted)',
                  }}
                  onClick={() => setForm(f => ({ ...f, platform: p }))}
                >
                  <span>{PLATFORM_ICONS[p]}</span>
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>

            {/* Slack fields */}
            {form.platform === 'slack' && (
              <div className="space-y-3">
                <Field label="App-Level Token (xapp-...)" value={form.app_token} placeholder="xapp-1-..." onChange={v => setForm(f => ({ ...f, app_token: v }))} />
                <Field label="Bot Token (xoxb-...)" value={form.bot_token} placeholder="xoxb-..." onChange={v => setForm(f => ({ ...f, bot_token: v }))} />
                <Field label="Channel IDs (comma-separated, optional)" value={form.channel_ids} placeholder="C12345,C67890" onChange={v => setForm(f => ({ ...f, channel_ids: v }))} />
                <Toggle label="Enable DMs" checked={form.dm_enabled} onChange={v => setForm(f => ({ ...f, dm_enabled: v }))} />
              </div>
            )}

            {/* Telegram fields */}
            {form.platform === 'telegram' && (
              <div className="space-y-3">
                <Field label="Bot Token" value={form.tg_bot_token} placeholder="123456:ABC-..." onChange={v => setForm(f => ({ ...f, tg_bot_token: v }))} />
                <Field label="Group IDs (comma-separated, optional)" value={form.group_ids} placeholder="-1001234567890" onChange={v => setForm(f => ({ ...f, group_ids: v }))} />
                <Toggle label="Enable DMs" checked={form.tg_dm_enabled} onChange={v => setForm(f => ({ ...f, tg_dm_enabled: v }))} />
              </div>
            )}

            {saveError && <p className="text-xs text-red-400 mt-3">{saveError}</p>}

            <div className="flex justify-end mt-4">
              <button className="btn-primary text-xs px-4 py-1.5" onClick={handleCreate} disabled={saving}>
                {saving ? 'Saving…' : 'Save integration'}
              </button>
            </div>
          </div>
        )}

        {/* Integration list */}
        {loading ? (
          <p className="text-sm text-muted text-center py-8">Loading…</p>
        ) : integrations.length === 0 && !showForm ? (
          <p className="text-sm text-muted text-center py-8">No integrations configured yet.</p>
        ) : (
          <div className="space-y-2">
            {integrations.map(i => (
              <div
                key={i.id}
                className="flex items-center gap-3 rounded-lg px-4 py-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  opacity: i.enabled ? 1 : 0.55,
                }}
              >
                <span className="text-lg">{PLATFORM_ICONS[i.platform]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {PLATFORM_LABELS[i.platform]}
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {i.enabled ? 'Active' : 'Disabled'} · added {new Date(i.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs px-2.5 py-1 rounded-md transition-colors"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color: 'var(--subtle)',
                    }}
                    onClick={() => handleToggle(i)}
                  >
                    {i.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
                    title="Remove integration"
                    onClick={() => handleDelete(i)}
                  >
                    <XIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] text-muted mb-1">{label}</label>
      <input
        type="text"
        className="w-full text-xs rounded-lg px-3 py-2 outline-none focus:ring-1"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'var(--text-primary)',
        }}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${checked ? 'bg-accent' : 'bg-white/[0.10]'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

import { useEffect, useState, useRef } from 'react'
import { api, type ConnectionProfile, type ProviderPreset } from '../../api.ts'

const PROVIDER_PRESETS: { id: string; label: string; baseUrl: string }[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'google', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { id: 'xai', label: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'together', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  { id: 'fireworks', label: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1' },
  { id: 'perplexity', label: 'Perplexity', baseUrl: 'https://api.perplexity.ai' },
  { id: 'ollama', label: 'Ollama (Local)', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lm-studio', label: 'LM Studio (Local)', baseUrl: 'http://localhost:1234/v1' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', baseUrl: '' },
]

interface FormData {
  name: string
  providerType: string
  baseUrl: string
  apiKey: string
  modelId: string
  isDefault: boolean
}

const emptyForm: FormData = {
  name: '',
  providerType: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  modelId: '',
  isDefault: false,
}

export default function SettingsProvider() {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [models, setModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const modelInputRef = useRef<HTMLInputElement>(null)

  async function loadProfiles() {
    try {
      const list = await api.connectionProfiles.list()
      setProfiles(list)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProfiles() }, [])

  function handleProviderTypeChange(providerType: string) {
    const preset = PROVIDER_PRESETS.find(p => p.id === providerType)
    setForm(f => ({
      ...f,
      providerType,
      baseUrl: preset ? preset.baseUrl : '',
      modelId: '',
    }))
    setModels([])
    setModelSearch('')
  }

  async function handleFetchModels() {
    if (!form.baseUrl) return
    setFetchingModels(true)
    setError('')
    try {
      const result = await api.connectionProfiles.fetchModels(form.baseUrl, form.apiKey || undefined)
      setModels(result)
      if (result.length > 0 && !form.modelId) {
        setForm(f => ({ ...f, modelId: result[0] }))
        setModelSearch(result[0])
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch models')
      setModels([])
    } finally {
      setFetchingModels(false)
    }
  }

  function startAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setShowKey(false)
    setModels([])
    setModelSearch('')
    setError('')
    setShowForm(true)
  }

  function startEdit(profile: ConnectionProfile) {
    setEditingId(profile.id)
    setForm({
      name: profile.name,
      providerType: profile.providerType,
      baseUrl: profile.baseUrl,
      apiKey: '',
      modelId: profile.modelId,
      isDefault: profile.isDefault,
    })
    setModelSearch(profile.modelId)
    setShowKey(false)
    setModels([])
    setError('')
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setError('')
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Profile name is required'); return }
    if (!form.baseUrl.trim()) { setError('Base URL is required'); return }
    const isLocalProvider = form.providerType === 'ollama' || form.providerType === 'lm-studio'
    if (!isLocalProvider && !editingId && !form.apiKey.trim()) { setError('API key is required'); return }

    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const updateData: Record<string, unknown> = {
          name: form.name.trim(),
          providerType: form.providerType,
          baseUrl: form.baseUrl.trim(),
          modelId: form.modelId.trim(),
          isDefault: form.isDefault,
        }
        if (form.apiKey.trim()) updateData.apiKey = form.apiKey.trim()
        await api.connectionProfiles.update(editingId, updateData as any)
      } else {
        await api.connectionProfiles.create({
          name: form.name.trim(),
          providerType: form.providerType,
          baseUrl: form.baseUrl.trim(),
          apiKey: isLocalProvider ? '' : form.apiKey.trim(),
          modelId: form.modelId.trim(),
          isDefault: form.isDefault,
        })
      }
      setShowForm(false)
      setEditingId(null)
      setSuccess('Profile saved')
      setTimeout(() => setSuccess(''), 2000)
      await loadProfiles()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await api.connectionProfiles.delete(id)
      await loadProfiles()
    } catch {
      // ignore
    } finally {
      setDeleting(null)
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await api.connectionProfiles.setDefault(id)
      await loadProfiles()
    } catch {
      // ignore
    }
  }

  function getProviderLabel(providerType: string): string {
    return PROVIDER_PRESETS.find(p => p.id === providerType)?.label ?? providerType
  }

  const isLocalProvider = form.providerType === 'ollama' || form.providerType === 'lm-studio'

  const filteredModels = models.filter(m =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  )

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'rgb(var(--accent))', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Connection Profiles</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Manage OpenAI-compatible API connection profiles for your agents.
            </p>
          </div>
          {!showForm && (
            <button className="btn-primary text-xs px-3 py-1.5" onClick={startAdd}>
              + Add Profile
            </button>
          )}
        </div>

        {success && (
          <div className="text-xs text-green-400 px-3 py-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            {success}
          </div>
        )}

        {showForm && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {editingId ? 'Edit Profile' : 'New Profile'}
              </h3>
              <button className="text-xs" style={{ color: 'var(--muted)' }} onClick={cancelForm}>
                Cancel
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--subtle)' }}>Profile Name</label>
                <input
                  className="input"
                  placeholder="e.g., My OpenAI, Work Anthropic..."
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--subtle)' }}>Provider</label>
                <select
                  className="input"
                  value={form.providerType}
                  onChange={e => handleProviderTypeChange(e.target.value)}
                >
                  {PROVIDER_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--subtle)' }}>Base URL</label>
                <input
                  className="input"
                  placeholder="https://api.openai.com/v1"
                  value={form.baseUrl}
                  onChange={e => setForm(f => ({ ...f, baseUrl: e.target.value }))}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                  OpenAI-compatible API endpoint
                </p>
              </div>

              {!isLocalProvider && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--subtle)' }}>API Key</label>
                  <div className="relative">
                    <input
                      className="input pr-16"
                      type={showKey ? 'text' : 'password'}
                      placeholder={editingId ? 'Leave blank to keep existing key' : 'sk-...'}
                      value={form.apiKey}
                      onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                    />
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-2 py-1 rounded"
                      style={{ color: 'var(--muted)' }}
                      onClick={() => setShowKey(v => !v)}
                      type="button"
                    >
                      {showKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium" style={{ color: 'var(--subtle)' }}>Model</label>
                  <button
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{ color: 'rgb(var(--accent))', background: 'rgba(245,158,11,0.1)' }}
                    onClick={handleFetchModels}
                    disabled={fetchingModels || !form.baseUrl}
                  >
                    {fetchingModels ? 'Loading...' : 'Fetch Models'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    ref={modelInputRef}
                    className="input"
                    placeholder="Select or type a model ID..."
                    value={modelSearch}
                    onChange={e => {
                      setModelSearch(e.target.value)
                      setForm(f => ({ ...f, modelId: e.target.value }))
                      setModelDropdownOpen(true)
                    }}
                    onFocus={() => setModelDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setModelDropdownOpen(false), 150)}
                  />
                  {modelDropdownOpen && filteredModels.length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10 max-h-48 overflow-y-auto"
                      style={{
                        background: 'rgba(8,18,40,0.95)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        backdropFilter: 'blur(16px)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      }}
                    >
                      {filteredModels.map(m => (
                        <button
                          key={m}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-white/[0.07] transition-colors"
                          style={{ color: 'var(--text-primary)' }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setForm(f => ({ ...f, modelId: m }))
                            setModelSearch(m)
                            setModelDropdownOpen(false)
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  className={`w-10 h-5 rounded-full transition-colors relative ${form.isDefault ? 'bg-accent' : 'bg-white/[0.07]'}`}
                  onClick={() => setForm(f => ({ ...f, isDefault: !f.isDefault }))}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isDefault ? 'translate-x-5' : 'translate-x-0.5'}`}
                  />
                </div>
                <span className="text-xs" style={{ color: 'var(--text-primary)' }}>Set as default profile</span>
              </label>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex items-center gap-2">
              <button className="btn-primary text-xs px-3 py-1.5" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update Profile' : 'Save Profile'}
              </button>
              <button className="btn-ghost text-xs px-3 py-1.5" onClick={cancelForm}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {profiles.length === 0 && !showForm && (
          <div className="card p-8 text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>No connection profiles yet. Add one to get started.</p>
          </div>
        )}

        <div className="space-y-2">
          {profiles.map(profile => (
            <div key={profile.id} className="card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${profile.isDefault ? 'bg-green-400' : 'bg-surface-3'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{profile.name}</span>
                    {profile.isDefault && (
                      <span className="text-[10px] bg-green-400/20 text-green-400 px-1.5 py-0.5 rounded-full font-medium">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {getProviderLabel(profile.providerType)} · {profile.baseUrl}
                  </div>
                  {profile.modelId && (
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--subtle)' }}>
                      Model: {profile.modelId}
                    </div>
                  )}
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--subtle)' }}>
                    Key: {profile.maskedKey}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {!profile.isDefault && (
                    <button
                      className="text-[10px] px-2 py-1 rounded hover:bg-white/5 transition-colors"
                      style={{ color: 'var(--subtle)' }}
                      onClick={() => handleSetDefault(profile.id)}
                      title="Set as default"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    className="text-[10px] px-2 py-1 rounded hover:bg-white/5 transition-colors"
                    style={{ color: 'var(--subtle)' }}
                    onClick={() => startEdit(profile)}
                  >
                    Edit
                  </button>
                  <button
                    className="text-[10px] px-2 py-1 rounded hover:bg-red-500/10 transition-colors text-red-400"
                    onClick={() => handleDelete(profile.id)}
                    disabled={deleting === profile.id}
                  >
                    {deleting === profile.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

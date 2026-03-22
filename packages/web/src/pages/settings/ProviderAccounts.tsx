import { useEffect, useRef, useState } from 'react'
import { api, type ProviderAccount } from '../../api.ts'

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google Gemini',
  groq: 'Groq',
  mistral: 'Mistral',
  xai: 'xAI (Grok)',
  'github-copilot': 'GitHub Copilot',
}

const ALL_PROVIDERS = Object.keys(PROVIDER_LABELS)

function CooldownBadge({ cooldownUntil }: { cooldownUntil: string | null }) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    if (!cooldownUntil) { setRemaining(''); return }

    function update() {
      const ms = new Date(cooldownUntil!).getTime() - Date.now()
      if (ms <= 0) { setRemaining(''); return }
      const mins = Math.ceil(ms / 60000)
      setRemaining(`cooldown ${mins}m`)
    }

    update()
    const id = setInterval(update, 15000)
    return () => clearInterval(id)
  }, [cooldownUntil])

  if (!remaining) return null
  return (
    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
      {remaining}
    </span>
  )
}

function AddAccountForm({
  providerId,
  onAdded,
  onCancel,
}: {
  providerId: string
  onAdded: () => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const labelRef = useRef<HTMLInputElement>(null)

  useEffect(() => { labelRef.current?.focus() }, [])

  async function handleSave() {
    if (!label.trim()) { setError('Label is required'); return }
    if (!apiKey.trim()) { setError('API key is required'); return }
    setSaving(true); setError('')
    try {
      await api.providerAccounts.create({ providerId, label: label.trim(), apiKey: apiKey.trim() })
      onAdded()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 p-3 rounded-lg space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <input
        ref={labelRef}
        className="input text-sm w-full"
        placeholder='Label, e.g. "Work key"'
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <div className="relative">
        <input
          className="input text-sm w-full pr-10"
          type={showKey ? 'text' : 'password'}
          placeholder="API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-subtle hover:text-primary"
          onClick={() => setShowKey((v) => !v)}
          type="button"
        >
          {showKey ? 'hide' : 'show'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary text-xs py-1 px-3" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Add'}
        </button>
        <button className="btn-ghost text-xs py-1 px-3" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function AccountRow({ account, onChanged }: { account: ProviderAccount; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(account.label)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true); setError('')
    try {
      await api.providerAccounts.update(account.id, {
        label: label.trim() || account.label,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      })
      setEditing(false)
      setApiKey('')
      onChanged()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete account "${account.label}"?`)) return
    await api.providerAccounts.delete(account.id)
    onChanged()
  }

  async function handleClearCooldown() {
    await api.providerAccounts.clearCooldown(account.id)
    onChanged()
  }

  return (
    <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {!editing ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${account.cooldownUntil ? 'bg-red-400' : 'bg-green-400'}`} />
            <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{account.label}</span>
            <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{account.maskedKey}</span>
            <CooldownBadge cooldownUntil={account.cooldownUntil} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {account.cooldownUntil && (
              <button className="text-xs text-subtle hover:text-primary" onClick={handleClearCooldown}>
                lift cooldown
              </button>
            )}
            <button className="text-xs text-subtle hover:text-primary" onClick={() => setEditing(true)}>
              edit
            </button>
            <button className="text-xs text-red-400/70 hover:text-red-400" onClick={handleDelete}>
              delete
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className="input text-sm w-full"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label"
          />
          <input
            className="input text-sm w-full"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="New API key (leave blank to keep current)"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary text-xs py-1 px-3" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-ghost text-xs py-1 px-3" onClick={() => { setEditing(false); setApiKey('') }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProviderSection({
  providerId,
  accounts,
  onChanged,
}: {
  providerId: string
  accounts: ProviderAccount[]
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {PROVIDER_LABELS[providerId] ?? providerId}
          </span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </span>
        </div>
        <button
          className="text-xs text-accent hover:underline"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? 'cancel' : '+ add account'}
        </button>
      </div>

      {accounts.map((a) => (
        <AccountRow key={a.id} account={a} onChanged={onChanged} />
      ))}

      {adding && (
        <AddAccountForm
          providerId={providerId}
          onAdded={() => { setAdding(false); onChanged() }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  )
}

export default function SettingsProviderAccounts() {
  const [accounts, setAccounts] = useState<ProviderAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [addingFor, setAddingFor] = useState<string | null>(null)

  async function load() {
    try {
      const data = await api.providerAccounts.list()
      setAccounts(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Group by provider, only show providers that have accounts or are being added to
  const grouped = accounts.reduce<Record<string, ProviderAccount[]>>((acc, a) => {
    if (!acc[a.providerId]) acc[a.providerId] = []
    acc[a.providerId].push(a)
    return acc
  }, {})

  const activeProviders = [...new Set([...Object.keys(grouped), ...(addingFor ? [addingFor] : [])])]
  const unusedProviders = ALL_PROVIDERS.filter((p) => !activeProviders.includes(p))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Provider Accounts</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Add multiple API keys per provider. Agents can be pinned to a specific account, or will automatically
            use any available account. On a 429 error, the account is put on cooldown and a fresh key is tried.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-subtle">Loading…</p>
        ) : (
          <>
            {activeProviders.length > 0 && (
              <div className="space-y-6">
                {activeProviders.map((pid) => (
                  <ProviderSection
                    key={pid}
                    providerId={pid}
                    accounts={grouped[pid] ?? []}
                    onChanged={load}
                  />
                ))}
              </div>
            )}

            {unusedProviders.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>Add accounts for:</p>
                <div className="flex flex-wrap gap-2">
                  {unusedProviders.map((p) => (
                    <button
                      key={p}
                      className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
                      style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'var(--subtle)' }}
                      onClick={() => setAddingFor(p)}
                    >
                      {PROVIDER_LABELS[p] ?? p}
                    </button>
                  ))}
                </div>
                {addingFor && !activeProviders.includes(addingFor) && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {PROVIDER_LABELS[addingFor] ?? addingFor}
                    </p>
                    <AddAccountForm
                      providerId={addingFor}
                      onAdded={() => { setAddingFor(null); load() }}
                      onCancel={() => setAddingFor(null)}
                    />
                  </div>
                )}
              </div>
            )}

            {accounts.length === 0 && !addingFor && (
              <p className="text-sm text-subtle">
                No accounts configured yet. Click a provider above to add your first key.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

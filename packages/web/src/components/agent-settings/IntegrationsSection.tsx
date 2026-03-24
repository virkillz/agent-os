import { useEffect, useState } from 'react'
import { api, type Integration, type PlatformMessage } from '../../api.ts'
import { XIcon } from './icons.tsx'

const PLATFORM_LABELS: Record<string, string> = { slack: 'Slack', telegram: 'Telegram' }
const PLATFORM_ICONS: Record<string, string> = { slack: '🔗', telegram: '✈️' }

// ─── Connector status badge ───────────────────────────────────────────────────

function StatusBadge({ status, error }: { status?: 'running' | 'stopped' | 'error'; error?: string }) {
  if (!status || status === 'stopped') {
    return (
      <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-white/20 flex-shrink-0" />
        Stopped
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--status-green, #4ade80)' }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--status-green, #4ade80)' }} />
        Running
      </span>
    )
  }
  return (
    <span
      className="flex items-center gap-1.5 text-[11px]"
      style={{ color: 'var(--status-red, #f87171)' }}
      title={error}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--status-red, #f87171)' }} />
      Error
    </span>
  )
}

// ─── Message log modal ────────────────────────────────────────────────────────

type Conversation = {
  scopeId: string
  scopeType: string
  threadId: string | null
  messages: PlatformMessage[]
}

function groupMessages(messages: PlatformMessage[]): Conversation[] {
  const map = new Map<string, Conversation>()
  for (const m of messages) {
    const key = `${m.scope_id}::${m.thread_id ?? ''}`
    if (!map.has(key)) {
      map.set(key, { scopeId: m.scope_id, scopeType: m.scope_type, threadId: m.thread_id, messages: [] })
    }
    map.get(key)!.messages.push(m)
  }
  // Sort conversations by most recent message descending
  const convos = Array.from(map.values())
  convos.sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.created_at ?? ''
    const bLast = b.messages[b.messages.length - 1]?.created_at ?? ''
    return bLast.localeCompare(aLast)
  })
  return convos
}

function conversationLabel(c: Conversation): string {
  const prefix = c.scopeType === 'dm' ? 'DM' : c.scopeType === 'channel' ? 'Channel' : 'Group'
  const scope = c.scopeId.length > 12 ? c.scopeId.slice(0, 12) + '…' : c.scopeId
  return c.threadId ? `${prefix} ${scope} (thread)` : `${prefix} ${scope}`
}

function MessageLogModal({
  agentId,
  integration,
  onClose,
}: {
  agentId: string
  integration: Integration
  onClose: () => void
}) {
  const [messages, setMessages] = useState<PlatformMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null)

  useEffect(() => {
    api.integrations
      .platformMessages(agentId, { platform: integration.platform, limit: 200 })
      .then((msgs) => {
        setMessages(msgs)
        const groups = groupMessages(msgs)
        if (groups.length > 0) {
          const first = groups[0]
          setSelectedConvo(`${first.scopeId}::${first.threadId ?? ''}`)
        }
      })
      .finally(() => setLoading(false))
  }, [agentId, integration.platform])

  const conversations = groupMessages(messages)
  const activeConvo = conversations.find(
    (c) => `${c.scopeId}::${c.threadId ?? ''}` === selectedConvo
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col rounded-2xl shadow-2xl"
        style={{
          maxWidth: '760px',
          maxHeight: '80vh',
          background: 'rgba(10,20,45,0.98)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {PLATFORM_ICONS[integration.platform]} {PLATFORM_LABELS[integration.platform]} Message Log
            </h3>
            <p className="text-[11px] text-muted mt-0.5">All messages received and sent via this integration</p>
          </div>
          <button
            className="p-1.5 rounded hover:bg-white/[0.07] text-muted transition-colors"
            onClick={onClose}
          >
            <XIcon />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted text-center py-12">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-muted text-center py-12">No messages yet.</p>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Conversation list (sidebar) */}
            <div
              className="w-48 flex-shrink-0 overflow-y-auto py-2"
              style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}
            >
              {conversations.map((c) => {
                const key = `${c.scopeId}::${c.threadId ?? ''}`
                const active = key === selectedConvo
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedConvo(key)}
                    className="w-full text-left px-3 py-2 text-[11px] truncate transition-colors"
                    style={{
                      background: active ? 'rgba(245,158,11,0.10)' : undefined,
                      borderLeft: `2px solid ${active ? 'rgb(var(--accent))' : 'transparent'}`,
                      color: active ? 'var(--text-primary)' : 'var(--subtle)',
                    }}
                  >
                    <div className="truncate font-medium">{conversationLabel(c)}</div>
                    <div className="text-muted">{c.messages.length} msg{c.messages.length !== 1 ? 's' : ''}</div>
                  </button>
                )
              })}
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {activeConvo ? (
                activeConvo.messages.map((m) => (
                  <div key={m.id} className="flex gap-2 text-xs">
                    <span className="text-muted flex-shrink-0 font-mono text-[10px] mt-0.5">
                      {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div>
                      <span
                        className="font-medium"
                        style={{ color: m.sender_type === 'agent' ? 'rgb(var(--accent))' : 'var(--subtle)' }}
                      >
                        {m.sender_name}
                      </span>
                      {m.message_type === 'reaction' ? (
                        <span className="text-muted ml-1.5">reacted {m.content}</span>
                      ) : (
                        <span className="ml-1.5" style={{ color: 'var(--text-primary)' }}>
                          {m.reply_to_msg_id && (
                            <span className="text-muted mr-1">[reply]</span>
                          )}
                          {m.content}
                        </span>
                      )}
                    </div>
                    <span
                      className="ml-auto text-[10px] flex-shrink-0"
                      style={{ color: m.direction === 'inbound' ? 'var(--muted)' : 'rgba(var(--accent),0.6)' }}
                    >
                      {m.direction}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted">Select a conversation.</p>
              )}
            </div>
          </div>
        )}

        <div
          className="flex justify-end px-6 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <button className="btn-primary text-xs px-4 py-1.5" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

type FormState = {
  platform: 'slack' | 'telegram'
  app_token: string
  bot_token: string
  channel_ids: string
  dm_enabled: boolean
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

function integrationToForm(i: Integration): FormState {
  const c = i.config
  if (i.platform === 'slack') {
    return {
      platform: 'slack',
      app_token: (c.app_token as string) ?? '',
      bot_token: (c.bot_token as string) ?? '',
      channel_ids: Array.isArray(c.channel_ids) ? (c.channel_ids as string[]).join(', ') : '',
      dm_enabled: (c.dm_enabled as boolean) ?? true,
      tg_bot_token: '',
      group_ids: '',
      tg_dm_enabled: true,
    }
  }
  return {
    platform: 'telegram',
    app_token: '',
    bot_token: '',
    channel_ids: '',
    dm_enabled: true,
    tg_bot_token: (c.bot_token as string) ?? '',
    group_ids: Array.isArray(c.group_ids) ? (c.group_ids as string[]).join(', ') : '',
    tg_dm_enabled: (c.dm_enabled as boolean) ?? true,
  }
}

function buildConfig(f: FormState): Record<string, unknown> {
  if (f.platform === 'slack') {
    return {
      app_token: f.app_token,
      bot_token: f.bot_token,
      dm_enabled: f.dm_enabled,
      channel_ids: f.channel_ids.split(',').map((s) => s.trim()).filter(Boolean),
    }
  }
  return {
    bot_token: f.tg_bot_token,
    dm_enabled: f.tg_dm_enabled,
    group_ids: f.group_ids.split(',').map((s) => s.trim()).filter(Boolean),
  }
}

// ─── Inline form ──────────────────────────────────────────────────────────────

function IntegrationForm({
  form,
  setForm,
  availablePlatforms,
  isEdit,
  saving,
  saveError,
  onSubmit,
  onCancel,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  availablePlatforms: ('slack' | 'telegram')[]
  isEdit: boolean
  saving: boolean
  saveError: string
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          {isEdit ? 'Edit Integration' : 'New Integration'}
        </h4>
        <button className="p-1 rounded hover:bg-white/[0.07] text-muted" onClick={onCancel}>
          <XIcon />
        </button>
      </div>

      {/* Platform selector — only shown for new integrations */}
      {!isEdit && (
        <div className="flex gap-2 mb-4">
          {availablePlatforms.map((p) => (
            <button
              key={p}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: form.platform === p ? 'rgba(var(--accent), 0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${form.platform === p ? 'rgba(var(--accent), 0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: form.platform === p ? 'var(--text-primary)' : 'var(--muted)',
              }}
              onClick={() => setForm((f) => ({ ...f, platform: p }))}
            >
              <span>{PLATFORM_ICONS[p]}</span>
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      {/* Slack fields */}
      {form.platform === 'slack' && (
        <div className="space-y-3">
          <Field
            label={isEdit ? 'App-Level Token (leave as *** to keep unchanged)' : 'App-Level Token (xapp-...)'}
            value={form.app_token}
            placeholder={isEdit ? '***' : 'xapp-1-...'}
            onChange={(v) => setForm((f) => ({ ...f, app_token: v }))}
            secret
          />
          <Field
            label={isEdit ? 'Bot Token (leave as *** to keep unchanged)' : 'Bot Token (xoxb-...)'}
            value={form.bot_token}
            placeholder={isEdit ? '***' : 'xoxb-...'}
            onChange={(v) => setForm((f) => ({ ...f, bot_token: v }))}
            secret
          />
          <Field
            label="Channel IDs (comma-separated, optional)"
            value={form.channel_ids}
            placeholder="C12345, C67890"
            onChange={(v) => setForm((f) => ({ ...f, channel_ids: v }))}
          />
          <Toggle
            label="Enable DMs"
            checked={form.dm_enabled}
            onChange={(v) => setForm((f) => ({ ...f, dm_enabled: v }))}
          />
        </div>
      )}

      {/* Telegram fields */}
      {form.platform === 'telegram' && (
        <div className="space-y-3">
          <Field
            label={isEdit ? 'Bot Token (leave as *** to keep unchanged)' : 'Bot Token'}
            value={form.tg_bot_token}
            placeholder={isEdit ? '***' : '123456:ABC-...'}
            onChange={(v) => setForm((f) => ({ ...f, tg_bot_token: v }))}
            secret
          />
          <Field
            label="Group IDs (comma-separated, optional)"
            value={form.group_ids}
            placeholder="-1001234567890"
            onChange={(v) => setForm((f) => ({ ...f, group_ids: v }))}
          />
          <Toggle
            label="Enable DMs"
            checked={form.tg_dm_enabled}
            onChange={(v) => setForm((f) => ({ ...f, tg_dm_enabled: v }))}
          />
        </div>
      )}

      {saveError && <p className="text-xs text-red-400 mt-3">{saveError}</p>}

      <div className="flex justify-end mt-4">
        <button className="btn-primary text-xs px-4 py-1.5" onClick={onSubmit} disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Update' : 'Save integration'}
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IntegrationsSection({ agentId }: { agentId: string }) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Add form
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<FormState>(DEFAULT_FORM)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(DEFAULT_FORM)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Message log modal
  const [msgLogIntegration, setMsgLogIntegration] = useState<Integration | null>(null)

  useEffect(() => {
    setLoading(true)
    api.integrations
      .list(agentId)
      .then(setIntegrations)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [agentId])

  async function handleCreate() {
    setAddSaving(true)
    setAddError('')
    try {
      const created = await api.integrations.create(agentId, {
        platform: addForm.platform,
        config: buildConfig(addForm),
      })
      setIntegrations((prev) => [...prev, created])
      setShowAddForm(false)
      setAddForm(DEFAULT_FORM)
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setAddSaving(false)
    }
  }

  function openEdit(i: Integration) {
    setEditingId(i.id)
    setEditForm(integrationToForm(i))
    setEditError('')
  }

  async function handleUpdate() {
    if (!editingId) return
    setEditSaving(true)
    setEditError('')
    try {
      const updated = await api.integrations.patch(agentId, editingId, { config: buildConfig(editForm) })
      setIntegrations((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      setEditingId(null)
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleToggle(i: Integration) {
    const updated = await api.integrations.patch(agentId, i.id, { enabled: i.enabled ? 0 : 1 })
    setIntegrations((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  }

  async function handleDelete(i: Integration) {
    if (!confirm(`Remove ${PLATFORM_LABELS[i.platform]} integration?`)) return
    await api.integrations.delete(agentId, i.id)
    setIntegrations((prev) => prev.filter((x) => x.id !== i.id))
  }

  const availablePlatforms = (['slack', 'telegram'] as const).filter(
    (p) => !integrations.find((i) => i.platform === p)
  )

  return (
    <>
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
              Connect this agent to external platforms. Each integration starts a live connector.
            </p>
            {availablePlatforms.length > 0 && !showAddForm && (
              <button
                className="btn-primary text-xs px-3 py-1.5"
                onClick={() => {
                  setShowAddForm(true)
                  setAddForm({ ...DEFAULT_FORM, platform: availablePlatforms[0] })
                }}
              >
                + Add integration
              </button>
            )}
          </div>

          {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

          {/* Add form */}
          {showAddForm && (
            <IntegrationForm
              form={addForm}
              setForm={setAddForm}
              availablePlatforms={availablePlatforms}
              isEdit={false}
              saving={addSaving}
              saveError={addError}
              onSubmit={handleCreate}
              onCancel={() => { setShowAddForm(false); setAddError('') }}
            />
          )}

          {/* Integration list */}
          {loading ? (
            <p className="text-sm text-muted text-center py-8">Loading…</p>
          ) : integrations.length === 0 && !showAddForm ? (
            <p className="text-sm text-muted text-center py-8">No integrations configured yet.</p>
          ) : (
            <div className="space-y-3">
              {integrations.map((i) => (
                <div key={i.id}>
                  {/* Integration row */}
                  {editingId !== i.id && (
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid rgba(255,255,255,0.07)', opacity: i.enabled ? 1 : 0.55 }}
                    >
                      <div
                        className="flex items-center gap-3 px-4 py-3"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                      >
                        <span className="text-lg flex-shrink-0">{PLATFORM_ICONS[i.platform]}</span>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {PLATFORM_LABELS[i.platform]}
                            </span>
                            <StatusBadge status={i.status} error={i.error} />
                          </div>
                          <div className="text-[11px] text-muted mt-0.5">
                            {i.enabled ? 'Enabled' : 'Disabled'} · added {new Date(i.created_at).toLocaleDateString()}
                            {i.status === 'error' && i.error && (
                              <span className="ml-2" style={{ color: 'var(--status-red, #f87171)' }}>
                                — {i.error}
                              </span>
                            )}
                          </div>
                          {/* Config summary */}
                          <ConfigSummary platform={i.platform} config={i.config} />
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            className="text-xs px-2.5 py-1 rounded-md transition-colors"
                            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--subtle)' }}
                            onClick={() => setMsgLogIntegration(i)}
                            title="View message log"
                          >
                            Messages
                          </button>
                          <button
                            className="text-xs px-2.5 py-1 rounded-md transition-colors"
                            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--subtle)' }}
                            onClick={() => openEdit(i)}
                            title="Edit configuration"
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs px-2.5 py-1 rounded-md transition-colors"
                            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--subtle)' }}
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
                    </div>
                  )}

                  {/* Edit form (inline, replaces row) */}
                  {editingId === i.id && (
                    <IntegrationForm
                      form={editForm}
                      setForm={setEditForm}
                      availablePlatforms={[i.platform]}
                      isEdit
                      saving={editSaving}
                      saveError={editError}
                      onSubmit={handleUpdate}
                      onCancel={() => { setEditingId(null); setEditError('') }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Message log modal */}
      {msgLogIntegration && (
        <MessageLogModal
          agentId={agentId}
          integration={msgLogIntegration}
          onClose={() => setMsgLogIntegration(null)}
        />
      )}
    </>
  )
}

// ─── Config summary ───────────────────────────────────────────────────────────

function ConfigSummary({ platform, config }: { platform: string; config: Record<string, unknown> }) {
  const parts: string[] = []
  if (platform === 'slack') {
    if (config.dm_enabled) parts.push('DMs enabled')
    const channels = Array.isArray(config.channel_ids) ? (config.channel_ids as string[]) : []
    if (channels.length > 0) parts.push(`${channels.length} channel${channels.length > 1 ? 's' : ''}`)
  } else if (platform === 'telegram') {
    if (config.dm_enabled) parts.push('DMs enabled')
    const groups = Array.isArray(config.group_ids) ? (config.group_ids as string[]) : []
    if (groups.length > 0) parts.push(`${groups.length} group${groups.length > 1 ? 's' : ''}`)
  }
  if (parts.length === 0) return null
  return (
    <div className="text-[11px] text-muted mt-0.5">{parts.join(' · ')}</div>
  )
}

// ─── Field / Toggle helpers ───────────────────────────────────────────────────

function Field({
  label,
  value,
  placeholder,
  onChange,
  secret,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
  secret?: boolean
}) {
  return (
    <div>
      <label className="block text-[11px] text-muted mb-1">{label}</label>
      <input
        type={secret ? 'password' : 'text'}
        className="w-full text-xs rounded-lg px-3 py-2 outline-none focus:ring-1"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'var(--text-primary)',
        }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${checked ? 'bg-accent' : 'bg-white/[0.10]'}`}
        onClick={() => onChange(!checked)}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </button>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

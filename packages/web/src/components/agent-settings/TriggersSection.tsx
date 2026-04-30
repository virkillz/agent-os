import { useEffect, useState } from 'react'
import { api, type Trigger, type TriggerPreview, type InvocationRow } from '../../api.ts'
import { EyeIcon, PauseIcon, PlayIcon, XIcon } from './icons.tsx'

const TYPE_LABELS: Record<string, string> = {
  scheduler: 'scheduler',
  internal_chat: 'internal',
  slack_dm: 'slack_dm',
  slack_channel: 'slack_ch',
  telegram_dm: 'tg_dm',
  telegram_group: 'tg_group',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'rgba(245,158,11,0.9)',    // amber
  processing: 'rgba(96,165,250,0.9)', // blue
  done: 'rgba(74,222,128,0.8)',       // green
  failed: 'rgba(248,113,113,0.9)',    // red
}

function formatFiredAt(iso: string | null): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return `${Math.floor(diffH / 24)}d ago`
}

// ─── Queue summary bar ────────────────────────────────────────────────────────

type QueueSummary = { pending: number; processing: number; done: number; failed: number }

function QueueSummaryBar({ agentId }: { agentId: string }) {
  const [summary, setSummary] = useState<QueueSummary | null>(null)

  useEffect(() => {
    api.triggers.queueSummary(agentId)
      .then(setSummary)
      .catch(() => { /* silently ignore */ })
  }, [agentId])

  if (!summary) return null

  const hasActivity = summary.pending > 0 || summary.processing > 0 || summary.failed > 0

  return (
    <div
      className="flex items-center gap-4 px-4 py-2.5 rounded-lg mb-4 text-xs"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <span className="text-muted font-medium uppercase tracking-wider text-[10px]">Queue</span>

      {!hasActivity ? (
        <span className="text-muted">No pending invocations</span>
      ) : (
        <>
          {summary.processing > 0 && (
            <span style={{ color: STATUS_COLORS.processing }}>
              {summary.processing} processing
            </span>
          )}
          {summary.pending > 0 && (
            <span style={{ color: STATUS_COLORS.pending }}>
              {summary.pending} pending
            </span>
          )}
          {summary.failed > 0 && (
            <span style={{ color: STATUS_COLORS.failed }}>
              {summary.failed} failed
            </span>
          )}
        </>
      )}

      <span className="ml-auto text-muted">{summary.done} done total</span>
    </div>
  )
}

// ─── Invocation history panel ────────────────────────────────────────────────

function InvocationHistory({ agentId, trigger }: { agentId: string; trigger: Trigger }) {
  const [rows, setRows] = useState<InvocationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.triggers
      .invocations(agentId, trigger.id, { limit: 20 })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [agentId, trigger.id])

  if (loading) {
    return (
      <div className="px-3 py-3 text-xs text-muted" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        Loading…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="px-3 py-3 text-xs text-muted" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        No invocations yet.
      </div>
    )
  }

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div
        className="grid gap-3 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted"
        style={{ gridTemplateColumns: '64px 1fr 1fr 56px' }}
      >
        <span>Status</span>
        <span>Queued</span>
        <span>Processed</span>
        <span className="text-right">Retries</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.id}
          className="grid gap-3 items-center px-3 py-2 text-xs"
          style={{ gridTemplateColumns: '64px 1fr 1fr 56px', borderTop: '1px solid rgba(255,255,255,0.04)' }}
        >
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-mono w-fit"
            style={{
              background: `${STATUS_COLORS[r.status] ?? 'rgba(255,255,255,0.08)'}22`,
              color: STATUS_COLORS[r.status] ?? 'var(--subtle)',
              border: `1px solid ${STATUS_COLORS[r.status] ?? 'rgba(255,255,255,0.1)'}44`,
            }}
          >
            {r.status}
          </span>
          <span className="text-muted">{formatFiredAt(r.created_at)}</span>
          <span className="text-muted">{r.processed_at ? formatFiredAt(r.processed_at) : '—'}</span>
          <span className="text-muted text-right">{r.retry_count > 0 ? `${r.retry_count}x` : '—'}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TriggersSection({ agentId }: { agentId: string }) {
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [previewTrigger, setPreviewTrigger] = useState<Trigger | null>(null)
  const [previewData, setPreviewData] = useState<TriggerPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewTab, setPreviewTab] = useState<'system' | 'context' | 'history'>('system')

  useEffect(() => {
    setLoading(true)
    api.triggers
      .list(agentId)
      .then(setTriggers)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [agentId])

  async function handleToggle(t: Trigger) {
    const updated = await api.triggers.patch(agentId, t.id, { enabled: t.enabled ? 0 : 1 })
    setTriggers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  }

  async function handleDelete(t: Trigger) {
    await api.triggers.delete(agentId, t.id)
    setTriggers((prev) => prev.filter((x) => x.id !== t.id))
  }

  function openPreview(t: Trigger) {
    setPreviewTrigger(t)
    setPreviewData(null)
    setPreviewLoading(true)
    setPreviewTab('system')
    api.triggers
      .previewPrompt(agentId, t.id)
      .then(setPreviewData)
      .catch(() => setPreviewData(null))
      .finally(() => setPreviewLoading(false))
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto flex items-start justify-center py-8">
        <div
          className="w-full max-w-4xl rounded-2xl p-6 animate-zoom-in"
          style={{
            background: 'rgb(var(--s1) / 0.90)',
            border: '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <p className="text-xs text-muted mb-4">
            Every invocation source for this agent. Click a row to see invocation history.
          </p>

          {/* Queue summary */}
          <QueueSummaryBar agentId={agentId} />

          {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

          {loading ? (
            <p className="text-sm text-muted text-center py-8">Loading…</p>
          ) : triggers.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">No triggers yet.</p>
          ) : (
            <div className="space-y-1">
              {/* Header row */}
              <div
                className="grid gap-3 px-3 py-1 text-[10px] text-muted font-medium uppercase tracking-wider"
                style={{ gridTemplateColumns: '80px 1fr 80px 48px 80px' }}
              >
                <span>Type</span>
                <span>Label</span>
                <span>Last fired</span>
                <span className="text-right">Count</span>
                <span />
              </div>

              {triggers.map((t) => {
                const expanded = expandedId === t.id
                return (
                  <div
                    key={t.id}
                    className="rounded-lg overflow-hidden"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${expanded ? 'rgba(245,158,11,0.20)' : 'rgba(255,255,255,0.07)'}`,
                      opacity: t.enabled ? 1 : 0.5,
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {/* Trigger row */}
                    <div
                      className="grid gap-3 items-center px-3 py-2.5 cursor-pointer hover:bg-white/[0.02]"
                      style={{ gridTemplateColumns: '80px 1fr 80px 48px 80px' }}
                      onClick={() => toggleExpand(t.id)}
                    >
                      {/* Type badge */}
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-mono w-fit"
                        style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--subtle)' }}
                      >
                        {TYPE_LABELS[t.type] ?? t.type}
                      </span>

                      {/* Label */}
                      <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                        {t.label}
                      </span>

                      {/* Last fired */}
                      <span className="text-[11px] text-muted">{formatFiredAt(t.last_fired_at)}</span>

                      {/* Fire count */}
                      <span className="text-[11px] text-muted text-right">{t.fire_count}x</span>

                      {/* Actions */}
                      <div
                        className="flex items-center gap-1 justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="p-1.5 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
                          title="Preview prompt"
                          onClick={() => openPreview(t)}
                        >
                          <EyeIcon />
                        </button>
                        {t.type !== 'internal_chat' && (
                          <button
                            className="p-1.5 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
                            title={t.enabled ? 'Disable' : 'Enable'}
                            onClick={() => handleToggle(t)}
                          >
                            {t.enabled ? <PauseIcon /> : <PlayIcon />}
                          </button>
                        )}
                        {t.type !== 'internal_chat' && (
                          <button
                            className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
                            title="Delete trigger"
                            onClick={() => handleDelete(t)}
                          >
                            <XIcon />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Invocation history (expanded) */}
                    {expanded && <InvocationHistory agentId={agentId} trigger={t} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {previewTrigger && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => {
            setPreviewTrigger(null)
            setPreviewData(null)
          }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col"
            style={{
              background: 'rgba(10,20,45,0.98)',
              border: '1px solid rgba(255,255,255,0.12)',
              maxHeight: '80vh',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Prompt Preview
                </h3>
                <p className="text-xs text-muted mt-0.5">{previewTrigger.label}</p>
              </div>
              <button
                className="p-1.5 rounded hover:bg-white/[0.07] text-muted transition-colors"
                onClick={() => {
                  setPreviewTrigger(null)
                  setPreviewData(null)
                }}
              >
                <XIcon />
              </button>
            </div>

            {/* Tabs */}
            <div
              className="flex gap-1 px-6 pt-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              {(['system', 'context', 'history'] as const).map((tab) => (
                <button
                  key={tab}
                  className="px-3 py-1.5 text-xs rounded-t-md transition-colors"
                  style={{
                    color: previewTab === tab ? 'var(--text-primary)' : 'var(--muted)',
                    background: previewTab === tab ? 'rgba(255,255,255,0.06)' : undefined,
                    borderBottom:
                      previewTab === tab ? '2px solid rgb(var(--accent))' : '2px solid transparent',
                  }}
                  onClick={() => setPreviewTab(tab)}
                >
                  {tab === 'system' ? 'System Prompt' : tab === 'context' ? 'Trigger Context' : 'History'}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {previewLoading ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : !previewData ? (
                <p className="text-sm text-red-400">Failed to load preview.</p>
              ) : (
                <>
                  {previewTab === 'system' && (
                    <pre
                      className="text-xs text-subtle whitespace-pre-wrap break-words"
                      style={{ fontFamily: 'monospace' }}
                    >
                      {previewData.system_prompt}
                    </pre>
                  )}
                  {previewTab === 'context' && (
                    <div className="space-y-3">
                      {previewData.trigger_context_addendum ? (
                        <pre
                          className="text-xs text-subtle whitespace-pre-wrap break-words"
                          style={{ fontFamily: 'monospace' }}
                        >
                          {previewData.trigger_context_addendum}
                        </pre>
                      ) : (
                        <p className="text-xs text-muted">
                          (No trigger context addendum for this trigger type.)
                        </p>
                      )}
                      {previewData.trigger_prompt && (
                        <div>
                          <p className="text-[10px] text-muted mb-1 font-medium uppercase tracking-wider">
                            Trigger Prompt
                          </p>
                          <pre
                            className="text-xs text-subtle whitespace-pre-wrap break-words rounded-lg p-3"
                            style={{
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.07)',
                              fontFamily: 'monospace',
                            }}
                          >
                            {previewData.trigger_prompt}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                  {previewTab === 'history' && (
                    <div className="space-y-2">
                      {previewData.conversation_history.length === 0 ? (
                        <p className="text-xs text-muted">
                          (No conversation history for this trigger.)
                        </p>
                      ) : (
                        previewData.conversation_history.map((m, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-muted">
                              [{new Date(m.timestamp).toLocaleString()}]{' '}
                            </span>
                            <span
                              style={{
                                color:
                                  m.sender_type === 'agent'
                                    ? 'var(--accent-light, #a78bfa)'
                                    : 'var(--text-primary)',
                              }}
                            >
                              {m.sender} ({m.sender_type}):
                            </span>
                            <span className="text-subtle ml-1">{m.content}</span>
                          </div>
                        ))
                      )}
                      {previewData.total_history_available !== undefined && (
                        <p className="text-[10px] text-muted mt-2">
                          Showing last {previewData.history_window} of{' '}
                          {previewData.total_history_available} messages.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div
              className="flex justify-end px-6 py-4"
              style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
            >
              <button
                className="btn-primary text-xs px-4 py-1.5"
                onClick={() => {
                  setPreviewTrigger(null)
                  setPreviewData(null)
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

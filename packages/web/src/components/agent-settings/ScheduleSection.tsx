import { useEffect, useState } from 'react'
import { useStore } from '../../store.ts'
import { api, type Schedule } from '../../api.ts'
import { BoltIcon, EyeIcon, PauseIcon, PencilIcon, PlayIcon, TrashIcon, VerticalEllipsisIcon, XIcon } from './icons.tsx'

const CRON_PRESETS = [
  { label: 'Daily 9am', value: '0 9 * * *' },
  { label: 'Weekdays 9am', value: '0 9 * * 1-5' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every Monday', value: '0 9 * * 1' },
]

function formatNextRun(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ScheduleSection({ agentId }: { agentId: string }) {
  const { schedules, loadSchedules, addSchedule, patchSchedule, deleteSchedule } = useStore()
  const items = schedules[agentId] ?? []
  const [showForm, setShowForm] = useState(false)
  const [formLabel, setFormLabel] = useState('')
  const [formCron, setFormCron] = useState('0 9 * * *')
  const [formPrompt, setFormPrompt] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [openMenuId, setOpenMenuId] = useState<number | null>(null)

  const [editScheduleId, setEditScheduleId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editCron, setEditCron] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [previewSchedule, setPreviewSchedule] = useState<Schedule | null>(null)
  const [previewCombinedPrompt, setPreviewCombinedPrompt] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [runningId, setRunningId] = useState<number | null>(null)

  useEffect(() => {
    loadSchedules(agentId)
  }, [agentId, loadSchedules])

  useEffect(() => {
    if (openMenuId === null) return
    function handleClick() { setOpenMenuId(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openMenuId])

  function openEdit(s: Schedule) {
    setEditScheduleId(s.id)
    setEditLabel(s.label ?? '')
    setEditCron(s.cron)
    setEditPrompt(s.prompt)
    setEditError('')
  }

  async function handleSaveEdit() {
    if (!editCron.trim() || !editPrompt.trim()) {
      setEditError('Cron expression and prompt are required.')
      return
    }
    setEditSaving(true)
    try {
      await patchSchedule(agentId, editScheduleId!, {
        label: editLabel,
        cron: editCron,
        prompt: editPrompt,
      })
      setEditScheduleId(null)
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleRunNow(s: Schedule) {
    setRunningId(s.id)
    try {
      await api.chat.send(agentId, s.prompt)
    } finally {
      setRunningId(null)
    }
  }

  async function handleDeleteConfirm() {
    if (deleteConfirmId === null) return
    await deleteSchedule(agentId, deleteConfirmId)
    setDeleteConfirmId(null)
  }

  async function handleCreate() {
    setFormError('')
    if (!formCron.trim() || !formPrompt.trim()) {
      setFormError('Cron expression and prompt are required.')
      return
    }
    setSaving(true)
    try {
      await addSchedule(agentId, {
        cron: formCron,
        prompt: formPrompt,
        label: formLabel,
      })
      setShowForm(false)
      setFormLabel('')
      setFormCron('0 9 * * *')
      setFormPrompt('')
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-2xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted">Recurring tasks that run automatically on a schedule.</p>
          <button
            className="btn-primary text-xs px-3 py-1.5"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : '+ Add schedule'}
          </button>
        </div>

        {showForm && (
          <div
            className="rounded-xl p-4 mb-6 space-y-3 animate-zoom-in"
            style={{
              background: 'rgba(8,18,40,0.80)',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
            }}
          >
            <div>
              <label className="block text-xs font-medium text-subtle mb-1">Label (optional)</label>
              <input
                className="input text-sm"
                placeholder="e.g. Morning standup"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1">Cron expression</label>
              <input
                className="input font-mono text-sm"
                placeholder="0 9 * * *"
                value={formCron}
                onChange={(e) => setFormCron(e.target.value)}
              />
              <div className="flex gap-1.5 flex-wrap mt-1.5">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className="px-2 py-0.5 rounded bg-white/[0.07] text-[10px] text-subtle hover:text-text-primary transition-colors"
                    onClick={() => setFormCron(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1">Prompt</label>
              <textarea
                className="input resize-none text-sm"
                rows={3}
                placeholder="What should the agent do when this fires?"
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
              />
            </div>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <button className="btn-primary text-xs" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create schedule'}
            </button>
          </div>
        )}

        {items.length === 0 && !showForm && (
          <p className="text-sm text-muted text-center py-8">No schedules yet.</p>
        )}

        <div className="space-y-2">
          {items.map((s: Schedule) => (
            <div
              key={s.id}
              className="rounded-lg px-4 py-3"
              style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {s.label && (
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {s.label}
                      </span>
                    )}
                    <code className="text-[10px] bg-white/[0.07] px-1.5 py-0.5 rounded font-mono text-subtle">
                      {s.cron}
                    </code>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        s.enabled
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-white/[0.07] text-muted'
                      }`}
                    >
                      {s.enabled ? 'enabled' : 'paused'}
                    </span>
                  </div>
                  <p className="text-xs text-muted truncate">{s.prompt}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] text-muted">Next: {formatNextRun(s.next_run_at)}</p>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0 items-center">
                  <button
                    className="p-1.5 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors text-xs"
                    onClick={() => patchSchedule(agentId, s.id, { enabled: s.enabled ? 0 : 1 })}
                    title={s.enabled ? 'Pause' : 'Enable'}
                  >
                    {s.enabled ? <PauseIcon /> : <PlayIcon />}
                  </button>
                  <div className="relative">
                    <button
                      className="p-1.5 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
                      title="More options"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === s.id ? null : s.id)
                      }}
                    >
                      <VerticalEllipsisIcon />
                    </button>
                    {openMenuId === s.id && (
                      <div
                        className="absolute right-0 top-full mt-1 z-50 rounded-lg overflow-hidden shadow-xl"
                        style={{
                          background: 'rgba(15,23,42,0.97)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          backdropFilter: 'blur(16px)',
                          minWidth: '148px',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-subtle hover:text-text-primary hover:bg-white/[0.07] transition-colors disabled:opacity-50"
                          disabled={runningId === s.id}
                          onClick={() => { setOpenMenuId(null); handleRunNow(s) }}
                        >
                          <BoltIcon />
                          {runningId === s.id ? 'Running...' : 'Run now'}
                        </button>
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-subtle hover:text-text-primary hover:bg-white/[0.07] transition-colors"
                          onClick={() => { setOpenMenuId(null); openEdit(s) }}
                        >
                          <PencilIcon />
                          Edit
                        </button>
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-subtle hover:text-text-primary hover:bg-white/[0.07] transition-colors"
                          onClick={() => {
                            setOpenMenuId(null)
                            setPreviewSchedule(s)
                            setPreviewCombinedPrompt(null)
                            setPreviewLoading(true)
                            api.schedules.previewPrompt(agentId, s.id)
                              .then((r) => setPreviewCombinedPrompt(r.prompt))
                              .finally(() => setPreviewLoading(false))
                          }}
                        >
                          <EyeIcon />
                          Preview prompt
                        </button>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-white/[0.07] transition-colors"
                          onClick={() => { setOpenMenuId(null); setDeleteConfirmId(s.id) }}
                        >
                          <TrashIcon />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {editScheduleId === s.id && (
                <div className="mt-3 pt-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div>
                    <label className="block text-xs font-medium text-subtle mb-1">Label (optional)</label>
                    <input
                      className="input text-sm"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-subtle mb-1">Cron expression</label>
                    <input
                      className="input font-mono text-sm"
                      value={editCron}
                      onChange={(e) => setEditCron(e.target.value)}
                    />
                    <div className="flex gap-1.5 flex-wrap mt-1.5">
                      {CRON_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          className="px-2 py-0.5 rounded bg-white/[0.07] text-[10px] text-subtle hover:text-text-primary transition-colors"
                          onClick={() => setEditCron(p.value)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-subtle mb-1">Prompt</label>
                    <textarea
                      className="input resize-none text-sm"
                      rows={3}
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                    />
                  </div>
                  {editError && <p className="text-xs text-red-400">{editError}</p>}
                  <div className="flex gap-2">
                    <button className="btn-primary text-xs" onClick={handleSaveEdit} disabled={editSaving}>
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs text-subtle hover:text-text-primary transition-colors"
                      onClick={() => setEditScheduleId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>

    {previewSchedule && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={(e) => { e.stopPropagation(); setPreviewSchedule(null); setPreviewCombinedPrompt(null) }}
      >
        <div
          className="w-full max-w-lg rounded-2xl p-6 shadow-2xl"
          style={{ background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.12)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Trigger message
              </h3>
              {previewSchedule.label && (
                <p className="text-xs text-muted mt-0.5">{previewSchedule.label}</p>
              )}
            </div>
            <button
              className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
              onClick={() => { setPreviewSchedule(null); setPreviewCombinedPrompt(null) }}
            >
              <XIcon />
            </button>
          </div>
          <pre
            className="text-xs text-subtle whitespace-pre-wrap break-words rounded-lg p-4 overflow-y-auto max-h-80"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {previewLoading ? 'Loading...' : (previewCombinedPrompt ?? '')}
          </pre>
          <div className="flex justify-end mt-4">
            <button className="btn-primary text-xs px-4 py-1.5" onClick={() => { setPreviewSchedule(null); setPreviewCombinedPrompt(null) }}>
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {deleteConfirmId !== null && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null) }}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
          style={{ background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.12)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Delete schedule?</h3>
          <p className="text-xs text-muted mb-5">This action cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <button
              className="px-4 py-1.5 text-xs text-subtle hover:text-text-primary transition-colors"
              onClick={() => setDeleteConfirmId(null)}
            >
              Cancel
            </button>
            <button
              className="px-4 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              onClick={handleDeleteConfirm}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

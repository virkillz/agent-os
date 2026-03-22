import { useEffect, useState } from 'react'
import { api, type Role } from '../api.ts'

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([])
  const [selected, setSelected] = useState<Role | null>(null)
  const [form, setForm] = useState({ name: '', description: '', prompt: '' })
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>('view')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.roles.list().then(setRoles)
  }, [])

  function selectRole(role: Role) {
    setSelected(role)
    setForm({ name: role.name, description: role.description, prompt: role.prompt })
    setMode('view')
    setError('')
  }

  function startCreate() {
    setSelected(null)
    setForm({ name: '', description: '', prompt: '' })
    setMode('create')
    setError('')
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') {
        const role = await api.roles.create(form)
        setRoles([...roles, role])
        selectRole(role)
      } else if (mode === 'edit' && selected) {
        const updated = await api.roles.update(selected.id, form)
        setRoles(roles.map((r) => (r.id === selected.id ? updated : r)))
        selectRole(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRole(role: Role) {
    if (!confirm(`Delete role "${role.name}"? Agents assigned this role will lose it.`)) return
    await api.roles.delete(role.id)
    setRoles(roles.filter((r) => r.id !== role.id))
    if (selected?.id === role.id) { setSelected(null); setMode('view') }
  }

  const isEditing = mode === 'edit' || mode === 'create'

  return (
    <div className="flex h-full bg-surface-0">
      {/* Role list */}
      <div className="w-56 flex-shrink-0 bg-surface-1 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Roles</span>
          <button
            onClick={startCreate}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-surface-2 transition-colors"
            style={{ color: 'var(--muted)' }}
            title="New role"
          >
            <PlusIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => selectRole(role)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                selected?.id === role.id ? 'bg-surface-3' : 'hover:bg-surface-2'
              }`}
              style={{ color: selected?.id === role.id ? 'var(--text-primary)' : 'var(--muted)' }}
            >
              <div className="w-2 h-2 rounded-full bg-accent/60 flex-shrink-0" />
              <span className="truncate">{role.name}</span>
            </button>
          ))}
          {roles.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted">No roles yet.</p>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto">
        {(selected || mode === 'create') ? (
          <div className="max-w-2xl mx-auto px-8 py-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {mode === 'create' ? 'New Role' : selected?.name}
              </h2>
              <div className="flex gap-2">
                {!isEditing && (
                  <>
                    <button
                      onClick={() => setMode('edit')}
                      className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-surface-2 transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => selected && deleteRole(selected)}
                      className="px-3 py-1.5 text-xs text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 transition-colors"
                    >
                      Delete
                    </button>
                  </>
                )}
                {isEditing && (
                  <>
                    <button
                      onClick={() => { setMode('view'); if (selected) setForm({ name: selected.name, description: selected.description, prompt: selected.prompt }) }}
                      className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-surface-2 transition-colors"
                      style={{ color: 'var(--muted)' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={save}
                      disabled={saving}
                      className="px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Name</label>
                {isEditing ? (
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder="e.g. Writer"
                  />
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{selected?.name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
                {isEditing ? (
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder="Brief description of what this role does"
                  />
                ) : (
                  <p className="text-sm text-muted">{selected?.description || '—'}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">
                  Role Prompt
                  <span className="ml-1 font-normal">(injected into agent system prompt)</span>
                </label>
                {isEditing ? (
                  <textarea
                    value={form.prompt}
                    onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                    rows={10}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-surface-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent resize-y"
                    style={{ color: 'var(--text-primary)' }}
                    placeholder="Describe the role's responsibilities, approach, and any specific instructions…"
                  />
                ) : (
                  <pre className="text-sm whitespace-pre-wrap bg-surface-1 border border-border rounded-lg p-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {selected?.prompt || '(no prompt)'}
                  </pre>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-muted">Select a role or create a new one</p>
            <button
              onClick={startCreate}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover transition-colors"
            >
              New Role
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

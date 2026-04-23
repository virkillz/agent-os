import { useEffect, useState } from 'react'
import { useStore } from '../../store.ts'
import type { McpServer } from '../../api.ts'

export default function SettingsMcp() {
  const { mcpServers, loadMcpServers, addMcpServer, updateMcpServer, deleteMcpServer } = useStore()

  useEffect(() => { loadMcpServers() }, [loadMcpServers])

  const [showForm, setShowForm] = useState(false)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>MCP Servers</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Configure Model Context Protocol servers. Agents can connect to these servers to access external tools and data.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary text-xs px-3"
          >
            + Add Server
          </button>
        </div>

        {showForm && (
          <AddServerForm
            onSave={async (data) => {
              await addMcpServer(data)
              setShowForm(false)
            }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {mcpServers.length === 0 && !showForm && (
          <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-gray-700 rounded-xl">
            No MCP servers configured. Click "+ Add Server" to get started.
          </div>
        )}

        <div className="space-y-2">
          {mcpServers.map((server) => (
            <McpServerCard key={server.id} server={server} onUpdate={updateMcpServer} onDelete={deleteMcpServer} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AddServerForm({ onSave, onCancel }: { onSave: (data: { name: string; description?: string; command: string; args?: string[]; env?: Record<string, string> }) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [command, setCommand] = useState('')
  const [argsStr, setArgsStr] = useState('')
  const [envStr, setEnvStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !command.trim()) return
    setSaving(true)
    setError('')
    try {
      let args: string[] | undefined
      if (argsStr.trim()) {
        try { args = JSON.parse(argsStr) } catch { args = argsStr.trim().split(/\s+/) }
      }
      let env: Record<string, string> | undefined
      if (envStr.trim()) {
        try { env = JSON.parse(envStr) } catch { setError('Environment variables must be valid JSON, e.g. {"KEY": "value"}'); setSaving(false); return }
      }
      await onSave({ name: name.trim(), description: description.trim() || undefined, command: command.trim(), args, env })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New MCP Server</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Name *</label>
          <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. my-tools" />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Description</label>
          <input className="input w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
        </div>
      </div>
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Command *</label>
        <input className="input w-full" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="e.g. npx, python, node" />
      </div>
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Arguments (JSON array or space-separated)</label>
        <input className="input w-full" value={argsStr} onChange={(e) => setArgsStr(e.target.value)} placeholder='e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]' />
      </div>
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Environment Variables (JSON object)</label>
        <input className="input w-full" value={envStr} onChange={(e) => setEnvStr(e.target.value)} placeholder='e.g. {"API_KEY": "sk-xxx"}' />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs border border-white/10 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--muted)' }}>Cancel</button>
        <button type="submit" disabled={saving || !name.trim() || !command.trim()} className="btn-primary text-xs px-3">{saving ? 'Saving…' : 'Add Server'}</button>
      </div>
    </form>
  )
}

function McpServerCard({ server, onUpdate, onDelete }: { server: McpServer; onUpdate: (id: string, data: { name?: string; description?: string; command?: string; args?: string[]; env?: Record<string, string>; enabled?: boolean }) => Promise<McpServer>; onDelete: (id: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(server.name)
  const [description, setDescription] = useState(server.description)
  const [command, setCommand] = useState(server.command)
  const [argsStr, setArgsStr] = useState(JSON.stringify(server.args))
  const [envStr, setEnvStr] = useState(JSON.stringify(server.env))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleToggleEnabled() {
    await onUpdate(server.id, { enabled: !server.enabled })
  }

  async function handleDelete() {
    setDeleting(true)
    try { await onDelete(server.id) } finally { setDeleting(false) }
  }

  async function handleSaveEdit() {
    setSaving(true)
    setError('')
    try {
      let args: string[] | undefined
      try { args = JSON.parse(argsStr) } catch { args = argsStr.trim().split(/\s+/) }
      let env: Record<string, string> | undefined
      try { env = JSON.parse(envStr) } catch { setError('Environment variables must be valid JSON'); setSaving(false); return }
      await onUpdate(server.id, { name: name.trim(), description: description.trim(), command: command.trim(), args, env })
      setEditing(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors"
      >
        <span className="text-xl w-7 text-center flex-shrink-0">🔗</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{server.name}</span>
            {server.enabled ? (
              <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full">Enabled</span>
            ) : (
              <span className="text-[10px] bg-surface-3 px-1.5 py-0.5 rounded-full" style={{ color: 'var(--muted)' }}>Disabled</span>
            )}
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{server.command} {server.args.join(' ')}</p>
        </div>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          style={{ color: 'var(--muted)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-3">
          {!editing ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span style={{ color: 'var(--muted)' }}>Command:</span>
                  <code className="ml-1" style={{ color: 'rgb(var(--accent))' }}>{server.command}</code>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)' }}>Args:</span>
                  <code className="ml-1" style={{ color: 'var(--text-primary)' }}>{server.args.length > 0 ? server.args.join(' ') : '(none)'}</code>
                </div>
              </div>
              {server.description && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{server.description}</p>
              )}
              {Object.keys(server.env).length > 0 && (
                <div className="text-xs">
                  <span style={{ color: 'var(--muted)' }}>Environment:</span>
                  <div className="mt-1 space-y-0.5">
                    {Object.entries(server.env).map(([key, val]) => (
                      <div key={key} className="flex gap-1">
                        <code style={{ color: 'rgb(var(--accent))' }}>{key}</code>
                        <span style={{ color: 'var(--muted)' }}>=</span>
                        <code style={{ color: 'var(--text-primary)' }}>{val.includes('key') || val.includes('secret') || val.includes('token') ? '••••••' : val}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleToggleEnabled}
                  className="px-3 py-1.5 text-xs border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--muted)' }}
                >
                  {server.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1.5 text-xs border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--muted)' }}
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 text-xs border border-red-400/30 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Name</label>
                  <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Description</label>
                  <input className="input w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Command</label>
                <input className="input w-full" value={command} onChange={(e) => setCommand(e.target.value)} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Arguments (JSON array or space-separated)</label>
                <input className="input w-full" value={argsStr} onChange={(e) => setArgsStr(e.target.value)} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Environment Variables (JSON object)</label>
                <input className="input w-full" value={envStr} onChange={(e) => setEnvStr(e.target.value)} />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs border border-white/10 rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'var(--muted)' }}>Cancel</button>
                <button onClick={handleSaveEdit} disabled={saving} className="btn-primary text-xs px-3">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

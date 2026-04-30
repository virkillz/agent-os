import { useState, useEffect } from 'react'
import { api } from '../api.ts'
import type { User } from '../api.ts'
import { Plus, Shield, Trash2 } from 'lucide-react'
import PageHeader from '../components/PageHeader.tsx'

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    api.users.list().then(setUsers).finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await api.users.delete(id)
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 mt-20">

        <PageHeader
          title="Users"
          subtitle={loading
            ? 'Loading...'
            : users.length === 0
            ? 'No users yet — create the first one'
            : `${users.length} user${users.length !== 1 ? 's' : ''} registered`}
          backTo="/"
        />

        {/* ── User Tile Grid ── */}
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
        >
          {users.map((user) => (
            <UserTile
              key={user.id}
              user={user}
              deleting={deletingId === user.id}
              onDelete={() => handleDelete(user.id)}
            />
          ))}

          {/* ── Add New User Tile ── */}
          <button
            onClick={() => setShowForm(true)}
            className="group flex flex-col items-center justify-center gap-3 rounded-xl transition-all duration-300"
            style={{
              height: '260px',
              background: 'rgb(var(--s1) / 0.35)',
              border: '2px dashed rgb(var(--accent) / 0.12)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgb(var(--accent) / 0.35)'
              e.currentTarget.style.background = 'rgb(var(--s2) / 0.3)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgb(var(--accent) / 0.12)'
              e.currentTarget.style.background = 'rgb(var(--s1) / 0.35)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <Plus size={28} style={{ color: 'rgb(var(--accent) / 0.35)' }} />
            <span
              className="text-[10px] font-bold tracking-[0.15em] uppercase"
              style={{ color: 'rgb(var(--muted) / 0.45)' }}
            >
              New User
            </span>
          </button>
        </div>

        {/* Create user form */}
        {showForm && (
          <div className="mt-6 animate-zoom-in">
            <CreateUserForm
              onDone={(user) => {
                setUsers((prev) => [...prev, user])
                setShowForm(false)
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── User Tile ────────────────────────────────────────────────────────────────

function UserTile({ user, deleting, onDelete }: {
  user: User
  deleting: boolean
  onDelete: () => void
}) {
  const initials = user.display_name
    ? user.display_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user.username[0].toUpperCase()

  return (
    <div
      className="group flex flex-col items-center justify-end rounded-xl transition-all duration-300 text-center relative overflow-hidden"
      style={{
        height: '260px',
        background: 'rgb(var(--s1) / 0.55)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        paddingBottom: '24px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgb(var(--accent) / 0.5)'
        e.currentTarget.style.borderWidth = '1.5px'
        e.currentTarget.style.background = 'rgb(var(--s2) / 0.65)'
        e.currentTarget.style.boxShadow = '0 0 30px rgb(var(--accent) / 0.15), inset 0 1px 0 rgba(255,255,255,0.08)'
        e.currentTarget.style.transform = 'translateY(-4px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
        e.currentTarget.style.borderWidth = '1px'
        e.currentTarget.style.background = 'rgb(var(--s1) / 0.55)'
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.04)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Top glow on hover */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--accent) / 0.6), transparent)' }}
      />

      {/* Delete button */}
      <button
        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-500/20"
        style={{ color: 'rgba(255, 100, 100, 0.6)' }}
        onClick={onDelete}
        disabled={deleting}
        title="Delete user"
      >
        <Trash2 size={13} />
      </button>

      {/* Avatar */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.display_name}
              className="w-24 h-24 rounded-xl object-cover"
              style={{ border: '2px solid rgb(var(--accent) / 0.12)' }}
            />
          ) : (
            <div
              className="w-24 h-24 rounded-xl flex items-center justify-center text-3xl font-bold"
              style={{
                backgroundColor: user.avatar_color ? user.avatar_color + '22' : 'rgb(var(--accent) / 0.08)',
                border: `2px solid ${user.avatar_color ? user.avatar_color + '44' : 'rgb(var(--accent) / 0.15)'}`,
                color: user.avatar_color ?? 'rgb(var(--accent) / 0.7)',
              }}
            >
              {initials}
            </div>
          )}
          {/* Admin badge */}
          {user.is_admin === 1 && (
            <span
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                border: '2px solid rgb(var(--s1) / 0.9)',
              }}
              title="Admin"
            >
              <Shield size={10} style={{ color: 'rgba(245, 158, 11, 0.9)' }} />
            </span>
          )}
        </div>
      </div>

      {/* Display name */}
      <div
        className="text-sm font-bold truncate tracking-[0.2em] mb-1 px-3 w-full"
        style={{ color: 'rgb(var(--subtle) / 0.85)' }}
      >
        {user.display_name.toUpperCase() || user.username.toUpperCase()}
      </div>

      {/* Username */}
      <div
        className="text-[10px] leading-tight text-center tracking-wider px-4"
        style={{ color: 'rgb(var(--muted) / 0.5)' }}
      >
        @{user.username}
      </div>

      {/* Role badge */}
      <span
        className="text-[9px] font-bold px-2.5 py-0.5 rounded-full tracking-wider uppercase mt-2"
        style={{
          background: user.is_admin === 1 ? 'rgba(245, 158, 11, 0.12)' : 'rgb(var(--accent) / 0.08)',
          color: user.is_admin === 1 ? 'rgba(245, 158, 11, 0.8)' : 'rgb(var(--muted) / 0.5)',
        }}
      >
        {user.is_admin === 1 ? 'Admin' : 'Member'}
      </span>
    </div>
  )
}

// ─── Create User Form ─────────────────────────────────────────────────────────

function CreateUserForm({ onDone, onCancel }: {
  onDone: (user: User) => void
  onCancel: () => void
}) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!username.trim()) { setError('Username is required'); return }
    if (!displayName.trim()) { setError('Display name is required'); return }
    if (!password.trim()) { setError('Password is required'); return }
    setSaving(true)
    setError('')
    try {
      const user = await api.users.create({ username: username.trim(), displayName: displayName.trim(), password, isAdmin })
      onDone(user)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-xl p-5 relative overflow-hidden"
      style={{
        background: 'rgb(var(--s1) / 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgb(var(--accent) / 0.1)',
      }}
    >
      {/* Top glow */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--accent) / 0.25), transparent)' }}
      />

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold tracking-[0.1em] uppercase" style={{ color: 'var(--text-primary)' }}>Add Human User</h2>
          <p className="text-[11px] mt-0.5 tracking-wide" style={{ color: 'rgb(var(--muted) / 0.5)' }}>Create login credentials for a new team member</p>
        </div>
        <button className="btn-ghost text-xs tracking-wider uppercase" onClick={onCancel}>Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]" style={{ color: 'rgb(var(--accent) / 0.6)' }}>
            Username <span style={{ color: 'rgb(var(--accent) / 0.7)' }}>*</span>
          </label>
          <input
            className="input"
            placeholder="jsmith"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]" style={{ color: 'rgb(var(--accent) / 0.6)' }}>
            Display Name <span style={{ color: 'rgb(var(--accent) / 0.7)' }}>*</span>
          </label>
          <input
            className="input"
            placeholder="Jane Smith"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]" style={{ color: 'rgb(var(--accent) / 0.6)' }}>
          Password <span style={{ color: 'rgb(var(--accent) / 0.7)' }}>*</span>
        </label>
        <input
          className="input"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          id="create-user-admin"
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
          className="rounded"
          style={{ accentColor: 'rgb(var(--accent) / 0.8)' }}
        />
        <label htmlFor="create-user-admin" className="text-xs cursor-pointer tracking-wide" style={{ color: 'rgb(var(--accent) / 0.6)' }}>
          Admin access
        </label>
      </div>

      {error && <p className="text-xs mb-3" style={{ color: 'var(--status-red)' }}>{error}</p>}

      <button className="btn-primary tracking-wider uppercase text-xs" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Creating...' : 'Create User'}
      </button>
    </div>
  )
}

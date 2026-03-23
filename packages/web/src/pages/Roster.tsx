import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import type { Agent, CreateAgentInput } from '../api.ts'
import { api } from '../api.ts'
import { User, Bot, X, Plus } from 'lucide-react'

type HireMode = 'ai' | 'human'

export default function Roster() {
  const { agents, addAgent, agentStatus, setAgentStatus } = useStore()
  const navigate = useNavigate()

  useAppEvents((event) => {
    if (event.type === 'agent:thinking') setAgentStatus(event.agentId, 'thinking')
    else if (event.type === 'agent:idle') setAgentStatus(event.agentId, 'idle')
    else if (event.type === 'agent:error') setAgentStatus(event.agentId, 'error')
  })

  const [hireMode, setHireMode] = useState<HireMode | null>(null)
  const [showHirePicker, setShowHirePicker] = useState(agents.length === 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* ── Section Label ── */}
        <div className="mb-6">
          <h1
            className="text-lg font-bold tracking-[0.15em] uppercase"
            style={{ color: 'var(--text-primary)' }}
          >
            Agents
          </h1>
          <p className="text-xs mt-1.5 tracking-wider uppercase" style={{ color: 'rgba(130, 160, 185, 0.5)' }}>
            {agents.length === 0
              ? 'No agents yet — create your first one'
              : `${agents.length} agent${agents.length !== 1 ? 's' : ''} registered`}
          </p>
        </div>

        {/* ── Agent Tile Grid ── */}
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
        >
          {agents.map((agent) => (
            <AgentTile
              key={agent.id}
              agent={agent}
              status={agentStatus[agent.id]}
              onClick={() => navigate(`/agents/${agent.id}`)}
            />
          ))}

          {/* ── Add New Agent Tile ── */}
          <button
            onClick={() => setShowHirePicker(true)}
            className="group flex flex-col items-center justify-center gap-3 rounded-xl transition-all duration-300"
            style={{
              height: '260px',
              background: 'rgba(12, 30, 50, 0.35)',
              border: '2px dashed rgba(100, 210, 230, 0.12)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(100, 210, 230, 0.35)'
              e.currentTarget.style.background = 'rgba(20, 60, 80, 0.3)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(100, 210, 230, 0.12)'
              e.currentTarget.style.background = 'rgba(12, 30, 50, 0.35)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <Plus
              size={28}
              className="transition-colors duration-300"
              style={{ color: 'rgba(100, 210, 230, 0.35)' }}
            />
            <span
              className="text-[10px] font-bold tracking-[0.15em] uppercase transition-colors duration-300"
              style={{ color: 'rgba(130, 160, 185, 0.45)' }}
            >
              New Agent
            </span>
          </button>
        </div>

        {/* Hire AI form */}
        {hireMode === 'ai' && (
          <div className="mt-6 animate-zoom-in">
            <HireForm
              onAdd={async (data) => {
                const agent = await addAgent(data)
                setHireMode(null)
                navigate(`/agents/${agent.id}`)
              }}
              onCancel={() => setHireMode(null)}
              canCancel={agents.length > 0}
            />
          </div>
        )}

        {/* Hire Human form */}
        {hireMode === 'human' && (
          <div className="mt-6 animate-zoom-in">
            <HireHumanForm
              onDone={() => setHireMode(null)}
              onCancel={() => setHireMode(null)}
            />
          </div>
        )}
      </div>

      {/* ── Hire Picker Modal ── */}
      {showHirePicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowHirePicker(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-xl p-6"
            style={{
              background: 'linear-gradient(135deg, rgba(10, 22, 45, 0.97) 0%, rgba(14, 32, 58, 0.97) 100%)',
              border: '1px solid rgba(100, 210, 230, 0.12)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 40px rgba(80, 200, 220, 0.05)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Top glow */}
            <div
              className="absolute top-0 left-0 right-0 h-[1px]"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(100, 210, 230, 0.3), transparent)' }}
            />

            <button
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: 'rgba(130, 160, 185, 0.5)' }}
              onClick={() => setShowHirePicker(false)}
            >
              <X size={14} />
            </button>

            <h2 className="text-sm font-bold tracking-[0.1em] uppercase mb-1" style={{ color: 'var(--text-primary)' }}>Who are you hiring?</h2>
            <p className="text-[11px] mb-5 tracking-wide" style={{ color: 'rgba(130, 160, 185, 0.5)' }}>Choose the type of employee to add to your roster.</p>

            <div className="grid grid-cols-2 gap-3">
              <PickerCard
                icon={<User size={22} style={{ color: 'rgba(140, 200, 235, 0.8)' }} />}
                iconBg="rgba(100, 210, 230, 0.1)"
                iconBorder="rgba(100, 210, 230, 0.2)"
                label="Human"
                sublabel="Create login account"
                onClick={() => { setShowHirePicker(false); setHireMode('human') }}
              />
              <PickerCard
                icon={<Bot size={22} style={{ color: 'rgba(140, 220, 235, 0.9)' }} />}
                iconBg="rgba(100, 210, 230, 0.12)"
                iconBorder="rgba(100, 210, 230, 0.25)"
                label="AI Agent"
                sublabel="Configure new agent"
                onClick={() => { setShowHirePicker(false); setHireMode('ai') }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Picker Card ──────────────────────────────────────────────────────────────

function PickerCard({ icon, iconBg, iconBorder, label, sublabel, onClick }: {
  icon: React.ReactNode
  iconBg: string
  iconBorder: string
  label: string
  sublabel: string
  onClick: () => void
}) {
  return (
    <button
      className="group flex flex-col items-center justify-center gap-3 rounded-xl py-7 px-4 transition-all duration-300 relative overflow-hidden"
      style={{
        background: 'rgba(12, 30, 50, 0.5)',
        border: '1px solid rgba(100, 210, 230, 0.08)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(20, 60, 80, 0.45)'
        e.currentTarget.style.borderColor = 'rgba(100, 210, 230, 0.25)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(12, 30, 50, 0.5)'
        e.currentTarget.style.borderColor = 'rgba(100, 210, 230, 0.08)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
      onClick={onClick}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{ background: iconBg, border: `1px solid ${iconBorder}` }}
      >
        {icon}
      </div>
      <div>
        <div className="text-sm font-bold tracking-[0.1em] uppercase" style={{ color: 'rgba(200, 220, 235, 0.85)' }}>{label}</div>
        <div className="text-[10px] mt-0.5 tracking-wide" style={{ color: 'rgba(130, 160, 185, 0.5)' }}>{sublabel}</div>
      </div>
    </button>
  )
}

// ─── Agent Tile ──────────────────────────────────────────────────────────────

function AgentTile({ agent, status, onClick }: {
  agent: Agent
  status?: string
  onClick: () => void
}) {
  const dotColor = !agent.is_active ? 'var(--status-gray)'
    : status === 'thinking' ? 'var(--status-amber)'
    : status === 'error' ? 'var(--status-red)'
    : 'var(--status-green)'

  const statusLabel = !agent.is_active ? 'Offline'
    : status === 'thinking' ? 'Working'
    : status === 'error' ? 'Error'
    : 'Online'

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center justify-end rounded-xl transition-all duration-300 text-center relative overflow-hidden"
      style={{
        height: '260px',
        background: 'rgba(12, 30, 50, 0.55)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        cursor: 'pointer',
        paddingBottom: '24px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(100, 210, 230, 0.5)'
        e.currentTarget.style.borderWidth = '1.5px'
        e.currentTarget.style.background = 'rgba(20, 60, 80, 0.65)'
        e.currentTarget.style.boxShadow = '0 0 30px rgba(80, 200, 220, 0.15), inset 0 1px 0 rgba(255,255,255,0.08)'
        e.currentTarget.style.transform = 'translateY(-4px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
        e.currentTarget.style.borderWidth = '1px'
        e.currentTarget.style.background = 'rgba(12, 30, 50, 0.55)'
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.04)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Top glow line on hover */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(100, 210, 230, 0.6), transparent)' }}
      />

      {/* Avatar — centered in the upper area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          {agent.avatar_url ? (
            <img
              src={agent.avatar_url}
              alt={agent.name}
              className="w-16 h-16 rounded-xl object-cover transition-all duration-300"
              style={{
                border: '2px solid rgba(100, 210, 230, 0.12)',
                filter: 'none',
              }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold transition-all duration-300"
              style={{
                backgroundColor: 'rgba(100, 210, 230, 0.08)',
                border: '2px solid rgba(100, 210, 230, 0.15)',
                color: 'rgba(140, 220, 235, 0.7)',
              }}
            >
              {agent.name[0].toUpperCase()}
            </div>
          )}
          {/* Status dot */}
          <span
            className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full ${status === 'thinking' ? 'animate-pulse' : ''}`}
            style={{
              background: dotColor,
              border: '2.5px solid rgba(12, 30, 50, 0.9)',
            }}
          />
        </div>
      </div>

      {/* Name */}
      <div
        className="text-sm font-bold truncate tracking-[0.2em] transition-colors duration-300 mb-1 px-3 w-full"
        style={{ color: 'rgba(200, 220, 235, 0.85)' }}
      >
        {agent.name.toUpperCase()}
      </div>

      {/* Role */}
      <div
        className="text-[10px] leading-tight text-center tracking-wider uppercase transition-colors duration-300 px-4 whitespace-pre-line"
        style={{ color: 'rgba(130, 160, 185, 0.5)' }}
      >
        {agent.role}
      </div>

      {/* Status badge */}
      <span
        className="text-[9px] font-bold px-2.5 py-0.5 rounded-full tracking-wider uppercase mt-2"
        style={{
          background: dotColor + '18',
          color: dotColor,
        }}
      >
        {statusLabel}
      </span>
    </button>
  )
}

// ─── Hire Form ────────────────────────────────────────────────────────────────

const DEFAULT_PROMPTS: Record<string, string> = {
  'Software Engineer': 'You are a skilled software engineer. You write clean, well-documented code and can help debug issues, review PRs, and architect solutions.',
  'Product Manager': 'You are an experienced product manager. You help define requirements, prioritize features, and ensure the team ships the right things.',
  'Designer': 'You are a creative designer with a strong eye for UX. You help with design decisions, user flows, and visual direction.',
  'Writer': 'You are a skilled writer and editor. You help produce clear, engaging content and can review and improve any written material.',
  'Analyst': 'You are a sharp analyst. You help investigate data, identify patterns, and provide actionable insights.',
}

function HireForm({ onAdd, onCancel, canCancel }: {
  onAdd: (data: CreateAgentInput) => Promise<void>
  onCancel: () => void
  canCancel: boolean
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleRoleChange(r: string) {
    setRole(r)
    if (DEFAULT_PROMPTS[r] && !systemPrompt) setSystemPrompt(DEFAULT_PROMPTS[r])
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!role.trim()) { setError('Role is required'); return }
    setSaving(true)
    setError('')
    try {
      await onAdd({ name: name.trim(), role: role.trim(), description: description.trim(), systemPrompt: systemPrompt.trim() })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-xl p-5 relative overflow-hidden"
      style={{
        background: 'rgba(10, 22, 45, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(100, 210, 230, 0.1)',
      }}
    >
      {/* Top glow */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(100, 210, 230, 0.25), transparent)' }}
      />

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold tracking-[0.1em] uppercase" style={{ color: 'var(--text-primary)' }}>New AI Agent</h2>
          <p className="text-[11px] mt-0.5 tracking-wide" style={{ color: 'rgba(130, 160, 185, 0.5)' }}>Configure your new agent</p>
        </div>
        {canCancel && (
          <button className="btn-ghost text-xs tracking-wider uppercase" onClick={onCancel}>Cancel</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]" style={{ color: 'rgba(140, 200, 220, 0.6)' }}>
            Name <span style={{ color: 'rgba(100, 210, 230, 0.7)' }}>*</span>
          </label>
          <input className="input" placeholder="Alex" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]" style={{ color: 'rgba(140, 200, 220, 0.6)' }}>
            Role <span style={{ color: 'rgba(100, 210, 230, 0.7)' }}>*</span>
          </label>
          <input
            className="input"
            placeholder="Software Engineer"
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
            list="role-suggestions"
          />
          <datalist id="role-suggestions">
            {Object.keys(DEFAULT_PROMPTS).map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]" style={{ color: 'rgba(140, 200, 220, 0.6)' }}>
          Description <span className="font-normal normal-case tracking-normal" style={{ color: 'rgba(130, 160, 185, 0.4)' }}>(optional)</span>
        </label>
        <input className="input" placeholder="A short bio..." value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="mb-4">
        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]" style={{ color: 'rgba(140, 200, 220, 0.6)' }}>
          System Prompt <span className="font-normal normal-case tracking-normal" style={{ color: 'rgba(130, 160, 185, 0.4)' }}>(optional)</span>
        </label>
        <textarea
          className="input resize-none h-24 font-mono text-xs"
          placeholder="Describe how this agent should behave..."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </div>

      {error && <p className="text-xs mb-3" style={{ color: 'var(--status-red)' }}>{error}</p>}

      <button className="btn-primary tracking-wider uppercase text-xs" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Creating...' : 'Create Agent'}
      </button>
    </div>
  )
}

// ─── Hire Human Form ──────────────────────────────────────────────────────────

function HireHumanForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
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
      await api.users.create({ username: username.trim(), displayName: displayName.trim(), password, isAdmin })
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div
      className="rounded-xl p-5 relative overflow-hidden"
      style={{
        background: 'rgba(10, 22, 45, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(100, 210, 230, 0.1)',
      }}
    >
      {/* Top glow */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(100, 210, 230, 0.25), transparent)' }}
      />

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold tracking-[0.1em] uppercase" style={{ color: 'var(--text-primary)' }}>Add Human User</h2>
          <p className="text-[11px] mt-0.5 tracking-wide" style={{ color: 'rgba(130, 160, 185, 0.5)' }}>Create login credentials for a new team member</p>
        </div>
        <button className="btn-ghost text-xs tracking-wider uppercase" onClick={onCancel}>Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]" style={{ color: 'rgba(140, 200, 220, 0.6)' }}>
            Username <span style={{ color: 'rgba(100, 210, 230, 0.7)' }}>*</span>
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
          <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]" style={{ color: 'rgba(140, 200, 220, 0.6)' }}>
            Display Name <span style={{ color: 'rgba(100, 210, 230, 0.7)' }}>*</span>
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
        <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-[0.15em]" style={{ color: 'rgba(140, 200, 220, 0.6)' }}>
          Password <span style={{ color: 'rgba(100, 210, 230, 0.7)' }}>*</span>
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
          id="hire-human-admin"
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
          className="rounded"
          style={{ accentColor: 'rgba(100, 210, 230, 0.8)' }}
        />
        <label htmlFor="hire-human-admin" className="text-xs cursor-pointer tracking-wide" style={{ color: 'rgba(140, 200, 220, 0.6)' }}>
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

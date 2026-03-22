import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import type { Agent, CreateAgentInput } from '../api.ts'
import { api } from '../api.ts'
import { User, Bot, X } from 'lucide-react'

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
      <div className="max-w-3xl mx-auto px-6 py-6">

        {/* Header */}
        <div
          className="flex items-center justify-between mb-5 rounded-xl px-6 py-4 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(8,18,40,0.95) 0%, rgba(20,35,70,0.95) 100%)',
            border: '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(var(--accent), 0.08) 0%, transparent 60%)' }}
          />
          <div className="relative">
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Employee Roster
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
              {agents.length === 0
                ? 'No employees yet — hire your first one'
                : `${agents.length} employee${agents.length !== 1 ? 's' : ''} on staff`}
            </p>
          </div>
          {hireMode === null && (
            <button
              className="btn-primary relative z-10 flex items-center gap-1.5"
              onClick={() => setShowHirePicker(true)}
            >
              <span className="text-base leading-none">+</span>
              Hire Employee
            </button>
          )}
        </div>

        {/* Employee list */}
        {agents.length > 0 && (
          <div className="space-y-2 mb-5">
            {agents.map((agent) => (
              <EmployeeCard
                key={agent.id}
                agent={agent}
                status={agentStatus[agent.id]}
                onClick={() => navigate(`/agents/${agent.id}`)}
              />
            ))}
          </div>
        )}

        {/* Hire AI form */}
        {hireMode === 'ai' && (
          <div className="animate-zoom-in">
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
          <div className="animate-zoom-in">
            <HireHumanForm
              onDone={() => setHireMode(null)}
              onCancel={() => setHireMode(null)}
            />
          </div>
        )}
      </div>

      {/* Hire Picker Modal */}
      {showHirePicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowHirePicker(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl p-6"
            style={{
              background: 'linear-gradient(135deg, rgba(10,20,48,0.98) 0%, rgba(16,30,64,0.98) 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: 'var(--muted)' }}
              onClick={() => setShowHirePicker(false)}
            >
              <X size={14} />
            </button>

            <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Who are you hiring?</h2>
            <p className="text-xs mb-5" style={{ color: 'var(--muted)' }}>Choose the type of employee to add to your roster.</p>

            <div className="grid grid-cols-2 gap-3">
              <button
                className="group flex flex-col items-center justify-center gap-3 rounded-xl py-7 px-4 transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onClick={() => { setShowHirePicker(false); setHireMode('human') }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)' }}
                >
                  <User size={22} style={{ color: 'var(--status-blue)' }} />
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Human</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>Create login account</div>
                </div>
              </button>

              <button
                className="group flex flex-col items-center justify-center gap-3 rounded-xl py-7 px-4 transition-all"
                style={{
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px solid rgba(245,158,11,0.2)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.06)')}
                onClick={() => { setShowHirePicker(false); setHireMode('ai') }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
                >
                  <Bot size={22} style={{ color: 'rgb(var(--accent))' }} />
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI Agent</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>Configure new agent</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Employee Card ────────────────────────────────────────────────────────────

function EmployeeCard({ agent, status, onClick }: {
  agent: Agent
  status?: 'idle' | 'thinking' | 'error'
  onClick: () => void
}) {
  const stats = deriveStats(agent.id + agent.name)

  const { label: statusLabel, cls: statusCls, dotColor } = resolveStatus(agent, status)

  return (
    <div
      className="group cursor-pointer transition-all"
      style={{
        background: 'rgba(8, 18, 40, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '8px',
      }}
      onClick={onClick}
    >
      {/* Hover highlight */}
      <div
        className="flex items-center gap-4 px-4 py-3.5 rounded-lg transition-colors group-hover:bg-white/5"
        style={{ borderRadius: '8px' }}
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {agent.avatar_url ? (
            <img
              src={agent.avatar_url}
              alt={agent.name}
              className="w-11 h-11 rounded-full object-cover"
              style={{ border: `2px solid ${agent.avatar_color}55` }}
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold"
              style={{
                backgroundColor: agent.avatar_color + '22',
                border: `2px solid ${agent.avatar_color}55`,
                color: agent.avatar_color,
              }}
            >
              {agent.name[0].toUpperCase()}
            </div>
          )}
          {/* Status dot */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${status === 'thinking' ? 'animate-pulse-dot' : ''}`}
            style={{
              background: dotColor,
              border: '2px solid rgb(var(--s1))',
            }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {agent.name}
            </span>
            <span className={`badge ${statusCls} flex-shrink-0`}>
              {statusLabel}
            </span>
          </div>
          <div className="text-xs mb-2" style={{ color: 'var(--subtle)' }}>
            {agent.role}
          </div>
          {/* Stat bars */}
          <div className="flex items-center gap-3">
            {stats.map((stat) => (
              <StatBar key={stat.label} label={stat.label} value={stat.value} color={stat.color} />
            ))}
            <span
              className="text-[10px] font-medium ml-1"
              style={{
                background: 'rgba(245,158,11,0.1)',
                color: 'rgb(var(--accent))',
                border: '1px solid rgba(245,158,11,0.2)',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              {agent.modelConfig?.provider ?? 'default'}
            </span>
            {agent.source !== 'user' && (
              <span
                className="text-[10px] font-medium"
                style={{
                  background: 'rgba(96,165,250,0.1)',
                  color: 'var(--status-blue)',
                  border: '1px solid rgba(96,165,250,0.2)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                }}
              >
                template
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium" style={{ color: 'var(--muted)', minWidth: '32px' }}>
        {label}
      </span>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ width: '52px', background: 'rgb(var(--s3))' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
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
      className="rounded-lg p-5"
      style={{ background: 'rgba(8, 18, 40, 0.80)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Hire New Employee</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Configure your new AI team member</p>
        </div>
        {canCancel && (
          <button className="btn-ghost text-xs" onClick={onCancel}>Cancel</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
            Name <span style={{ color: 'rgb(var(--accent))' }}>*</span>
          </label>
          <input className="input" placeholder="Alex" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
            Role <span style={{ color: 'rgb(var(--accent))' }}>*</span>
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
        <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
          Description <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>(optional)</span>
        </label>
        <input className="input" placeholder="A short bio for the roster..." value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
          System Prompt <span className="font-normal normal-case" style={{ color: 'var(--muted)' }}>(optional)</span>
        </label>
        <textarea
          className="input resize-none h-24 font-mono text-xs"
          placeholder="Describe how this agent should behave..."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </div>

      {error && <p className="text-xs mb-3" style={{ color: 'var(--status-red)' }}>{error}</p>}

      <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Hiring...' : 'Confirm Hire'}
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
      className="rounded-lg p-5"
      style={{ background: 'rgba(8, 18, 40, 0.80)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Hire Human Employee</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Create login credentials for a new team member</p>
        </div>
        <button className="btn-ghost text-xs" onClick={onCancel}>Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
            Username <span style={{ color: 'rgb(var(--accent))' }}>*</span>
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
          <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
            Display Name <span style={{ color: 'rgb(var(--accent))' }}>*</span>
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
        <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
          Password <span style={{ color: 'rgb(var(--accent))' }}>*</span>
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
          style={{ accentColor: 'rgb(var(--accent))' }}
        />
        <label htmlFor="hire-human-admin" className="text-xs cursor-pointer" style={{ color: 'var(--subtle)' }}>
          Admin access
        </label>
      </div>

      {error && <p className="text-xs mb-3" style={{ color: 'var(--status-red)' }}>{error}</p>}

      <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
        {saving ? 'Hiring...' : 'Confirm Hire'}
      </button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveStatus(agent: Agent, status?: string) {
  if (!agent.is_active) return { label: 'Offline', cls: 'badge-offline', dotColor: 'var(--status-gray)' }
  if (status === 'thinking') return { label: 'Working', cls: 'badge-working', dotColor: 'var(--status-amber)' }
  if (status === 'error') return { label: 'Error', cls: 'badge-error', dotColor: 'var(--status-red)' }
  return { label: 'Online', cls: 'badge-active', dotColor: 'var(--status-green)' }
}

function hashInt(str: string, salt: number): number {
  let h = salt * 2654435761
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761)
  }
  return Math.abs(h >>> 0)
}

const STAT_CONFIGS = [
  { label: 'EFF', color: '#4ade80' },
  { label: 'FOC', color: '#f59e0b' },
  { label: 'SPD', color: '#60a5fa' },
]

function deriveStats(seed: string) {
  return STAT_CONFIGS.map((cfg, i) => ({
    label: cfg.label,
    color: cfg.color,
    value: 30 + (hashInt(seed, i + 7) % 60),
  }))
}

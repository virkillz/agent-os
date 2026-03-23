import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { MessageCircle, Brain, CheckSquare, Calendar, Settings, type LucideIcon } from 'lucide-react'
import PageHeader from '../components/PageHeader.tsx'

export default function AgentProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { agents, agentStatus } = useStore()
  const agent = agents.find((a) => a.id === id)

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Agent not found</p>
          <button className="btn-primary text-xs" onClick={() => navigate('/roster')}>
            Back to Roster
          </button>
        </div>
      </div>
    )
  }

  const dotColor = !agent.is_active ? 'var(--status-gray)'
    : agentStatus[agent.id] === 'thinking' ? 'var(--status-amber)'
    : agentStatus[agent.id] === 'error' ? 'var(--status-red)'
    : 'var(--status-green)'

  const statusLabel = !agent.is_active ? 'Offline'
    : agentStatus[agent.id] === 'thinking' ? 'Working'
    : agentStatus[agent.id] === 'error' ? 'Error'
    : 'Online'

  const menuItems = [
    {
      icon: MessageCircle,
      label: 'Chat',
      sublabel: 'Message this agent',
      onClick: () => navigate(`/agents/${id}/chat`),
      color: 'rgba(100, 210, 230, 0.8)',
    },
    {
      icon: Brain,
      label: 'Memory',
      sublabel: 'View agent memory',
      onClick: () => navigate(`/agents/${id}/memory`),
      color: 'rgba(140, 180, 255, 0.8)',
    },
    {
      icon: CheckSquare,
      label: 'Todo',
      sublabel: 'Manage tasks',
      onClick: () => navigate(`/agents/${id}/todos`),
      color: 'rgba(120, 220, 180, 0.8)',
    },
    {
      icon: Calendar,
      label: 'Schedule',
      sublabel: 'View schedule',
      onClick: () => navigate(`/agents/${id}/schedule`),
      color: 'rgba(255, 180, 120, 0.8)',
    },
    {
      icon: Settings,
      label: 'Settings',
      sublabel: 'Configure agent',
      onClick: () => navigate(`/agents/${id}/settings`),
      color: 'rgba(200, 160, 220, 0.8)',
    },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 mt-20">
        
        <PageHeader
          title="Agent Profile"
          subtitle="View and manage agent details"
          backTo="/roster"
        />

        {/* ── Agent Profile Card ── */}
        <div
          className="rounded-xl p-8 mb-8 relative overflow-hidden"
          style={{
            background: 'rgba(10, 22, 45, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(100, 210, 230, 0.15)',
          }}
        >
          {/* Top glow */}
          <div
            className="absolute top-0 left-0 right-0 h-[1px]"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(100, 210, 230, 0.3), transparent)' }}
          />

          <div className="flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative mb-4">
              {agent.avatar_url ? (
                <img
                  src={agent.avatar_url}
                  alt={agent.name}
                  className="w-32 h-32 rounded-2xl object-cover"
                  style={{
                    border: '3px solid rgba(100, 210, 230, 0.2)',
                  }}
                />
              ) : (
                <div
                  className="w-32 h-32 rounded-2xl flex items-center justify-center text-5xl font-bold"
                  style={{
                    backgroundColor: 'rgba(100, 210, 230, 0.1)',
                    border: '3px solid rgba(100, 210, 230, 0.2)',
                    color: 'rgba(140, 220, 235, 0.8)',
                  }}
                >
                  {agent.name[0].toUpperCase()}
                </div>
              )}
              {/* Status dot */}
              <span
                className={`absolute bottom-2 right-2 w-5 h-5 rounded-full ${agentStatus[agent.id] === 'thinking' ? 'animate-pulse' : ''}`}
                style={{
                  background: dotColor,
                  border: '3px solid rgba(10, 22, 45, 0.9)',
                }}
              />
            </div>

            {/* Name */}
            <h1
              className="text-2xl font-bold tracking-[0.15em] uppercase mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {agent.name}
            </h1>

            {/* Role */}
            <p
              className="text-sm tracking-wider uppercase mb-3"
              style={{ color: 'rgba(130, 160, 185, 0.6)' }}
            >
              {agent.role}
            </p>

            {/* Status badge */}
            <span
              className="text-xs font-bold px-3 py-1.5 rounded-full tracking-wider uppercase"
              style={{
                background: dotColor + '18',
                color: dotColor,
              }}
            >
              {statusLabel}
            </span>

            {/* Description */}
            {agent.description && (
              <p
                className="mt-4 text-sm max-w-md"
                style={{ color: 'rgba(160, 180, 200, 0.7)' }}
              >
                {agent.description}
              </p>
            )}
          </div>
        </div>

        {/* ── Action Menu Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {menuItems.map((item) => (
            <MenuCard
              key={item.label}
              icon={item.icon}
              label={item.label}
              sublabel={item.sublabel}
              color={item.color}
              onClick={item.onClick}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Menu Card ────────────────────────────────────────────────────────────────

function MenuCard({ icon: Icon, label, sublabel, color, onClick }: {
  icon: LucideIcon
  label: string
  sublabel: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      className="group flex flex-col items-center justify-center gap-4 rounded-xl py-8 px-6 transition-all duration-300 relative overflow-hidden"
      style={{
        background: 'rgba(12, 30, 50, 0.5)',
        border: '1px solid rgba(100, 210, 230, 0.12)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(20, 60, 80, 0.6)'
        e.currentTarget.style.borderColor = 'rgba(100, 210, 230, 0.35)'
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(12, 30, 50, 0.5)'
        e.currentTarget.style.borderColor = 'rgba(100, 210, 230, 0.12)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
      onClick={onClick}
    >
      {/* Top glow on hover */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />

      {/* Icon */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
        style={{
          background: `${color}15`,
          border: `2px solid ${color}30`,
        }}
      >
        <Icon size={32} style={{ color }} />
      </div>

      {/* Label */}
      <div>
        <div
          className="text-base font-bold tracking-[0.1em] uppercase mb-1"
          style={{ color: 'rgba(200, 220, 235, 0.9)' }}
        >
          {label}
        </div>
        <div
          className="text-[11px] tracking-wide"
          style={{ color: 'rgba(130, 160, 185, 0.5)' }}
        >
          {sublabel}
        </div>
      </div>
    </button>
  )
}

import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { MessageCircle, Brain, CheckSquare, Calendar, Settings, type LucideIcon } from 'lucide-react'
import PageHeader from '../components/PageHeader.tsx'
import { AgentProfileCard } from '../components/AgentProfileCard.tsx'

export default function AgentProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { agents, agentStatus } = useStore()
  const agent = agents.find((a) => a.id === id)

  if (!agent || !id) {
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

  const menuItems = [
    {
      icon: MessageCircle,
      label: 'Chat',
      sublabel: 'Message this agent',
      onClick: () => navigate(`/agents/${id}/chat`),
      color: 'rgb(var(--accent) / 0.8)',
    },
    {
      icon: Brain,
      label: 'Memory',
      sublabel: 'View agent memory',
      onClick: () => navigate(`/agents/${id}/memory`),
      color: 'rgb(var(--accent) / 0.8)',
    },
    {
      icon: CheckSquare,
      label: 'Todo',
      sublabel: 'Manage tasks',
      onClick: () => navigate(`/agents/${id}/todos`),
      color: 'rgb(var(--accent) / 0.8)',
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

        <AgentProfileCard agentId={id} />

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
        background: 'rgb(var(--s1) / 0.5)',
        border: '1px solid rgb(var(--accent) / 0.12)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgb(var(--s2) / 0.6)'
        e.currentTarget.style.borderColor = 'rgb(var(--accent) / 0.35)'
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgb(var(--s1) / 0.5)'
        e.currentTarget.style.borderColor = 'rgb(var(--accent) / 0.12)'
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
          style={{ color: 'rgb(var(--subtle) / 0.9)' }}
        >
          {label}
        </div>
        <div
          className="text-[11px] tracking-wide"
          style={{ color: 'rgb(var(--muted) / 0.5)' }}
        >
          {sublabel}
        </div>
      </div>
    </button>
  )
}

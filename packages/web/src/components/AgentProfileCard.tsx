import { useStore } from '../store.ts'

interface AgentProfileCardProps {
  agentId: string
}

export function AgentProfileCard({ agentId }: AgentProfileCardProps) {
  const { agents, agentStatus } = useStore()
  const agent = agents.find((a) => a.id === agentId)

  if (!agent) {
    return null
  }

  const dotColor = !agent.is_active ? 'var(--status-gray)'
    : agentStatus[agent.id] === 'thinking' ? 'var(--status-amber)'
    : agentStatus[agent.id] === 'error' ? 'var(--status-red)'
    : 'var(--status-green)'

  const statusLabel = !agent.is_active ? 'Offline'
    : agentStatus[agent.id] === 'thinking' ? 'Working'
    : agentStatus[agent.id] === 'error' ? 'Error'
    : 'Online'

  return (
    <div
      className="rounded-xl p-6 mb-6 relative overflow-hidden"
      style={{
        background: 'rgba(10, 22, 45, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(100, 210, 230, 0.15)',
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(100, 210, 230, 0.3), transparent)' }}
      />

      <div className="flex items-center gap-6">
        <div className="relative flex-shrink-0">
          {agent.avatar_url ? (
            <img
              src={agent.avatar_url}
              alt={agent.name}
              className="w-20 h-20 rounded-xl object-cover"
              style={{
                border: '2px solid rgba(100, 210, 230, 0.2)',
              }}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-xl flex items-center justify-center text-3xl font-bold"
              style={{
                backgroundColor: 'rgba(100, 210, 230, 0.1)',
                border: '2px solid rgba(100, 210, 230, 0.2)',
                color: 'rgba(140, 220, 235, 0.8)',
              }}
            >
              {agent.name[0].toUpperCase()}
            </div>
          )}
          <span
            className={`absolute bottom-1 right-1 w-4 h-4 rounded-full ${agentStatus[agent.id] === 'thinking' ? 'animate-pulse' : ''}`}
            style={{
              background: dotColor,
              border: '2px solid rgba(10, 22, 45, 0.9)',
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h2
            className="text-xl font-bold tracking-[0.1em] uppercase mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {agent.name}
          </h2>
          <p
            className="text-xs tracking-wider uppercase mb-2"
            style={{ color: 'rgba(130, 160, 185, 0.6)' }}
          >
            {agent.role}
          </p>
          <span
            className="inline-block text-xs font-bold px-2.5 py-1 rounded-full tracking-wider uppercase"
            style={{
              background: dotColor + '18',
              color: dotColor,
            }}
          >
            {statusLabel}
          </span>
        </div>

        {agent.description && (
          <div className="hidden md:block flex-1 min-w-0">
            <p
              className="text-sm line-clamp-2"
              style={{ color: 'rgba(160, 180, 200, 0.7)' }}
            >
              {agent.description}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

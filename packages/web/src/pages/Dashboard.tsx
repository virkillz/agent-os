import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'

const tiles = [
  {
    label: 'AGENTS',
    description: 'MANAGE AND MONITOR\nACTIVE BOT WORKFORCE',
    path: '/roster',
    image: '/dashboard/agents.png',
  },
  {
    label: 'USERS',
    description: 'OVERSEE TEAM ACCESS\nAND PERMISSIONS',
    path: '/users',
    image: '/dashboard/users.png',
  },
  {
    label: 'EXTENSION',
    description: 'ADD NEW CAPABILITIES\nAND API MODULES',
    path: '/settings/extensions',
    image: '/dashboard/extention.png',
  },
  {
    label: 'SETTINGS',
    description: 'CONFIGURE SYSTEM-WIDE\nPREFERENCES',
    path: '/settings',
    image: '/dashboard/settings.png',
  },
]

export default function Dashboard() {
  const { agents, setAgentStatus } = useStore()
  const navigate = useNavigate()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  useAppEvents((event) => {
    if (event.type === 'agent:thinking') setAgentStatus(event.agentId, 'thinking')
    else if (event.type === 'agent:idle') setAgentStatus(event.agentId, 'idle')
    else if (event.type === 'agent:error') setAgentStatus(event.agentId, 'error')
  })

  const activeAgents = agents.filter((a) => a.is_active).length

  return (
    <div className="h-full flex flex-col items-center justify-center px-8">
      {/* Card grid */}
      <div className="flex gap-5 mb-12">
        {tiles.map((tile, i) => {
          const isHovered = hoveredIndex === i
          return (
            <button
              key={tile.label}
              onClick={() => navigate(tile.path)}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="group flex flex-col items-center justify-end rounded-xl transition-all duration-300 active:scale-95 relative overflow-hidden"
              style={{
                width: '230px',
                height: '300px',
                background: isHovered
                  ? 'rgba(20, 60, 80, 0.65)'
                  : 'rgba(12, 30, 50, 0.55)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: isHovered
                  ? '1.5px solid rgba(100, 210, 230, 0.5)'
                  : '1px solid rgba(255,255,255,0.08)',
                boxShadow: isHovered
                  ? '0 0 30px rgba(80, 200, 220, 0.15), inset 0 1px 0 rgba(255,255,255,0.08)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                paddingBottom: '24px',
              }}
            >
              {/* Top glow line when hovered */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px] transition-opacity duration-300"
                style={{
                  opacity: isHovered ? 1 : 0,
                  background: 'linear-gradient(90deg, transparent, rgba(100, 210, 230, 0.6), transparent)',
                }}
              />

              {/* Image area */}
              <div className="flex-1 flex items-end justify-center overflow-hidden w-full">
                <img
                  src={tile.image}
                  alt={tile.label}
                  className="transition-all duration-300 object-contain object-bottom w-full"
                  style={{
                    height: '180px',
                    filter: isHovered
                      ? 'drop-shadow(0 0 20px rgba(100, 210, 230, 0.35)) brightness(1.1)'
                      : 'brightness(0.85) saturate(0.9)',
                    transform: isHovered ? 'scale(1.05) translateY(4px)' : 'scale(1) translateY(8px)',
                  }}
                />
              </div>

              {/* Label */}
              <span
                className="text-sm font-bold tracking-[0.2em] transition-colors duration-300 mb-1"
                style={{
                  color: isHovered ? '#e8f4f8' : 'rgba(200, 220, 235, 0.85)',
                }}
              >
                {tile.label}
              </span>

              {/* Description */}
              <span
                className="text-[10px] leading-tight text-center tracking-wider uppercase transition-colors duration-300 whitespace-pre-line px-4"
                style={{
                  color: isHovered ? 'rgba(160, 210, 225, 0.7)' : 'rgba(130, 160, 185, 0.5)',
                }}
              >
                {tile.description}
              </span>
            </button>
          )
        })}
      </div>

      {/* Status footer */}
      <div className="flex flex-col items-center gap-2">
        <span
          className="text-xs tracking-[0.15em] font-medium"
          style={{ color: 'rgba(160, 200, 220, 0.5)' }}
        >
          [Currently {activeAgents} Agent{activeAgents !== 1 ? 's' : ''} Online]
        </span>
      </div>
    </div>
  )
}

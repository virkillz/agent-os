import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'

const tiles = [
  {
    label: 'AGENTS',
    description: 'MANAGE AND MONITOR\nACTIVE BOT WORKFORCE',
    path: '/roster',
    icon: (
      <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    label: 'USERS',
    description: 'OVERSEE TEAM ACCESS\nAND PERMISSIONS',
    path: '/settings/company',
    icon: (
      <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    label: 'EXTENSION',
    description: 'ADD NEW CAPABILITIES\nAND API MODULES',
    path: '/settings/extensions',
    icon: (
      <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
      </svg>
    ),
  },
  {
    label: 'SETTINGS',
    description: 'CONFIGURE SYSTEM-WIDE\nPREFERENCES',
    path: '/settings',
    icon: (
      <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
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
                width: '220px',
                height: '260px',
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

              {/* Icon area */}
              <div className="flex-1 flex items-center justify-center">
                <div
                  className="transition-all duration-300"
                  style={{
                    color: isHovered ? 'rgba(140, 220, 235, 0.95)' : 'rgba(140, 180, 210, 0.5)',
                    filter: isHovered ? 'drop-shadow(0 0 12px rgba(100, 210, 230, 0.3))' : 'none',
                    transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                  }}
                >
                  {tile.icon}
                </div>
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

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Agent } from '../api.ts'

export default function AgentDetailModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const navigate = useNavigate()
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-80 rounded-2xl p-6 shadow-2xl"
        style={{
          background: 'rgba(8,18,40,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted hover:text-subtle hover:bg-white/8 transition-colors"
          onClick={onClose}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col items-center text-center gap-3">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold overflow-hidden"
            style={{
              backgroundColor: agent.avatar_color + '33',
              border: `1px solid ${agent.avatar_color}66`,
              color: agent.avatar_color,
            }}
          >
            {agent.avatar_url ? (
              <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
            ) : (
              agent.name[0].toUpperCase()
            )}
          </div>

          <div>
            <div className="text-base font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
              {agent.name}
            </div>
            <div className="text-xs" style={{ color: agent.avatar_color }}>
              {agent.role}
            </div>
          </div>

          {agent.description && (
            <p className="text-xs text-muted leading-relaxed">{agent.description}</p>
          )}

          <div
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
            style={{
              background: agent.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)',
              color: agent.is_active ? 'var(--status-green)' : 'var(--muted)',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: agent.is_active ? 'var(--status-green)' : 'var(--muted)' }}
            />
            {agent.is_active ? 'Active' : 'Inactive'}
          </div>

          <button
            className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors hover:bg-white/8"
            style={{ color: 'var(--subtle)', border: '1px solid rgba(255,255,255,0.10)' }}
            onClick={() => { onClose(); navigate(`/agents/${agent.id}/settings`) }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        </div>
      </div>
    </div>
  )
}

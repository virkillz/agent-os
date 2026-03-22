import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'

const TYPE_COLORS: Record<string, string> = {
  error: 'var(--status-red)',
  schedule: 'rgb(var(--accent))',
  board: 'var(--status-blue)',
  agent: 'var(--status-green)',
  dm: 'var(--status-amber)',
}

const TYPE_LABELS: Record<string, string> = {
  error: 'Error',
  schedule: 'Schedule',
  board: 'Board',
  agent: 'Agent',
  dm: 'Message',
}

export default function Notifications() {
  const { agents, notifications, pushNotification, clearNotifications, loadSchedules } = useStore()

  function agentName(id: string) {
    return agents.find((a) => a.id === id)?.name ?? id
  }

  useAppEvents((event) => {
    if (event.type === 'agent:error') {
      pushNotification({ message: `${agentName(event.agentId)}: ${event.error}`, type: 'error' })
    } else if (event.type === 'schedule:fired') {
      pushNotification({ message: `Schedule fired for ${agentName(event.agentId)}: ${event.label || 'unnamed'}`, type: 'schedule' })
    } else if (event.type === 'schedule:created') {
      loadSchedules(event.agentId)
      pushNotification({ message: `${agentName(event.agentId)} created schedule: ${event.label || 'unnamed'}`, type: 'schedule' })
    } else if (event.type === 'board:card_moved') {
      pushNotification({ message: `Card moved: "${event.title}"`, type: 'board' })
    } else if (event.type === 'agent:idle') {
      pushNotification({ message: `${agentName(event.agentId)} finished`, type: 'agent' })
    }
  })

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Notifications</h1>
          {notifications.length > 0 && (
            <button
              onClick={clearNotifications}
              className="text-xs px-3 py-1.5 rounded transition-colors hover:bg-white/8"
              style={{ color: 'var(--muted)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Clear all
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <BellIcon />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No notifications yet</p>
          </div>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {notifications.map((n, i) => (
              <div
                key={n.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                style={{ borderBottom: i < notifications.length - 1 ? '1px solid rgba(255,255,255,0.07)' : undefined }}
              >
                <span
                  className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: TYPE_COLORS[n.type] ?? 'var(--muted)', marginTop: '5px' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{n.message}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-[10px] font-medium uppercase tracking-wide"
                      style={{ color: TYPE_COLORS[n.type] ?? 'var(--muted)' }}
                    >
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                      {n.at.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BellIcon() {
  return (
    <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} style={{ color: 'var(--muted)' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}

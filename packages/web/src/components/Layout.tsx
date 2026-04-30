import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import { api } from '../api.ts'

interface LayoutProps {
  currentUser: import('../api.ts').User | null
  onLogout: () => void
}

export default function Layout({ currentUser, onLogout }: LayoutProps) {
  const { loadAgents, unreadDmChannels, addUnreadDm } = useStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => { loadAgents() }, [loadAgents])

  // Track unread DMs from agent send_direct_message calls
  useAppEvents(async (event) => {
    if (event.type === 'channel:message' && event.senderType === 'agent') {
      // Only count as unread if not on the channels page
      if (!location.pathname.startsWith('/channels')) {
        // Check if it's a DM channel (we check via API)
        try {
          const dms = await api.channels.listDms()
          if (dms.some((d) => d.id === event.channelId)) {
            addUnreadDm(event.channelId)
          }
        } catch { /* ignore */ }
      }
    }
  })

  const unreadDmCount = unreadDmChannels.size

  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/'

  return (
    <div className="h-full flex flex-col">

      {/* ── Top Bar ── */}
      <header className="flex items-center gap-3 flex-shrink-0 px-4 pt-3">

        {/* Main pill */}
        <div
          className="flex-1 flex items-center justify-between px-5"
          style={{
            height: '52px',
            background: 'linear-gradient(135deg, rgb(var(--s1) / 0.82) 0%, rgb(var(--s0) / 0.88) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgb(var(--accent) / 0.12)',
            borderRadius: '999px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Left: Back + Logo */}
          <div className="flex items-center gap-2 min-w-0">
            {!isDashboard && (
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1 text-xs font-medium mr-2 transition-opacity hover:opacity-100"
                style={{ color: 'var(--muted)' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Back
              </button>
            )}
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2.5 transition-opacity hover:opacity-85"
            >
              <div
                className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0"
                style={{ border: '1px solid rgb(var(--accent) / 0.18)' }}
              >
                <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <span
                className="text-sm font-bold tracking-wide"
                style={{ color: 'var(--text-primary)', fontFamily: "'Bitcount Prop Single Circle', monospace" }}
              >
                Agent OS
              </span>
            </button>
          </div>

          {/* Right: User info + settings */}
          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="flex items-center gap-2.5">
                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold uppercase flex-shrink-0 overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, rgb(var(--accent) / 0.5), rgb(var(--accent) / 0.3))',
                    border: '1.5px solid rgb(var(--accent) / 0.3)',
                    color: 'var(--text-primary)',
                    boxShadow: '0 0 10px rgb(var(--accent) / 0.2)',
                  }}
                >
                  {currentUser.display_name?.[0] || currentUser.username?.[0] || 'A'}
                </div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'var(--subtle)' }}
                >
                  {currentUser.display_name || currentUser.username || 'Admin'}
                </span>
              </div>
            )}

            {/* DM inbox icon with unread badge */}
            <button
              onClick={() => navigate('/channels')}
              className="relative flex items-center justify-center rounded-full transition-all duration-200 hover:opacity-80 active:scale-95"
              style={{ color: 'var(--muted)', padding: '4px' }}
              title="Direct Messages"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              {unreadDmCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-[9px] font-bold"
                  style={{
                    minWidth: '14px',
                    height: '14px',
                    background: 'rgb(239, 68, 68)',
                    color: '#fff',
                    padding: '0 3px',
                  }}
                >
                  {unreadDmCount > 9 ? '9+' : unreadDmCount}
                </span>
              )}
            </button>

            {/* Settings icon */}
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center justify-center rounded-full transition-all duration-200 hover:opacity-80 active:scale-95"
              style={{ color: 'var(--muted)', padding: '4px' }}
              title="Settings"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Power button — separate from pill */}
        <button
          onClick={onLogout}
          className="flex items-center justify-center flex-shrink-0 transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(200, 55, 45, 0.22) 0%, rgba(170, 35, 25, 0.28) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(220, 70, 60, 0.28)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,120,100,0.08)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(220, 65, 50, 0.4) 0%, rgba(190, 40, 30, 0.45) 100%)'
            e.currentTarget.style.borderColor = 'rgba(240, 90, 75, 0.5)'
            e.currentTarget.style.boxShadow = '0 4px 24px rgba(220, 60, 50, 0.25), inset 0 1px 0 rgba(255,120,100,0.12)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(200, 55, 45, 0.22) 0%, rgba(170, 35, 25, 0.28) 100%)'
            e.currentTarget.style.borderColor = 'rgba(220, 70, 60, 0.28)'
            e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,120,100,0.08)'
          }}
          title="Logout"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="rgba(245, 100, 85, 0.95)" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
          </svg>
        </button>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 overflow-hidden">
        <Outlet context={{ currentUser, onLogout }} />
      </main>
    </div>
  )
}

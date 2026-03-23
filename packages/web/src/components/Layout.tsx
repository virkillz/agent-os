import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from '../store.ts'

interface LayoutProps {
  currentUser: import('../api.ts').User | null
  onLogout: () => void
}

export default function Layout({ currentUser, onLogout }: LayoutProps) {
  const { loadAgents, settings } = useStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => { loadAgents() }, [loadAgents])

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
            background: 'linear-gradient(135deg, rgba(15, 30, 55, 0.82) 0%, rgba(10, 28, 52, 0.88) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(120, 200, 230, 0.12)',
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
                style={{ color: 'rgba(140, 185, 210, 0.7)' }}
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
                style={{ border: '1px solid rgba(100, 200, 225, 0.18)' }}
              >
                <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <span
                className="text-sm font-bold tracking-wide"
                style={{ color: 'rgba(220, 238, 248, 0.95)' }}
              >
                {settings?.companyName || 'Robot Magang'}
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
                    background: 'linear-gradient(135deg, rgba(60, 140, 180, 0.5), rgba(30, 80, 130, 0.6))',
                    border: '1.5px solid rgba(100, 200, 230, 0.3)',
                    color: 'rgba(170, 225, 245, 0.95)',
                    boxShadow: '0 0 10px rgba(80, 180, 220, 0.2)',
                  }}
                >
                  {currentUser.display_name?.[0] || currentUser.username?.[0] || 'A'}
                </div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: 'rgba(190, 220, 240, 0.85)' }}
                >
                  {currentUser.display_name || currentUser.username || 'Admin'}
                </span>
              </div>
            )}

            {/* Settings icon */}
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center justify-center rounded-full transition-all duration-200 hover:opacity-80 active:scale-95"
              style={{ color: 'rgba(140, 190, 215, 0.6)', padding: '4px' }}
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

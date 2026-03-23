import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/settings/company', label: 'Company' },
  { to: '/settings/prompt', label: 'Prompt' },
  { to: '/settings/provider', label: 'Provider' },
  { to: '/settings/accounts', label: 'Accounts' },
  { to: '/settings/model', label: 'Model' },
  { to: '/settings/skills', label: 'Skills' },
  { to: '/settings/roles', label: 'Roles' },
  { to: '/settings/appearance', label: 'Appearance' },
]

export default function Settings() {
  return (
    <div className="flex h-full items-center justify-center py-4 px-4 md:px-8">
      {/* Cyberpunk window frame */}
      <div
        className="relative w-full flex"
        style={{
          maxWidth: '960px',
          height: '100%',
          background: 'rgba(6, 14, 32, 0.82)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(80, 180, 220, 0.18)',
          borderRadius: '12px',
          boxShadow: '0 0 0 1px rgba(80, 180, 220, 0.06), 0 8px 48px rgba(0,0,0,0.5), 0 0 60px rgba(40,120,200,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Corner brackets */}
        <span style={{ position: 'absolute', top: -1, left: -1, width: 16, height: 16, borderTop: '2px solid rgba(80,200,240,0.7)', borderLeft: '2px solid rgba(80,200,240,0.7)', borderRadius: '4px 0 0 0', pointerEvents: 'none', zIndex: 10 }} />
        <span style={{ position: 'absolute', top: -1, right: -1, width: 16, height: 16, borderTop: '2px solid rgba(80,200,240,0.7)', borderRight: '2px solid rgba(80,200,240,0.7)', borderRadius: '0 4px 0 0', pointerEvents: 'none', zIndex: 10 }} />
        <span style={{ position: 'absolute', bottom: -1, left: -1, width: 16, height: 16, borderBottom: '2px solid rgba(80,200,240,0.7)', borderLeft: '2px solid rgba(80,200,240,0.7)', borderRadius: '0 0 0 4px', pointerEvents: 'none', zIndex: 10 }} />
        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderBottom: '2px solid rgba(80,200,240,0.7)', borderRight: '2px solid rgba(80,200,240,0.7)', borderRadius: '0 0 4px 0', pointerEvents: 'none', zIndex: 10 }} />

      {/* Settings side panel */}
      <aside
        className="w-44 flex-shrink-0 flex flex-col glass"
        style={{ borderRight: '1px solid rgba(255,255,255,0.10)', background: 'rgba(8,18,40,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
      >
        <div
          className="px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}
        >
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Settings
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center px-4 py-2 text-sm font-medium transition-all ${
                  isActive ? '' : 'hover:bg-white/5'
                }`
              }
              style={({ isActive }) => ({
                color: isActive ? 'var(--text-primary)' : 'var(--subtle)',
                background: isActive ? 'rgba(245,158,11,0.08)' : undefined,
                borderLeft: `2px solid ${isActive ? 'rgb(var(--accent))' : 'transparent'}`,
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Content area */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      </div>
    </div>
  )
}


import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/settings/company', label: 'Company' },
  { to: '/settings/prompt', label: 'Prompt' },
  { to: '/settings/provider', label: 'Provider' },
  { to: '/settings/model', label: 'Model' },
  { to: '/settings/skills', label: 'Skills' },
  { to: '/settings/roles', label: 'Roles' },
  { to: '/settings/appearance', label: 'Appearance' },
]

export default function Settings() {
  return (
    <div className="flex h-full">
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
      <main className="flex-1 overflow-hidden p-6">
        <div
          className="h-full rounded-xl overflow-hidden"
          style={{ background: 'rgba(8,18,40,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
        >
          <Outlet />
        </div>
      </main>
    </div>
  )
}


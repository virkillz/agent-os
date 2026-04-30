import { NavLink, Outlet } from 'react-router-dom'
import PageHeader from '../components/PageHeader.tsx'

const NAV_ITEMS = [
  { to: '/settings/prompt', label: 'Prompt' },
  { to: '/settings/provider', label: 'Provider' },
  { to: '/settings/extensions', label: 'Extensions' },
  { to: '/settings/mcp', label: 'MCP Servers' },
  { to: '/settings/skills', label: 'Skills' },
  { to: '/settings/appearance', label: 'Appearance' },
]

export default function Settings() {
  return (
    <div className="h-full flex flex-col">
      {/* ── Header Section ── */}
      <div className="flex-shrink-0">
        <div className="max-w-4xl mx-auto px-6 pt-8 pb-4">
          <PageHeader
            title="Settings"
            subtitle="Configure system preferences"
            backTo="/dashboard"
          />
        </div>
      </div>

      {/* ── Settings Window Section ── */}
      <div className="flex-1 flex items-center justify-center px-4 md:px-8 pb-4">
        {/* Adaptive window frame */}
        <div
          className="relative w-full flex"
          style={{
            maxWidth: '960px',
            height: '100%',
            background: 'rgb(var(--s0) / 0.82)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgb(var(--accent) / 0.18)',
            borderRadius: '12px',
            boxShadow: '0 0 0 1px rgb(var(--accent) / 0.06), 0 8px 48px rgba(0,0,0,0.5), 0 0 60px rgb(var(--accent) / 0.06)',
            overflow: 'hidden',
          }}
        >
          {/* Corner brackets */}
          <span style={{ position: 'absolute', top: -1, left: -1, width: 16, height: 16, borderTop: '2px solid rgb(var(--accent) / 0.7)', borderLeft: '2px solid rgb(var(--accent) / 0.7)', borderRadius: '4px 0 0 0', pointerEvents: 'none', zIndex: 10 }} />
          <span style={{ position: 'absolute', top: -1, right: -1, width: 16, height: 16, borderTop: '2px solid rgb(var(--accent) / 0.7)', borderRight: '2px solid rgb(var(--accent) / 0.7)', borderRadius: '0 4px 0 0', pointerEvents: 'none', zIndex: 10 }} />
          <span style={{ position: 'absolute', bottom: -1, left: -1, width: 16, height: 16, borderBottom: '2px solid rgb(var(--accent) / 0.7)', borderLeft: '2px solid rgb(var(--accent) / 0.7)', borderRadius: '0 0 0 4px', pointerEvents: 'none', zIndex: 10 }} />
          <span style={{ position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderBottom: '2px solid rgb(var(--accent) / 0.7)', borderRight: '2px solid rgb(var(--accent) / 0.7)', borderRadius: '0 0 4px 0', pointerEvents: 'none', zIndex: 10 }} />

          {/* Settings side panel */}
          <aside
            className="w-44 flex-shrink-0 flex flex-col glass"
            style={{ borderRight: '1px solid var(--border)', background: 'rgb(var(--s1) / 0.72)' }}
          >
            <div
              className="px-4 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
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
                    background: isActive ? 'rgb(var(--accent) / 0.08)' : undefined,
                    borderLeft: `2px solid ${isActive ? 'rgb(var(--accent) / 0.6)' : 'transparent'}`,
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
    </div>
  )
}

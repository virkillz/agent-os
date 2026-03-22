import { Outlet, NavLink } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.ts'
import { useTheme } from '../contexts/ThemeContext.tsx'
import { api, type User } from '../api.ts'
import NotificationCenter from './NotificationCenter.tsx'

interface LayoutProps {
  currentUser: User | null
  onLogout: () => void
}

export default function Layout({ currentUser, onLogout }: LayoutProps) {
  const { settings, agents, loadAgents, agentStatus } = useStore()
  const { theme, toggle } = useTheme()

  useEffect(() => { loadAgents() }, [loadAgents])

  function handleLogout() {
    api.auth.logout().finally(onLogout)
  }

  const [showCompanyModal, setShowCompanyModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [liveUser, setLiveUser] = useState<User | null>(currentUser)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setLiveUser(currentUser) }, [currentUser])

  useEffect(() => {
    if (!showUserMenu) return
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showUserMenu])

  const thinkingCount = Object.values(agentStatus).filter(s => s === 'thinking').length
  const now = new Date()
  const quarter = Math.floor(now.getMonth() / 3) + 1
  const year = now.getFullYear()

  return (
    <div className="flex flex-col h-full">

      {/* ── HUD Top Bar ── */}
      <header
        className="glass flex items-center justify-between px-5 flex-shrink-0"
        style={{ height: '52px', borderBottom: '1px solid rgba(255,255,255,0.10)' }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setShowCompanyModal(true)}>
          <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              {settings?.companyName || 'Rascal Inc'}
            </span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
              Command Center
            </span>
          </div>
        </div>

        {/* HUD Stats + User Menu */}
        <div className="flex items-center">
          <HudStat icon={<StaffIcon />} label="Staff" value={String(agents.length)} />
          <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />
          <HudStat
            icon={<BoltIcon />}
            label="Working"
            value={String(thinkingCount)}
            highlight={thinkingCount > 0}
          />
          <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />
          <HudStat icon={<ClockIcon />} label="Period" value={`Q${quarter} ${year}`} />
          <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />
          <button
            onClick={toggle}
            className="w-7 h-7 ml-2 rounded flex items-center justify-center transition-colors hover:bg-surface-3"
            style={{ color: 'var(--muted)' }}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          <div className="ml-2">
            <NotificationCenter />
          </div>

          {/* User avatar dropdown */}
          <div className="relative ml-3" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold transition-opacity hover:opacity-80 overflow-hidden"
              style={{ backgroundColor: liveUser?.avatar_color ?? 'rgb(var(--accent))', color: '#0a0f1a' }}
              title={liveUser?.display_name ?? ''}
            >
              {liveUser?.avatar_url
                ? <img src={liveUser.avatar_url} alt="" className="w-full h-full object-cover" />
                : (liveUser?.display_name ?? '?')[0].toUpperCase()
              }
            </button>

            {showUserMenu && (
              <div
                className="absolute right-0 top-full mt-2 w-52 rounded-lg overflow-hidden z-50"
                style={{ background: 'rgb(16, 32, 60)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 12px 32px rgba(0,0,0,0.7)' }}
              >
                {/* Identity header */}
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <div
                    className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: liveUser?.avatar_color ?? 'rgb(var(--accent))', color: '#0a0f1a' }}
                  >
                    {liveUser?.avatar_url
                      ? <img src={liveUser.avatar_url} alt="" className="w-full h-full object-cover" />
                      : (liveUser?.display_name ?? '?')[0].toUpperCase()
                    }
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {liveUser?.display_name}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                      @{liveUser?.username}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="py-1">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-white/8"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => { setShowUserMenu(false); setShowProfileModal(true) }}
                  >
                    <span className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }}><UserCircleIcon /></span>
                    My Profile
                  </button>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-white/8"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => { setShowUserMenu(false); handleLogout() }}
                  >
                    <span className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }}><LogoutIcon /></span>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body: Sidebar + Main ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside
          className="glass flex-shrink-0 flex flex-col"
          style={{ width: '200px', borderRight: '1px solid rgba(255,255,255,0.10)' }}
        >
          {/* Main Navigation */}
          <nav className="flex-1 py-3 overflow-y-auto">
            <div className="px-3 space-y-0.5">
              <GameNavLink to="/dashboard" icon={<DashboardIcon />} label="Dashboard" />
              <GameNavLink to="/roster" icon={<EmployeesIcon />} label="Employees" />
              <GameNavLink to="/settings/extensions" icon={<ExtensionsIcon />} label="Extensions" />
            </div>

            {/* Agent quick-links */}
            {agents.length > 0 && (
              <>
                <div
                  className="px-5 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: 'var(--muted)' }}
                >
                  Agents
                </div>
                {agents.map((agent) => (
                  <div key={agent.id} className="px-3">
                    <NavLink
                      to={`/agents/${agent.id}`}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-all ${
                          isActive ? '' : 'hover:bg-white/5'
                        }`
                      }
                      style={({ isActive }) => ({
                        color: isActive ? 'var(--text-primary)' : 'var(--subtle)',
                        background: isActive ? 'rgba(245,158,11,0.08)' : undefined,
                        borderLeft: `2px solid ${isActive ? 'rgb(var(--accent))' : 'transparent'}`,
                        opacity: !agent.is_active && !isActive ? 0.5 : 1,
                      })}
                    >
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white overflow-hidden"
                          style={{ backgroundColor: agent.avatar_color }}
                        >
                          {agent.avatar_url
                            ? <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
                            : agent.name[0].toUpperCase()
                          }
                        </div>
                        {agent.is_active && (
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${agentStatus[agent.id] === 'thinking' ? 'animate-pulse-dot' : ''}`}
                            style={{
                              background: agentStatus[agent.id] === 'thinking' ? 'var(--status-amber)' : 'var(--status-green)',
                              border: '1.5px solid rgb(var(--s1))',
                            }}
                          />
                        )}
                      </div>
                      <span className="truncate">{agent.name}</span>
                    </NavLink>
                  </div>
                ))}
              </>
            )}
          </nav>

          {/* Bottom: settings */}
          <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
            <GameNavLink to="/settings" icon={<CogIcon />} label="Settings" />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* ── Profile Modal ── */}
      {showProfileModal && liveUser && (
        <ProfileModal
          user={liveUser}
          onClose={() => setShowProfileModal(false)}
          onUpdated={setLiveUser}
        />
      )}

      {/* ── Company Info Modal ── */}
      {showCompanyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCompanyModal(false)}
        >
          <div
            className="w-full max-w-md card p-8 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {settings?.companyName || 'Rascal Inc'}
                </h2>
                <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Command Center · Q{quarter} {year}
                </span>
              </div>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />

            {/* Mission */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                Mission
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--subtle)' }}>
                {settings?.companyMission || 'No mission statement set.'}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Staff</div>
                <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{agents.length}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>AI agents</div>
              </div>
              <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>Active</div>
                <div className="text-2xl font-bold" style={{ color: thinkingCount > 0 ? 'var(--status-green)' : 'var(--text-primary)' }}>{thinkingCount}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>working now</div>
              </div>
            </div>

            {/* Close */}
            <button
              className="btn-ghost w-full text-center"
              onClick={() => setShowCompanyModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function GameNavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all ${
          isActive ? '' : 'hover:bg-white/5'
        }`
      }
      style={({ isActive }) => ({
        color: isActive ? 'var(--text-primary)' : 'var(--subtle)',
        background: isActive ? 'rgba(245,158,11,0.12)' : undefined,
        borderLeft: `2px solid ${isActive ? 'rgb(var(--accent))' : 'transparent'}`,
      })}
    >
      <span className="w-4 h-4 flex-shrink-0">{icon}</span>
      {label}
    </NavLink>
  )
}

function HudStat({ icon, label, value, highlight }: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-2 px-4">
      <span className="w-4 h-4 flex-shrink-0" style={{ color: highlight ? 'var(--status-green)' : 'var(--muted)' }}>
        {icon}
      </span>
      <div>
        <div className="hud-stat-label">{label}</div>
        <div className="hud-stat-value" style={{ color: highlight ? 'var(--status-green)' : 'var(--text-primary)' }}>
          {value}
        </div>
      </div>
    </div>
  )
}

// ─── Icons ───────────────────────────────────────────────────────────────────


function DashboardIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  )
}


function EmployeesIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}


function CogIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function StaffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
}

function UserCircleIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function ExtensionsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
    </svg>
  )
}

// ─── Profile Modal ────────────────────────────────────────────────────────────

function ProfileModal({ user, onClose, onUpdated }: {
  user: User
  onClose: () => void
  onUpdated: (u: User) => void
}) {
  const [displayName, setDisplayName] = useState(user.display_name)
  const [bio, setBio] = useState(user.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    setSaving(true)
    try {
      let updated = await api.users.update(user.id, { displayName, bio })
      if (avatarFile) {
        updated = await api.users.uploadAvatar(user.id, avatarFile)
      }
      onUpdated(updated)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  function handleAvatarClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const avatarSrc = avatarPreview ?? (user.avatar_url || null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm card p-8 space-y-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>My Profile</h2>

        {/* Avatar */}
        <div className="flex justify-center">
          <button
            onClick={handleAvatarClick}
            className="relative group w-20 h-20 rounded-full overflow-hidden flex-shrink-0"
            style={{ backgroundColor: user.avatar_color }}
            title="Click to upload photo"
          >
            {avatarSrc
              ? <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
              : <span className="text-2xl font-bold text-white flex items-center justify-center w-full h-full">
                  {(user.display_name)[0].toUpperCase()}
                </span>
            }
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.5)' }}>
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </div>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {/* Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>
              Username
            </label>
            <div className="px-3 py-2 rounded text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--subtle)' }}>
              @{user.username}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>
              Display Name
            </label>
            <input
              className="input w-full text-sm"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>
              Bio
            </label>
            <textarea
              className="input w-full text-sm resize-none"
              rows={3}
              placeholder="A short bio..."
              value={bio}
              onChange={e => setBio(e.target.value)}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store.ts'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { api, type User } from './api.ts'
import Onboarding from './pages/Onboarding.tsx'
import Login from './pages/Login.tsx'
import Roster from './pages/Roster.tsx'
import AgentProfile from './pages/AgentProfile.tsx'
import AgentChat from './pages/AgentChat.tsx'
import AgentSettings from './pages/AgentSettings.tsx'
import AgentMemory from './pages/AgentMemory.tsx'
import AgentTodos from './pages/AgentTodos.tsx'
import AgentSchedule from './pages/AgentSchedule.tsx'
import Settings from './pages/Settings.tsx'
import SettingsProvider from './pages/settings/Provider.tsx'
import SettingsExtensions from './pages/settings/Extensions.tsx'
import SettingsMcp from './pages/settings/Mcp.tsx'
import SettingsSkills from './pages/settings/Skills.tsx'
import SettingsAppearance from './pages/settings/Appearance.tsx'
import SettingsPrompt from './pages/settings/Prompt.tsx'
import Workspace from './pages/Workspace.tsx'
import Board from './pages/Board.tsx'
import Channels from './pages/Channels.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Users from './pages/Users.tsx'
import Notifications from './pages/Notifications.tsx'
import Layout from './components/Layout.tsx'

type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

export default function App() {
  const { settings, loadSettings } = useStore()
  const [loading, setLoading] = useState(true)
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  // ThemeProvider handles all background and color theming
  // No manual background setup needed here

  useEffect(() => {
    loadSettings()
      .then(() => api.auth.me())
      .then((user) => {
        setCurrentUser(user)
        setAuthState('authenticated')
      })
      .catch(() => {
        setAuthState('unauthenticated')
      })
      .finally(() => setLoading(false))
  }, [loadSettings])

  if (loading) {
    return (
      <ThemeProvider>
        <div className="flex items-center justify-center h-full" style={{ background: 'rgb(var(--s0))' }}>
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-10 h-10 rounded flex items-center justify-center"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              <div
                className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'rgb(var(--accent))', borderTopColor: 'transparent' }}
              />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Initializing
            </span>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  // First-run setup wizard (no users exist yet)
  if (settings?.firstRun || settings?.needsSetup) {
    return (
      <ThemeProvider>
        <Onboarding
          onComplete={(user) => { if (user) { setCurrentUser(user); setAuthState('authenticated') } loadSettings() }}
          startAtAccount={!settings.firstRun && settings.needsSetup}
        />
      </ThemeProvider>
    )
  }

  // Login gate
  if (authState === 'unauthenticated') {
    return (
      <ThemeProvider>
        <Login onLogin={(user) => { setCurrentUser(user); setAuthState('authenticated') }} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout currentUser={currentUser} onLogout={async () => { await api.auth.logout(); setCurrentUser(null); setAuthState('unauthenticated') }} />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/channels/:id" element={<Channels />} />
            <Route path="/board" element={<Board />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/users" element={<Users />} />
            <Route path="/agents/:id" element={<AgentProfile />} />
            <Route path="/agents/:id/chat" element={<AgentChat />} />
            <Route path="/agents/:id/settings" element={<AgentSettings />} />
            <Route path="/agents/:id/memory" element={<AgentMemory />} />
            <Route path="/agents/:id/todos" element={<AgentTodos />} />
            <Route path="/agents/:id/schedule" element={<AgentSchedule />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<Settings />}>
              <Route index element={<Navigate to="/settings/prompt" replace />} />
              <Route path="provider" element={<SettingsProvider />} />
              <Route path="extensions" element={<SettingsExtensions />} />
              <Route path="mcp" element={<SettingsMcp />} />
              <Route path="skills" element={<SettingsSkills />} />
              <Route path="prompt" element={<SettingsPrompt />} />
              <Route path="appearance" element={<SettingsAppearance />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store.ts'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { api, type User } from './api.ts'
import Onboarding from './pages/Onboarding.tsx'
import Login from './pages/Login.tsx'
import Roster from './pages/Roster.tsx'
import AgentChat from './pages/AgentChat.tsx'
import AgentSettings from './pages/AgentSettings.tsx'
import Settings from './pages/Settings.tsx'
import SettingsProvider from './pages/settings/Provider.tsx'
import SettingsModel from './pages/settings/Model.tsx'
import SettingsExtensions from './pages/settings/Extensions.tsx'
import SettingsSkills from './pages/settings/Skills.tsx'
import SettingsRoles from './pages/settings/Roles.tsx'
import SettingsAppearance from './pages/settings/Appearance.tsx'
import SettingsCompany from './pages/settings/Company.tsx'
import SettingsPrompt from './pages/settings/Prompt.tsx'
import Workspace from './pages/Workspace.tsx'
import Board from './pages/Board.tsx'
import Channels from './pages/Channels.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Notifications from './pages/Notifications.tsx'
import Layout from './components/Layout.tsx'

type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

export default function App() {
  const { settings, loadSettings } = useStore()
  const [loading, setLoading] = useState(true)
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('rascal:background')
    if (saved) {
      const preset = ['default', 'midnight', 'aurora', 'nebula', 'void', 'deep-ocean', 'ember']
      const PRESET_VALUES: Record<string, string> = {
        default: "url('/background.png')",
        midnight: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 50%, #07111f 100%)',
        aurora: 'linear-gradient(135deg, #0d1b2a 0%, #1a2a1a 40%, #0a1a2a 100%)',
        nebula: 'linear-gradient(135deg, #1a0a2e 0%, #0d1a3e 50%, #1a0a1a 100%)',
        void: 'linear-gradient(135deg, #050505 0%, #0a0a14 100%)',
        'deep-ocean': 'linear-gradient(135deg, #020b18 0%, #041830 50%, #051020 100%)',
        ember: 'linear-gradient(135deg, #1a0a00 0%, #2a1000 50%, #1a0500 100%)',
      }
      const value = preset.includes(saved) ? PRESET_VALUES[saved] : saved
      document.body.style.backgroundImage = value
    }
  }, [])

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

  // First-run setup wizard (no company name set OR no users exist yet)
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
          <Route element={<Layout currentUser={currentUser} onLogout={() => { setCurrentUser(null); setAuthState('unauthenticated') }} />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/channels/:id" element={<Channels />} />
            <Route path="/board" element={<Board />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/agents/:id" element={<AgentChat />} />
            <Route path="/agents/:id/settings" element={<AgentSettings />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<Settings />}>
              <Route index element={<Navigate to="/settings/company" replace />} />
              <Route path="company" element={<SettingsCompany />} />
              <Route path="provider" element={<SettingsProvider />} />
              <Route path="model" element={<SettingsModel />} />
              <Route path="extensions" element={<SettingsExtensions />} />
              <Route path="skills" element={<SettingsSkills />} />
              <Route path="roles" element={<SettingsRoles />} />
              <Route path="prompt" element={<SettingsPrompt />} />
              <Route path="appearance" element={<SettingsAppearance />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export interface ThemeDefinition {
  id: string
  name: string
  description: string
  accent: string
  accentGlow: string
  s0: string
  s1: string
  s2: string
  s3: string
  textPrimary: string
  subtle: string
  muted: string
  border: string
  background: string
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'cyan',
    name: 'Cyan',
    description: 'Clinical precision. The original command interface.',
    accent: '100 210 230',
    accentGlow: 'rgba(80, 200, 220, 0.35)',
    s0: '8 18 36',
    s1: '12 24 48',
    s2: '16 32 60',
    s3: '24 44 80',
    textPrimary: '#e8f2ff',
    subtle: '#a8c8e8',
    muted: '#7a9ec0',
    border: 'rgba(255,255,255,0.10)',
    background: 'url(\'/background.png\')',
  },
  {
    id: 'amber',
    name: 'Amber',
    description: 'Industrial warning systems. Caution meets control.',
    accent: '245 180 80',
    accentGlow: 'rgba(220, 160, 60, 0.35)',
    s0: '18 14 6',
    s1: '28 20 8',
    s2: '40 28 10',
    s3: '55 38 14',
    textPrimary: '#f8f0e0',
    subtle: '#d4b888',
    muted: '#a08050',
    border: 'rgba(255,220,160,0.10)',
    background: 'linear-gradient(160deg, #1a1208 0%, #0f0a04 50%, #1a1004 100%)',
  },
  {
    id: 'magenta',
    name: 'Magenta',
    description: 'Synthetic neural pathways. Electric and bold.',
    accent: '220 100 180',
    accentGlow: 'rgba(200, 80, 160, 0.35)',
    s0: '16 8 18',
    s1: '26 12 28',
    s2: '38 16 40',
    s3: '50 22 55',
    textPrimary: '#f8e8f4',
    subtle: '#d8a8c8',
    muted: '#a07090',
    border: 'rgba(255,180,220,0.10)',
    background: 'linear-gradient(160deg, #1a0818 0%, #0f040f 50%, #1a0814 100%)',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Bioluminescent depths. Organic intelligence.',
    accent: '80 210 150',
    accentGlow: 'rgba(60, 190, 130, 0.35)',
    s0: '6 16 12',
    s1: '8 26 18',
    s2: '10 38 24',
    s3: '14 50 32',
    textPrimary: '#e8f8f0',
    subtle: '#a8d8c0',
    muted: '#70a080',
    border: 'rgba(160,255,200,0.10)',
    background: 'linear-gradient(160deg, #081a12 0%, #040f0a 50%, #081a10 100%)',
  },
  {
    id: 'coral',
    name: 'Coral',
    description: 'Warm sunset glow. Human-centered warmth.',
    accent: '240 140 120',
    accentGlow: 'rgba(220, 120, 100, 0.35)',
    s0: '16 10 10',
    s1: '26 14 14',
    s2: '38 18 18',
    s3: '50 24 24',
    textPrimary: '#f8e8e4',
    subtle: '#d8a898',
    muted: '#a07868',
    border: 'rgba(255,180,160,0.10)',
    background: 'linear-gradient(160deg, #1a0e0c 0%, #0f0806 50%, #1a0c08 100%)',
  },
  {
    id: 'violet',
    name: 'Violet',
    description: 'Deep space telemetry. Cosmic and mysterious.',
    accent: '160 130 240',
    accentGlow: 'rgba(140, 110, 220, 0.35)',
    s0: '10 8 20',
    s1: '16 12 32',
    s2: '22 16 45',
    s3: '30 22 60',
    textPrimary: '#ece8f8',
    subtle: '#b8a8d8',
    muted: '#8878a8',
    border: 'rgba(180,160,255,0.10)',
    background: 'linear-gradient(160deg, #120a1e 0%, #0a0614 50%, #120a1a 100%)',
  },
  {
    id: 'steel',
    name: 'Steel',
    description: 'Brutalist monochrome. Stark and uncompromising.',
    accent: '160 170 180',
    accentGlow: 'rgba(140, 150, 160, 0.35)',
    s0: '10 10 12',
    s1: '16 16 18',
    s2: '24 24 26',
    s3: '34 34 36',
    textPrimary: '#e8e8ea',
    subtle: '#a8a8ac',
    muted: '#707074',
    border: 'rgba(255,255,255,0.10)',
    background: 'linear-gradient(160deg, #121214 0%, #0a0a0c 50%, #101012 100%)',
  },
]

const THEME_STORAGE_KEY = 'agentos:theme'
const BACKGROUND_STORAGE_KEY = 'agentos:background'

interface ThemeContextValue {
  theme: ThemeDefinition
  setTheme: (id: string) => void
  backgroundOverride: string | null
  setBackgroundOverride: (value: string | null) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[0],
  setTheme: () => {},
  backgroundOverride: null,
  setBackgroundOverride: () => {},
})

function applyTheme(theme: ThemeDefinition, backgroundOverride: string | null) {
  const root = document.documentElement
  root.style.setProperty('--accent', theme.accent)
  root.style.setProperty('--s0', theme.s0)
  root.style.setProperty('--s1', theme.s1)
  root.style.setProperty('--s2', theme.s2)
  root.style.setProperty('--s3', theme.s3)
  root.style.setProperty('--text-primary', theme.textPrimary)
  root.style.setProperty('--subtle', theme.subtle)
  root.style.setProperty('--muted', theme.muted)
  root.style.setProperty('--border', theme.border)

  // Update derived colors for status badges to harmonize with theme
  const accentRgb = theme.accent.split(' ').map(Number)
  const accentHex = `#${accentRgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`
  root.style.setProperty('--status-blue', accentHex)
  root.style.setProperty('--status-blue-bg', `rgba(${theme.accent}, 0.12)`)
  root.style.setProperty('--status-blue-border', `rgba(${theme.accent}, 0.25)`)

  // Apply background
  const bg = backgroundOverride ?? theme.background
  document.body.style.backgroundImage = bg
}

function triggerThemeTransition() {
  document.body.classList.add('theme-transitioning')
  window.setTimeout(() => {
    document.body.classList.remove('theme-transitioning')
  }, 450)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<string>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return THEMES.find((t) => t.id === stored) ? stored! : 'cyan'
  })

  const [backgroundOverride, setBackgroundOverrideState] = useState<string | null>(() => {
    const saved = localStorage.getItem(BACKGROUND_STORAGE_KEY)
    if (!saved) return null
    // If it's a preset ID, return null (theme will handle it)
    if (THEMES.find((t) => t.id === saved)) return null
    // If it's the old default background key
    if (saved === 'default') return null
    // Otherwise it's a custom URL
    return saved
  })

  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]

  useEffect(() => {
    triggerThemeTransition()
    applyTheme(theme, backgroundOverride)
    localStorage.setItem(THEME_STORAGE_KEY, themeId)
  }, [theme, backgroundOverride, themeId])

  const setTheme = useCallback((id: string) => {
    const t = THEMES.find((th) => th.id === id)
    if (t) {
      setThemeId(id)
      // Clear background override when switching themes so theme default shows
      setBackgroundOverrideState(null)
      localStorage.removeItem(BACKGROUND_STORAGE_KEY)
    }
  }, [])

  const setBackgroundOverride = useCallback((value: string | null) => {
    setBackgroundOverrideState(value)
    if (value) {
      localStorage.setItem(BACKGROUND_STORAGE_KEY, value)
    } else {
      localStorage.removeItem(BACKGROUND_STORAGE_KEY)
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, backgroundOverride, setBackgroundOverride }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

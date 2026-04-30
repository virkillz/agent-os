import { useState, useEffect } from 'react'
import { Check, Palette, Image, Sparkles } from 'lucide-react'
import { useTheme, THEMES, type ThemeDefinition } from '../../contexts/ThemeContext.tsx'

/* ─── Theme Preview Card ───────────────────────────────────────────────────── */

function ThemePreview({ theme }: { theme: ThemeDefinition }) {
  const accentRgb = theme.accent.split(' ').join(', ')
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg"
      style={{
        aspectRatio: '16/10',
        background: `rgb(${theme.s1})`,
        border: `1px solid ${theme.border}`,
      }}
    >
      {/* Mini header bar */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: `rgb(${accentRgb})` }} />
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: theme.muted, opacity: 0.4 }} />
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: theme.muted, opacity: 0.4 }} />
        <div className="ml-auto w-8 h-1 rounded" style={{ background: theme.muted, opacity: 0.25 }} />
      </div>
      {/* Mini content */}
      <div className="p-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded" style={{ background: `rgba(${accentRgb}, 0.15)`, border: `1px solid rgba(${accentRgb}, 0.3)` }} />
          <div className="flex-1 space-y-1">
            <div className="h-1 rounded" style={{ background: theme.textPrimary, opacity: 0.6, width: '70%' }} />
            <div className="h-1 rounded" style={{ background: theme.subtle, opacity: 0.35, width: '45%' }} />
          </div>
        </div>
        <div className="flex gap-1.5 pt-0.5">
          <div className="h-3 flex-1 rounded" style={{ background: `rgba(${accentRgb}, 0.12)`, border: `1px solid rgba(${accentRgb}, 0.25)` }} />
          <div className="h-3 w-6 rounded" style={{ background: theme.s3, opacity: 0.6 }} />
        </div>
        <div className="flex gap-1 pt-1">
          <div className="h-1.5 rounded flex-1" style={{ background: theme.muted, opacity: 0.2 }} />
          <div className="h-1.5 rounded flex-1" style={{ background: theme.muted, opacity: 0.15 }} />
          <div className="h-1.5 rounded w-4" style={{ background: `rgba(${accentRgb}, 0.3)` }} />
        </div>
      </div>
      {/* Subtle glow in corner */}
      <div
        className="absolute -bottom-6 -right-6 w-16 h-16 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, rgba(${accentRgb}, 0.15) 0%, transparent 70%)` }}
      />
    </div>
  )
}

/* ─── Background Presets ───────────────────────────────────────────────────── */

const BG_PRESETS = [
  { id: 'theme-default', label: 'Theme Default', type: 'theme' as const },
  { id: 'starry', label: 'Starry Field', value: 'radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%)', type: 'preset' as const },
  { id: 'obsidian', label: 'Obsidian', value: 'radial-gradient(circle at 50% 0%, #1a1a2e 0%, #0f0f1a 50%, #050508 100%)', type: 'preset' as const },
  { id: 'forest', label: 'Deep Forest', value: 'linear-gradient(180deg, #0a1a10 0%, #061208 50%, #0a140a 100%)', type: 'preset' as const },
  { id: 'ash', label: 'Nuclear Ash', value: 'linear-gradient(180deg, #1a1816 0%, #0f0e0c 50%, #121110 100%)', type: 'preset' as const },
  { id: 'blood', label: 'Crimson', value: 'radial-gradient(ellipse at top, #1a0a0a 0%, #0f0505 50%, #0a0202 100%)', type: 'preset' as const },
  { id: 'ice', label: 'Arctic', value: 'linear-gradient(180deg, #0a1218 0%, #060c12 50%, #080e14 100%)', type: 'preset' as const },
]

/* ─── Main Component ───────────────────────────────────────────────────────── */

export default function SettingsAppearance() {
  const { theme: activeTheme, setTheme, backgroundOverride, setBackgroundOverride } = useTheme()
  const [selectedBg, setSelectedBg] = useState<string>('theme-default')
  const [customUrl, setCustomUrl] = useState('')
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    // Determine current bg selection
    if (!backgroundOverride) {
      setSelectedBg('theme-default')
    } else {
      const preset = BG_PRESETS.find((p) => p.value === backgroundOverride)
      if (preset) {
        setSelectedBg(preset.id)
      } else {
        setSelectedBg('custom')
        setCustomUrl(backgroundOverride.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, ''))
      }
    }
  }, [backgroundOverride])

  function handleThemeSelect(id: string) {
    setTheme(id)
  }

  function handleBgSelect(preset: (typeof BG_PRESETS)[number]) {
    if (preset.type === 'theme') {
      setBackgroundOverride(null)
      setSelectedBg(preset.id)
    } else if (preset.value) {
      setBackgroundOverride(preset.value)
      setSelectedBg(preset.id)
    }
  }

  function handleApplyCustom() {
    if (!customUrl.trim()) return
    const value = `url('${customUrl.trim()}')`
    setBackgroundOverride(value)
    setSelectedBg('custom')
  }

  const previewTheme = THEMES.find((t) => t.id === (hoveredTheme ?? activeTheme.id)) ?? activeTheme
  const accentRgb = previewTheme.accent.split(' ').join(', ')

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0 mt-0.5"
            style={{
              background: `rgba(${accentRgb}, 0.12)`,
              border: `1px solid rgba(${accentRgb}, 0.25)`,
            }}
          >
            <Palette size={18} style={{ color: `rgb(${accentRgb})` }} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Appearance
            </h2>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
              Customize the visual identity of your command station. Each theme redefines the entire color system.
            </p>
          </div>
        </div>

        {/* ── Live Preview ── */}
        <div
          className="relative rounded-xl overflow-hidden transition-all duration-500"
          style={{
            border: `1px solid ${previewTheme.border}`,
            background: `rgb(${previewTheme.s0})`,
            boxShadow: `0 0 0 1px rgba(0,0,0,0.3), 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)`,
          }}
        >
          <div
            className="px-4 py-2.5 flex items-center gap-3"
            style={{ borderBottom: `1px solid ${previewTheme.border}` }}
          >
            <Sparkles size={14} style={{ color: `rgb(${accentRgb})` }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: previewTheme.muted }}>
              Live Preview — {previewTheme.name}
            </span>
            <div className="ml-auto flex gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: previewTheme.muted, opacity: 0.3 }} />
              <div className="w-2 h-2 rounded-full" style={{ background: previewTheme.muted, opacity: 0.3 }} />
              <div className="w-2 h-2 rounded-full" style={{ background: previewTheme.muted, opacity: 0.3 }} />
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-4 mb-5">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{
                  background: `rgba(${accentRgb}, 0.12)`,
                  border: `1px solid rgba(${accentRgb}, 0.25)`,
                }}
              >
                <div className="w-5 h-5 rounded" style={{ background: `rgb(${accentRgb})` }} />
              </div>
              <div>
                <div className="h-2.5 rounded w-32 mb-2" style={{ background: previewTheme.textPrimary, opacity: 0.5 }} />
                <div className="h-1.5 rounded w-48" style={{ background: previewTheme.subtle, opacity: 0.25 }} />
              </div>
            </div>
            <div className="flex gap-3 mb-5">
              <div
                className="flex-1 h-20 rounded-lg"
                style={{
                  background: `rgb(${previewTheme.s1})`,
                  border: `1px solid ${previewTheme.border}`,
                }}
              >
                <div className="p-3">
                  <div className="h-1.5 rounded w-16 mb-2" style={{ background: previewTheme.muted, opacity: 0.4 }} />
                  <div className="h-1 rounded w-full mb-1.5" style={{ background: previewTheme.subtle, opacity: 0.15 }} />
                  <div className="h-1 rounded w-3/4" style={{ background: previewTheme.subtle, opacity: 0.1 }} />
                </div>
              </div>
              <div
                className="flex-1 h-20 rounded-lg"
                style={{
                  background: `rgb(${previewTheme.s1})`,
                  border: `1px solid ${previewTheme.border}`,
                }}
              >
                <div className="p-3">
                  <div className="h-1.5 rounded w-12 mb-2" style={{ background: `rgba(${accentRgb}, 0.5)` }} />
                  <div className="h-1 rounded w-full mb-1.5" style={{ background: previewTheme.subtle, opacity: 0.15 }} />
                  <div className="h-1 rounded w-2/3" style={{ background: previewTheme.subtle, opacity: 0.1 }} />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <div
                className="h-8 px-3 rounded flex items-center"
                style={{
                  background: `rgba(${accentRgb}, 0.12)`,
                  border: `1px solid rgba(${accentRgb}, 0.3)`,
                }}
              >
                <div className="h-1 rounded w-10" style={{ background: `rgb(${accentRgb})`, opacity: 0.6 }} />
              </div>
              <div
                className="h-8 px-3 rounded flex items-center"
                style={{
                  background: `rgb(${previewTheme.s2})`,
                  border: `1px solid ${previewTheme.border}`,
                }}
              >
                <div className="h-1 rounded w-10" style={{ background: previewTheme.subtle, opacity: 0.35 }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Theme Selector ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Palette size={14} style={{ color: 'var(--muted)' }} />
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Color Theme
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {THEMES.map((t, i) => {
              const isActive = activeTheme.id === t.id
              const tAccent = t.accent.split(' ').join(', ')
              return (
                <button
                  key={t.id}
                  onClick={() => handleThemeSelect(t.id)}
                  onMouseEnter={() => setHoveredTheme(t.id)}
                  onMouseLeave={() => setHoveredTheme(null)}
                  className="group text-left transition-all duration-300"
                  style={{
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? 'translateY(0)' : 'translateY(12px)',
                    transitionDelay: `${i * 40}ms`,
                  }}
                >
                  <div
                    className="relative rounded-xl overflow-hidden transition-all duration-300"
                    style={{
                      background: `rgb(${t.s1})`,
                      border: isActive
                        ? `1.5px solid rgba(${tAccent}, 0.5)`
                        : `1px solid ${t.border}`,
                      boxShadow: isActive
                        ? `0 0 0 1px rgba(${tAccent}, 0.1), 0 4px 20px rgba(${tAccent}, 0.15), inset 0 1px 0 rgba(255,255,255,0.03)`
                        : `inset 0 1px 0 rgba(255,255,255,0.03)`,
                    }}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <div
                        className="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{
                          background: `rgba(${tAccent}, 0.2)`,
                          border: `1px solid rgba(${tAccent}, 0.4)`,
                        }}
                      >
                        <Check size={12} style={{ color: `rgb(${tAccent})` }} />
                      </div>
                    )}

                    <div className="p-3">
                      <ThemePreview theme={t} />
                    </div>

                    <div
                      className="px-3 pb-3 pt-1"
                      style={{ borderTop: `1px solid ${t.border}` }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: `rgb(${tAccent})`, boxShadow: `0 0 6px rgba(${tAccent}, 0.4)` }}
                        />
                        <span
                          className="text-sm font-semibold"
                          style={{ color: isActive ? t.textPrimary : t.subtle }}
                        >
                          {t.name}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: t.muted }}>
                        {t.description}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Background Override ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Image size={14} style={{ color: 'var(--muted)' }} />
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Background Override
            </p>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-2 mb-5">
            {BG_PRESETS.map((preset) => {
              const isActive = selectedBg === preset.id
              return (
                <button
                  key={preset.id}
                  onClick={() => handleBgSelect(preset)}
                  className="group flex flex-col gap-1.5 text-left"
                >
                  <div
                    className="w-full rounded-lg overflow-hidden transition-all duration-200"
                    style={{
                      aspectRatio: '16/10',
                      background: preset.type === 'theme' ? activeTheme.background : preset.value,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: isActive
                        ? '2px solid rgb(var(--accent) / 0.5)'
                        : '2px solid rgba(255,255,255,0.06)',
                      boxShadow: isActive ? '0 0 0 2px rgb(var(--accent) / 0.1)' : undefined,
                    }}
                  />
                  <span
                    className="text-[10px] font-medium truncate"
                    style={{ color: isActive ? 'var(--text-primary)' : 'var(--muted)' }}
                  >
                    {preset.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Custom URL */}
          <div
            className="rounded-lg p-4"
            style={{
              background: 'rgb(var(--s1) / 0.5)',
              border: '1px solid var(--border)',
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
              Custom Image URL
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1"
                placeholder="https://example.com/background.jpg"
                value={customUrl}
                onChange={(e) => {
                  setCustomUrl(e.target.value)
                  if (selectedBg === 'custom') setSelectedBg('theme-default')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyCustom()}
              />
              <button
                className="btn-primary"
                onClick={handleApplyCustom}
                disabled={!customUrl.trim()}
              >
                Apply
              </button>
            </div>
            {selectedBg === 'custom' && (
              <p className="text-xs mt-2" style={{ color: 'var(--status-green)' }}>
                Custom background applied.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

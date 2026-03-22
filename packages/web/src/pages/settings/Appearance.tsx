import { useEffect, useState } from 'react'

const PRESETS = [
  {
    id: 'default',
    label: 'Default',
    value: "url('/background.png')",
    preview: "url('/background.png')",
  },
  {
    id: 'midnight',
    label: 'Midnight',
    value: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 50%, #07111f 100%)',
    preview: 'linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 50%, #07111f 100%)',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    value: 'linear-gradient(135deg, #0d1b2a 0%, #1a2a1a 40%, #0a1a2a 100%)',
    preview: 'linear-gradient(135deg, #0d1b2a 0%, #1a2a1a 40%, #0a1a2a 100%)',
  },
  {
    id: 'nebula',
    label: 'Nebula',
    value: 'linear-gradient(135deg, #1a0a2e 0%, #0d1a3e 50%, #1a0a1a 100%)',
    preview: 'linear-gradient(135deg, #1a0a2e 0%, #0d1a3e 50%, #1a0a1a 100%)',
  },
  {
    id: 'void',
    label: 'Void',
    value: 'linear-gradient(135deg, #050505 0%, #0a0a14 100%)',
    preview: 'linear-gradient(135deg, #050505 0%, #0a0a14 100%)',
  },
  {
    id: 'deep-ocean',
    label: 'Deep Ocean',
    value: 'linear-gradient(135deg, #020b18 0%, #041830 50%, #051020 100%)',
    preview: 'linear-gradient(135deg, #020b18 0%, #041830 50%, #051020 100%)',
  },
  {
    id: 'ember',
    label: 'Ember',
    value: 'linear-gradient(135deg, #1a0a00 0%, #2a1000 50%, #1a0500 100%)',
    preview: 'linear-gradient(135deg, #1a0a00 0%, #2a1000 50%, #1a0500 100%)',
  },
]

const STORAGE_KEY = 'rascal:background'

function applyBackground(value: string) {
  document.body.style.backgroundImage = value
}

export default function SettingsAppearance() {
  const [selected, setSelected] = useState<string>('default')
  const [customUrl, setCustomUrl] = useState('')
  const [customApplied, setCustomApplied] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    const preset = PRESETS.find((p) => p.id === saved)
    if (preset) {
      setSelected(preset.id)
    } else {
      // custom URL
      setSelected('custom')
      setCustomUrl(saved.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, ''))
      setCustomApplied(true)
    }
  }, [])

  function handleSelect(preset: (typeof PRESETS)[number]) {
    setSelected(preset.id)
    setCustomApplied(false)
    applyBackground(preset.value)
    localStorage.setItem(STORAGE_KEY, preset.id)
  }

  function handleApplyCustom() {
    if (!customUrl.trim()) return
    const value = `url('${customUrl.trim()}')`
    setSelected('custom')
    setCustomApplied(true)
    applyBackground(value)
    localStorage.setItem(STORAGE_KEY, value)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Appearance
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Customize the background of your workspace.
          </p>
        </div>

        {/* Preset grid */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
            Background Presets
          </p>
          <div className="grid grid-cols-4 gap-3">
            {PRESETS.map((preset) => {
              const isActive = selected === preset.id
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelect(preset)}
                  className="group flex flex-col gap-2 text-left"
                >
                  <div
                    className="w-full rounded-lg overflow-hidden transition-all"
                    style={{
                      aspectRatio: '16/9',
                      backgroundImage: preset.preview,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: isActive
                        ? '2px solid rgb(var(--accent))'
                        : '2px solid rgba(255,255,255,0.08)',
                      boxShadow: isActive ? '0 0 0 2px rgba(245,158,11,0.2)' : undefined,
                    }}
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: isActive ? 'rgb(var(--accent))' : 'var(--subtle)' }}
                  >
                    {preset.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Custom URL */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
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
                setCustomApplied(false)
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
          {selected === 'custom' && customApplied && (
            <p className="text-xs mt-2" style={{ color: 'var(--status-green)' }}>
              Custom background applied.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

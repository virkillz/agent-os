import { useState } from 'react'
import { type Agent } from '../../api.ts'

const DEFAULT_AVATARS = Array.from({ length: 15 }, (_, i) => `/default_avatar/avatar_${i + 1}.jpg`)
const PIXEL_AVATARS = Array.from({ length: 17 }, (_, i) => `/pixel_avatar/avatar_${i + 1}.jpg`)
const AVATAR_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#f97316']

export function AvatarSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: Partial<Agent & { systemPrompt: string }>) => Promise<unknown>
}) {
  const [tab, setTab] = useState<'default' | 'pixel' | 'custom'>('default')
  const [selectedUrl, setSelectedUrl] = useState(agent.avatar_url)
  const [selectedColor, setSelectedColor] = useState(agent.avatar_color)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ avatarUrl: selectedUrl, avatarColor: selectedColor } as Parameters<typeof onSave>[0])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setSelectedUrl(result)
      setTab('custom')
    }
    reader.readAsDataURL(file)
  }

  const avatarList = tab === 'pixel' ? PIXEL_AVATARS : DEFAULT_AVATARS

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in space-y-6">

        {/* Preview */}
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0 overflow-hidden"
            style={{
              backgroundColor: selectedColor + '33',
              border: `1px solid ${selectedColor}66`,
              color: selectedColor,
            }}
          >
            {selectedUrl ? (
              <img src={selectedUrl} alt={agent.name} className="w-full h-full object-cover" />
            ) : (
              agent.name[0].toUpperCase()
            )}
          </div>
          <div>
            <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{agent.name}</div>
            <div className="text-xs text-muted">{agent.role}</div>
          </div>
        </div>

        {/* Color picker */}
        <div>
          <label className="block text-xs font-medium text-subtle mb-2">Accent color</label>
          <div className="flex gap-2 flex-wrap">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedColor(c)}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c,
                  outline: selectedColor === c ? `2px solid ${c}` : '2px solid transparent',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 mb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {(['default', 'pixel', 'custom'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 py-1.5 text-xs font-medium capitalize transition-colors"
                style={{
                  color: tab === t ? 'var(--text-primary)' : 'var(--muted)',
                  borderBottom: `2px solid ${tab === t ? 'rgb(var(--accent))' : 'transparent'}`,
                  marginBottom: '-1px',
                }}
              >
                {t === 'default' ? 'Default' : t === 'pixel' ? 'Pixel' : 'Custom'}
              </button>
            ))}
          </div>

          {tab === 'custom' ? (
            <div className="space-y-3">
              <label
                className="flex flex-col items-center justify-center gap-2 rounded-xl cursor-pointer transition-colors hover:bg-white/5"
                style={{ border: '2px dashed rgba(255,255,255,0.15)', padding: '2rem' }}
              >
                <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-xs text-muted">Click to upload an image</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </label>
              {selectedUrl?.startsWith('data:') && (
                <div className="flex justify-center">
                  <img src={selectedUrl} alt="preview" className="w-20 h-20 rounded-xl object-cover" />
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {avatarList.map((url) => (
                <button
                  key={url}
                  onClick={() => setSelectedUrl(url)}
                  className="rounded-xl overflow-hidden transition-transform hover:scale-105 aspect-square"
                  style={{
                    outline: selectedUrl === url ? `2px solid rgb(var(--accent))` : '2px solid transparent',
                    outlineOffset: '2px',
                  }}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save avatar'}
          </button>
          {saved && <span className="text-xs text-green-400">Saved</span>}
        </div>
      </div>
    </div>
  )
}

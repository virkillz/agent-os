import { useState, useRef } from 'react'
import { useStore } from '../../store.ts'

export default function SettingsCompany() {
  const { settings, updateSettings } = useStore()
  const [logo, setLogo] = useState(settings?.companyLogo ?? '/rascals.png')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updateSettings({ companyLogo: logo })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') setLogo(ev.target.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Branding
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Customize the platform logo.
          </p>
        </div>

        {/* Logo */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
            Logo
          </p>
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0"
              style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
            >
              <img
                src={logo}
                alt="Logo"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = '/rascals.png' }}
              />
            </div>
            <div className="space-y-2">
              <button
                className="btn-ghost text-xs px-3 py-1.5"
                onClick={() => fileRef.current?.click()}
              >
                Upload image
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <p className="text-xs" style={{ color: 'var(--muted)' }}>PNG, JPG up to 2MB</p>
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useStore } from '../../store.ts'

const DEFAULT_PLATFORM_PROMPT =
  'You are an AI agent working for {company_name}. You have access to the working directory at {working_directory}. Follow the Standard Operating Procedure in SOP.md and your job description.'

export default function SettingsPrompt() {
  const { settings, updateSettings } = useStore()
  const [prompt, setPrompt] = useState(settings?.platformPrompt ?? DEFAULT_PLATFORM_PROMPT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await updateSettings({ platformPrompt: prompt })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setPrompt(DEFAULT_PLATFORM_PROMPT)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Platform Prompt
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            The base system prompt injected into every agent session. Applied before role and identity prompts.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Prompt
            </p>
            <button className="btn-ghost text-xs px-2 py-1" onClick={handleReset}>
              Reset to default
            </button>
          </div>
          <textarea
            className="input w-full resize-none"
            style={{ minHeight: '180px' }}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={DEFAULT_PLATFORM_PROMPT}
          />
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            Available variables: <code style={{ color: 'var(--subtle)' }}>{'{company_name}'}</code>, <code style={{ color: 'var(--subtle)' }}>{'{working_directory}'}</code>
          </p>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

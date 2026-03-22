import { useState } from 'react'
import { type Agent } from '../../api.ts'

export function ProfileSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: Partial<Agent & { systemPrompt: string }>) => Promise<unknown>
}) {
  const [name, setName] = useState(agent.name)
  const [role, setRole] = useState(agent.role)
  const [description, setDescription] = useState(agent.description)
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ name, role, description, systemPrompt })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-subtle mb-1.5">Role</label>
              <input className="input" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">Description</label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short bio for the roster card..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-subtle mb-1.5">System prompt</label>
            <textarea
              className="input resize-none h-48 font-mono text-xs"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="How should this agent behave?"
            />
            <p className="text-[10px] text-muted mt-1">
              Changes take effect on the next message. Current session will reset.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            {saved && <span className="text-xs text-green-400">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

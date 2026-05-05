import { useEffect, useState } from 'react'
import { api, type Agent, type Skill } from '../../api.ts'

export function SkillsSection({
  agent,
  onSave,
}: {
  agent: Agent
  onSave: (data: { modelConfig: object }) => Promise<unknown>
}) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const allowedSkills: string[] | undefined = agent.modelConfig?.allowedSkills

  useEffect(() => {
    api.skills.list().then(setSkills).finally(() => setLoading(false))
  }, [])

  async function toggle(skillName: string, currentlyEnabled: boolean) {
    setSaving(skillName)
    try {
      let next: string[] | undefined
      if (currentlyEnabled) {
        const current = allowedSkills ?? skills.map((s) => s.name)
        next = current.filter((n) => n !== skillName)
        if (next.length === 0) next = undefined
      } else {
        const current = allowedSkills ?? []
        const next_ = [...current, skillName]
        next = next_.length === skills.length ? undefined : next_
      }
      await onSave({ modelConfig: { ...agent.modelConfig, allowedSkills: next } })
    } finally {
      setSaving(null)
    }
  }

  function isEnabled(skillName: string): boolean {
    if (!allowedSkills) return true
    return allowedSkills.includes(skillName)
  }

  const workspaceSkills = skills.filter((s) => s.source === 'workspace')
  const globalSkills = skills.filter((s) => s.source === 'global')

  function renderSkillRow(skill: Skill) {
    const enabled = isEnabled(skill.name)
    return (
      <div
        key={skill.name}
        className="flex items-center gap-3 rounded-lg px-4 py-3"
        style={{ background: 'rgb(var(--s1) / 0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {skill.name}
            </span>
            {skill.source === 'global' && (
              <span className="text-[10px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-full">
                Global
              </span>
            )}
          </div>
          {skill.description && (
            <p className="text-xs text-muted truncate">{skill.description}</p>
          )}
        </div>
        <button
          onClick={() => toggle(skill.name, enabled)}
          disabled={saving === skill.name}
          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
            enabled ? 'bg-accent' : 'bg-white/[0.07]'
          }`}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in space-y-6">
        <p className="text-xs text-muted">
          Control which skills this agent can use. Install new skills from the{' '}
          <a href="/settings/skills" className="text-accent hover:underline">
            Skills page
          </a>
          .
        </p>

        {loading && <p className="text-sm text-muted py-4">Loading…</p>}

        {!loading && skills.length === 0 && (
          <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-gray-700 rounded-xl">
            No skills installed yet. Go to the Skills page to install some.
          </div>
        )}

        {/* Workspace skills */}
        {workspaceSkills.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Workspace
            </p>
            {workspaceSkills.map(renderSkillRow)}
          </div>
        )}

        {/* Global skills */}
        {globalSkills.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Global
            </p>
            {globalSkills.map(renderSkillRow)}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api, type Skill } from '../../api.ts'

export default function SettingsSkills() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [repo, setRepo] = useState('')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadSkills() {
    try {
      const data = await api.skills.list()
      setSkills(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSkills() }, [])

  async function handleInstall() {
    const trimmed = repo.trim()
    if (!trimmed) return
    setInstalling(true)
    setError('')
    try {
      await api.skills.install(trimmed)
      setRepo('')
      await loadSkills()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  async function handleUninstall(name: string) {
    try {
      await api.skills.uninstall(name)
      await loadSkills()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const workspaceSkills = skills.filter((s) => s.source === 'workspace')
  const globalSkills = skills.filter((s) => s.source === 'global')

  const globalPath =
    typeof window !== 'undefined' && navigator.platform.toLowerCase().includes('win')
      ? '%APPDATA%\\AgentOS\\skills'
      : navigator.platform.toLowerCase().includes('linux')
      ? '~/.local/share/agents/skills'
      : '~/.agents/skills'

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Workspace Skills */}
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Workspace Skills</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Install SKILL.md files from GitHub. Skills are shared across this workspace and can be
              selectively enabled per agent from the agent's Skills tab.
            </p>
          </div>

          {/* Install form */}
          <div className="card p-4 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Install from GitHub
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1 font-mono"
                placeholder="user/repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
              />
              <button
                onClick={handleInstall}
                disabled={installing || !repo.trim()}
                className="btn-primary"
              >
                {installing ? 'Installing…' : 'Install'}
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Fetches SKILL.md from the default branch of the repository.
            </p>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          {/* Installed workspace skills */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Installed ({workspaceSkills.length})
            </h3>

            {loading && <p className="text-sm py-4" style={{ color: 'var(--muted)' }}>Loading…</p>}

            {!loading && workspaceSkills.length === 0 && (
              <div
                className="text-center py-10 text-sm border border-dashed rounded-xl"
                style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
              >
                No workspace skills installed yet.
              </div>
            )}

            <div className="space-y-2">
              {workspaceSkills.map((skill) => (
                <div key={skill.name} className="card flex items-start gap-3 p-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                    style={{ background: 'rgb(var(--accent) / 0.1)', border: '1px solid rgb(var(--accent) / 0.2)' }}
                  >
                    ⚡
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{skill.name}</span>
                      <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full">
                        Installed
                      </span>
                    </div>
                    {skill.description && (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{skill.description}</p>
                    )}
                    {skill.repo && (
                      <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--subtle)' }}>{skill.repo}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleUninstall(skill.name)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs border border-border rounded-lg hover:border-red-400/40 hover:text-red-400 transition-colors"
                    style={{ color: 'var(--muted)' }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* Global Skills */}
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Global Skills</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Skills placed manually in{' '}
              <code
                className="px-1 py-0.5 rounded text-[11px] font-mono"
                style={{ background: 'rgb(var(--s1) / 0.8)', color: 'var(--text-primary)' }}
              >
                {globalPath}
              </code>{' '}
              are automatically available across all AgentOS workspaces on this machine.
              Each subdirectory should contain a <code className="font-mono">SKILL.md</code> file.
            </p>
          </div>

          {!loading && globalSkills.length === 0 && (
            <div
              className="text-center py-8 text-sm border border-dashed rounded-xl"
              style={{ color: 'var(--muted)', borderColor: 'var(--border)' }}
            >
              No global skills detected.
            </div>
          )}

          {globalSkills.length > 0 && (
            <div className="space-y-2">
              {globalSkills.map((skill) => (
                <div key={skill.name} className="card flex items-start gap-3 p-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}
                  >
                    ⚡
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{skill.name}</span>
                      <span className="text-[10px] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-full">
                        Global
                      </span>
                    </div>
                    {skill.description && (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{skill.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

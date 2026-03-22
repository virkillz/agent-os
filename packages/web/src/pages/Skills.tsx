import { useEffect, useState } from 'react'
import { api, type Skill } from '../api.ts'

export default function Skills() {
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

  return (
    <div className="p-6 max-w-2xl mx-auto bg-gray-900/80 backdrop-blur-md mt-6 rounded-md">
      <h1 className="text-2xl font-bold mb-1">Skills</h1>
      <p className="text-sm text-gray-400 mb-6">
        Install SKILL.md files from GitHub. Skills are shared across the workspace and can be
        selectively enabled per agent from the agent's Skills tab.
      </p>

      {/* Install form */}
      <div className="mb-8">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Install from GitHub
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 font-mono"
            placeholder="user/repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
          />
          <button
            onClick={handleInstall}
            disabled={installing || !repo.trim()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5">
          Fetches SKILL.md from the default branch of the repository.
        </p>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>

      {/* Installed skills */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Installed ({skills.length})
        </h2>

        {loading && (
          <p className="text-sm text-gray-500 py-4">Loading…</p>
        )}

        {!loading && skills.length === 0 && (
          <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-gray-700 rounded-xl">
            No skills installed yet. Install one using the form above.
          </div>
        )}

        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="flex items-start gap-3 bg-gray-800 border border-gray-700 rounded-xl p-4"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-900/50 border border-purple-700/50 flex items-center justify-center flex-shrink-0 text-sm">
                ⚡
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm">{skill.name}</span>
                  <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">
                    Installed
                  </span>
                </div>
                {skill.description && (
                  <p className="text-xs text-gray-400 mb-1">{skill.description}</p>
                )}
                {skill.repo && (
                  <p className="text-xs text-gray-600 font-mono">{skill.repo}</p>
                )}
              </div>
              <button
                onClick={() => handleUninstall(skill.name)}
                className="flex-shrink-0 px-3 py-1.5 text-xs bg-gray-700 hover:bg-red-900 hover:text-red-300 rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

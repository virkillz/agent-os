import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { loadSkillsFromDir } from '@mariozechner/pi-coding-agent'
import { getGlobalSkillsDir } from '../agent-runner.js'

export function createSkillsRouter(dataDir: string): Router {
  const router = Router()
  const skillsDir = path.join(dataDir, 'skills')

  function ensureSkillsDir() {
    fs.mkdirSync(skillsDir, { recursive: true })
  }

  // GET /api/skills — list workspace-installed and global skills
  router.get('/', (_req, res) => {
    ensureSkillsDir()
    const globalDir = getGlobalSkillsDir()

    // Workspace skills (installable via GitHub)
    const { skills: workspaceSkills } = loadSkillsFromDir({ dir: skillsDir, source: 'workspace' })
    const workspaceResult = workspaceSkills.map((skill) => {
      const metaPath = path.join(path.dirname(skill.filePath), '.source.json')
      let repo: string | null = null
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { repo?: string }
        repo = meta.repo ?? null
      } catch { /* no meta file */ }
      return { name: skill.name, description: skill.description, repo, source: 'workspace' as const }
    })

    // Global skills (manually placed in ~/.agents/skills or OS equivalent)
    type SkillEntry = { name: string; description: string; repo: string | null; source: 'workspace' | 'global' }
    let globalResult: SkillEntry[] = []
    if (fs.existsSync(globalDir)) {
      try {
        const { skills: globalSkills } = loadSkillsFromDir({ dir: globalDir, source: 'global' })
        globalResult = globalSkills.map((skill) => ({
          name: skill.name,
          description: skill.description,
          repo: null,
          source: 'global' as const,
        }))
      } catch { /* ignore unreadable global dir */ }
    }

    // Workspace skills take priority — deduplicate by name
    const workspaceNames = new Set(workspaceResult.map((s) => s.name))
    const dedupedGlobal = globalResult.filter((s) => !workspaceNames.has(s.name))

    res.json([...workspaceResult, ...dedupedGlobal])
  })

  // POST /api/skills/install — install from GitHub user/repo
  router.post('/install', async (req, res) => {
    const { repo, branch = 'HEAD' } = req.body as { repo?: string; branch?: string }

    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return res.status(400).json({ error: 'Invalid repo format. Expected user/repo' })
    }

    const repoName = repo.split('/')[1]
    const skillDir = path.join(skillsDir, repoName)

    if (fs.existsSync(skillDir)) {
      return res.status(409).json({ error: `Skill "${repoName}" is already installed` })
    }

    const url = `https://raw.githubusercontent.com/${repo}/${branch}/SKILL.md`

    try {
      const response = await fetch(url)
      if (!response.ok) {
        return res.status(404).json({ error: `No SKILL.md found at ${repo} (branch: ${branch})` })
      }
      const content = await response.text()

      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8')
      fs.writeFileSync(
        path.join(skillDir, '.source.json'),
        JSON.stringify({ repo, branch }),
        'utf-8',
      )

      // Parse name from newly written skill
      const { skills } = loadSkillsFromDir({ dir: skillsDir, source: 'workspace' })
      const installed = skills.find((s) => path.dirname(s.filePath) === skillDir)

      res.status(201).json({ ok: true, name: installed?.name ?? repoName, description: installed?.description ?? '' })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Install failed' })
    }
  })

  // DELETE /api/skills/:name — uninstall a skill by directory name
  router.delete('/:name', (req, res) => {
    const { name } = req.params
    if (!/^[\w.-]+$/.test(name)) {
      return res.status(400).json({ error: 'Invalid skill name' })
    }

    const skillDir = path.join(skillsDir, name)
    if (!fs.existsSync(skillDir)) {
      return res.status(404).json({ error: 'Skill not found' })
    }

    fs.rmSync(skillDir, { recursive: true, force: true })
    res.json({ ok: true })
  })

  return router
}

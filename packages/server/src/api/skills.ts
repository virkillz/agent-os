import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { loadSkillsFromDir } from '@mariozechner/pi-coding-agent'

export function createSkillsRouter(workspaceDir: string): Router {
  const router = Router()
  const skillsDir = path.join(workspaceDir, 'skills')

  function ensureSkillsDir() {
    fs.mkdirSync(skillsDir, { recursive: true })
  }

  // GET /api/skills — list installed skills
  router.get('/', (_req, res) => {
    ensureSkillsDir()
    const { skills } = loadSkillsFromDir({ dir: skillsDir, source: 'workspace' })

    const result = skills.map((skill) => {
      const metaPath = path.join(path.dirname(skill.filePath), '.source.json')
      let repo: string | null = null
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { repo?: string }
        repo = meta.repo ?? null
      } catch { /* no meta file */ }
      return { name: skill.name, description: skill.description, repo }
    })

    res.json(result)
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

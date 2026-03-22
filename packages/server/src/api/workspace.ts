import express, { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { eventBus } from '../event-bus.js'

export interface FileEntry {
  path: string
  name: string
  size_bytes: number
  mime_type: string
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

function scanDir(dir: string, base: string, results: FileEntry[] = []): FileEntry[] {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    const rel = path.join(base, entry.name)
    if (entry.isDirectory()) {
      scanDir(abs, rel, results)
    } else {
      const stat = fs.statSync(abs)
      results.push({
        path: rel.replace(/\\/g, '/'),
        name: entry.name,
        size_bytes: stat.size,
        mime_type: 'application/octet-stream',
        uploaded_by: null,
        created_at: stat.birthtime.toISOString(),
        updated_at: stat.mtime.toISOString(),
      })
    }
  }
  return results
}

function safeResolve(workspaceDir: string, relativePath: string): string | null {
  const resolved = path.resolve(workspaceDir, relativePath)
  if (!resolved.startsWith(path.resolve(workspaceDir))) return null
  return resolved
}

export function createWorkspaceRouter(workspaceDir: string): Router {
  const router = Router()

  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      const subdir = (req.query.subdir as string | undefined) ?? ''
      const dest = subdir ? path.join(workspaceDir, subdir) : workspaceDir
      fs.mkdirSync(dest, { recursive: true })
      cb(null, dest)
    },
    filename: (_req, file, cb) => cb(null, file.originalname),
  })
  const upload = multer({ storage })

  // GET /api/workspace — list all files
  router.get('/', (_req, res) => {
    const files = scanDir(workspaceDir, '')
    res.json(files)
  })

  // GET /api/workspace/download?path=...
  router.get('/download', (req, res) => {
    const relPath = req.query.path as string | undefined
    if (!relPath) {
      res.status(400).json({ error: 'path is required' })
      return
    }
    const abs = safeResolve(workspaceDir, relPath)
    if (!abs || !fs.existsSync(abs)) {
      res.status(404).json({ error: 'File not found' })
      return
    }
    res.sendFile(abs)
  })

  // POST /api/workspace/upload
  router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }
    const subdir = (req.query.subdir as string | undefined) ?? ''
    const relPath = subdir
      ? `${subdir}/${req.file.filename}`.replace(/\\/g, '/')
      : req.file.filename

    const entry: FileEntry = {
      path: relPath,
      name: req.file.originalname,
      size_bytes: req.file.size,
      mime_type: req.file.mimetype,
      uploaded_by: (req.query.agentId as string | undefined) ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    eventBus.emit({ type: 'workspace:change', path: relPath, action: 'created' })
    res.status(201).json(entry)
  })

  // GET /api/workspace/preview/:templateId/* — serve static files built by agents
  // Agents can build HTML/React apps in workspace/<templateId>/dashboard/ and
  // have them served here for display in custom UI panels.
  router.get('/preview/:templateId/*', (req, res) => {
    const templateId = req.params.templateId
    const filePath = (req.params as Record<string, string>)[0] ?? 'index.html'

    // Prevent path traversal
    const safePath = filePath.split('/').filter((p) => p !== '..' && p !== '.').join('/')
    const abs = path.join(workspaceDir, templateId, safePath)

    if (!abs.startsWith(path.resolve(workspaceDir))) {
      res.status(400).json({ error: 'Invalid path' })
      return
    }

    if (!fs.existsSync(abs)) {
      res.status(404).send('Not found')
      return
    }

    res.sendFile(abs)
  })

  // PUT /api/workspace/content?path=... — save text file content
  router.put('/content', express.text({ type: '*/*', limit: '10mb' }), (req, res) => {
    const relPath = req.query.path as string | undefined
    if (!relPath) {
      res.status(400).json({ error: 'path is required' })
      return
    }
    const abs = safeResolve(workspaceDir, relPath)
    if (!abs) {
      res.status(400).json({ error: 'Invalid path' })
      return
    }
    const content = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf-8')
    eventBus.emit({ type: 'workspace:change', path: relPath, action: 'updated' })
    res.json({ ok: true })
  })

  // DELETE /api/workspace?path=...
  router.delete('/', (req, res) => {
    const relPath = req.query.path as string | undefined
    if (!relPath) {
      res.status(400).json({ error: 'path is required' })
      return
    }
    const abs = safeResolve(workspaceDir, relPath)
    if (!abs || !fs.existsSync(abs)) {
      res.status(404).json({ error: 'File not found' })
      return
    }
    fs.rmSync(abs, { force: true })
    eventBus.emit({ type: 'workspace:change', path: relPath, action: 'deleted' })
    res.json({ ok: true })
  })

  return router
}

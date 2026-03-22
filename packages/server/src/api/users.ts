import { Router } from 'express'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { getDb, type UserRow } from '../db.js'
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  requireAuth,
  requireAdmin,
  SESSION_COOKIE,
  type AuthRequest,
} from '../auth.js'

let _userAvatarsDir = path.join(process.cwd(), 'data', 'user_avatars')
export function setUserAvatarsDir(dir: string) {
  _userAvatarsDir = dir
}

const AVATAR_COLORS = [
  '#7c6af7', '#f76a6a', '#6af7a0', '#f7c46a',
  '#6ac5f7', '#f76ac0', '#a0f76a', '#f7906a',
]
function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

function safeUser(row: UserRow) {
  const { password_hash: _, ...safe } = row
  return safe
}

export function createUsersRouter(): Router {
  const router = Router()

  // POST /api/users/login
  router.post('/login', async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string }
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'username and password required' })
    }

    const user = getDb()
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username.trim().toLowerCase()) as unknown as UserRow | undefined

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = createSession(user.id)
    res
      .cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      })
      .json(safeUser(user))
  })

  // POST /api/users/logout
  router.post('/logout', (req: AuthRequest, res) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined
    if (token) destroySession(token)
    res.clearCookie(SESSION_COOKIE).json({ ok: true })
  })

  // GET /api/users/me — current session
  router.get('/me', requireAuth, (req: AuthRequest, res) => {
    res.json(safeUser(req.user!))
  })

  // GET /api/users — all human users (authenticated)
  router.get('/', requireAuth, (_req, res) => {
    const users = getDb().prepare('SELECT * FROM users ORDER BY created_at ASC').all() as unknown as UserRow[]
    res.json(users.map(safeUser))
  })

  // POST /api/users — create human user (admin only)
  router.post('/', requireAdmin, async (req: AuthRequest, res) => {
    const { username, displayName, password, isAdmin } = req.body as {
      username?: string
      displayName?: string
      password?: string
      isAdmin?: boolean
    }

    if (!username?.trim()) return res.status(400).json({ error: 'username required' })
    if (!displayName?.trim()) return res.status(400).json({ error: 'displayName required' })
    if (!password) return res.status(400).json({ error: 'password required' })

    if (isAdmin) {
      const existingAdmin = getDb().prepare('SELECT id FROM users WHERE is_admin = 1').get()
      if (existingAdmin) return res.status(409).json({ error: 'An admin already exists. The system only supports one admin.' })
    }

    const existing = getDb()
      .prepare('SELECT id FROM users WHERE username = ?')
      .get(username.trim().toLowerCase())
    if (existing) return res.status(409).json({ error: 'Username already taken' })

    const id = randomUUID()
    const hash = await hashPassword(password)
    getDb()
      .prepare('INSERT INTO users (id, username, display_name, avatar_color, password_hash, is_admin) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, username.trim().toLowerCase(), displayName.trim(), randomColor(), hash, isAdmin ? 1 : 0)

    const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow
    res.status(201).json(safeUser(user))
  })

  // PUT /api/users/:id — update display name / password / bio (admin or self)
  router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
    const target = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as unknown as UserRow | undefined
    if (!target) return res.status(404).json({ error: 'User not found' })

    const isSelf = req.user!.id === target.id
    const isAdmin = !!req.user!.is_admin
    if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Forbidden' })

    const { displayName, password, avatarColor, bio } = req.body as {
      displayName?: string
      password?: string
      avatarColor?: string
      bio?: string
    }

    const hash = password ? await hashPassword(password) : target.password_hash

    getDb()
      .prepare('UPDATE users SET display_name = ?, password_hash = ?, avatar_color = ?, bio = ? WHERE id = ?')
      .run(
        displayName?.trim() ?? target.display_name,
        hash,
        avatarColor ?? target.avatar_color,
        bio !== undefined ? bio.trim() : target.bio,
        target.id,
      )

    const updated = getDb().prepare('SELECT * FROM users WHERE id = ?').get(target.id) as unknown as UserRow
    res.json(safeUser(updated))
  })

  // POST /api/users/:id/avatar — upload avatar image (self or admin)
  router.post('/:id/avatar', requireAuth, (req: AuthRequest, res) => {
    const target = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as unknown as UserRow | undefined
    if (!target) return res.status(404).json({ error: 'User not found' })

    const isSelf = req.user!.id === target.id
    const isAdmin = !!req.user!.is_admin
    if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Forbidden' })

    fs.mkdirSync(_userAvatarsDir, { recursive: true })
    const storage = multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, _userAvatarsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg'
        cb(null, `${target.id}${ext}`)
      },
    })
    multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }).single('avatar')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message })
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

      const avatarUrl = `/user_avatars/${req.file.filename}`
      getDb()
        .prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
        .run(avatarUrl, target.id)

      const updated = getDb().prepare('SELECT * FROM users WHERE id = ?').get(target.id) as unknown as UserRow
      res.json(safeUser(updated))
    })
  })

  // DELETE /api/users/:id — admin only; cannot delete yourself
  router.delete('/:id', requireAdmin, (req: AuthRequest, res) => {
    if (req.user!.id === req.params.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }
    const target = getDb().prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)
    if (!target) return res.status(404).json({ error: 'User not found' })

    getDb().prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  })

  return router
}

// POST /api/setup — first-run admin account creation (no auth required)
export function createSetupRouter(): Router {
  const router = Router()

  router.post('/', async (req, res) => {
    const userCount = (getDb().prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
    if (userCount > 0) {
      return res.status(409).json({ error: 'Platform already initialized' })
    }

    const { username, displayName, password, companyName } = req.body as {
      username?: string
      displayName?: string
      password?: string
      companyName?: string
    }

    if (!username?.trim()) return res.status(400).json({ error: 'username required' })
    if (!displayName?.trim()) return res.status(400).json({ error: 'displayName required' })
    if (!password) return res.status(400).json({ error: 'password required' })
    if (!companyName?.trim()) return res.status(400).json({ error: 'companyName required' })

    const id = randomUUID()
    const hash = await hashPassword(password)
    getDb()
      .prepare('INSERT INTO users (id, username, display_name, avatar_color, password_hash, is_admin) VALUES (?, ?, ?, ?, ?, 1)')
      .run(id, username.trim().toLowerCase(), displayName.trim(), '#7c6af7', hash)

    // Store company settings
    const db = getDb()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('company_name', companyName.trim())
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'platform_prompt',
      'You are an AI agent working for {company_name}. You have access to the working directory at {working_directory}. Follow the Standard Operating Procedure in SOP.md and your job description.',
    )

    const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow
    const token = createSession(id)
    const { password_hash: _, ...safe } = user

    res
      .cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 })
      .status(201)
      .json(safe)
  })

  return router
}

import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import { getDb } from './db.js'
import type { UserRow } from './db.js'

const scryptAsync = promisify(scrypt)

// ── Password helpers ──────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const derived = (await scryptAsync(password, salt, 64)) as Buffer
  const storedBuf = Buffer.from(hash, 'hex')
  if (derived.length !== storedBuf.length) return false
  return timingSafeEqual(derived, storedBuf)
}

// ── Session helpers ───────────────────────────────────────────────────────────

const SESSION_COOKIE = 'rascal_session'

export function createSession(userId: string): string {
  const token = randomUUID()
  getDb()
    .prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)')
    .run(token, userId)
  return token
}

export function destroySession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function getUserBySession(token: string): UserRow | null {
  const row = getDb()
    .prepare(`
      SELECT u.* FROM users u
      JOIN sessions s ON s.user_id = u.id
      WHERE s.token = ?
    `)
    .get(token) as UserRow | undefined
  return row ?? null
}

// ── Express middleware ────────────────────────────────────────────────────────

export interface AuthRequest extends Request {
  user?: UserRow
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  const user = getUserBySession(token)
  if (!user) {
    res.status(401).json({ error: 'Invalid session' })
    return
  }
  req.user = user
  next()
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user?.is_admin) {
      res.status(403).json({ error: 'Admin access required' })
      return
    }
    next()
  })
}

export { SESSION_COOKIE }

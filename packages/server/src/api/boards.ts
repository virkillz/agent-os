import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getDb, type BoardRow, type LaneRow, type CardRow, type LaneRuleRow, type CardEventRow } from '../db.js'
import { requireAuth, requireAdmin, type AuthRequest } from '../auth.js'
import { eventBus } from '../event-bus.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBoardFull(boardId: string) {
  const db = getDb()
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId) as unknown as BoardRow | undefined
  if (!board) return null
  const lanes = db.prepare('SELECT * FROM lanes WHERE board_id = ? ORDER BY position ASC').all(boardId) as unknown as LaneRow[]
  const cards = db.prepare('SELECT * FROM cards WHERE board_id = ? AND is_archived = 0 ORDER BY position ASC').all(boardId) as unknown as CardRow[]
  const rules = db.prepare(`
    SELECT lr.* FROM lane_rules lr
    JOIN lanes l ON l.id = lr.lane_id
    WHERE l.board_id = ?
  `).all(boardId) as unknown as LaneRuleRow[]
  return { ...board, lanes, cards, rules }
}

function getLaneName(laneId: string): string {
  const row = getDb().prepare('SELECT name FROM lanes WHERE id = ?').get(laneId) as { name: string } | undefined
  return row?.name ?? laneId
}

function insertEvent(
  cardId: string,
  boardId: string,
  actorId: string,
  actorType: string,
  action: string,
  meta: Record<string, unknown> = {},
): void {
  getDb().prepare(
    `INSERT INTO card_events (card_id, board_id, actor_id, actor_type, action, meta) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(cardId, boardId, actorId, actorType, action, JSON.stringify(meta))
}

/**
 * Check whether a given employee (user or agent) can move a card into a lane.
 * Returns true if allowed.
 */
function canMoveToLane(
  laneId: string,
  actorId: string,
  actorType: 'user' | 'agent',
): boolean {
  const db = getDb()
  const rules = db.prepare('SELECT * FROM lane_rules WHERE lane_id = ?').all(laneId) as unknown as LaneRuleRow[]
  if (rules.length === 0) return true // no rules = anyone can move

  for (const rule of rules) {
    if (rule.rule_type === 'admin_only') {
      if (actorType === 'user') {
        const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(actorId) as { is_admin: number } | undefined
        if (user?.is_admin) return true
      }
    } else if (rule.rule_type === 'employee') {
      if (rule.target_id === actorId) return true
    } else if (rule.rule_type === 'role') {
      if (actorType === 'agent') {
        const inRole = db.prepare('SELECT 1 FROM agent_roles WHERE agent_id = ? AND role_id = ?').get(actorId, rule.target_id!)
        if (inRole) return true
      }
    }
  }

  return false
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createBoardsRouter(): Router {
  const router = Router()

  // GET /api/boards — list boards
  router.get('/', requireAuth, (_req, res) => {
    const boards = getDb().prepare('SELECT * FROM boards ORDER BY created_at ASC').all() as unknown as BoardRow[]
    res.json(boards)
  })

  // GET /api/boards/lanes — list all lanes on the single board
  router.get('/lanes', requireAuth, (_req, res) => {
    const board = getDb().prepare('SELECT id FROM boards ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined
    if (!board) return res.status(404).json({ error: 'No board found' })
    const lanes = getDb().prepare('SELECT * FROM lanes WHERE board_id = ? ORDER BY position ASC').all(board.id) as unknown as LaneRow[]
    res.json(lanes)
  })

  // GET /api/boards/:id — board with lanes + cards + rules
  router.get('/:id', requireAuth, (req, res) => {
    const board = getBoardFull(req.params.id)
    if (!board) return res.status(404).json({ error: 'Board not found' })
    res.json(board)
  })

  // POST /api/boards (admin only) — single board enforced
  router.post('/', requireAdmin, (req: AuthRequest, res) => {
    const existing = (getDb().prepare('SELECT COUNT(*) as c FROM boards').get() as { c: number }).c
    if (existing > 0) return res.status(409).json({ error: 'A board already exists. Only one board is allowed.' })
    const { name } = req.body as { name?: string }
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    const id = randomUUID()
    getDb().prepare('INSERT INTO boards (id, name) VALUES (?, ?)').run(id, name.trim())
    const defaultLanes: { name: string; description: string; type: string }[] = [
      { name: 'Todo', description: 'Tasks ready to be picked up', type: 'todo' },
      { name: 'Doing', description: 'Tasks currently being worked on', type: 'in_progress' },
      { name: 'Done', description: 'Completed tasks', type: 'done' },
    ]
    defaultLanes.forEach(({ name, description, type }, i) => {
      getDb().prepare('INSERT INTO lanes (id, board_id, name, description, position, lane_type) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), id, name, description, i, type)
    })
    res.status(201).json(getBoardFull(id))
  })

  // PUT /api/boards/:id (admin only)
  router.put('/:id', requireAdmin, (req: AuthRequest, res) => {
    const { name } = req.body as { name?: string }
    const board = getDb().prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id) as unknown as BoardRow | undefined
    if (!board) return res.status(404).json({ error: 'Board not found' })
    getDb().prepare('UPDATE boards SET name = ? WHERE id = ?').run(name?.trim() ?? board.name, board.id)
    res.json(getBoardFull(board.id))
  })

  // DELETE /api/boards/:id (admin only)
  router.delete('/:id', requireAdmin, (_req, res) => {
    getDb().prepare('DELETE FROM boards WHERE id = ?').run(_req.params.id)
    res.json({ ok: true })
  })

  // ── Lanes ─────────────────────────────────────────────────────────────────

  // POST /api/boards/:id/lanes (admin only)
  router.post('/:id/lanes', requireAdmin, (req: AuthRequest, res) => {
    const { name, position, laneType } = req.body as { name?: string; position?: number; laneType?: string }
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    const board = getDb().prepare('SELECT id FROM boards WHERE id = ?').get(req.params.id)
    if (!board) return res.status(404).json({ error: 'Board not found' })
    const resolvedType = laneType ?? 'in_progress'
    if (!['todo', 'in_progress', 'done'].includes(resolvedType)) {
      return res.status(400).json({ error: 'laneType must be todo | in_progress | done' })
    }
    if (resolvedType === 'todo' || resolvedType === 'done') {
      const existing = getDb().prepare('SELECT id FROM lanes WHERE board_id = ? AND lane_type = ?').get(req.params.id, resolvedType)
      if (existing) return res.status(409).json({ error: `A ${resolvedType} lane already exists on this board` })
    }
    const pos = position ?? (getDb().prepare('SELECT COUNT(*) as c FROM lanes WHERE board_id = ?').get(req.params.id) as { c: number }).c
    const id = randomUUID()
    getDb().prepare('INSERT INTO lanes (id, board_id, name, position, lane_type) VALUES (?, ?, ?, ?, ?)').run(id, req.params.id, name.trim(), pos, resolvedType)
    res.status(201).json(getDb().prepare('SELECT * FROM lanes WHERE id = ?').get(id))
  })

  // PUT /api/boards/:boardId/lanes/:laneId (admin only)
  router.put('/:boardId/lanes/:laneId', requireAdmin, (req: AuthRequest, res) => {
    const lane = getDb().prepare('SELECT * FROM lanes WHERE id = ? AND board_id = ?').get(req.params.laneId, req.params.boardId) as LaneRow | undefined
    if (!lane) return res.status(404).json({ error: 'Lane not found' })
    const { name, position, laneType } = req.body as { name?: string; position?: number; laneType?: string }
    const resolvedType = laneType ?? lane.lane_type
    if (!['todo', 'in_progress', 'done'].includes(resolvedType)) {
      return res.status(400).json({ error: 'laneType must be todo | in_progress | done' })
    }
    if (laneType && laneType !== lane.lane_type && (laneType === 'todo' || laneType === 'done')) {
      const existing = getDb().prepare('SELECT id FROM lanes WHERE board_id = ? AND lane_type = ? AND id != ?').get(req.params.boardId, laneType, lane.id)
      if (existing) return res.status(409).json({ error: `A ${laneType} lane already exists on this board` })
    }
    getDb()
      .prepare('UPDATE lanes SET name = ?, position = ?, lane_type = ? WHERE id = ?')
      .run(name?.trim() ?? lane.name, position ?? lane.position, resolvedType, lane.id)
    res.json(getDb().prepare('SELECT * FROM lanes WHERE id = ?').get(lane.id))
  })

  // DELETE /api/boards/:boardId/lanes/:laneId (admin only)
  router.delete('/:boardId/lanes/:laneId', requireAdmin, (req: AuthRequest, res) => {
    const lane = getDb().prepare('SELECT id FROM lanes WHERE id = ? AND board_id = ?').get(req.params.laneId, req.params.boardId)
    if (!lane) return res.status(404).json({ error: 'Lane not found' })
    getDb().prepare('DELETE FROM lanes WHERE id = ?').run(req.params.laneId)
    res.json({ ok: true })
  })

  // ── Lane rules ────────────────────────────────────────────────────────────

  // GET /api/boards/:boardId/lanes/:laneId/rules
  router.get('/:boardId/lanes/:laneId/rules', requireAuth, (req, res) => {
    const rules = getDb().prepare('SELECT * FROM lane_rules WHERE lane_id = ?').all(req.params.laneId) as unknown as LaneRuleRow[]
    res.json(rules)
  })

  // POST /api/boards/:boardId/lanes/:laneId/rules (admin only)
  router.post('/:boardId/lanes/:laneId/rules', requireAdmin, (req: AuthRequest, res) => {
    const { ruleType, targetId } = req.body as { ruleType?: string; targetId?: string }
    if (!ruleType) return res.status(400).json({ error: 'ruleType required' })
    if (!['admin_only', 'role', 'employee'].includes(ruleType)) {
      return res.status(400).json({ error: 'ruleType must be admin_only | role | employee' })
    }
    const id = randomUUID()
    getDb().prepare('INSERT INTO lane_rules (id, lane_id, rule_type, target_id) VALUES (?, ?, ?, ?)').run(id, req.params.laneId, ruleType, targetId ?? null)
    res.status(201).json(getDb().prepare('SELECT * FROM lane_rules WHERE id = ?').get(id))
  })

  // DELETE /api/boards/:boardId/lanes/:laneId/rules/:ruleId (admin only)
  router.delete('/:boardId/lanes/:laneId/rules/:ruleId', requireAdmin, (req: AuthRequest, res) => {
    getDb().prepare('DELETE FROM lane_rules WHERE id = ? AND lane_id = ?').run(req.params.ruleId, req.params.laneId)
    res.json({ ok: true })
  })

  // ── Cards ─────────────────────────────────────────────────────────────────

  // POST /api/boards/:id/cards
  router.post('/:id/cards', requireAuth, (req: AuthRequest, res) => {
    const { laneId, title, description, result, assigneeId, assigneeType } = req.body as {
      laneId?: string
      title?: string
      description?: string
      result?: string
      assigneeId?: string
      assigneeType?: 'agent' | 'user'
    }
    if (!title?.trim()) return res.status(400).json({ error: 'title required' })

    // Resolve lane: use provided laneId or fall back to the todo lane
    let lane: { id: string; name: string } | undefined
    if (laneId?.trim()) {
      lane = getDb().prepare('SELECT id, name FROM lanes WHERE id = ? AND board_id = ?').get(laneId, req.params.id) as { id: string; name: string } | undefined
      if (!lane) return res.status(404).json({ error: 'Lane not found' })
    } else {
      lane = getDb().prepare("SELECT id, name FROM lanes WHERE board_id = ? AND lane_type = 'todo' LIMIT 1").get(req.params.id) as { id: string; name: string } | undefined
      if (!lane) return res.status(404).json({ error: 'No todo lane found on this board' })
    }

    const resolvedLaneId = lane.id
    const pos = (getDb().prepare('SELECT COUNT(*) as c FROM cards WHERE lane_id = ?').get(resolvedLaneId) as { c: number }).c
    const id = randomUUID()
    const actorId = req.user!.id
    const actorType = 'user'

    getDb().prepare(`
      INSERT INTO cards (id, board_id, lane_id, title, description, result, assignee_id, assignee_type, created_by, created_by_type, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.id, resolvedLaneId, title.trim(), description?.trim() ?? '', result?.trim() ?? '', assigneeId ?? null, assigneeType ?? null, actorId, actorType, pos)

    const card = getDb().prepare('SELECT * FROM cards WHERE id = ?').get(id) as unknown as CardRow
    insertEvent(id, req.params.id, actorId, actorType, 'created', { lane: lane.name, title: card.title })
    eventBus.emit({ type: 'board:card_moved', cardId: id, boardId: req.params.id, laneId: resolvedLaneId, title: card.title })
    res.status(201).json(card)
  })

  // PUT /api/boards/:boardId/cards/:cardId — update title/description/result/assignee
  router.put('/:boardId/cards/:cardId', requireAuth, (req: AuthRequest, res) => {
    const card = getDb().prepare('SELECT * FROM cards WHERE id = ? AND board_id = ?').get(req.params.cardId, req.params.boardId) as unknown as CardRow | undefined
    if (!card) return res.status(404).json({ error: 'Card not found' })

    const { title, description, result, assigneeId, assigneeType } = req.body as {
      title?: string
      description?: string
      result?: string
      assigneeId?: string | null
      assigneeType?: 'agent' | 'user' | null
    }

    const changed: string[] = []
    if (title !== undefined && title.trim() !== card.title) changed.push('title')
    if (description !== undefined && description.trim() !== card.description) changed.push('description')
    if (result !== undefined && result.trim() !== card.result) changed.push('result')
    if (assigneeId !== undefined && assigneeId !== card.assignee_id) changed.push('assignee')

    getDb().prepare(`
      UPDATE cards SET title = ?, description = ?, result = ?, assignee_id = ?, assignee_type = ?, updated_at = datetime('now') WHERE id = ?
    `).run(
      title?.trim() ?? card.title,
      description?.trim() ?? card.description,
      result?.trim() ?? card.result,
      assigneeId !== undefined ? assigneeId : card.assignee_id,
      assigneeType !== undefined ? assigneeType : card.assignee_type,
      card.id,
    )

    if (changed.length > 0) {
      insertEvent(card.id, req.params.boardId, req.user!.id, 'user', 'updated', { changed })
    }

    res.json(getDb().prepare('SELECT * FROM cards WHERE id = ?').get(card.id))
  })

  // POST /api/boards/:boardId/cards/:cardId/move — move card to a different lane
  router.post('/:boardId/cards/:cardId/move', requireAuth, (req: AuthRequest, res) => {
    const card = getDb().prepare('SELECT * FROM cards WHERE id = ? AND board_id = ?').get(req.params.cardId, req.params.boardId) as unknown as CardRow | undefined
    if (!card) return res.status(404).json({ error: 'Card not found' })

    const { laneId, position } = req.body as { laneId?: string; position?: number }
    if (!laneId?.trim()) return res.status(400).json({ error: 'laneId required' })

    const lane = getDb().prepare('SELECT id, name FROM lanes WHERE id = ? AND board_id = ?').get(laneId, req.params.boardId) as { id: string; name: string } | undefined
    if (!lane) return res.status(404).json({ error: 'Lane not found on this board' })

    // Check lane movement rules
    const actorId = req.user!.id
    if (!canMoveToLane(laneId, actorId, 'user')) {
      return res.status(403).json({ error: 'You do not have permission to move cards into this lane' })
    }

    const fromLaneName = getLaneName(card.lane_id)
    const pos = position ?? (getDb().prepare('SELECT COUNT(*) as c FROM cards WHERE lane_id = ?').get(laneId) as { c: number }).c
    getDb().prepare(`UPDATE cards SET lane_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?`).run(laneId, pos, card.id)

    insertEvent(card.id, req.params.boardId, actorId, 'user', 'moved', { from_lane: fromLaneName, to_lane: lane.name })

    const updated = getDb().prepare('SELECT * FROM cards WHERE id = ?').get(card.id) as unknown as CardRow
    eventBus.emit({ type: 'board:card_moved', cardId: card.id, boardId: req.params.boardId, laneId, title: updated.title })
    res.json(updated)
  })

  // DELETE /api/boards/:boardId/cards/:cardId
  router.delete('/:boardId/cards/:cardId', requireAuth, (req: AuthRequest, res) => {
    const card = getDb().prepare('SELECT * FROM cards WHERE id = ? AND board_id = ?').get(req.params.cardId, req.params.boardId) as unknown as CardRow | undefined
    if (!card) return res.status(404).json({ error: 'Card not found' })
    insertEvent(card.id, req.params.boardId, req.user!.id, 'user', 'deleted', { title: card.title })
    getDb().prepare('DELETE FROM cards WHERE id = ?').run(req.params.cardId)
    res.json({ ok: true })
  })

  // POST /api/boards/:boardId/cards/:cardId/archive
  router.post('/:boardId/cards/:cardId/archive', requireAuth, (req: AuthRequest, res) => {
    const card = getDb().prepare('SELECT * FROM cards WHERE id = ? AND board_id = ?').get(req.params.cardId, req.params.boardId) as unknown as CardRow | undefined
    if (!card) return res.status(404).json({ error: 'Card not found' })
    getDb().prepare(`UPDATE cards SET is_archived = 1, updated_at = datetime('now') WHERE id = ?`).run(card.id)
    insertEvent(card.id, req.params.boardId, req.user!.id, 'user', 'archived', { title: card.title })
    res.json({ ok: true })
  })

  // POST /api/boards/:boardId/cards/:cardId/unarchive
  router.post('/:boardId/cards/:cardId/unarchive', requireAuth, (req: AuthRequest, res) => {
    const card = getDb().prepare('SELECT * FROM cards WHERE id = ? AND board_id = ?').get(req.params.cardId, req.params.boardId) as unknown as CardRow | undefined
    if (!card) return res.status(404).json({ error: 'Card not found' })
    getDb().prepare(`UPDATE cards SET is_archived = 0, updated_at = datetime('now') WHERE id = ?`).run(card.id)
    insertEvent(card.id, req.params.boardId, req.user!.id, 'user', 'unarchived', { title: card.title })
    res.json(getDb().prepare('SELECT * FROM cards WHERE id = ?').get(card.id))
  })

  // GET /api/boards/:boardId/archived-cards
  router.get('/:boardId/archived-cards', requireAuth, (req, res) => {
    const cards = getDb()
      .prepare('SELECT * FROM cards WHERE board_id = ? AND is_archived = 1 ORDER BY updated_at DESC')
      .all(req.params.boardId) as unknown as CardRow[]
    res.json(cards)
  })

  // ── Card events ───────────────────────────────────────────────────────────

  // GET /api/boards/:boardId/cards/:cardId/events
  router.get('/:boardId/cards/:cardId/events', requireAuth, (req, res) => {
    const events = getDb()
      .prepare('SELECT * FROM card_events WHERE card_id = ? ORDER BY created_at ASC')
      .all(req.params.cardId) as unknown as CardEventRow[]
    res.json(events)
  })

  return router
}

import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store.ts'
import { api, type BoardFull, type Board, type Lane, type Card, type CardEvent, type User } from '../api.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function avatar(name: string, color: string, url?: string, size = 24) {
  const s = `${size}px`
  if (url) return <img src={url} alt={name} style={{ width: s, height: s, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: s, height: s, borderRadius: '50%', flexShrink: 0,
      background: color + '22', border: `1.5px solid ${color}44`,
      color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 700,
    }}>
      {name[0]?.toUpperCase()}
    </div>
  )
}

// ── Dropdown Menu ─────────────────────────────────────────────────────────────

interface DropdownItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface DropdownMenuProps {
  items: DropdownItem[]
  onClose: () => void
  align?: 'left' | 'right'
}

function DropdownMenu({ items, onClose, align = 'right' }: DropdownMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute top-full mt-1 z-50 rounded-lg py-1 min-w-[140px]"
      style={{
        background: 'rgba(14,26,56,0.98)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        [align === 'right' ? 'right' : 'left']: 0,
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          disabled={item.disabled}
          onClick={() => { item.onClick(); onClose() }}
          className="w-full text-left px-3 py-1.5 text-xs transition-colors disabled:opacity-30"
          style={{ color: item.danger ? '#f87171' : 'var(--subtle)' }}
          onMouseEnter={(e) => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

// ── Add Card Modal ─────────────────────────────────────────────────────────────

interface AddCardModalProps {
  onConfirm: (title: string) => Promise<void>
  onClose: () => void
}

function AddCardModal({ onConfirm, onClose }: AddCardModalProps) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  async function handleAdd() {
    if (!title.trim()) return
    setSaving(true)
    await onConfirm(title.trim())
    setSaving(false)
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-5 space-y-4"
        style={{ background: 'rgba(8,18,40,0.97)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Card</h2>
        <input
          autoFocus
          className="input text-sm w-full"
          placeholder="Card title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onClose() }}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted hover:bg-white/5 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={saving || !title.trim()}
            className="px-4 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add Card'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card Detail Modal ─────────────────────────────────────────────────────────

interface CardModalProps {
  card: Card
  board: BoardFull
  onClose: () => void
  onUpdated: (card: Card) => void
  onDeleted: (cardId: string) => void
  onMoved: (card: Card) => void
  onArchived: (cardId: string) => void
  isAdmin: boolean
}

function CardModal({ card, board, onClose, onUpdated, onDeleted, onMoved, onArchived, isAdmin }: CardModalProps) {
  const { agents } = useStore()
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description)
  const [result, setResult] = useState(card.result)
  const [assigneeId, setAssigneeId] = useState<string>(card.assignee_id ?? '')
  const [assigneeType, setAssigneeType] = useState<'agent' | 'user' | ''>(card.assignee_type ?? '')
  const [targetLaneId, setTargetLaneId] = useState(card.lane_id)
  const [events, setEvents] = useState<CardEvent[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.boards.cardEvents(card.board_id, card.id).then(setEvents).catch(() => {})
  }, [card.board_id, card.id])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const updated = await api.boards.updateCard(card.board_id, card.id, {
        title: title.trim() || card.title,
        description,
        result,
        assigneeId: assigneeId || null,
        assigneeType: (assigneeType || null) as 'agent' | 'user' | null,
      })
      if (targetLaneId !== card.lane_id) {
        const moved = await api.boards.moveCard(card.board_id, card.id, targetLaneId)
        onMoved(moved)
      } else {
        onUpdated(updated)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    if (!confirm('Archive this card? It will be hidden from the board.')) return
    await api.boards.archiveCard(card.board_id, card.id)
    onArchived(card.id)
    onClose()
  }

  async function handleDelete() {
    if (!confirm('Delete this card? This cannot be undone.')) return
    await api.boards.deleteCard(card.board_id, card.id)
    onDeleted(card.id)
    onClose()
  }

  function getActorName(actorId: string, actorType: string): string {
    if (actorType === 'agent') {
      return agents.find((a) => a.id === actorId)?.name ?? 'Agent'
    }
    return 'User'
  }

  function describeEvent(ev: CardEvent): string {
    try {
      const meta = JSON.parse(ev.meta)
      switch (ev.action) {
        case 'created': return `created this card in ${meta.lane ?? ''}`
        case 'moved': return `moved from ${meta.from_lane ?? '?'} to ${meta.to_lane ?? '?'}`
        case 'updated': return `updated ${(meta.changed as string[])?.join(', ') ?? 'card'}`
        case 'deleted': return `deleted this card`
        default: return ev.action
      }
    } catch { return ev.action }
  }

  const currentLane = board.lanes.find((l) => l.id === card.lane_id)

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className="h-full w-full max-w-lg flex flex-col overflow-hidden"
        style={{
          background: 'rgba(8,18,40,0.97)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-xs text-muted">{currentLane?.name ?? '—'}</span>
          <span className="text-muted text-xs">›</span>
          <input
            className="flex-1 bg-transparent text-sm font-semibold outline-none"
            style={{ color: 'var(--text-primary)' }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button onClick={onClose} className="text-muted hover:text-white ml-2 flex-shrink-0">
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Description */}
          <div>
            <label className="text-xs font-medium text-muted block mb-1.5">Task</label>
            <textarea
              className="input text-sm w-full resize-none"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task…"
            />
          </div>

          {/* Result */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: result ? 'var(--accent)' : 'var(--muted)' }}>
              Result {result && '✓'}
            </label>
            <textarea
              className="input text-sm w-full resize-none"
              rows={4}
              style={result ? { borderColor: 'rgba(245,158,11,0.3)' } : {}}
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="Fill in the result or output when the task is done…"
            />
          </div>

          {/* Assignee */}
          <div>
            <label className="text-xs font-medium text-muted block mb-1.5">Assignee</label>
            <select
              className="input text-sm w-full"
              value={assigneeId ? `${assigneeType}:${assigneeId}` : ''}
              onChange={(e) => {
                const val = e.target.value
                if (!val) { setAssigneeId(''); setAssigneeType('') }
                else {
                  const [type, id] = val.split(':')
                  setAssigneeId(id)
                  setAssigneeType(type as 'agent' | 'user')
                }
              }}
            >
              <option value="">Unassigned</option>
              <optgroup label="Agents">
                {agents.map((a) => (
                  <option key={a.id} value={`agent:${a.id}`}>{a.name}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Move to lane */}
          <div>
            <label className="text-xs font-medium text-muted block mb-1.5">Lane</label>
            <select
              className="input text-sm w-full"
              value={targetLaneId}
              onChange={(e) => setTargetLaneId(e.target.value)}
            >
              {[...board.lanes].sort((a, b) => a.position - b.position).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Meta */}
          <div className="text-xs text-muted space-y-0.5">
            <p>Created {fmtDate(card.created_at)}</p>
            {card.updated_at !== card.created_at && <p>Updated {fmtDate(card.updated_at)}</p>}
          </div>

          {/* Activity */}
          {events.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted block mb-2">Activity</label>
              <div className="space-y-2">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2.5">
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 text-[9px] font-bold"
                      style={{ background: ev.actor_type === 'agent' ? 'rgba(124,106,247,0.25)' : 'rgba(245,158,11,0.2)', color: ev.actor_type === 'agent' ? '#a78bfa' : '#fbbf24' }}
                    >
                      {ev.actor_type === 'agent' ? 'A' : 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>
                        {getActorName(ev.actor_id, ev.actor_type)}
                      </span>
                      <span className="text-xs text-muted"> {describeEvent(ev)}</span>
                    </div>
                    <span className="text-[10px] text-muted flex-shrink-0">{timeAgo(ev.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {error && <span className="text-xs text-red-400 flex-1">{error}</span>}
          {!error && <span className="flex-1" />}
          <button
            onClick={handleArchive}
            className="px-3 py-1.5 text-xs border border-white/10 text-muted hover:bg-white/5 rounded-lg transition-colors"
          >
            Archive
          </button>
          {isAdmin && (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              Delete
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted hover:bg-white/5 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Archived Modal ─────────────────────────────────────────────────────────────

interface ArchivedModalProps {
  cards: Card[]
  lanes: Lane[]
  onUnarchive: (cardId: string) => void
  onClose: () => void
}

function ArchivedModal({ cards, lanes, onUnarchive, onClose }: ArchivedModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  function getLaneName(laneId: string) {
    return lanes.find((l) => l.id === laneId)?.name ?? '—'
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-xl flex flex-col overflow-hidden"
        style={{ background: 'rgba(8,18,40,0.97)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '80vh' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Archived Cards {cards.length > 0 && <span className="text-muted font-normal ml-1">({cards.length})</span>}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-white"><XIcon /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {cards.length === 0 && (
            <p className="text-sm text-muted text-center py-8">No archived cards.</p>
          )}
          {cards.map((card) => (
            <div
              key={card.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{card.title}</p>
                <p className="text-xs text-muted">{getLaneName(card.lane_id)}</p>
              </div>
              <button
                onClick={() => onUnarchive(card.id)}
                className="flex-shrink-0 px-2.5 py-1 text-xs text-muted hover:text-white border border-white/10 hover:border-white/20 rounded-md transition-colors"
              >
                Unarchive
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Board ─────────────────────────────────────────────────────────────────

export default function Board() {
  const { agents, loadAgents } = useStore()
  const [boards, setBoards] = useState<Board[]>([])
  const [board, setBoard] = useState<BoardFull | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [activeBoardId, setActiveBoardId] = useState<string>(() => localStorage.getItem('activeBoardId') ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  // Card creation modal
  const [showAddCardModal, setShowAddCardModal] = useState(false)

  // Card detail modal
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  // Drag
  const [dragging, setDragging] = useState<{ card: Card; sourceLaneId: string } | null>(null)

  // Archived cards modal
  const [showArchived, setShowArchived] = useState(false)
  const [archivedCards, setArchivedCards] = useState<Card[]>([])

  // Lane editing (admin)
  const [renamingLaneId, setRenamingLaneId] = useState<string | null>(null)
  const [renamingLaneName, setRenamingLaneName] = useState('')
  const [addingLane, setAddingLane] = useState(false)
  const [newLaneName, setNewLaneName] = useState('')
  const [newLaneType, setNewLaneType] = useState<'todo' | 'in_progress' | 'done'>('in_progress')

  // Lane dropdown menu
  const [openLaneMenu, setOpenLaneMenu] = useState<string | null>(null)

  // Board editing (admin)
  const [renamingBoard, setRenamingBoard] = useState(false)
  const [renamingBoardName, setRenamingBoardName] = useState('')
  const [creatingBoard, setCreatingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)

  const isAdmin = currentUser?.is_admin === 1

  useEffect(() => {
    api.auth.me().then(setCurrentUser).catch(() => {})
    api.users.list().then(setUsers).catch(() => {})
    loadAgents()
  }, [loadAgents])

  function resolveActor(id: string | null, type: string): { name: string; color: string; url?: string } | null {
    if (!id) return null
    if (type === 'agent') {
      const a = agents.find(ag => ag.id === id)
      return a ? { name: a.name, color: a.avatar_color, url: a.avatar_url || undefined } : null
    }
    const u = users.find(u => u.id === id)
    return u ? { name: u.display_name, color: u.avatar_color, url: u.avatar_url || undefined } : null
  }

  useEffect(() => {
    loadBoardList()
  }, [])

  async function loadBoardList() {
    try {
      const list = await api.boards.list()
      setBoards(list)
      const id = activeBoardId && list.find((b) => b.id === activeBoardId) ? activeBoardId : list[0]?.id ?? ''
      if (id) await loadBoard(id)
      else setLoading(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load boards')
      setLoading(false)
    }
  }

  async function loadBoard(id: string) {
    setLoading(true)
    try {
      const full = await api.boards.get(id)
      setBoard(full)
      setActiveBoardId(id)
      localStorage.setItem('activeBoardId', id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load board')
    } finally {
      setLoading(false)
    }
  }

  useAppEvents((event) => {
    if (event.type === 'board:card_moved' && board && event.boardId === board.id) {
      loadBoard(board.id)
    }
  })

  // ── Card actions ────────────────────────────────────────────────────────────

  async function addCardToFirstLane(title: string) {
    if (!board) return
    const sorted = [...board.lanes].sort((a, b) => a.position - b.position)
    const firstLane = sorted.find((l) => l.lane_type === 'todo') ?? sorted[0]
    if (!firstLane) return
    const card = await api.boards.addCard(board.id, { laneId: firstLane.id, title })
    setBoard({ ...board, cards: [...board.cards, card] })
    setShowAddCardModal(false)
  }

  async function moveCard(cardId: string, toLaneId: string) {
    if (!board) return
    try {
      const updated = await api.boards.moveCard(board.id, cardId, toLaneId)
      setBoard({ ...board, cards: board.cards.map((c) => (c.id === cardId ? updated : c)) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot move card to that lane')
    }
  }

  function handleCardUpdated(updated: Card) {
    if (!board) return
    setBoard({ ...board, cards: board.cards.map((c) => (c.id === updated.id ? updated : c)) })
    if (selectedCard?.id === updated.id) setSelectedCard(updated)
  }

  function handleCardDeleted(cardId: string) {
    if (!board) return
    setBoard({ ...board, cards: board.cards.filter((c) => c.id !== cardId) })
    setSelectedCard(null)
  }

  function handleCardMoved(updated: Card) {
    if (!board) return
    setBoard({ ...board, cards: board.cards.map((c) => (c.id === updated.id ? updated : c)) })
    setSelectedCard(null)
  }

  function handleCardArchived(cardId: string) {
    if (!board) return
    setBoard({ ...board, cards: board.cards.filter((c) => c.id !== cardId) })
    setSelectedCard(null)
  }

  async function openArchivedModal() {
    if (!board) return
    const cards = await api.boards.archivedCards(board.id)
    setArchivedCards(cards)
    setShowArchived(true)
  }

  async function handleUnarchive(cardId: string) {
    if (!board) return
    await api.boards.unarchiveCard(board.id, cardId)
    setArchivedCards((prev) => prev.filter((c) => c.id !== cardId))
  }

  // ── Lane actions (admin) ────────────────────────────────────────────────────

  async function startRenaming(lane: Lane) {
    setRenamingLaneId(lane.id)
    setRenamingLaneName(lane.name)
  }

  async function confirmRenameLane(laneId: string) {
    if (!board || !renamingLaneName.trim()) return
    const updated = await api.boards.updateLane(board.id, laneId, { name: renamingLaneName.trim() })
    setBoard({ ...board, lanes: board.lanes.map((l) => (l.id === laneId ? updated : l)) })
    setRenamingLaneId(null)
  }

  async function deleteLane(laneId: string) {
    if (!board) return
    if (!confirm('Delete this lane and all its cards?')) return
    await api.boards.deleteLane(board.id, laneId)
    setBoard({
      ...board,
      lanes: board.lanes.filter((l) => l.id !== laneId),
      cards: board.cards.filter((c) => c.lane_id !== laneId),
    })
  }

  async function shiftLane(lane: Lane, dir: -1 | 1) {
    if (!board) return
    const sorted = [...board.lanes].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex((l) => l.id === lane.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const swap = sorted[swapIdx]
    await Promise.all([
      api.boards.updateLane(board.id, lane.id, { position: swap.position }),
      api.boards.updateLane(board.id, swap.id, { position: lane.position }),
    ])
    await loadBoard(board.id)
  }

  async function addLane() {
    if (!board || !newLaneName.trim()) return
    const lane = await api.boards.addLane(board.id, newLaneName.trim(), newLaneType)
    setBoard({ ...board, lanes: [...board.lanes, lane] })
    setNewLaneName('')
    setNewLaneType('in_progress')
    setAddingLane(false)
  }

  // ── Board actions (admin) ────────────────────────────────────────────────────

  async function confirmRenameBoard() {
    if (!board || !renamingBoardName.trim()) return
    await api.boards.update(board.id, renamingBoardName.trim())
    const updated = { ...board, name: renamingBoardName.trim() }
    setBoard(updated)
    setBoards(boards.map((b) => (b.id === board.id ? { ...b, name: renamingBoardName.trim() } : b)))
    setRenamingBoard(false)
  }

  async function createBoard() {
    if (!newBoardName.trim()) return
    const created = await api.boards.create(newBoardName.trim())
    setBoards([...boards, created])
    setNewBoardName('')
    setCreatingBoard(false)
    await loadBoard(created.id)
  }

  async function deleteBoard() {
    if (!board) return
    if (!confirm(`Delete board "${board.name}" and all its lanes and cards?`)) return
    await api.boards.delete(board.id)
    const remaining = boards.filter((b) => b.id !== board.id)
    setBoards(remaining)
    if (remaining.length > 0) await loadBoard(remaining[0].id)
    else { setBoard(null); setActiveBoardId('') }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-full"><span className="text-sm text-muted">Loading…</span></div>
  }

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <span className="text-sm text-muted">No boards yet.</span>
        {isAdmin && (
          <button
            onClick={() => setCreatingBoard(true)}
            className="btn-primary text-sm px-4 py-2"
          >
            Create Board
          </button>
        )}
        {creatingBoard && (
          <div className="flex gap-2">
            <input
              autoFocus
              className="input text-sm"
              placeholder="Board name…"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createBoard(); if (e.key === 'Escape') setCreatingBoard(false) }}
            />
            <button onClick={createBoard} className="btn-primary text-sm px-3 py-1.5">Create</button>
          </div>
        )}
      </div>
    )
  }

  const lanes = [...board.lanes].sort((a, b) => a.position - b.position)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="px-6 py-3 flex items-center gap-2 flex-shrink-0"
        style={{ background: 'rgba(8,18,40,0.60)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Board selector / title */}
        {boards.length > 1 ? (
          <select
            className="bg-transparent text-base font-semibold outline-none cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
            value={activeBoardId}
            onChange={(e) => loadBoard(e.target.value)}
          >
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        ) : renamingBoard ? (
          <input
            autoFocus
            className="input text-sm font-semibold"
            value={renamingBoardName}
            onChange={(e) => setRenamingBoardName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmRenameBoard(); if (e.key === 'Escape') setRenamingBoard(false) }}
            onBlur={confirmRenameBoard}
          />
        ) : (
          <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{board.name}</h1>
        )}

        <span className="flex-1" />

        {error && <span className="text-xs text-red-400">{error}</span>}

        {/* Archived button */}
        <button
          onClick={openArchivedModal}
          className="px-3 py-1.5 text-xs text-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
        >
          Archived
        </button>

        {/* Add Card button */}
        {lanes.length > 0 && (
          <button
            onClick={() => setShowAddCardModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <PlusIcon />
            Add Card
          </button>
        )}

        {/* Board actions ellipsis (admin) */}
        {isAdmin && !renamingBoard && (
          <div className="relative">
            <button
              onClick={() => setBoardMenuOpen((v) => !v)}
              className="p-1.5 text-muted hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              title="Board options"
            >
              <DotsVerticalIcon />
            </button>
            {boardMenuOpen && (
              <DropdownMenu
                align="right"
                onClose={() => setBoardMenuOpen(false)}
                items={[
                  {
                    label: 'Rename board',
                    onClick: () => { setRenamingBoard(true); setRenamingBoardName(board.name) },
                  },
                  {
                    label: 'New board',
                    onClick: () => setCreatingBoard(true),
                  },
                  {
                    label: 'Delete board',
                    onClick: deleteBoard,
                    danger: true,
                  },
                ]}
              />
            )}
          </div>
        )}

        {/* New board inline form */}
        {creatingBoard && (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              className="input text-sm h-7 px-2"
              placeholder="New board name…"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createBoard(); if (e.key === 'Escape') setCreatingBoard(false) }}
            />
            <button onClick={createBoard} className="text-xs px-2 py-0.5 bg-accent text-white rounded-md">Create</button>
            <button onClick={() => setCreatingBoard(false)} className="text-xs text-muted px-1">✕</button>
          </div>
        )}
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full items-start" style={{ minWidth: 'max-content' }}>
          {lanes.map((lane, laneIdx) => {
            const cards = board.cards.filter((c) => c.lane_id === lane.id).sort((a, b) => a.position - b.position)
            return (
              <div
                key={lane.id}
                className="w-72 flex flex-col rounded-xl animate-zoom-in"
                style={{
                  background: 'rgba(8,18,40,0.72)',
                  backdropFilter: 'blur(14px)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderTop: `2px solid ${
                    lane.lane_type === 'done' ? 'rgba(74,222,128,0.45)'
                    : lane.lane_type === 'in_progress' ? 'rgba(251,191,36,0.45)'
                    : 'rgba(255,255,255,0.15)'
                  }`,
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragging && dragging.card.lane_id !== lane.id) moveCard(dragging.card.id, lane.id)
                  setDragging(null)
                }}
              >
                {/* Lane header */}
                <div className="px-3 py-2.5 flex items-center gap-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {renamingLaneId === lane.id ? (
                    <input
                      autoFocus
                      className="input text-xs font-semibold flex-1 h-6 px-1.5"
                      value={renamingLaneName}
                      onChange={(e) => setRenamingLaneName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmRenameLane(lane.id)
                        if (e.key === 'Escape') setRenamingLaneId(null)
                      }}
                      onBlur={() => confirmRenameLane(lane.id)}
                    />
                  ) : (
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted flex-1 flex items-center gap-1.5">
                      <LaneTypeIndicator type={lane.lane_type} />
                      {lane.name}
                    </span>
                  )}
                  <span className="text-xs rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--muted)' }}>
                    {cards.length}
                  </span>
                  {isAdmin && renamingLaneId !== lane.id && (
                    <div className="relative">
                      <button
                        onClick={() => setOpenLaneMenu(openLaneMenu === lane.id ? null : lane.id)}
                        className="p-0.5 text-muted hover:text-white rounded transition-colors"
                        title="Lane options"
                      >
                        <DotsVerticalIcon />
                      </button>
                      {openLaneMenu === lane.id && (
                        <DropdownMenu
                          align="right"
                          onClose={() => setOpenLaneMenu(null)}
                          items={[
                            {
                              label: 'Move left',
                              onClick: () => shiftLane(lane, -1),
                              disabled: laneIdx === 0,
                            },
                            {
                              label: 'Move right',
                              onClick: () => shiftLane(lane, 1),
                              disabled: laneIdx === lanes.length - 1,
                            },
                            {
                              label: 'Rename',
                              onClick: () => startRenaming(lane),
                            },
                            {
                              label: 'Delete lane',
                              onClick: () => deleteLane(lane.id),
                              danger: true,
                            },
                          ]}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[4rem]">
                  {cards.map((card) => {
                    const assignee = resolveActor(card.assignee_id, card.assignee_type ?? '')
                    const createdBy = resolveActor(card.created_by, card.created_by_type)
                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={() => setDragging({ card, sourceLaneId: card.lane_id })}
                        onClick={() => setSelectedCard(card)}
                        className="group rounded-xl px-3 py-2.5 cursor-pointer transition-all"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                        onMouseEnter={(e) => {
                          const el = e.currentTarget as HTMLElement
                          el.style.borderColor = 'rgba(245,158,11,0.30)'
                          el.style.background = 'rgba(255,255,255,0.055)'
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLElement
                          el.style.borderColor = 'rgba(255,255,255,0.08)'
                          el.style.background = 'rgba(255,255,255,0.03)'
                        }}
                      >
                        {/* Title */}
                        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{card.title}</p>

                        {/* Created by */}
                        {createdBy && (
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>by {createdBy.name}</p>
                        )}

                        {/* Description preview */}
                        {card.description && (
                          <p className="text-xs mt-1.5 line-clamp-2 leading-relaxed" style={{ color: 'var(--subtle)' }}>{card.description}</p>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <div className="flex items-center gap-1.5">
                            {card.result ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
                                done ✓
                              </span>
                            ) : (
                              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{timeAgo(card.updated_at)}</span>
                            )}
                          </div>
                          {assignee ? (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {avatar(assignee.name, assignee.color, assignee.url, 18)}
                              <span className="text-[10px] truncate max-w-[72px]" style={{ color: 'var(--muted)' }}>{assignee.name}</span>
                            </div>
                          ) : (
                            card.result && <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--muted)' }}>{timeAgo(card.updated_at)}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Add lane (admin) */}
          {isAdmin && (
            <div className="w-72 flex-shrink-0">
              {addingLane ? (
                <div
                  className="rounded-xl p-3 space-y-2"
                  style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  <input
                    autoFocus
                    className="input text-sm w-full"
                    placeholder="Lane name…"
                    value={newLaneName}
                    onChange={(e) => setNewLaneName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addLane(); if (e.key === 'Escape') setAddingLane(false) }}
                  />
                  <select
                    className="input text-xs w-full"
                    value={newLaneType}
                    onChange={(e) => setNewLaneType(e.target.value as 'todo' | 'in_progress' | 'done')}
                  >
                    <option value="in_progress">In Progress</option>
                    <option value="todo" disabled={lanes.some((l) => l.lane_type === 'todo')}>
                      Todo{lanes.some((l) => l.lane_type === 'todo') ? ' (taken)' : ''}
                    </option>
                    <option value="done" disabled={lanes.some((l) => l.lane_type === 'done')}>
                      Done{lanes.some((l) => l.lane_type === 'done') ? ' (taken)' : ''}
                    </option>
                  </select>
                  <div className="flex gap-1.5">
                    <button onClick={addLane} className="flex-1 py-1 bg-accent text-white text-xs rounded-md">Add Lane</button>
                    <button onClick={() => setAddingLane(false)} className="px-2 text-xs text-muted hover:bg-white/5 rounded-md">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingLane(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-muted hover:text-accent transition-colors"
                  style={{ border: '1px dashed rgba(255,255,255,0.15)' }}
                >
                  <PlusIcon />
                  Add Lane
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Archived cards modal */}
      {showArchived && board && (
        <ArchivedModal
          cards={archivedCards}
          lanes={board.lanes}
          onUnarchive={handleUnarchive}
          onClose={() => setShowArchived(false)}
        />
      )}

      {/* Add card modal */}
      {showAddCardModal && (
        <AddCardModal
          onConfirm={addCardToFirstLane}
          onClose={() => setShowAddCardModal(false)}
        />
      )}

      {/* Card detail modal */}
      {selectedCard && board && (
        <CardModal
          card={selectedCard}
          board={board}
          onClose={() => setSelectedCard(null)}
          onUpdated={handleCardUpdated}
          onDeleted={handleCardDeleted}
          onMoved={handleCardMoved}
          onArchived={handleCardArchived}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function LaneTypeIndicator({ type }: { type: 'todo' | 'in_progress' | 'done' }) {
  if (type === 'todo') return <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 inline-block" style={{ background: 'rgba(255,255,255,0.25)' }} title="Todo" />
  if (type === 'done') return <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 inline-block" style={{ background: 'rgba(74,222,128,0.6)' }} title="Done" />
  return <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 inline-block" style={{ background: 'rgba(251,191,36,0.6)' }} title="In Progress" />
}

function DotsVerticalIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  )
}

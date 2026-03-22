import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { api, type ChatMessage } from '../api.ts'
import AgentDetailModal from '../components/AgentDetailModal.tsx'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import { MemorySection } from '../components/agent-settings/MemorySection.tsx'
import { TodosSection } from '../components/agent-settings/TodosSection.tsx'
import { ScheduleSection } from '../components/agent-settings/ScheduleSection.tsx'

export default function AgentChat() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { agents, agentStatus } = useStore()
  const agent = agents.find((a) => a.id === id)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showDetail, setShowDetail] = useState(false)
  const [activeModal, setActiveModal] = useState<'memory' | 'todos' | 'schedule' | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!id) return
    api.chat.history(id).then(setMessages).catch(() => {})
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useAppEvents((event) => {
    if (event.type === 'chat:message' && event.agentId === id) {
      const msg: ChatMessage = {
        id: event.messageId,
        agent_id: event.agentId,
        role: event.role,
        content: event.content,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, msg])
    }
  })

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-sm">
        Agent not found.{' '}
        <button className="text-accent ml-1 hover:underline" onClick={() => navigate('/roster')}>
          Back to roster
        </button>
      </div>
    )
  }

  async function send() {
    if (!input.trim() || sending || !id) return
    const msg = input.trim()
    setInput('')
    setSending(true)
    setError('')

    const userMsg: ChatMessage = {
      id: Date.now(),
      agent_id: id,
      role: 'user',
      content: msg,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    try {
      const { reply } = await api.chat.send(id, msg)
      const assistantMsg: ChatMessage = {
        id: Date.now() + 1,
        agent_id: id,
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send')
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  async function clearHistory() {
    if (!id) return
    await api.chat.clear(id)
    setMessages([])
  }

  return (
    <div className="flex h-full">
      {showDetail && <AgentDetailModal agent={agent} onClose={() => setShowDetail(false)} />}
      {activeModal && id && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setActiveModal(null)}
        >
          <div
            className="flex items-center justify-between px-6 py-3 flex-shrink-0"
            style={{
              background: 'rgba(8,18,40,0.95)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {activeModal === 'memory' ? 'Memory' : activeModal === 'todos' ? 'Todos' : 'Schedule'}
            </span>
            <button
              className="p-1.5 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
              onClick={() => setActiveModal(null)}
            >
              <CloseIcon />
            </button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col" onClick={() => setActiveModal(null)}>
            {activeModal === 'memory' && <MemorySection agentId={id} />}
            {activeModal === 'todos' && <TodosSection agentId={id} />}
            {activeModal === 'schedule' && <ScheduleSection agentId={id} />}
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-6 py-4"
          style={{
            background: 'rgba(8, 18, 40, 0.72)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="relative flex-shrink-0 cursor-pointer" onClick={() => setShowDetail(true)}>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold overflow-hidden"
              style={{
                backgroundColor: agent.avatar_color + '33',
                border: `1px solid ${agent.avatar_color}66`,
                color: agent.avatar_color,
              }}
            >
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
              ) : (
                agent.name[0].toUpperCase()
              )}
            </div>
            {agent.is_active && (
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${agentStatus[agent.id] === 'thinking' ? 'animate-pulse' : ''}`}
                style={{
                  background: agentStatus[agent.id] === 'thinking' ? 'var(--status-amber)' : 'var(--status-green)',
                  border: '1.5px solid rgb(var(--s1))',
                }}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div
                className="text-sm font-semibold cursor-pointer hover:underline"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => setShowDetail(true)}
              >
                {agent.name}
              </div>
              {!agent.is_active && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--muted)' }}
                >
                  inactive
                </span>
              )}
            </div>
            <div className="text-xs text-muted">{agent.role}</div>
          </div>

          {messages.length > 0 && (
            <button className="btn-ghost text-xs" onClick={clearHistory}>
              Clear
            </button>
          )}

          <button
            className="p-2 rounded-lg hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
            onClick={() => setActiveModal('memory')}
            title="Memory"
          >
            <MemoryIcon />
          </button>
          <button
            className="p-2 rounded-lg hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
            onClick={() => setActiveModal('todos')}
            title="Todos"
          >
            <TodoIcon />
          </button>
          <button
            className="p-2 rounded-lg hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
            onClick={() => setActiveModal('schedule')}
            title="Schedule"
          >
            <ScheduleIcon />
          </button>

          <button
            className="p-2 rounded-lg hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
            onClick={() => navigate(`/agents/${id}/settings`)}
            title="Agent settings"
          >
            <GearIcon />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center text-center py-16 bg-gray-900/80 backdrop-blur-md rounded-md max-w-lg mx-auto">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold mb-4 overflow-hidden"
                style={{
                  backgroundColor: agent.avatar_color + '22',
                  border: `1px solid ${agent.avatar_color}44`,
                  color: agent.avatar_color,
                }}
              >
                {agent.avatar_url ? (
                  <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
                ) : (
                  agent.name[0].toUpperCase()
                )}
              </div>
              <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Chat with {agent.name}
              </div>
              <div className="text-xs text-muted max-w-xs">
                {agent.description || `${agent.name} is ready to help. Send a message to start.`}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              agentName={agent.name}
              agentColor={agent.avatar_color}
              agentAvatarUrl={agent.avatar_url}
              agentId={agent.id}
              onDelete={(msgId) => setMessages((prev) => prev.filter((m) => m.id !== msgId))}
              onEdit={(msgId, content) =>
                setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content } : m)))
              }
            />
          ))}

          {sending && (
            <div className="flex items-start gap-3">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 overflow-hidden"
                style={{ backgroundColor: agent.avatar_color + '33', color: agent.avatar_color }}
              >
                {agent.avatar_url ? (
                  <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
                ) : (
                  agent.name[0].toUpperCase()
                )}
              </div>
              <div
                className="rounded-2xl rounded-tl-sm px-4 py-3"
                style={{ background: 'rgba(30,50,90,0.90)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <div className="flex gap-1 items-center h-4">
                  <div
                    className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0ms]"
                    style={{ background: 'var(--muted)' }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:150ms]"
                    style={{ background: 'var(--muted)' }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:300ms]"
                    style={{ background: 'var(--muted)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 pb-6 pt-2">
          <div
            className="flex items-end gap-3 rounded-xl px-4 py-3 transition-colors focus-within:ring-1 focus-within:ring-accent/40"
            style={{
              background: 'rgba(8,18,40,0.75)',
              border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
            }}
          >
            <textarea
              ref={inputRef}
              className="flex-1 bg-transparent text-sm placeholder-muted resize-none outline-none max-h-32 min-h-[20px]"
              style={{ color: 'var(--text-primary)' }}
              placeholder={`Message ${agent.name}...`}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${e.target.scrollHeight}px`
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              autoFocus
            />
            <button
              className="flex-shrink-0 w-8 h-8 bg-accent hover:bg-accent-hover rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
              onClick={send}
              disabled={!input.trim() || sending}
            >
              <SendIcon />
            </button>
          </div>
          <p className="text-[10px] text-muted mt-2 text-center">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  agentName,
  agentColor,
  agentAvatarUrl,
  agentId,
  onDelete,
  onEdit,
}: {
  msg: ChatMessage
  agentName: string
  agentColor: string
  agentAvatarUrl?: string
  agentId: string
  onDelete: (msgId: number) => void
  onEdit: (msgId: number, content: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(msg.content)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  async function handleDelete() {
    setMenuOpen(false)
    await api.chat.deleteMessage(agentId, msg.id)
    onDelete(msg.id)
  }

  async function handleEditSave() {
    if (!editValue.trim() || editValue.trim() === msg.content) {
      setEditing(false)
      return
    }
    await api.chat.editMessage(agentId, msg.id, editValue.trim())
    onEdit(msg.id, editValue.trim())
    setEditing(false)
  }

  const menu = (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="opacity-30 hover:opacity-100 p-1 rounded transition-opacity hover:bg-white/10"
        style={{ color: 'var(--muted)' }}
        title="Message options"
      >
        <DotsVerticalIcon />
      </button>
      {menuOpen && (
        <div
          className="absolute z-50 right-0 top-6 w-32 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: 'rgba(8,18,40,0.97)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-white/8 transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => {
              setEditing(true)
              setEditValue(msg.content)
              setMenuOpen(false)
            }}
          >
            <PencilIcon /> Edit
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-red-500/15 transition-colors"
            style={{ color: '#f87171' }}
            onClick={handleDelete}
          >
            <TrashIcon /> Delete
          </button>
        </div>
      )}
    </div>
  )

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex items-start gap-1">
          <div className="self-start mt-1">{menu}</div>
          <div
            className="max-w-[70%] rounded-2xl rounded-tr-sm px-4 py-3"
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.20)',
            }}
          >
            {editing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  className="bg-transparent text-sm resize-none outline-none w-full min-w-[20rem]"
                  style={{ color: 'var(--text-primary)', minHeight: '4rem' }}
                  value={editValue}
                  rows={Math.max(3, editValue.split('\n').length)}
                  autoFocus
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleEditSave()
                    }
                    if (e.key === 'Escape') setEditing(false)
                  }}
                />
                <div className="flex gap-1.5 justify-end">
                  <button
                    className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors"
                    style={{ color: 'var(--muted)' }}
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="text-[10px] px-2 py-1 rounded bg-accent hover:bg-accent-hover text-white transition-colors"
                    onClick={handleEditSave}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                {msg.content}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 overflow-hidden"
        style={{ backgroundColor: agentColor + '33', color: agentColor }}
      >
        {agentAvatarUrl ? (
          <img src={agentAvatarUrl} alt={agentName} className="w-full h-full object-cover" />
        ) : (
          agentName[0].toUpperCase()
        )}
      </div>
      <div
        className="max-w-[70%] rounded-2xl rounded-tl-sm px-4 py-3"
        style={{ background: 'rgba(30,50,90,0.90)', border: '1px solid rgba(255,255,255,0.15)' }}
      >
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="bg-transparent text-sm resize-none outline-none w-full"
              style={{ color: 'var(--text-primary)', minWidth: '12rem' }}
              value={editValue}
              rows={2}
              autoFocus
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleEditSave()
                }
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <div className="flex gap-1.5 justify-end">
              <button
                className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--muted)' }}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                className="text-[10px] px-2 py-1 rounded bg-accent hover:bg-accent-hover text-white transition-colors"
                onClick={handleEditSave}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
            {msg.content}
          </p>
        )}
      </div>
      <div className="self-start mt-1">{menu}</div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function DotsVerticalIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
      />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  )
}

function MemoryIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  )
}

function TodoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function ScheduleIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

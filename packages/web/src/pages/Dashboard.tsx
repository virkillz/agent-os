import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'
import { api, type ChatMessage, type Agent } from '../api.ts'
import {
  Users, CheckCircle, Zap, CheckCircle2,
  Activity, Clock, AlertCircle, CalendarClock,
} from 'lucide-react'

// ── Welcome messages ────────────────────────────────────────────────────────────

const WELCOME_MESSAGES = [
  'Your empire awaits. The agents are sharp and the board is clear.',
  'All systems nominal. Time to make something happen.',
  'The crew is assembled. Ready for your orders.',
  'The office never sleeps — and neither do your agents.',
  'Productivity levels are off the charts. Or they will be.',
  'Your agents are standing by. Give them something to chew on.',
  'Another day, another opportunity to run a tight ship.',
  'Operations are humming. You\'re in command.',
  'Intelligence is up. Morale is high. Let\'s move.',
  'The dashboard has been briefed. You\'re the only missing piece.',
]

function getWelcomeMessage() {
  return WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
}

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

function avatar(name: string, color: string, url?: string, size = 28) {
  const s = `${size}px`
  if (url) return <img src={url} alt={name} style={{ width: s, height: s, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: s, height: s, borderRadius: '50%', flexShrink: 0,
      background: color + '22', border: `1.5px solid ${color}55`,
      color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700,
    }}>
      {name[0]?.toUpperCase()}
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { agents, agentStatus, setAgentStatus } = useStore()
  const navigate = useNavigate()

  // Chat assistant state
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  // Pick default chat agent
  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  // Load chat history when agent changes
  useEffect(() => {
    if (!selectedAgentId) return
    setMessages([])
    api.chat.history(selectedAgentId).then(setMessages).catch(() => {})
  }, [selectedAgentId])

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // WebSocket events
  useAppEvents((event) => {
    if (event.type === 'agent:thinking') setAgentStatus(event.agentId, 'thinking')
    else if (event.type === 'agent:idle') setAgentStatus(event.agentId, 'idle')
    else if (event.type === 'agent:error') setAgentStatus(event.agentId, 'error')
  })

  // Derived stats
  const activeAgents = agents.filter(a => a.is_active).length
  const thinkingCount = Object.values(agentStatus).filter(s => s === 'thinking').length

  async function sendChat() {
    if (!chatInput.trim() || sending || !selectedAgentId) return
    const msg = chatInput.trim()
    setChatInput('')
    setSending(true)
    const userMsg: ChatMessage = {
      id: Date.now(), agent_id: selectedAgentId, role: 'user',
      content: msg, created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    try {
      const { reply } = await api.chat.send(selectedAgentId, msg)
      setMessages(prev => [...prev, {
        id: Date.now() + 1, agent_id: selectedAgentId, role: 'assistant',
        content: reply, created_at: new Date().toISOString(),
      }])
    } catch {
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
    } finally {
      setSending(false)
      setTimeout(() => chatInputRef.current?.focus(), 50)
    }
  }

  const [welcomeMsg] = useState(getWelcomeMessage)

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-4">

        {/* ── Welcome Banner ── */}
        <div
          className="rounded-xl px-6 py-4 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(8,18,40,0.95) 0%, rgba(20,35,70,0.95) 100%)',
            border: '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          {/* subtle accent glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at 20% 50%, rgba(var(--accent), 0.08) 0%, transparent 60%)',
            }}
          />
          <div className="relative">
            <h1 className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
              Welcome back, Chief.
            </h1>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>{welcomeMsg}</p>
          </div>
        </div>

        {/* ── Stats Bar ── */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}
        >
          <StatCard label="Total Staff" value={String(agents.length)} icon={<Users size={16} />} color="var(--status-blue)" />
          <StatCard label="Active" value={String(activeAgents)} icon={<CheckCircle size={16} />} color="var(--status-green)" />
          <StatCard label="Working" value={String(thinkingCount)} icon={<Zap size={16} />} color="rgb(var(--accent))" highlight={thinkingCount > 0} />
        </div>

        {/* ── Main Grid ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: '260px 1fr', gridTemplateRows: 'auto auto', alignItems: 'start' }}>

          {/* ── Employee Roster ── (left, spans 2 rows) */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(8,18,40,0.75)', backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)',
              gridRow: '1 / 3',
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Employee Roster
              </span>
              <Link
                to="/roster"
                className="text-[10px] font-medium transition-opacity hover:opacity-100"
                style={{ color: 'rgb(var(--accent))', opacity: 0.7 }}
              >
                View all →
              </Link>
            </div>
            <div className="p-2 space-y-1">
              {agents.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: 'var(--muted)' }}>No employees yet</p>
              ) : (
                agents.map(agent => (
                  <RosterRow
                    key={agent.id}
                    agent={agent}
                    status={agentStatus[agent.id]}
                    onClick={() => navigate(`/agents/${agent.id}`)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Notifications ── */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(8,18,40,0.75)', backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <div
              className="px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Notifications
              </span>
            </div>
            <NotificationsWidget agents={agents} agentStatus={agentStatus} />
          </div>

          {/* ── Chat Assistant ── */}
          <div
            className="rounded-xl overflow-hidden flex flex-col"
            style={{
              background: 'rgba(8,18,40,0.75)', backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)',
              minHeight: '300px',
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Chat Assistant
              </span>
              {agents.length > 1 && (
                <select
                  className="text-[10px] rounded px-1.5 py-0.5 border-0 outline-none cursor-pointer"
                  style={{ background: 'rgb(var(--s3))', color: 'var(--text-primary)' }}
                  value={selectedAgentId}
                  onChange={e => setSelectedAgentId(e.target.value)}
                >
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ maxHeight: '260px' }}>
              {messages.length === 0 && !sending ? (
                <div className="flex flex-col items-center justify-center h-full py-8 gap-2">
                  {agents.length === 0 ? (
                    <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                      No agents yet. <Link to="/roster" style={{ color: 'rgb(var(--accent))' }}>Hire one →</Link>
                    </p>
                  ) : (
                    <>
                      <Clock size={20} style={{ color: 'var(--muted)' }} />
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        Ask {agents.find(a => a.id === selectedAgentId)?.name ?? 'an agent'} anything
                      </p>
                    </>
                  )}
                </div>
              ) : (
                messages.slice(-20).map(msg => (
                  <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div
                      className="rounded-lg px-2.5 py-1.5 text-xs leading-relaxed max-w-[85%]"
                      style={{
                        background: msg.role === 'user'
                          ? 'rgba(245,158,11,0.12)'
                          : 'rgba(255,255,255,0.06)',
                        color: 'var(--text-primary)',
                        border: msg.role === 'user'
                          ? '1px solid rgba(245,158,11,0.2)'
                          : '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex gap-2">
                <textarea
                  ref={chatInputRef}
                  rows={1}
                  className="flex-1 resize-none rounded-lg px-3 py-2 text-xs outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-primary)', lineHeight: '1.4',
                  }}
                  placeholder={agents.length === 0 ? 'No agents available' : 'Type a message...'}
                  value={chatInput}
                  disabled={agents.length === 0 || sending}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                />
                <button
                  className="px-3 rounded-lg text-xs font-semibold flex-shrink-0 transition-opacity disabled:opacity-30"
                  style={{ background: 'rgb(var(--accent))', color: '#000' }}
                  disabled={!chatInput.trim() || sending || agents.length === 0}
                  onClick={sendChat}
                >
                  Send
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, highlight }: {
  label: string; value: string; icon: React.ReactNode; color: string; highlight?: boolean
}) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{
        background: highlight ? `${color}18` : 'rgba(8,18,40,0.75)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${highlight ? color + '44' : 'rgba(255,255,255,0.10)'}`,
      }}
    >
      <span style={{ color, opacity: 0.85 }}>{icon}</span>
      <div>
        <div className="text-xl font-bold leading-none" style={{ color }}>{value}</div>
        <div className="text-[10px] font-medium mt-0.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</div>
      </div>
    </div>
  )
}

// ── Roster Row ─────────────────────────────────────────────────────────────────

function RosterRow({ agent, status, onClick }: {
  agent: Agent; status?: string; onClick: () => void
}) {
  const dotColor = !agent.is_active ? 'var(--status-gray)'
    : status === 'thinking' ? 'var(--status-amber)'
    : status === 'error' ? 'var(--status-red)'
    : 'var(--status-green)'

  const statusLabel = !agent.is_active ? 'Offline'
    : status === 'thinking' ? 'Working'
    : status === 'error' ? 'Error'
    : 'Online'

  return (
    <div
      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors hover:bg-white/5"
      onClick={onClick}
    >
      <div className="relative flex-shrink-0">
        {avatar(agent.name, agent.avatar_color, agent.avatar_url || undefined, 32)}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${status === 'thinking' ? 'animate-pulse' : ''}`}
          style={{ background: dotColor, border: '1.5px solid rgb(var(--s1))' }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {agent.name}
          </span>
        </div>
        <div className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>{agent.role}</div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <span
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
          style={{
            background: dotColor + '22',
            color: dotColor,
          }}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  )
}

// ── Notifications Widget ───────────────────────────────────────────────────────

function NotificationsWidget({ agents, agentStatus }: { agents: Agent[]; agentStatus: Record<string, string> }) {
  const [items, setItems] = useState<Array<{ id: string; icon: string; text: string; time: string; color: string }>>([])

  useAppEvents((event) => {
    let item: { id: string; icon: string; text: string; time: string; color: string } | null = null
    const time = new Date().toISOString()

    if (event.type === 'agent:thinking') {
      const a = agents.find(ag => ag.id === event.agentId)
      item = { id: `${Date.now()}`, icon: 'zap', text: `${a?.name ?? 'Agent'} started working`, time, color: 'var(--status-amber)' }
    } else if (event.type === 'agent:idle') {
      const a = agents.find(ag => ag.id === event.agentId)
      item = { id: `${Date.now()}`, icon: 'check', text: `${a?.name ?? 'Agent'} finished`, time, color: 'var(--status-green)' }
    } else if (event.type === 'agent:error') {
      const a = agents.find(ag => ag.id === event.agentId)
      item = { id: `${Date.now()}`, icon: 'alert', text: `${a?.name ?? 'Agent'} encountered an error`, time, color: 'var(--status-red)' }
    } else if (event.type === 'schedule:fired') {
      const a = agents.find(ag => ag.id === event.agentId)
      item = { id: `${Date.now()}`, icon: 'clock', text: `Schedule fired for ${a?.name ?? 'agent'}: ${event.label}`, time, color: 'rgb(var(--accent))' }
    }

    if (item) setItems(prev => [item!, ...prev].slice(0, 30))
  })

  // Seed with any currently-thinking agents
  const thinking = agents.filter(a => agentStatus[a.id] === 'thinking')

  return (
    <div className="p-3 space-y-1.5" style={{ maxHeight: '220px', overflowY: 'auto' }}>
      {thinking.map(a => (
        <div key={a.id} className="flex items-start gap-2.5 py-1.5 px-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)' }}>
          <Zap size={12} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--status-amber)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs leading-snug" style={{ color: 'var(--text-primary)' }}>{a.name} is working</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>now</p>
          </div>
        </div>
      ))}
      {items.map(item => {
        const Icon = item.icon === 'zap' ? Zap
          : item.icon === 'check' ? CheckCircle2
          : item.icon === 'alert' ? AlertCircle
          : item.icon === 'clock' ? CalendarClock
          : Activity
        return (
          <div key={item.id} className="flex items-start gap-2.5 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
            <Icon size={12} className="mt-0.5 flex-shrink-0" style={{ color: item.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs leading-snug" style={{ color: 'var(--text-primary)' }}>{item.text}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{timeAgo(item.time)}</p>
            </div>
          </div>
        )
      })}
      {items.length === 0 && thinking.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Clock size={20} style={{ color: 'var(--muted)' }} />
          <p className="text-xs" style={{ color: 'var(--muted)' }}>No recent notifications</p>
        </div>
      )}
    </div>
  )
}


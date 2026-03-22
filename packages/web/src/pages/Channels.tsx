import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { api, type Channel, type DmChannel, type ChannelMessage, type Agent, type User } from '../api.ts'
import { useStore } from '../store.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'

// ─── Message menu ─────────────────────────────────────────────────────────────

function MessageMenu({ msg, channelId, onDelete, onEditStart }: {
  msg: ChannelMessage
  channelId: string
  onDelete: (msgId: number) => void
  onEditStart: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleDelete() {
    setOpen(false)
    await api.channels.deleteMessage(channelId, msg.id)
    onDelete(msg.id)
  }

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="opacity-30 hover:opacity-100 p-1 rounded transition-opacity hover:bg-white/10"
        style={{ color: 'var(--muted)' }}
        title="Message options"
      >
        <DotsVerticalIcon />
      </button>
      {open && (
        <div
          className="absolute z-50 right-0 top-6 w-32 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: 'rgba(8,18,40,0.97)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-white/8 transition-colors"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => { onEditStart(); setOpen(false) }}
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
}

type ChannelMember = { id: string; name: string; role: string; avatar_color: string }

export default function Channels() {
  const { id: paramId } = useParams<{ id?: string }>()
  const { agents, addUnreadDm, markDmRead, unreadDmChannels } = useStore()
  const [channels, setChannels] = useState<Channel[]>([])
  const [dmChannels, setDmChannels] = useState<DmChannel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const [members, setMembers] = useState<ChannelMember[]>([])
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [creatingChannel, setCreatingChannel] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const membersRef = useRef<HTMLDivElement>(null)
  const createInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.auth.me().then(setCurrentUser).catch(() => {})
    loadChannels()
    loadDmChannels()
  }, [])

  useEffect(() => {
    if (activeChannel) {
      loadMessages(activeChannel.id)
      loadMembers(activeChannel.id)
      setShowMembers(false)
      setShowAddAgent(false)
    }
  }, [activeChannel])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (showCreateChannel) setTimeout(() => createInputRef.current?.focus(), 0)
  }, [showCreateChannel])

  // Close members panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (membersRef.current && !membersRef.current.contains(e.target as Node)) {
        setShowMembers(false)
        setShowAddAgent(false)
      }
    }
    if (showMembers) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMembers])

  // Subscribe to WS channel:message events
  useAppEvents((event) => {
    if (event.type === 'channel:message' && event.channelId !== activeChannel?.id) {
      // Track unread DMs; reload list if this is a new DM channel we haven't seen
      const isDm = dmChannels.some((d) => d.id === event.channelId)
      if (isDm) {
        addUnreadDm(event.channelId)
      } else if (event.senderType === 'agent') {
        // Could be a new DM channel — refresh the list
        loadDmChannels().then(() => addUnreadDm(event.channelId))
      }
    }
    if (event.type === 'channel:message' && event.channelId === activeChannel?.id) {
      const incoming: ChannelMessage = {
        id: event.messageId,
        channel_id: event.channelId,
        sender_id: event.senderId,
        sender_type: event.senderType as 'agent' | 'user',
        content: event.content,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => {
        // Replace optimistic message from current user if content matches
        const optimisticIdx = prev.findIndex(
          (m) => m.id > 1_000_000_000_000 && m.sender_id === event.senderId && m.content === event.content
        )
        if (optimisticIdx !== -1) {
          const next = [...prev]
          next[optimisticIdx] = incoming
          return next
        }
        return [...prev, incoming]
      })
    }
  })

  async function loadChannels() {
    const list = await api.channels.list()
    setChannels(list)
    if (list.length > 0) {
      const target = paramId ? list.find((c) => c.id === paramId) ?? list[0] : list[0]
      setActiveChannel(target)
    }
  }

  async function loadDmChannels() {
    const list = await api.channels.listDms()
    setDmChannels(list)
  }

  function openChannel(ch: Channel) {
    setActiveChannel(ch)
    if (ch.is_dm) markDmRead(ch.id)
  }

  async function loadMessages(channelId: string) {
    const msgs = await api.channels.messages(channelId)
    setMessages(msgs)
  }

  async function loadMembers(channelId: string) {
    const list = await api.channels.members(channelId)
    setMembers(list)
  }

  async function createChannel() {
    const name = newChannelName.trim()
    if (!name || creatingChannel) return
    setCreatingChannel(true)
    try {
      const ch = await api.channels.create(name)
      setChannels((prev) => [...prev, ch])
      setActiveChannel(ch)
      setNewChannelName('')
      setShowCreateChannel(false)
    } finally {
      setCreatingChannel(false)
    }
  }

  async function addMember(agentId: string) {
    if (!activeChannel) return
    await api.channels.addMember(activeChannel.id, agentId)
    await loadMembers(activeChannel.id)
    setShowAddAgent(false)
  }

  async function removeMember(agentId: string) {
    if (!activeChannel) return
    await api.channels.removeMember(activeChannel.id, agentId)
    setMembers((prev) => prev.filter((m) => m.id !== agentId))
  }

  async function sendMessage() {
    if (!activeChannel || !input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    setInput('')
    setMentionQuery(null)

    // Optimistic update — show immediately like AgentChat
    const optimisticId = Date.now()
    if (currentUser) {
      setMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          channel_id: activeChannel.id,
          sender_id: currentUser.id,
          sender_type: 'user',
          content,
          created_at: new Date().toISOString(),
        },
      ])
    }

    try {
      await api.channels.send(activeChannel.id, content)
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  function agentById(id: string): Agent | undefined {
    return agents.find((a) => a.id === id)
  }

  function senderName(msg: ChannelMessage): string {
    if (msg.sender_type === 'agent') {
      return agentById(msg.sender_id)?.name ?? msg.sender_id
    }
    if (currentUser && msg.sender_id === currentUser.id) return currentUser.display_name
    return msg.sender_id
  }

  function senderColor(msg: ChannelMessage): string {
    if (msg.sender_type === 'agent') {
      return agentById(msg.sender_id)?.avatar_color ?? '#7c6af7'
    }
    if (currentUser && msg.sender_id === currentUser.id) {
      return currentUser.avatar_color ?? '#6ac5f7'
    }
    return '#6ac5f7'
  }

  function isOwnMessage(msg: ChannelMessage): boolean {
    return msg.sender_type === 'user' && !!currentUser && msg.sender_id === currentUser.id
  }

  // @mention autocomplete
  const filteredMentions = mentionQuery !== null
    ? agents.filter((a) => a.name.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6)
    : []

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInput(val)

    // Detect @mention at cursor
    const cursor = e.target.selectionStart ?? val.length
    const textBeforeCursor = val.slice(0, cursor)
    const match = textBeforeCursor.match(/@([\w-]*)$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }

  function insertMention(agentName: string) {
    const cursor = inputRef.current?.selectionStart ?? input.length
    const textBefore = input.slice(0, cursor)
    const textAfter = input.slice(cursor)
    const match = textBefore.match(/@([\w-]*)$/)
    if (!match) return
    const newBefore = textBefore.slice(0, textBefore.length - match[0].length) + `@${agentName} `
    setInput(newBefore + textAfter)
    setMentionQuery(null)
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.selectionStart = newBefore.length
        inputRef.current.selectionEnd = newBefore.length
      }
    }, 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % filteredMentions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i - 1 + filteredMentions.length) % filteredMentions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredMentions[mentionIndex].name)
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const nonMembers = agents.filter((a) => !members.some((m) => m.id === a.id))

  return (
    <div className="flex h-full">
      {/* Channel list sidebar */}
      <div
        className="w-48 flex-shrink-0 flex flex-col"
        style={{
          background: 'rgba(8, 18, 40, 0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Channels</span>
          <button
            onClick={() => setShowCreateChannel((v) => !v)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--muted)' }}
            title="New channel"
          >
            <PlusIcon />
          </button>
        </div>
        {showCreateChannel && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <input
              ref={createInputRef}
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createChannel()
                if (e.key === 'Escape') { setShowCreateChannel(false); setNewChannelName('') }
              }}
              placeholder="channel-name"
              className="w-full bg-transparent text-xs outline-none rounded px-2 py-1.5"
              style={{
                color: 'var(--text-primary)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto py-2">
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => openChannel(ch)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                activeChannel?.id === ch.id ? 'bg-white/[0.08]' : 'hover:bg-white/5'
              }`}
              style={{ color: activeChannel?.id === ch.id ? 'var(--text-primary)' : 'var(--muted)' }}
            >
              <span style={{ color: 'var(--muted)' }}>#</span>
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
          {dmChannels.length > 0 && (
            <>
              <div
                className="px-4 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: 'var(--muted)' }}
              >
                Direct Messages
              </div>
              {dmChannels.map((ch) => {
                const hasUnread = unreadDmChannels.has(ch.id)
                return (
                  <button
                    key={ch.id}
                    onClick={() => openChannel(ch)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      activeChannel?.id === ch.id ? 'bg-white/[0.08]' : 'hover:bg-white/5'
                    }`}
                    style={{ color: activeChannel?.id === ch.id ? 'var(--text-primary)' : 'var(--muted)' }}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold"
                      style={{ background: ch.partner_avatar_color, color: '#fff' }}
                    >
                      {ch.partner_name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate flex-1">{ch.partner_name}</span>
                    {hasUnread && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: 'rgb(var(--accent))' }}
                      />
                    )}
                  </button>
                )
              })}
            </>
          )}
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeChannel ? (
          <>
            {/* Channel header */}
            <div
              className="px-5 py-3.5 flex items-center gap-2"
              style={{
                background: 'rgba(8, 18, 40, 0.60)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {activeChannel.is_dm ? (
                <>
                  {(() => {
                    const dm = dmChannels.find((d) => d.id === activeChannel.id)
                    return dm ? (
                      <>
                        <span
                          className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                          style={{ background: dm.partner_avatar_color, color: '#fff' }}
                        >
                          {dm.partner_name.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                          {dm.partner_name}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>Direct Message</span>
                    )
                  })()}
                </>
              ) : (
                <>
                  <span className="text-muted text-sm">#</span>
                  <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                    {activeChannel.name}
                  </span>
                </>
              )}

              {/* Participant count button */}
              <div className="relative" ref={membersRef}>
                <button
                  onClick={() => { setShowMembers((v) => !v); setShowAddAgent(false) }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-white/8"
                  style={{ color: showMembers ? 'var(--text-primary)' : 'var(--muted)' }}
                  title="Channel members"
                >
                  <PeopleIcon />
                  <span>{members.length + (currentUser ? 1 : 0)}</span>
                </button>

                {/* Members popover */}
                {showMembers && (
                  <div
                    className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-2xl z-50 overflow-hidden"
                    style={{
                      background: 'rgba(8,18,40,0.95)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                    }}
                  >
                    <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Members
                      </span>
                      <button
                        onClick={() => setShowAddAgent((v) => !v)}
                        className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--muted)' }}
                        title="Add agent"
                      >
                        <PlusIcon /> Add agent
                      </button>
                    </div>

                    {/* Add agent picker */}
                    {showAddAgent && nonMembers.length > 0 && (
                      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        {nonMembers.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => addMember(a.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/8 transition-colors"
                          >
                            <div
                              className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                              style={{ backgroundColor: a.avatar_color }}
                            >
                              {a.name[0]?.toUpperCase()}
                            </div>
                            <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{a.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {showAddAgent && nonMembers.length === 0 && (
                      <p className="text-xs text-muted px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        All agents are members
                      </p>
                    )}

                    <div className="py-1 max-h-52 overflow-y-auto">
                      {/* Current user */}
                      {currentUser && (
                        <div className="flex items-center gap-2.5 px-3 py-2">
                          <div
                            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ backgroundColor: currentUser.avatar_color ?? '#6ac5f7' }}
                          >
                            {currentUser.display_name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {currentUser.display_name}
                            </p>
                          </div>
                        </div>
                      )}
                      {/* Agent members */}
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center gap-2.5 px-3 py-2 group">
                          <div
                            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ backgroundColor: m.avatar_color ?? '#7c6af7' }}
                          >
                            {m.name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {m.name}
                            </p>
                            <p className="text-[10px] text-muted">AI agent</p>
                          </div>
                          <button
                            onClick={() => removeMember(m.id)}
                            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded"
                            style={{ color: '#f87171' }}
                            title="Remove from channel"
                          >
                            <XIcon />
                          </button>
                        </div>
                      ))}
                      {members.length === 0 && !currentUser && (
                        <p className="text-xs text-muted px-3 py-3">No members yet</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {messages.map((msg, i) => {
                const own = isOwnMessage(msg)
                const prevMsg = messages[i - 1]
                const sameSenderAsPrev = prevMsg &&
                  prevMsg.sender_id === msg.sender_id &&
                  prevMsg.sender_type === msg.sender_type
                const isEditing = editingMsgId === msg.id

                async function saveEdit() {
                  if (!editValue.trim() || editValue.trim() === msg.content) { setEditingMsgId(null); return }
                  await api.channels.editMessage(activeChannel!.id, msg.id, editValue.trim())
                  setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, content: editValue.trim() } : m))
                  setEditingMsgId(null)
                }

                if (own) {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="flex items-start gap-1">
                        <div className="self-start mt-1">
                          <MessageMenu
                            msg={msg}
                            channelId={activeChannel!.id}
                            onDelete={(id) => setMessages((prev) => prev.filter((m) => m.id !== id))}
                            onEditStart={() => { setEditingMsgId(msg.id); setEditValue(msg.content) }}
                          />
                        </div>
                        <div className="max-w-[70%]">
                          {!sameSenderAsPrev && (
                            <p className="text-[10px] text-muted text-right mb-1 mr-1">
                              You · {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          <div
                            className="rounded-2xl rounded-tr-sm px-4 py-2.5"
                            style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.20)' }}
                          >
                            {isEditing ? (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  className="bg-transparent text-sm resize-none outline-none w-full min-w-[20rem]"
                                  style={{ color: 'var(--text-primary)', minHeight: '4rem' }}
                                  value={editValue}
                                  rows={Math.max(3, editValue.split('\n').length)}
                                  autoFocus
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } if (e.key === 'Escape') setEditingMsgId(null) }}
                                />
                                <div className="flex gap-1.5 justify-end">
                                  <button className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors" style={{ color: 'var(--muted)' }} onClick={() => setEditingMsgId(null)}>Cancel</button>
                                  <button className="text-[10px] px-2 py-1 rounded bg-accent hover:bg-accent-hover text-white transition-colors" onClick={saveEdit}>Save</button>
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
                    </div>
                  )
                }

                return (
                  <div key={msg.id} className="flex items-start gap-3">
                    {!sameSenderAsPrev ? (
                      <div
                        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5"
                        style={{ backgroundColor: senderColor(msg) }}
                      >
                        {senderName(msg)[0]?.toUpperCase() ?? '?'}
                      </div>
                    ) : (
                      <div className="w-7 flex-shrink-0" />
                    )}
                    <div className="min-w-0 max-w-[70%]">
                      {!sameSenderAsPrev && (
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {senderName(msg)}
                          </span>
                          {msg.sender_type === 'agent' && (
                            <span
                              className="text-[9px] rounded px-1 py-px font-medium"
                              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
                            >
                              AI
                            </span>
                          )}
                          <span className="text-[10px] text-muted">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}
                      <div
                        className="rounded-2xl rounded-tl-sm px-4 py-2.5"
                        style={{ background: 'rgba(30,50,90,0.90)', border: '1px solid rgba(255,255,255,0.15)' }}
                      >
                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              className="bg-transparent text-sm resize-none outline-none w-full min-w-[20rem]"
                              style={{ color: 'var(--text-primary)', minHeight: '4rem' }}
                              value={editValue}
                              rows={Math.max(3, editValue.split('\n').length)}
                              autoFocus
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } if (e.key === 'Escape') setEditingMsgId(null) }}
                            />
                            <div className="flex gap-1.5 justify-end">
                              <button className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors" style={{ color: 'var(--muted)' }} onClick={() => setEditingMsgId(null)}>Cancel</button>
                              <button className="text-[10px] px-2 py-1 rounded bg-accent hover:bg-accent-hover text-white transition-colors" onClick={saveEdit}>Save</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                            {msg.content}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="self-start mt-1">
                      <MessageMenu
                        msg={msg}
                        channelId={activeChannel!.id}
                        onDelete={(id) => setMessages((prev) => prev.filter((m) => m.id !== id))}
                        onEditStart={() => { setEditingMsgId(msg.id); setEditValue(msg.content) }}
                      />
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              className="px-5 py-4"
              style={{
                background: 'rgba(8, 18, 40, 0.60)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {/* @mention dropdown */}
              {mentionQuery !== null && filteredMentions.length > 0 && (
                <div
                  className="mb-2 rounded-xl overflow-hidden shadow-2xl"
                  style={{
                    background: 'rgba(8,18,40,0.96)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                  }}
                >
                  <div className="px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mention an agent</span>
                  </div>
                  {filteredMentions.map((agent, idx) => (
                    <button
                      key={agent.id}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                      style={{
                        background: idx === mentionIndex ? 'rgba(255,255,255,0.08)' : 'transparent',
                        color: 'var(--text-primary)',
                      }}
                      onMouseEnter={() => setMentionIndex(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        insertMention(agent.name)
                      }}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: agent.avatar_color }}
                      >
                        {agent.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="text-[10px] text-muted">{agent.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div
                className="flex items-end gap-3 rounded-xl px-3 py-2 transition-colors focus-within:ring-1 focus-within:ring-accent/40"
                style={{
                  background: 'rgba(8, 18, 40, 0.70)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message #${activeChannel.name} — use @name to mention an agent`}
                  rows={1}
                  className="flex-1 bg-transparent text-sm resize-none focus:outline-none"
                  style={{ color: 'var(--text-primary)', minHeight: '1.5rem', maxHeight: '8rem' }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="flex-shrink-0 w-8 h-8 bg-accent hover:bg-accent-hover text-white rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted">Select a channel</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  )
}

function DotsVerticalIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

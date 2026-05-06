import { useEffect, useState } from 'react'
import { api, type SessionNode, type SessionEvent } from '../../api.ts'

const PAGE_SIZE = 20

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function parseSessionLabel(filename: string): string {
  const ts = filename.replace(/T(\d{2})-(\d{2})-(\d{2})-\d+Z_.+/, 'T$1:$2:$3Z')
  try {
    return formatDate(ts)
  } catch {
    return filename.replace('.jsonl', '')
  }
}

function flattenFiles(nodes: SessionNode[]): SessionNode[] {
  const files: SessionNode[] = []
  for (const n of nodes) {
    if (n.type === 'file') files.push(n)
    else if (n.children) files.push(...flattenFiles(n.children))
  }
  return files
}

function FileIcon() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: 'var(--subtle)' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

// ─── Event renderers ────────────────────────────────────────────────────────

function EventRow({ event }: { event: SessionEvent }) {
  const [expanded, setExpanded] = useState(false)

  if (event.type === 'session') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.20)' }}>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.18)', color: '#818cf8' }}>session</span>
        <span className="text-xs text-muted">Started · cwd: <span className="font-mono text-subtle">{String(event.cwd ?? '')}</span></span>
        <span className="ml-auto text-[10px] text-muted/50 font-mono">{event.timestamp ? formatDate(String(event.timestamp)) : ''}</span>
      </div>
    )
  }

  if (event.type === 'model_change') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>model</span>
        <span className="text-xs text-muted"><span className="text-subtle">{String(event.provider ?? '')}</span> / <span className="text-subtle">{String(event.modelId ?? '')}</span></span>
      </div>
    )
  }

  if (event.type === 'thinking_level_change') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#fcd34d' }}>thinking</span>
        <span className="text-xs text-muted">level: <span className="text-subtle">{String(event.thinkingLevel ?? '')}</span></span>
      </div>
    )
  }

  if (event.type === 'message') {
    const msg = event.message as { role: string; content: unknown[]; toolCallId?: string; toolName?: string; isError?: boolean } | undefined
    if (!msg) return null

    const { role, content } = msg

    if (role === 'user') {
      const text = (content as { type: string; text?: string }[])
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('\n')
      return (
        <div className="flex gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 text-[9px] font-bold" style={{ background: 'rgba(255,255,255,0.10)', color: 'var(--subtle)' }}>U</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted mb-1 uppercase tracking-wider font-semibold">User</div>
            <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>{text}</p>
          </div>
        </div>
      )
    }

    if (role === 'toolResult') {
      const toolName = msg.toolName ?? 'tool'
      const isError = msg.isError
      const text = (content as { type: string; text?: string }[])
        .filter(c => c.type === 'text').map(c => c.text ?? '').join('\n')
      return (
        <div className="flex gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: isError ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.05)', border: `1px solid ${isError ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.15)'}` }}>
          <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 text-[9px] font-bold" style={{ background: isError ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)', color: isError ? '#f87171' : '#6ee7b7' }}>⚙</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] mb-1 uppercase tracking-wider font-semibold" style={{ color: isError ? '#f87171' : 'var(--muted)' }}>{toolName} {isError ? '· error' : '· result'}</div>
            <p className="text-xs font-mono whitespace-pre-wrap break-words" style={{ color: 'var(--subtle)' }}>{text}</p>
          </div>
        </div>
      )
    }

    if (role === 'assistant') {
      const parts = content as { type: string; text?: string; thinking?: string; toolName?: string; input?: unknown }[]
      return (
        <div className="flex gap-2.5 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.12)' }}>
          <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 text-[9px] font-bold" style={{ background: 'rgba(245,158,11,0.15)', color: '#fcd34d' }}>A</div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="text-[10px] text-muted mb-1 uppercase tracking-wider font-semibold">Assistant</div>
            {parts.map((part, i) => {
              if (part.type === 'thinking') {
                return (
                  <div key={i} className="rounded" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <button
                      className="flex items-center gap-1 px-2 py-1 w-full text-xs transition-colors"
                      style={{ color: 'var(--muted)' }}
                      onClick={() => setExpanded(e => !e)}
                    >
                      <span className="text-[10px]">{expanded ? '▾' : '▸'}</span>
                      <span className="italic">thinking…</span>
                    </button>
                    {expanded && (
                      <p className="px-2 pb-2 text-xs whitespace-pre-wrap break-words italic" style={{ color: 'var(--muted)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {part.thinking}
                      </p>
                    )}
                  </div>
                )
              }
              if (part.type === 'text') {
                return <p key={i} className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>{part.text}</p>
              }
              if (part.type === 'tool_use') {
                return (
                  <div key={i} className="text-xs font-mono px-2 py-1.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--subtle)' }}>
                    <span style={{ color: '#fcd34d' }}>{part.toolName}</span>
                    {part.input != null && <span style={{ color: 'var(--muted)' }}> {JSON.stringify(part.input).slice(0, 120)}</span>}
                  </div>
                )
              }
              return null
            })}
          </div>
        </div>
      )
    }
    return null
  }

  // Generic fallback
  return (
    <div className="flex gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded self-start flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)' }}>{event.type}</span>
      <span className="text-xs text-muted/60 font-mono break-all">{JSON.stringify(event).slice(0, 200)}</span>
    </div>
  )
}

// ─── File row ────────────────────────────────────────────────────────────────

function FileRow({ node, selected, onSelect }: { node: SessionNode; selected: string | null; onSelect: (path: string) => void }) {
  const isSelected = selected === node.path
  return (
    <button
      onClick={() => onSelect(node.path)}
      className="w-full text-left px-3 py-1.5 transition-colors flex items-center gap-1.5"
      style={{
        background: isSelected ? 'rgba(245,158,11,0.08)' : undefined,
        borderLeft: `2px solid ${isSelected ? 'rgb(var(--accent))' : 'transparent'}`,
      }}
    >
      <FileIcon />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" style={{ color: isSelected ? 'var(--text-primary)' : 'var(--subtle)' }}>
          {parseSessionLabel(node.name)}
        </div>
        <div className="text-[10px] text-muted/60 mt-0.5">{formatBytes(node.size ?? 0)}</div>
      </div>
    </button>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function SessionsSection({ agentId }: { agentId: string }) {
  const [files, setFiles] = useState<SessionNode[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [treeLoading, setTreeLoading] = useState(false)
  const [page, setPage] = useState(0)

  function loadTree() {
    setTreeLoading(true)
    api.sessions.list(agentId).then(nodes => {
      const allFiles = flattenFiles(nodes)
      setFiles(allFiles)
      setPage(0)
      if (allFiles.length > 0) setSelected(allFiles[0].path)
    }).finally(() => setTreeLoading(false))
  }

  useEffect(() => {
    loadTree()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    api.sessions.read(agentId, selected)
      .then(setEvents)
      .finally(() => setLoading(false))
  }, [agentId, selected])

  const totalPages = Math.ceil(files.length / PAGE_SIZE)
  const pageFiles = files.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Flat file list sidebar */}
      <aside
        className="w-64 flex-shrink-0 flex flex-col"
        style={{ borderRight: '1px solid rgba(255,255,255,0.07)', background: 'rgb(var(--s1) / 0.6)' }}
      >
        <div className="px-3 py-2 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">
            Sessions {files.length > 0 && <span className="text-muted/50">({files.length})</span>}
          </p>
          <button
            onClick={loadTree}
            disabled={treeLoading}
            title="Reload sessions"
            className="p-1 rounded transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ color: 'var(--muted)' }}
          >
            <svg className={`w-3 h-3 ${treeLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {files.length === 0 && !treeLoading && (
            <p className="text-xs text-muted/50 text-center py-8 px-3">No sessions yet.</p>
          )}
          {pageFiles.map(node => (
            <FileRow key={node.path} node={node} selected={selected} onSelect={setSelected} />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded transition-colors hover:bg-white/5 disabled:opacity-30"
              style={{ color: 'var(--muted)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-[10px] text-muted/60">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1 rounded transition-colors hover:bg-white/5 disabled:opacity-30"
              style={{ color: 'var(--muted)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </aside>

      {/* Event viewer */}
      <div className="flex-1 overflow-y-auto py-6 px-6" style={{ background: 'rgba(4,10,24,0.90)' }}>
        {loading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-muted animate-pulse">Loading session…</span>
          </div>
        )}
        {!loading && events.length === 0 && selected && (
          <p className="text-xs text-muted/50 text-center py-16">No events in this session.</p>
        )}
        {!loading && !selected && (
          <p className="text-xs text-muted/50 text-center py-16">Select a session to view.</p>
        )}
        {!loading && events.length > 0 && (
          <div className="max-w-2xl mx-auto space-y-3">
            {events.map((ev, i) => (
              <EventRow key={i} event={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

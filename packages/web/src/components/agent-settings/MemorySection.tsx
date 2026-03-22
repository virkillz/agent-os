import { useEffect, useState } from 'react'
import { useStore } from '../../store.ts'
import { type MemoryEntry } from '../../api.ts'
import { PencilIcon, TrashIcon } from './icons.tsx'

export function MemorySection({ agentId }: { agentId: string }) {
  const { memory, loadMemory, addMemory, updateMemory, deleteMemory } = useStore()
  const entries = memory[agentId] ?? []
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    loadMemory(agentId)
  }, [agentId, loadMemory])

  async function handleAdd() {
    if (!newContent.trim()) return
    setAdding(true)
    try {
      await addMemory(agentId, newContent.trim())
      setNewContent('')
    } finally {
      setAdding(false)
    }
  }

  async function handleUpdate(id: number) {
    if (!editContent.trim()) return
    await updateMemory(agentId, id, editContent.trim())
    setEditingId(null)
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs text-muted mb-4">
          Memory entries are injected into this agent's system prompt and persist across sessions.
        </p>

        <div className="flex gap-2 mb-6">
          <textarea
            className="input flex-1 resize-none text-sm"
            rows={2}
            placeholder="Add a memory entry..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleAdd()
              }
            }}
          />
          <button
            className="btn-primary self-end px-3 py-2 text-xs"
            onClick={handleAdd}
            disabled={!newContent.trim() || adding}
          >
            Add
          </button>
        </div>

        {entries.length === 0 && (
          <p className="text-sm text-muted text-center py-8">No memory entries yet.</p>
        )}

        <div className="space-y-2">
          {entries.map((entry: MemoryEntry) => (
            <div
              key={entry.id}
              className="rounded-lg px-3 py-2.5 group"
              style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              {editingId === entry.id ? (
                <div className="flex gap-2">
                  <textarea
                    className="input flex-1 resize-none text-sm"
                    rows={2}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    autoFocus
                  />
                  <div className="flex flex-col gap-1 self-start">
                    <button
                      className="btn-primary text-xs px-2 py-1"
                      onClick={() => handleUpdate(entry.id)}
                    >
                      Save
                    </button>
                    <button
                      className="btn-ghost text-xs px-2 py-1"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                    {entry.content}
                  </p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
                      onClick={() => {
                        setEditingId(entry.id)
                        setEditContent(entry.content)
                      }}
                      title="Edit"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-red-400 transition-colors"
                      onClick={() => deleteMemory(agentId, entry.id)}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

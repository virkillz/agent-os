import { useEffect, useState } from 'react'
import { useStore } from '../../store.ts'
import { type TodoItem } from '../../api.ts'
import { ChevronRightIcon, PencilIcon, TrashIcon } from './icons.tsx'

function TodoRow({
  todo,
  agentId,
  onPatch,
  onDelete,
}: {
  todo: TodoItem
  agentId: string
  onPatch: (agentId: string, id: number, data: { completed?: boolean; text?: string }) => Promise<void>
  onDelete: (agentId: string, id: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(todo.text)

  async function handleEditSave() {
    if (!editText.trim() || editText.trim() === todo.text) {
      setEditing(false)
      return
    }
    await onPatch(agentId, todo.id, { text: editText.trim() })
    setEditing(false)
  }

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 group"
      style={{ background: 'rgba(8,18,40,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <button
        className="flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors"
        style={{
          borderColor: todo.completed ? 'rgb(var(--accent))' : 'rgba(255,255,255,0.25)',
          background: todo.completed ? 'rgba(245,158,11,0.2)' : 'transparent',
        }}
        onClick={() => onPatch(agentId, todo.id, { completed: !todo.completed })}
      >
        {todo.completed && (
          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l3 3 5-5"
              stroke="rgb(var(--accent))"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {editing ? (
        <input
          className="input flex-1 text-sm py-0.5"
          value={editText}
          autoFocus
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleEditSave()
            if (e.key === 'Escape') setEditing(false)
          }}
          onBlur={handleEditSave}
        />
      ) : (
        <span
          className={`flex-1 text-sm ${todo.completed ? 'line-through' : ''}`}
          style={{ color: todo.completed ? 'var(--muted)' : 'var(--text-primary)' }}
        >
          {todo.text}
        </span>
      )}

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-subtle transition-colors"
          onClick={() => {
            setEditText(todo.text)
            setEditing(true)
          }}
          title="Edit"
        >
          <PencilIcon />
        </button>
        <button
          className="p-1 rounded hover:bg-white/[0.07] text-muted hover:text-red-400 transition-colors"
          onClick={() => onDelete(agentId, todo.id)}
          title="Delete"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

export function TodosSection({ agentId }: { agentId: string }) {
  const { todos, loadTodos, addTodo, patchTodo, deleteTodo } = useStore()
  const items = todos[agentId] ?? []
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const open = items.filter((t) => !t.completed)
  const done = items.filter((t) => t.completed)

  useEffect(() => {
    loadTodos(agentId)
  }, [agentId, loadTodos])

  async function handleAdd() {
    if (!newText.trim()) return
    setAdding(true)
    try {
      await addTodo(agentId, newText.trim())
      setNewText('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-2 mb-6">
          <input
            className="input flex-1 text-sm"
            placeholder="Add a todo..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
          />
          <button
            className="btn-primary px-3 py-2 text-xs"
            onClick={handleAdd}
            disabled={!newText.trim() || adding}
          >
            Add
          </button>
        </div>

        {open.length === 0 && done.length === 0 && (
          <p className="text-sm text-muted text-center py-8">No todos yet.</p>
        )}

        <div className="space-y-1.5">
          {open.map((t: TodoItem) => (
            <TodoRow key={t.id} todo={t} agentId={agentId} onPatch={patchTodo} onDelete={deleteTodo} />
          ))}
        </div>

        {done.length > 0 && (
          <div className="mt-6">
            <button
              className="flex items-center gap-1.5 text-xs text-muted hover:text-subtle mb-2 transition-colors"
              onClick={() => setShowCompleted((v) => !v)}
            >
              <ChevronRightIcon rotated={showCompleted} />
              {done.length} completed
            </button>
            {showCompleted && (
              <div className="space-y-1.5">
                {done.map((t: TodoItem) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    agentId={agentId}
                    onPatch={patchTodo}
                    onDelete={deleteTodo}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

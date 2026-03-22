import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store.ts'
import { type Agent } from '../../api.ts'

export function TerminateSection({ agent, agentId }: { agent: Agent; agentId: string }) {
  const navigate = useNavigate()
  const { deleteAgent } = useStore()
  const [confirmText, setConfirmText] = useState('')
  const [terminating, setTerminating] = useState(false)
  const [error, setError] = useState('')

  async function handleTerminate() {
    if (confirmText !== 'delete') return
    setTerminating(true)
    setError('')
    try {
      await deleteAgent(agentId)
      navigate('/roster')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setTerminating(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div
        className="w-full max-w-xl rounded-2xl p-6 animate-zoom-in"
        style={{
          background: 'rgba(20,8,8,0.90)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(239,68,68,0.2)',
        }}
      >
        <div className="flex items-start gap-4 mb-6">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <span style={{ color: 'var(--status-red)', fontSize: '18px' }}>⚠</span>
          </div>
          <div>
            <h2 className="text-base font-bold mb-1" style={{ color: 'var(--status-red)' }}>
              Terminate Employee
            </h2>
            <p className="text-sm" style={{ color: 'var(--subtle)' }}>
              This will permanently delete <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.name}</span> and all associated data — memory, todos, schedules, and chat history.
            </p>
            <p className="text-sm mt-2 font-semibold" style={{ color: 'var(--status-red)' }}>
              This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--subtle)' }}>
            Type <span className="font-bold" style={{ color: 'var(--text-primary)' }}>delete</span> to confirm
          </label>
          <input
            className="input"
            placeholder="delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTerminate()}
            autoFocus
            autoComplete="off"
          />
        </div>

        {error && <p className="text-xs mb-3" style={{ color: 'var(--status-red)' }}>{error}</p>}

        <button
          onClick={handleTerminate}
          disabled={confirmText !== 'delete' || terminating}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: confirmText === 'delete' ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.06)',
            color: confirmText === 'delete' ? 'var(--status-red)' : 'rgba(239,68,68,0.35)',
            border: `1px solid ${confirmText === 'delete' ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.15)'}`,
            cursor: confirmText === 'delete' ? 'pointer' : 'not-allowed',
          }}
        >
          {terminating ? 'Terminating...' : 'Terminate Employee'}
        </button>
      </div>
    </div>
  )
}

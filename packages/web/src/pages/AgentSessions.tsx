import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { SessionsSection } from '../components/agent-settings/SessionsSection.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { AgentProfileCard } from '../components/AgentProfileCard.tsx'

export default function AgentSessions() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { agents } = useStore()
  const agent = agents.find((a) => a.id === id)

  if (!agent || !id) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Agent not found</p>
          <button className="btn-primary text-xs" onClick={() => navigate('/roster')}>
            Back to Roster
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 max-w-4xl w-full mx-auto px-6 pt-8 pb-4 mt-20">
        <PageHeader
          title="Sessions"
          subtitle={`${agent.name} • View session history`}
          backTo={`/agents/${id}`}
        />
        <AgentProfileCard agentId={id} />
      </div>
      <div className="flex-1 min-h-0 max-w-4xl w-full mx-auto px-6 pb-8">
        <SessionsSection agentId={id} />
      </div>
    </div>
  )
}

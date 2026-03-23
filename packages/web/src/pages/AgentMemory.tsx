import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import { MemorySection } from '../components/agent-settings/MemorySection.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { AgentProfileCard } from '../components/AgentProfileCard.tsx'

export default function AgentMemory() {
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 mt-20">
        <PageHeader
          title="Memory"
          subtitle={`${agent.name} • View agent memory`}
          backTo={`/agents/${id}`}
        />
        <AgentProfileCard agentId={id} />
        <MemorySection agentId={id} />
      </div>
    </div>
  )
}

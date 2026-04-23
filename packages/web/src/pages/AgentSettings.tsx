import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store.ts'
import AgentDetailModal from '../components/AgentDetailModal.tsx'
import PageHeader from '../components/PageHeader.tsx'
import { ProfileSection } from '../components/agent-settings/ProfileSection.tsx'
import { AvatarSection } from '../components/agent-settings/AvatarSection.tsx'
import { ModelSection } from '../components/agent-settings/ModelSection.tsx'
import { SkillsSection } from '../components/agent-settings/SkillsSection.tsx'
import { PluginsSection } from '../components/agent-settings/PluginsSection.tsx'
import { PlatformToolsSection } from '../components/agent-settings/PlatformToolsSection.tsx'
import { PromptSection } from '../components/agent-settings/PromptSection.tsx'
import { TerminateSection } from '../components/agent-settings/TerminateSection.tsx'
import { SessionsSection } from '../components/agent-settings/SessionsSection.tsx'
import { TriggersSection } from '../components/agent-settings/TriggersSection.tsx'
import { IntegrationsSection } from '../components/agent-settings/IntegrationsSection.tsx'
import { ConnectionSection } from '../components/agent-settings/ConnectionSection.tsx'
import { McpSection } from '../components/agent-settings/McpSection.tsx'

type Section = 'profile' | 'avatar' | 'connection' | 'model' | 'skills' | 'platform-tools' | 'plugins' | 'mcp' | 'prompt' | 'triggers' | 'integrations' | 'sessions' | 'terminate'

const NAV_ITEMS: { id: Section; label: string; danger?: boolean }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'connection', label: 'Connection' },
  { id: 'model', label: 'Model' },
  { id: 'skills', label: 'Skills' },
  { id: 'platform-tools', label: 'Platform Tools' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'prompt', label: 'System Prompt' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'terminate', label: 'Terminate', danger: true },
]

export default function AgentSettings() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { agents, updateAgent, toggleAgentActive } = useStore()
  const agent = agents.find((a) => a.id === id)
  const [section, setSection] = useState<Section>('profile')
  const [showDetail, setShowDetail] = useState(false)

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

  async function handleSave(data: Parameters<typeof updateAgent>[1] & { systemPrompt?: string }) {
    if (!id) return
    const { systemPrompt, ...rest } = data
    await updateAgent(id, { ...rest, ...(systemPrompt !== undefined ? { systemPrompt } : {}) })
  }

  return (
    <div className="h-full flex flex-col">
      {/* ── Header Section ── */}
      <div className="flex-shrink-0">
        <div className="max-w-4xl mx-auto pt-8 pb-4">
          <PageHeader
            title="Agent Settings"
            subtitle={`${agent.name} • ${agent.role}`}
            backTo={`/agents/${id}`}
          />
        </div>
      </div>

      {/* ── Settings Window Section ── */}
      <div className="flex-1 flex items-center justify-center px-4 md:px-8 pb-4">
      {showDetail && <AgentDetailModal agent={agent} onClose={() => setShowDetail(false)} />}

      {/* Cyberpunk window frame */}
      <div
        className="relative w-full flex"
        style={{
          maxWidth: '960px',
          height: '100%',
          background: 'rgba(6, 14, 32, 0.82)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(80, 180, 220, 0.18)',
          borderRadius: '12px',
          boxShadow: '0 0 0 1px rgba(80, 180, 220, 0.06), 0 8px 48px rgba(0,0,0,0.5), 0 0 60px rgba(40,120,200,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Corner brackets */}
        <span style={{ position: 'absolute', top: -1, left: -1, width: 16, height: 16, borderTop: '2px solid rgba(80,200,240,0.7)', borderLeft: '2px solid rgba(80,200,240,0.7)', borderRadius: '4px 0 0 0', pointerEvents: 'none', zIndex: 10 }} />
        <span style={{ position: 'absolute', top: -1, right: -1, width: 16, height: 16, borderTop: '2px solid rgba(80,200,240,0.7)', borderRight: '2px solid rgba(80,200,240,0.7)', borderRadius: '0 4px 0 0', pointerEvents: 'none', zIndex: 10 }} />
        <span style={{ position: 'absolute', bottom: -1, left: -1, width: 16, height: 16, borderBottom: '2px solid rgba(80,200,240,0.7)', borderLeft: '2px solid rgba(80,200,240,0.7)', borderRadius: '0 0 0 4px', pointerEvents: 'none', zIndex: 10 }} />
        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 16, height: 16, borderBottom: '2px solid rgba(80,200,240,0.7)', borderRight: '2px solid rgba(80,200,240,0.7)', borderRadius: '0 0 4px 0', pointerEvents: 'none', zIndex: 10 }} />

      {/* Sidebar */}
      <aside
        className="w-52 flex-shrink-0 flex flex-col"
        style={{
          background: 'rgba(8,18,40,0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Agent header */}
        <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden cursor-pointer"
              style={{
                backgroundColor: agent.avatar_color + '33',
                border: `1px solid ${agent.avatar_color}66`,
                color: agent.avatar_color,
              }}
              onClick={() => setShowDetail(true)}
            >
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
              ) : (
                agent.name[0].toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div
                className="text-sm font-semibold truncate cursor-pointer hover:underline"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => setShowDetail(true)}
              >
                {agent.name}
              </div>
              <div className="text-[10px] text-muted truncate">{agent.role}</div>
            </div>
          </div>

          {/* is_active toggle */}
          <button
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs transition-colors hover:bg-white/5"
            onClick={() => id && toggleAgentActive(id)}
            title={agent.is_active ? 'Deactivate agent' : 'Activate agent'}
          >
            <div
              className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${
                agent.is_active ? 'bg-accent' : 'bg-white/[0.10]'
              }`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                  agent.is_active ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span style={{ color: agent.is_active ? 'var(--text-primary)' : 'var(--muted)' }}>
              {agent.is_active ? 'Active' : 'Inactive'}
            </span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 flex flex-col">
          <div className="flex-1">
            {NAV_ITEMS.filter(i => !i.danger).map(({ id: navId, label }) => (
              <button
                key={navId}
                onClick={() => setSection(navId)}
                className="w-full flex items-center px-4 py-2 text-sm font-medium transition-all"
                style={{
                  color: section === navId ? 'var(--text-primary)' : 'var(--subtle)',
                  background: section === navId ? 'rgba(245,158,11,0.08)' : undefined,
                  borderLeft: `2px solid ${section === navId ? 'rgb(var(--accent))' : 'transparent'}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {!agent.is_default && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="pt-1 pb-2">
              <button
                onClick={() => setSection('terminate')}
                className="w-full flex items-center px-4 py-2 text-sm font-medium transition-all"
                style={{
                  color: section === 'terminate' ? 'var(--status-red)' : 'rgba(239,68,68,0.5)',
                  background: section === 'terminate' ? 'rgba(239,68,68,0.08)' : undefined,
                  borderLeft: `2px solid ${section === 'terminate' ? 'var(--status-red)' : 'transparent'}`,
                }}
              >
                Terminate
              </button>
            </div>
          )}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {section === 'profile' && <ProfileSection agent={agent} onSave={handleSave} />}
        {section === 'avatar' && <AvatarSection agent={agent} onSave={handleSave} />}
        {section === 'connection' && <ConnectionSection agent={agent} onSave={handleSave as (data: { modelConfig: object }) => Promise<unknown>} />}
        {section === 'model' && <ModelSection agent={agent} onSave={handleSave as (data: { modelConfig: object }) => Promise<unknown>} />}
        {section === 'skills' && <SkillsSection agent={agent} onSave={handleSave as (data: { modelConfig: object }) => Promise<unknown>} />}
        {section === 'platform-tools' && <PlatformToolsSection agent={agent} onSave={handleSave as (data: { modelConfig: object }) => Promise<unknown>} />}
        {section === 'plugins' && <PluginsSection agent={agent} onSave={handleSave as (data: { modelConfig: object }) => Promise<unknown>} />}
        {section === 'mcp' && <McpSection agent={agent} onSave={handleSave as (data: { modelConfig: object }) => Promise<unknown>} />}
        {section === 'prompt' && id && <PromptSection agentId={id} />}
        {section === 'triggers' && id && <TriggersSection agentId={id} />}
        {section === 'integrations' && id && <IntegrationsSection agentId={id} />}
        {section === 'sessions' && id && <SessionsSection agentId={id} />}
        {section === 'terminate' && id && <TerminateSection agent={agent} agentId={id} />}
      </div>
      </div>
      </div>
    </div>
  )
}

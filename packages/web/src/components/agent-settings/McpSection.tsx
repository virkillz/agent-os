import { useEffect, useState } from 'react'
import { api, type Agent, type McpServerWithAgent } from '../../api.ts'

export function McpSection({
  agent,
}: {
  agent: Agent
  onSave: (data: { modelConfig: object }) => Promise<unknown>
}) {
  const [servers, setServers] = useState<McpServerWithAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    api.mcp.listForAgent(agent.id).then(setServers).finally(() => setLoading(false))
  }, [agent.id])

  async function toggle(serverId: string, currentlyEnabled: boolean) {
    setSaving(serverId)
    try {
      await api.mcp.toggleForAgent(agent.id, serverId, !currentlyEnabled)
      setServers((prev) =>
        prev.map((s) => (s.id === serverId ? { ...s, agentEnabled: !currentlyEnabled } : s))
      )
    } finally {
      setSaving(null)
    }
  }

  const enabledServers = servers.filter((s) => s.agentEnabled)
  const availableServers = servers.filter((s) => !s.agentEnabled)

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <p className="text-xs text-muted mb-5">
          Control which MCP servers this agent can connect to. Configure MCP servers from the{' '}
          <a href="/settings/mcp" className="text-accent hover:underline">
            MCP Servers page
          </a>
          .
        </p>

        {loading && <p className="text-sm text-muted py-4">Loading…</p>}

        {!loading && servers.length === 0 && (
          <div className="text-center py-10 text-gray-600 text-sm border border-dashed border-gray-700 rounded-xl">
            No MCP servers available.{' '}
            <a href="/settings/mcp" className="text-accent hover:underline">Add one</a>.
          </div>
        )}

        {!loading && servers.length > 0 && (
          <>
            {enabledServers.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Enabled for this agent</p>
                {enabledServers.map((server) => (
                  <McpServerRow key={server.id} server={server} saving={saving} onToggle={toggle} />
                ))}
              </div>
            )}

            {availableServers.length > 0 && (
              <div className={enabledServers.length > 0 ? 'mt-4' : ''}>
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">
                  {enabledServers.length > 0 ? 'Available' : 'MCP Servers'}
                </p>
                <div className="space-y-2">
                  {availableServers.map((server) => (
                    <McpServerRow key={server.id} server={server} saving={saving} onToggle={toggle} />
                  ))}
                </div>
              </div>
            )}

            {!loading && servers.every((s) => !s.enabled) && (
              <p className="text-xs text-muted mt-3">
                Note: Some servers are globally disabled. Enable them from the{' '}
                <a href="/settings/mcp" className="text-accent hover:underline">MCP Servers page</a>.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function McpServerRow({
  server,
  saving,
  onToggle,
}: {
  server: McpServerWithAgent
  saving: string | null
  onToggle: (serverId: string, currentlyEnabled: boolean) => void
}) {
  const globallyDisabled = !server.enabled

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-4 py-3 ${globallyDisabled ? 'opacity-40' : ''}`}
      style={{ background: 'rgb(var(--s1) / 0.72)', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{server.name}</span>
          {server.agentEnabled && (
            <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full">Active</span>
          )}
          {globallyDisabled && (
            <span className="text-[10px] bg-surface-3 px-1.5 py-0.5 rounded-full" style={{ color: 'var(--muted)' }}>Disabled</span>
          )}
        </div>
        {server.description && (
          <p className="text-xs text-muted truncate">{server.description}</p>
        )}
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--subtle)' }}>
          {server.command} {server.args.join(' ')}
        </p>
      </div>
      <button
        onClick={() => onToggle(server.id, server.agentEnabled)}
        disabled={saving === server.id || globallyDisabled}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
          server.agentEnabled ? 'bg-accent' : 'bg-white/[0.07]'
        }`}
        title={globallyDisabled ? 'Server is globally disabled' : server.agentEnabled ? 'Disable for this agent' : 'Enable for this agent'}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            server.agentEnabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

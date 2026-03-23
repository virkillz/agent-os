import chalk from 'chalk'
import { getDb, type AgentIntegrationRow } from '../db.js'
import { eventBus } from '../event-bus.js'
import type { Connector } from './types.js'

/**
 * ConnectorLoader manages the lifecycle of all platform connectors.
 * It reads agent_integrations on startup, instantiates the right Connector
 * implementation for each row, and hot-reloads when integration config changes.
 *
 * Phase 2 skeleton: connector instantiation is a no-op until Phase 3/4
 * add the actual Slack/Telegram connector implementations.
 */
class ConnectorLoader {
  // Map of "agentId:platform" → active Connector
  private active = new Map<string, Connector>()

  private key(agentId: string, platform: string): string {
    return `${agentId}:${platform}`
  }

  async start(): Promise<void> {
    const rows = getDb()
      .prepare('SELECT * FROM agent_integrations WHERE enabled = 1')
      .all() as unknown as AgentIntegrationRow[]

    for (const row of rows) {
      await this.startConnector(row)
    }

    // Hot-reload: when an integration is created/updated/deleted, restart its connector
    eventBus.on((event) => {
      if (event.type === 'integration:config_updated') {
        void this.reloadConnector(event.agentId, event.platform)
      }
    })
  }

  async stop(): Promise<void> {
    for (const connector of this.active.values()) {
      await connector.stop().catch(() => {/* ignore errors on shutdown */})
    }
    this.active.clear()
  }

  private async startConnector(row: AgentIntegrationRow): Promise<void> {
    const connector = this.buildConnector(row)
    if (!connector) return  // platform not yet implemented

    const k = this.key(row.agent_id, row.platform)
    try {
      await connector.start()
      this.active.set(k, connector)
      eventBus.emit({ type: 'connector:started', agentId: row.agent_id, platform: row.platform })
      console.log(chalk.green('[connector]'), `started ${row.platform} for agent ${row.agent_id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      eventBus.emit({ type: 'connector:error', agentId: row.agent_id, platform: row.platform, error: msg })
      console.error(chalk.red('[connector]'), `failed to start ${row.platform} for agent ${row.agent_id}:`, msg)
    }
  }

  private async stopConnector(agentId: string, platform: string): Promise<void> {
    const k = this.key(agentId, platform)
    const existing = this.active.get(k)
    if (!existing) return

    try {
      await existing.stop()
      this.active.delete(k)
      eventBus.emit({ type: 'connector:stopped', agentId, platform })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(chalk.yellow('[connector]'), `error stopping ${platform} for agent ${agentId}:`, msg)
    }
  }

  private async reloadConnector(agentId: string, platform: string): Promise<void> {
    await this.stopConnector(agentId, platform)

    const row = getDb()
      .prepare('SELECT * FROM agent_integrations WHERE agent_id = ? AND platform = ? AND enabled = 1')
      .get(agentId, platform) as unknown as AgentIntegrationRow | undefined

    if (row) {
      await this.startConnector(row)
    }
  }

  /**
   * Returns the active connector for a given agent+platform, if any.
   * Used by the invocation pipeline to deliver responses.
   */
  getConnector(agentId: string, platform: string): Connector | undefined {
    return this.active.get(this.key(agentId, platform))
  }

  /**
   * Instantiate the right Connector class for a given integration row.
   * Returns null for platforms not yet implemented (Phase 3/4).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private buildConnector(_row: AgentIntegrationRow): Connector | null {
    // Phase 3 will return: new SlackConnector(row.agent_id, config)
    // Phase 4 will return: new TelegramConnector(row.agent_id, config)
    // For now, log a warning and return null
    console.log(chalk.dim('[connector]'), `${_row.platform} connector not yet implemented — skipping`)
    return null
  }
}

export const connectorLoader = new ConnectorLoader()

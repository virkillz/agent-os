import chalk from 'chalk'
import { getDb, type AgentChannelRow } from '../db.js'
import { eventBus } from '../event-bus.js'
import type { Connector, SlackChannelConfig, TelegramChannelConfig } from './types.js'
import { SlackConnector } from './slack/index.js'
import { TelegramConnector } from './telegram/index.js'

/**
 * ConnectorLoader manages the lifecycle of all platform connectors.
 * It reads agent_channels on startup, instantiates the right Connector
 * implementation for each row, and hot-reloads when channel config changes.
 *
 * Phase 2 skeleton: connector instantiation is a no-op until Phase 3/4
 * add the actual Slack/Telegram connector implementations.
 */
class ConnectorLoader {
  // Map of "agentId:platform" → active Connector
  private active = new Map<string, Connector>()
  // Map of "agentId:platform" → last error message (set on failed start, cleared on success)
  private errors = new Map<string, string>()

  private key(agentId: string, platform: string): string {
    return `${agentId}:${platform}`
  }

  async start(): Promise<void> {
    const rows = getDb()
      .prepare('SELECT * FROM agent_channels WHERE enabled = 1')
      .all() as unknown as AgentChannelRow[]

    for (const row of rows) {
      await this.startConnector(row)
    }

    // Hot-reload: when an integration is created/updated/deleted, restart its connector
    eventBus.on((event) => {
      if (event.type === 'channel:config_updated') {
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

  private async startConnector(row: AgentChannelRow): Promise<void> {
    const connector = this.buildConnector(row)
    if (!connector) return  // platform not yet implemented

    const k = this.key(row.agent_id, row.platform)
    try {
      await connector.start()
      this.active.set(k, connector)
      this.errors.delete(k)
      eventBus.emit({ type: 'connector:started', agentId: row.agent_id, platform: row.platform })
      console.log(chalk.green('[connector]'), `started ${row.platform} for agent ${row.agent_id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.errors.set(k, msg)
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
      .prepare('SELECT * FROM agent_channels WHERE agent_id = ? AND platform = ? AND enabled = 1')
      .get(agentId, platform) as unknown as AgentChannelRow | undefined

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
   * Returns the connector status for a given agent+platform.
   * Used by the integrations API to surface health state to the frontend.
   */
  statusOf(agentId: string, platform: string): { status: 'running' | 'stopped' | 'error'; error?: string } {
    const k = this.key(agentId, platform)
    if (this.active.has(k)) return { status: 'running' }
    const err = this.errors.get(k)
    if (err) return { status: 'error', error: err }
    return { status: 'stopped' }
  }

  /**
   * Instantiate the right Connector class for a given integration row.
   * Returns null for platforms not yet implemented (Phase 4+).
   */
  private buildConnector(row: AgentChannelRow): Connector | null {
    if (row.platform === 'slack') {
      let config: SlackChannelConfig
      try {
        config = JSON.parse(row.config) as SlackChannelConfig
      } catch {
        console.error(chalk.red('[connector]'), `invalid Slack config JSON for agent ${row.agent_id}`)
        return null
      }
      if (!config.app_token || !config.bot_token) {
        console.warn(chalk.yellow('[connector]'), `Slack integration for agent ${row.agent_id} missing app_token or bot_token — skipping`)
        return null
      }
      return new SlackConnector(row.agent_id, config)
    }

    if (row.platform === 'telegram') {
      let config: TelegramChannelConfig
      try {
        config = JSON.parse(row.config) as TelegramChannelConfig
      } catch {
        console.error(chalk.red('[connector]'), `invalid Telegram config JSON for agent ${row.agent_id}`)
        return null
      }
      if (!config.bot_token) {
        console.warn(chalk.yellow('[connector]'), `Telegram integration for agent ${row.agent_id} missing bot_token — skipping`)
        return null
      }
      return new TelegramConnector(row.agent_id, config)
    }

    console.log(chalk.dim('[connector]'), `${row.platform} connector not yet implemented — skipping`)
    return null
  }
}

export const connectorLoader = new ConnectorLoader()

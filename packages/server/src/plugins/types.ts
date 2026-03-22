import type { ToolDefinition } from '@mariozechner/pi-coding-agent'

export type { ToolDefinition }

// ── Tool context ───────────────────────────────────────────────────────────────

/** Passed to getTools() so plugins can create context-scoped tool instances. */
export interface ToolContext {
  agentId: string
  workspaceDir: string
  projectId?: string
}

// ── Plugin manifest (mirrors plugin.json on disk) ─────────────────────────────

export interface PluginEnvVar {
  key: string
  required: boolean
  description: string
}

export interface PluginConfig {
  id: string
  displayName: string
  description: string
  /** Environment variables this plugin needs (e.g. API keys) */
  env: PluginEnvVar[]
  /** Tool IDs this plugin exports — used in agent config.json "tools" array */
  toolIds: string[]
}

// ── Plugin interface ───────────────────────────────────────────────────────────

export interface RascalPlugin {
  config: PluginConfig

  /**
   * One-time setup called when the plugin is first configured or when the
   * platform starts with this plugin already configured.
   * Use for npm installs, workspace scaffolding, etc.
   * Optional — API-key-only plugins don't need this.
   */
  setup?(workspaceDir: string): Promise<void>

  /**
   * Return tool instances scoped to the given agent context.
   * Called each time an agent session is created.
   */
  getTools(ctx: ToolContext): ToolDefinition[]

  /**
   * Optional health check surfaced in the Plugin Manager UI.
   */
  healthCheck?(): Promise<{ ok: boolean; message?: string }>
}

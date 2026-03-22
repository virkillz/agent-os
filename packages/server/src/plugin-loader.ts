/**
 * Plugin loader — singleton that manages built-in plugins.
 *
 * Responsibilities:
 * - Hold the registry of all RascalPlugin instances
 * - Seed the plugins table in SQLite on startup
 * - Provide getToolsForIds() used by buildAgentTools() in platform-tools.ts
 * - Run plugin setup() when a plugin becomes configured
 */

import { builtInPlugins } from './plugins/index.js'
import type { RascalPlugin, ToolContext } from './plugins/types.js'
import { getDb } from './db.js'

class PluginLoader {
  private registry = new Map<string, RascalPlugin>()
  private workspaceDir = ''

  /** Call once at startup before seedDb() */
  setWorkspaceDir(dir: string) {
    this.workspaceDir = dir
  }

  /** Load all built-in plugins into the registry */
  init() {
    for (const plugin of builtInPlugins) {
      this.registry.set(plugin.config.id, plugin)
    }
  }

  /** Upsert plugin metadata rows into SQLite. Call after initDb(). */
  seedDb() {
    const db = getDb()
    for (const plugin of this.registry.values()) {
      // Determine configured status from env vars
      const isConfigured = plugin.config.env
        .filter((e) => e.required)
        .every((e) => !!process.env[e.key])

      db.prepare(`
        INSERT INTO plugins (id, display_name, description, configured)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          display_name = excluded.display_name,
          description  = excluded.description,
          configured   = excluded.configured
      `).run(
        plugin.config.id,
        plugin.config.displayName,
        plugin.config.description,
        isConfigured ? 1 : 0,
      )
    }
  }

  /** Return all registered plugins */
  getAll(): RascalPlugin[] {
    return [...this.registry.values()]
  }

  /** Return a single plugin by ID */
  get(id: string): RascalPlugin | undefined {
    return this.registry.get(id)
  }

  /**
   * Return ToolDefinitions for all plugin-owned tool IDs in the given list.
   * Only IDs that belong to a plugin are handled here — platform tool IDs are
   * handled by buildAgentTools() in platform-tools.ts.
   */
  getToolsForIds(toolIds: string[], ctx: ToolContext) {
    // Build a map of toolId → plugin for fast lookup
    const toolToPlugin = new Map<string, RascalPlugin>()
    for (const plugin of this.registry.values()) {
      for (const toolId of plugin.config.toolIds) {
        toolToPlugin.set(toolId, plugin)
      }
    }

    // Deduplicate plugins to avoid creating the same tools twice
    const usedPlugins = new Set<RascalPlugin>()
    const requestedPluginToolIds = new Set<string>()

    for (const id of toolIds) {
      const plugin = toolToPlugin.get(id)
      if (plugin) {
        usedPlugins.add(plugin)
        requestedPluginToolIds.add(id)
      }
    }

    // Call getTools() once per plugin, then filter to only requested tool IDs
    const tools = []
    for (const plugin of usedPlugins) {
      const allPluginTools = plugin.getTools(ctx)
      for (const tool of allPluginTools) {
        if (requestedPluginToolIds.has(tool.name)) {
          tools.push(tool)
        }
      }
    }

    return tools
  }

  /**
   * Run setup() for all configured plugins that have one.
   * Called at startup after env vars are loaded.
   */
  async runSetupForConfigured() {
    for (const plugin of this.registry.values()) {
      if (!plugin.setup) continue
      const isConfigured = plugin.config.env
        .filter((e) => e.required)
        .every((e) => !!process.env[e.key])

      // Remotion has no required env vars — always run its setup
      const hasNoRequiredEnv = plugin.config.env.filter((e) => e.required).length === 0

      if (isConfigured || hasNoRequiredEnv) {
        try {
          await plugin.setup(this.workspaceDir)
        } catch (err) {
          console.warn(`  [plugin:${plugin.config.id}] setup() failed:`, err)
        }
      }
    }
  }

  /** Run setup() for a single plugin by ID (called after user configures it). */
  async runSetup(pluginId: string) {
    const plugin = this.registry.get(pluginId)
    if (!plugin?.setup) return
    await plugin.setup(this.workspaceDir)
  }

  /** Return env var metadata for a plugin (shown in Plugin Manager UI). */
  getEnvVars(pluginId: string) {
    return this.registry.get(pluginId)?.config.env ?? []
  }
}

export const pluginLoader = new PluginLoader()

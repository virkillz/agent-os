/**
 * Platform tool loader — singleton that manages built-in platform tools.
 *
 * Responsibilities:
 * - Hold the registry of all PlatformTool instances
 * - Provide getDefaultTools() for tools that are available to all agents by default
 * - Provide getToolsForIds() for explicitly enabled non-default tools
 * - Provide getAll() for the UI to render per-tool toggles in agent settings
 */

import { builtInPlatformTools } from './index.js'
import type { PlatformTool, PlatformToolEntry, ToolContext, ToolDefinition } from './types.js'

class PlatformToolLoader {
  private registry = new Map<string, PlatformTool>()

  /** Load all built-in platform tools into the registry */
  init() {
    for (const tool of builtInPlatformTools) {
      this.registry.set(tool.config.id, tool)
    }
  }

  /** Return all registered platform tool groups */
  getAll(): PlatformTool[] {
    return [...this.registry.values()]
  }

  /**
   * Return a flat list of all individual tool entries across all groups.
   * Used by the UI to render per-tool toggles.
   */
  getAllEntries(): Array<PlatformToolEntry & { groupId: string; groupDisplayName: string }> {
    const entries: Array<PlatformToolEntry & { groupId: string; groupDisplayName: string }> = []
    for (const group of this.registry.values()) {
      for (const entry of group.config.tools) {
        entries.push({
          ...entry,
          groupId: group.config.id,
          groupDisplayName: group.config.displayName,
        })
      }
    }
    return entries
  }

  /** Return the set of tool IDs that are available by default (across all groups). */
  getDefaultToolIds(): Set<string> {
    const ids = new Set<string>()
    for (const group of this.registry.values()) {
      for (const entry of group.config.tools) {
        if (entry.availableByDefault) ids.add(entry.id)
      }
    }
    return ids
  }

  /**
   * Return ToolDefinitions for all tools where availableByDefault is true.
   * Called on every agent session — these tools are always present unless
   * explicitly disabled in the agent's model_config.
   */
  getDefaultTools(ctx: ToolContext): ToolDefinition[] {
    return this._resolveTools(this.getDefaultToolIds(), ctx)
  }

  /**
   * Return ToolDefinitions for the given tool IDs, excluding defaults
   * (which are already loaded via getDefaultTools).
   * Used for tools explicitly opted into by the agent.
   */
  getToolsForIds(toolIds: string[], ctx: ToolContext): ToolDefinition[] {
    // Only resolve IDs that belong to platform tools (not plugins)
    const platformIds = new Set<string>()
    const knownIds = this._buildToolIndex()
    for (const id of toolIds) {
      if (knownIds.has(id)) platformIds.add(id)
    }
    return this._resolveTools(platformIds, ctx)
  }

  /**
   * Build the toolsBlock system prompt sections for the active tool set.
   * Each group with at least one active tool contributes its systemPrompt section.
   * Returns an array of section strings ready to be joined with '\n\n'.
   */
  getSystemPromptSections(activeToolIds: Set<string>): string[] {
    const sections: string[] = []
    for (const group of this.registry.values()) {
      if (!group.config.systemPrompt) continue
      const hasActive = group.config.tools.some(t => activeToolIds.has(t.id))
      if (hasActive) {
        sections.push(group.config.systemPrompt(activeToolIds))
      }
    }
    return sections
  }

  /**
   * Check whether a given tool ID belongs to the platform tool registry.
   * Used by buildAgentTools() to split IDs between platform and plugin loaders.
   */
  owns(toolId: string): boolean {
    return this._buildToolIndex().has(toolId)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Build a map of toolId → PlatformTool for fast lookup */
  private _buildToolIndex(): Map<string, PlatformTool> {
    const index = new Map<string, PlatformTool>()
    for (const group of this.registry.values()) {
      for (const entry of group.config.tools) {
        index.set(entry.id, group)
      }
    }
    return index
  }

  /** Resolve a set of tool IDs to ToolDefinition instances */
  private _resolveTools(ids: Set<string>, ctx: ToolContext): ToolDefinition[] {
    if (ids.size === 0) return []

    // Determine which groups contain at least one requested ID
    const index = this._buildToolIndex()
    const usedGroups = new Set<PlatformTool>()
    for (const id of ids) {
      const group = index.get(id)
      if (group) usedGroups.add(group)
    }

    // Call getTools() once per group, then filter to only requested IDs
    const tools: ToolDefinition[] = []
    for (const group of usedGroups) {
      for (const tool of group.getTools(ctx)) {
        if (ids.has(tool.name)) tools.push(tool)
      }
    }
    return tools
  }
}

export const platformToolLoader = new PlatformToolLoader()

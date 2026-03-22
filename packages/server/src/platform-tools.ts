/**
 * Platform tools — entry point for agent session wiring.
 *
 * Tool implementations live in platform-tools/<group>/index.ts.
 * This file re-exports the public surface used by agent-runner.ts.
 */

import { platformToolLoader } from './platform-tools/loader.js'
import { pluginLoader } from './plugin-loader.js'
import type { ToolContext } from './platform-tools/types.js'

export type { ToolContext }

/**
 * Build the list of custom ToolDefinitions for an agent session.
 *
 * Resolution order:
 * 1. Default platform tools (availableByDefault: true), minus any in disabledTools
 * 2. Explicitly enabled platform tools from agent's model_config.tools
 * 3. Plugin tools from agent's model_config.tools
 */
export function buildAgentTools(
  toolIds: string[],
  ctx: ToolContext,
  disabledTools: string[] = [],
) {
  const disabled = new Set(disabledTools)

  const defaultIds = new Set(
    [...platformToolLoader.getDefaultToolIds()].filter(id => !disabled.has(id))
  )
  const defaults = platformToolLoader.getToolsForIds([...defaultIds], ctx)

  // Split agent-enabled IDs between platform tools and plugins
  const platformIds = toolIds.filter(id => platformToolLoader.owns(id) && !disabled.has(id))
  const pluginIds = toolIds.filter(id => !platformToolLoader.owns(id))

  const extras = platformToolLoader.getToolsForIds(platformIds, ctx)
  const plugins = pluginLoader.getToolsForIds(pluginIds, ctx)

  return [...defaults, ...extras, ...plugins]
}

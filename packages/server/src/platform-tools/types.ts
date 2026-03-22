import type { ToolDefinition } from '@mariozechner/pi-coding-agent'

export type { ToolDefinition }

// ── Tool context ───────────────────────────────────────────────────────────────

/** Passed to getTools() so platform tools can create context-scoped tool instances. */
export interface ToolContext {
  agentId: string
  workspaceDir: string
  projectId?: string
}

// ── Platform tool manifest ─────────────────────────────────────────────────────

/**
 * Metadata for a single tool within a group.
 * availableByDefault controls whether new agents get this tool without
 * explicitly enabling it in their model_config.tools list.
 */
export interface PlatformToolEntry {
  id: string
  displayName: string
  availableByDefault: boolean
}

/**
 * A logical group of related tools (e.g. "board", "scheduling").
 * Groups are the unit of folder organisation; individual tools are toggled separately.
 */
export interface PlatformToolConfig {
  /** Group ID — used as a namespace, e.g. 'board', 'scheduling' */
  id: string
  displayName: string
  description: string
  /** Per-tool metadata with individual availability flags */
  tools: PlatformToolEntry[]
  /**
   * Optional function that returns the system prompt section for this group.
   * Receives the set of tool IDs that are actually active for this agent,
   * so the group can tailor its description to what's available.
   * Called only when at least one tool in the group is active.
   */
  systemPrompt?: (enabledToolIds: Set<string>) => string
}

// ── Platform tool interface ────────────────────────────────────────────────────

export interface PlatformTool {
  config: PlatformToolConfig

  /**
   * Return tool instances scoped to the given agent context.
   * Called each time an agent session is created.
   * Only tools whose IDs appear in the requested set will be used — the loader
   * filters the output, so getTools() may return all group tools unconditionally.
   */
  getTools(ctx: ToolContext): ToolDefinition[]
}

/**
 * Platform tool registry — all built-in platform tools are imported statically here.
 *
 * To add a new platform tool group:
 * 1. Create platform-tools/<name>/index.ts implementing PlatformTool
 * 2. Import and add it to builtInPlatformTools below
 */

import { memoryTool } from './memory/index.js'
import { todosTool } from './todos/index.js'
// import { boardTool } from './board/index.js'
import { schedulingTool } from './scheduling/index.js'
import { agentMgmtTool } from './agent-mgmt/index.js'
import { platformCommsTool } from './platform-comms/index.js'
import { conversationSearchTool } from './conversation-search/index.js'

export {
  memoryTool,
  todosTool,
  // boardTool,
  schedulingTool,
  agentMgmtTool,
  platformCommsTool,
  conversationSearchTool,
}

export const builtInPlatformTools = [
  memoryTool,
  todosTool,
  // boardTool,
  schedulingTool,
  agentMgmtTool,
  platformCommsTool,
  conversationSearchTool,
]

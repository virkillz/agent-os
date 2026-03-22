/**
 * Platform tool registry — all built-in platform tools are imported statically here.
 *
 * To add a new platform tool group:
 * 1. Create platform-tools/<name>/index.ts implementing PlatformTool
 * 2. Import and add it to builtInPlatformTools below
 */

import { memoryTool } from './memory/index.js'
import { todosTool } from './todos/index.js'
import { boardTool } from './board/index.js'
import { channelsTool } from './channels/index.js'
import { messagingTool } from './messaging/index.js'
import { schedulingTool } from './scheduling/index.js'
import { workspaceTool } from './workspace/index.js'
import { agentMgmtTool } from './agent-mgmt/index.js'

export {
  memoryTool,
  todosTool,
  boardTool,
  channelsTool,
  messagingTool,
  schedulingTool,
  workspaceTool,
  agentMgmtTool,
}

export const builtInPlatformTools = [
  memoryTool,
  todosTool,
  boardTool,
  channelsTool,
  messagingTool,
  schedulingTool,
  workspaceTool,
  agentMgmtTool,
]

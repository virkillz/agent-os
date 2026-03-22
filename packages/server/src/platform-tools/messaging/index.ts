import { Type } from '@sinclair/typebox'
import { getDb } from '../../db.js'
import { eventBus } from '../../event-bus.js'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const messagingTool: PlatformTool = {
  config: {
    id: 'messaging',
    displayName: 'Direct Messaging',
    description: 'Send proactive messages to the user via your chat thread',
    tools: [
      { id: 'send_direct_message', displayName: 'Send Direct Message', availableByDefault: true },
    ],
    systemPrompt: () =>
      `### Direct Messages\n` +
      `You can send a direct message to the user via your chat thread.\n` +
      `- send_direct_message — notify the workspace owner about reports, alerts, or task completions`,
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'send_direct_message',
        label: 'Send Direct Message',
        description:
          'Send a proactive message to the user via your chat thread. Use this to notify the workspace owner about reports, alerts, or task completions. ' +
          'The message will appear in your Agent Chat inbox.',
        parameters: Type.Object({
          message: Type.String({ description: 'The message to send' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const db = getDb()
          const result = db.prepare(
            "INSERT INTO chat_messages (agent_id, role, content) VALUES (?, 'assistant', ?)"
          ).run(ctx.agentId, params.message) as { lastInsertRowid: number | bigint }

          const agent = db.prepare('SELECT name FROM agents WHERE id = ?').get(ctx.agentId) as { name: string }
          eventBus.emit({
            type: 'chat:message',
            agentId: ctx.agentId,
            agentName: agent.name,
            role: 'assistant',
            content: params.message,
            messageId: result.lastInsertRowid as number,
          })

          return ok(JSON.stringify({ success: true, message_id: result.lastInsertRowid }))
        },
      },
    ]
  },
}

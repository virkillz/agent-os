import { Type } from '@sinclair/typebox'
import { getDb } from '../../db.js'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const conversationSearchTool: PlatformTool = {
  config: {
    id: 'conversation_search',
    displayName: 'Conversation Search',
    description: 'Search conversation history across all platforms (Telegram, Slack, Web UI)',
    tools: [
      { id: 'search_conversation_history', displayName: 'Search Conversation History', availableByDefault: true },
    ],
    systemPrompt: () =>
      `### Cross-Platform Conversation Search\n` +
      `- search_conversation_history — search past conversations from any platform (Telegram, Slack, Web UI). ` +
      `Use this when the user asks about a previous conversation on another platform, ` +
      `e.g. "check our Slack history about X" or "what did we discuss on Telegram last week".`,
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'search_conversation_history',
        label: 'Search Conversation History',
        description:
          'Search past conversations across all platforms (Telegram, Slack, Web UI). ' +
          'Returns matching messages with timestamps and platform context. ' +
          'Use when the user references a previous conversation on a different platform.',
        parameters: Type.Object({
          query: Type.String({ description: 'Keyword or phrase to search for in conversation history' }),
          platform: Type.Optional(
            Type.Union(
              [Type.Literal('telegram'), Type.Literal('slack'), Type.Literal('web')],
              { description: 'Filter to a specific platform. Omit to search all platforms.' }
            )
          ),
          limit: Type.Optional(
            Type.Number({ description: 'Max results to return (default 20, max 50)' })
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const limit = Math.min(params.limit ?? 20, 50)
          const rows = params.platform
            ? getDb()
                .prepare(
                  `SELECT platform, scope_type, scope_id, sender_name, sender_type, content, created_at
                   FROM platform_messages
                   WHERE agent_id = ? AND content LIKE ? AND platform = ?
                   ORDER BY created_at DESC LIMIT ?`
                )
                .all(ctx.agentId, `%${params.query}%`, params.platform, limit)
            : getDb()
                .prepare(
                  `SELECT platform, scope_type, scope_id, sender_name, sender_type, content, created_at
                   FROM platform_messages
                   WHERE agent_id = ? AND content LIKE ?
                   ORDER BY created_at DESC LIMIT ?`
                )
                .all(ctx.agentId, `%${params.query}%`, limit)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((rows as any[]).length === 0) {
            return ok(`No conversations found matching "${params.query}".`)
          }

          // Reverse so results are chronological
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lines = (rows as any[]).reverse().map((r) => {
            const ts = (r.created_at as string).slice(0, 16).replace('T', ' ')
            const surface = `${r.platform}/${r.scope_type}`
            return `[${ts}] [${surface}] ${r.sender_name}: ${r.content}`
          })

          return ok(lines.join('\n'))
        },
      },
    ]
  },
}

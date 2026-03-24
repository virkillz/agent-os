import { Type } from '@sinclair/typebox'
import { getDb } from '../../db.js'
import { connectorLoader } from '../../connectors/loader.js'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

type PlatformRow = {
  external_msg_id: string | null
  reply_to_msg_id: string | null
  sender_name: string
  sender_type: string
  message_type: string
  content: string
  created_at: string
}

/**
 * Build the reply_to inline object by looking up the quoted message.
 * Returns null if no reply or the referenced message isn't in the DB.
 */
function resolveReplyTo(
  db: ReturnType<typeof getDb>,
  agentId: string,
  platform: string,
  replyToMsgId: string | null,
): { message_id: string; sender: string; content: string } | null {
  if (!replyToMsgId) return null
  const row = db.prepare(`
    SELECT external_msg_id, sender_name, content
    FROM platform_messages
    WHERE agent_id = ? AND platform = ? AND external_msg_id = ?
  `).get(agentId, platform, replyToMsgId) as
    | { external_msg_id: string; sender_name: string; content: string }
    | undefined
  if (!row) return null
  return { message_id: row.external_msg_id, sender: row.sender_name, content: row.content }
}

export const platformCommsTool: PlatformTool = {
  config: {
    id: 'platform_comms',
    displayName: 'Platform Communications',
    description: 'Query conversation history and add emoji reactions on Slack/Telegram',
    tools: [
      { id: 'get_conversation_history', displayName: 'Get Conversation History', availableByDefault: true },
      { id: 'add_reaction', displayName: 'Add Reaction', availableByDefault: true },
    ],
    systemPrompt: () =>
      `### Platform Communication Tools\n` +
      `These tools are available when you are operating within a Slack or Telegram conversation.\n` +
      `- get_conversation_history — fetch past messages from a Slack/Telegram conversation. ` +
        `Use this to look up earlier context beyond what was injected automatically, or to summarise a channel's recent activity.\n` +
      `- add_reaction — add an emoji reaction to a specific platform message. ` +
        `Use this to acknowledge a message (e.g. 👍 to confirm receipt, ✅ when a task is done, 👀 to signal you're working on it). ` +
        `The triggering message ID is provided in the trigger context block at the top of your system prompt.`,
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'get_conversation_history',
        label: 'Get Conversation History',
        description:
          'Fetch stored messages from a Slack or Telegram conversation. ' +
          'Returns the last N messages for the given scope, with any quote-replies resolved inline. ' +
          'Use scope_id from the trigger context (channel ID, chat ID, or group ID).',
        parameters: Type.Object({
          platform: Type.Union([Type.Literal('slack'), Type.Literal('telegram')], {
            description: "Platform to query: 'slack' or 'telegram'",
          }),
          scope_type: Type.Union([Type.Literal('dm'), Type.Literal('channel'), Type.Literal('group')], {
            description: "Conversation scope: 'dm', 'channel' (Slack), or 'group' (Telegram)",
          }),
          scope_id: Type.String({
            description: 'The platform channel ID, chat ID, or group ID from the trigger context',
          }),
          thread_id: Type.Optional(Type.String({
            description: 'Slack thread_ts to scope to a specific thread. Omit for DMs and Telegram.',
          })),
          limit: Type.Optional(Type.Number({
            description: 'Number of messages to return (default 50, max 200)',
            minimum: 1,
            maximum: 200,
          })),
          before: Type.Optional(Type.String({
            description: 'ISO timestamp — only return messages before this time',
          })),
          include_reactions: Type.Optional(Type.Boolean({
            description: 'Include reaction events in the results (default false)',
          })),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const db = getDb()
          const limit = Math.min(Number(params.limit ?? 50), 200)
          const includeReactions = params.include_reactions === true

          const rows = db.prepare(`
            SELECT external_msg_id, reply_to_msg_id, sender_name, sender_type, message_type, content, created_at
            FROM platform_messages
            WHERE agent_id = ?
              AND platform = ?
              AND scope_type = ?
              AND scope_id = ?
              AND (? IS NULL OR (thread_id = ?))
              AND (? IS NULL OR created_at < ?)
              AND (? OR message_type != 'reaction')
            ORDER BY created_at ASC
            LIMIT ?
          `).all(
            ctx.agentId, params.platform, params.scope_type, params.scope_id,
            params.thread_id ?? null, params.thread_id ?? null,
            params.before ?? null, params.before ?? null,
            includeReactions ? 1 : 0,
            limit,
          ) as PlatformRow[]

          const messages = rows.map((row) => ({
            message_id: row.external_msg_id,
            sender: row.sender_name,
            sender_type: row.sender_type,
            message_type: row.message_type,
            content: row.content,
            timestamp: row.created_at,
            ...(row.reply_to_msg_id
              ? { reply_to: resolveReplyTo(db, ctx.agentId, params.platform, row.reply_to_msg_id) }
              : {}),
          }))

          return ok(JSON.stringify({ messages, total_count: messages.length }))
        },
      },

      {
        name: 'add_reaction',
        label: 'Add Reaction',
        description:
          'Add an emoji reaction to a platform message. ' +
          "The triggering message's ID is in your system prompt trigger context block. " +
          'You can also get message IDs from get_conversation_history results.',
        parameters: Type.Object({
          platform: Type.Union([Type.Literal('slack'), Type.Literal('telegram')], {
            description: "Platform: 'slack' or 'telegram'",
          }),
          message_id: Type.String({
            description:
              "The external message ID to react to (from trigger context or get_conversation_history). " +
              "For Slack: 'channelId:ts'. For Telegram: 'chatId:messageId'.",
          }),
          emoji: Type.String({
            description: "Emoji to react with, e.g. '👍', '✅', '👀'. For Slack: name without colons, e.g. 'thumbsup'.",
          }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const connector = connectorLoader.getConnector(ctx.agentId, params.platform)
          if (!connector) {
            throw new Error(
              `No active ${params.platform} connector for this agent. ` +
              `Ensure a ${params.platform} integration is configured and connected.`
            )
          }
          await connector.addReaction(params.message_id, params.emoji)
          return ok(JSON.stringify({ success: true }))
        },
      },
    ]
  },
}

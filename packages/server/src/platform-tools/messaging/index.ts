import { randomUUID } from 'crypto'
import { Type } from '@sinclair/typebox'
import { getDb } from '../../db.js'
import { eventBus } from '../../event-bus.js'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findOrCreateDmChannel(db: any, agentId: string, userId: string): string {
  const existing = db.prepare(`
    SELECT cm1.channel_id
    FROM channel_members cm1
    JOIN channel_members cm2 ON cm1.channel_id = cm2.channel_id
    JOIN channels c ON c.id = cm1.channel_id
    WHERE c.is_dm = 1
      AND cm1.member_id = ? AND cm1.member_type = 'agent'
      AND cm2.member_id = ? AND cm2.member_type = 'user'
  `).get(agentId, userId) as { channel_id: string } | undefined

  if (existing) return existing.channel_id

  const channelId = randomUUID()
  db.prepare("INSERT INTO channels (id, name, is_dm) VALUES (?, ?, 1)").run(channelId, `dm-${channelId}`)
  db.prepare("INSERT INTO channel_members (channel_id, member_id, member_type) VALUES (?, ?, 'agent')").run(channelId, agentId)
  db.prepare("INSERT INTO channel_members (channel_id, member_id, member_type) VALUES (?, ?, 'user')").run(channelId, userId)

  return channelId
}

export const messagingTool: PlatformTool = {
  config: {
    id: 'messaging',
    displayName: 'Direct Messaging',
    description: 'Send proactive direct messages to human users',
    tools: [
      { id: 'send_direct_message', displayName: 'Send Direct Message', availableByDefault: true },
    ],
    systemPrompt: () =>
      `### Direct Messages\n` +
      `You can send a direct message directly to the workspace owner's DM inbox.\n` +
      `- send_direct_message — notify the workspace owner about reports, alerts, or task completions. The message appears in the Channels → Direct Messages inbox.`,
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'send_direct_message',
        label: 'Send Direct Message',
        description:
          'Send a direct message to the workspace owner. Use this to proactively notify them about reports, alerts, or task completions. ' +
          'The message will appear in the Channels Direct Messages inbox. Can only message human users, not other agents.',
        parameters: Type.Object({
          message: Type.String({ description: 'The message to send' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const db = getDb()

          // Resolve the admin/owner
          const admin = db.prepare('SELECT id FROM users WHERE is_admin = 1').get() as { id: string } | undefined
          if (!admin) throw new Error('No admin user found. Please complete setup.')

          const channelId = findOrCreateDmChannel(db, ctx.agentId, admin.id)

          const agent = db.prepare('SELECT name FROM agents WHERE id = ?').get(ctx.agentId) as { name: string }
          const result = db.prepare(
            "INSERT INTO channel_messages (channel_id, sender_id, sender_type, content) VALUES (?, ?, 'agent', ?)"
          ).run(channelId, ctx.agentId, params.message) as { lastInsertRowid: number | bigint }

          eventBus.emit({
            type: 'channel:message',
            channelId,
            senderId: ctx.agentId,
            senderType: 'agent',
            senderName: agent.name,
            content: params.message,
            messageId: result.lastInsertRowid as number,
          })

          return ok(JSON.stringify({ success: true, channel_id: channelId, message_id: result.lastInsertRowid }))
        },
      },
    ]
  },
}

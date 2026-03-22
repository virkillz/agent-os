import { Type } from '@sinclair/typebox'
import { getDb, getAgentChannels, getRecentChannelMessages } from '../../db.js'
import { eventBus } from '../../event-bus.js'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const channelsTool: PlatformTool = {
  config: {
    id: 'channels',
    displayName: 'Channels',
    description: 'Team channels — list, read, and post messages to shared channels',
    tools: [
      { id: 'channel_list', displayName: 'List My Channels', availableByDefault: true },
      { id: 'channel_get_messages', displayName: 'Get Channel Messages', availableByDefault: true },
      { id: 'channel_post', displayName: 'Post to Channel', availableByDefault: true },
    ],
    systemPrompt: () =>
      `### Communication\n` +
      `You can proactively post messages to channels — don't wait to be mentioned. Use this to share updates, ask teammates for help, or announce completed work.\n` +
      `- channel_list — list channels you are a member of (use this if ## Channels is empty or to refresh)\n` +
      `- channel_get_messages — fetch the last 10 messages from a channel by channelId\n` +
      `- channel_post — post a message to a channel by channelId`,
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'channel_list',
        label: 'List My Channels',
        description:
          'List all channels you are a member of. Returns channel id and name. ' +
          'Use channel_post to send a message to one of these channels.',
        parameters: Type.Object({}),
        execute: async () => {
          const channels = getAgentChannels(ctx.agentId)
          if (!channels.length) return ok('You are not a member of any channels.')
          return ok(JSON.stringify(channels, null, 2))
        },
      },
      {
        name: 'channel_get_messages',
        label: 'Get Channel Messages',
        description:
          'Fetch the last 10 messages from a channel you are a member of. ' +
          'Use channel_list to get channel IDs.',
        parameters: Type.Object({
          channelId: Type.String({ description: 'ID of the channel to read' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const db = getDb()
          const membership = db
            .prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND member_id = ?')
            .get(params.channelId, ctx.agentId)
          if (!membership) throw new Error('You are not a member of that channel.')
          const messages = getRecentChannelMessages(params.channelId, 10).reverse()
          if (!messages.length) return ok('No messages yet.')
          return ok(JSON.stringify(messages, null, 2))
        },
      },
      {
        name: 'channel_post',
        label: 'Post to Channel',
        description:
          'Post a message to a channel. Use this to communicate updates, ask questions, or share results with the team. ' +
          'The channelId is available in your system prompt under ## Channels.',
        parameters: Type.Object({
          channelId: Type.String({ description: 'ID of the channel to post to' }),
          content: Type.String({ description: 'The message content' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const db = getDb()
          const channel = db.prepare('SELECT id, name FROM channels WHERE id = ? AND is_dm = 0').get(params.channelId) as { id: string; name: string } | undefined
          if (!channel) throw new Error(`Channel not found: ${params.channelId}`)
          const agent = db.prepare('SELECT name FROM agents WHERE id = ?').get(ctx.agentId) as { name: string } | undefined
          const agentName = agent?.name ?? ctx.agentId

          const msgId = (db
            .prepare('INSERT INTO channel_messages (channel_id, sender_id, sender_type, content) VALUES (?, ?, ?, ?)')
            .run(params.channelId, ctx.agentId, 'agent', params.content.trim()) as { lastInsertRowid: number | bigint }).lastInsertRowid as number

          eventBus.emit({
            type: 'channel:message',
            channelId: params.channelId,
            senderId: ctx.agentId,
            senderType: 'agent',
            senderName: agentName,
            content: params.content.trim(),
            messageId: msgId,
          })

          return ok(`Message posted to #${channel.name}`)
        },
      },
    ]
  },
}

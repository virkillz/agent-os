/**
 * Builds the system prompt addendum and conversation history block
 * for Slack-triggered invocations.
 */

export interface SlackTriggerMeta {
  platform: 'slack'
  scopeType: 'dm' | 'channel'
  scopeId: string
  threadId: string | null
  senderName: string
  senderId: string
  externalMsgId: string    // Slack ts of the inbound message (encoded as "channelId:ts")
  channelName?: string     // human-readable channel name e.g. "marketing"
  creatorId?: string       // Slack user ID of the trusted owner
}

export function buildSlackContextAddendum(ctx: SlackTriggerMeta): string {
  if (ctx.scopeType === 'dm') {
    return [
      '[Trigger Context — Slack DM]',
      'You are responding to a direct message on Slack.',
      `Sender: ${ctx.senderName} — Slack user ID: ${ctx.senderId}`,
      `Triggering message ID: ${ctx.externalMsgId} (use with add_reaction to react to this message)`,
      'Format responses using Slack markdown: *bold*, _italic_, `code`, ```code block```.',
      'Keep responses focused and concise.',
    ].join('\n')
  }

  // Channel (with threading)
  const channelRef = ctx.channelName ? `#${ctx.channelName} (${ctx.scopeId})` : ctx.scopeId
  // If threadId equals the ts part of externalMsgId, this is a new thread we're starting
  const inboundTs = ctx.externalMsgId.split(':')[1] ?? ctx.externalMsgId
  const isExistingThread = ctx.threadId !== null && ctx.threadId !== inboundTs

  return [
    `[Trigger Context — Slack Channel${isExistingThread ? ' Thread' : ''}]`,
    `You are responding to a message in Slack channel ${channelRef}.`,
    isExistingThread
      ? 'You were @mentioned inside an existing thread.'
      : 'You were @mentioned in the channel. Your reply will start a new thread.',
    `The message was sent by: ${ctx.senderName} (Slack user ID: ${ctx.senderId})`,
    `Triggering message ID: ${ctx.externalMsgId} (use with add_reaction to react to this message)`,
    'Reply within this thread. Format your response using Slack markdown (*bold*, `code`, etc.).',
  ].join('\n')
}

export interface HistoryMessage {
  sender_name: string
  sender_type: string
  content: string
  created_at: string
}

export function buildConversationHistoryBlock(
  messages: HistoryMessage[],
  label: string,
): string {
  if (messages.length === 0) return ''

  const lines = messages.map((m) => {
    const ts = m.created_at.replace('T', ' ').slice(0, 16)
    return `[${ts}] ${m.sender_name} (${m.sender_type}): ${m.content}`
  })

  return [
    `[Conversation History — last ${messages.length} messages, ${label}]`,
    ...lines,
  ].join('\n')
}

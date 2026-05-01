/**
 * Builds the system prompt addendum for Telegram-triggered invocations.
 */

export interface TelegramTriggerMeta {
  platform: 'telegram'
  scopeType: 'dm' | 'group'
  scopeId: string
  threadId: null  // Telegram groups don't have threads; always null
  senderName: string
  senderId: string
  externalMsgId: string  // "chatId:messageId" — for add_reaction on the triggering message
  groupTitle?: string    // human-readable group name, if available
  creatorId?: string     // Telegram user ID of the trusted owner
}

export function buildTelegramContextAddendum(ctx: TelegramTriggerMeta): string {
  if (ctx.scopeType === 'dm') {
    return [
      '[Trigger Context — Telegram DM]',
      'You are responding to a direct message on Telegram.',
      `Sender: ${ctx.senderName} — Telegram user ID: ${ctx.senderId}`,
      `Triggering message ID: ${ctx.externalMsgId} (use with add_reaction to react to this message)`,
      'Format responses using plain text. Keep responses focused and concise.',
    ].join('\n')
  }

  // Group
  const groupRef = ctx.groupTitle
    ? `"${ctx.groupTitle}" (group ID: ${ctx.scopeId})`
    : `group ID: ${ctx.scopeId}`

  return [
    '[Trigger Context — Telegram Group]',
    `You are responding to a message in Telegram group ${groupRef}.`,
    `You were mentioned by ${ctx.senderName} (Telegram user ID: ${ctx.senderId}).`,
    `Triggering message ID: ${ctx.externalMsgId} (use with add_reaction to react to this message)`,
    "Format responses using plain text; Telegram group chats don't always render markdown well.",
  ].join('\n')
}

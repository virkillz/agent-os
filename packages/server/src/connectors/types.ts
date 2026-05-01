/**
 * Shared types for the connector system.
 * Connectors bridge external platforms (Slack, Telegram) to the invocation queue.
 */

export interface Connector {
  platform: 'slack' | 'telegram'
  agentId: string
  start(): Promise<void>
  stop(): Promise<void>
  sendMessage(scopeId: string, threadId: string | null, text: string): Promise<void>
  sendImage(scopeId: string, threadId: string | null, attachment: Attachment): Promise<void>
  addReaction(externalMsgId: string, emoji: string): Promise<void>
}

/** Parsed inbound message from any platform, normalised for the invocation pipeline */
export interface InboundMessage {
  platform: 'slack' | 'telegram'
  messageType: 'message' | 'reaction'
  direction: 'inbound'
  scopeType: 'dm' | 'channel' | 'group'
  scopeId: string
  threadId: string | null
  externalMsgId: string
  replyToMsgId: string | null
  senderId: string
  senderName: string
  senderType: 'user'
  content: string
  rawPayload: string
}

/** Context injected into an invocation originating from a platform trigger */
export interface TriggerContext {
  platform: 'slack' | 'telegram'
  scopeType: 'dm' | 'channel' | 'group'
  scopeId: string
  threadId: string | null
  senderName: string
  senderId: string
}

/** Attachment sent with a platform message */
export interface Attachment {
  type: 'image'
  mimeType: string
  data: string // base64-encoded
}

/** Config shape returned from agent_channels.config for Slack */
export interface SlackChannelConfig {
  app_token: string
  bot_token: string
  dm_enabled?: boolean
  channel_ids?: string[]
  creator_id?: string
  history_window?: number
  auto_follow_threads?: boolean
  include_reactions_in_history?: boolean
}

/** Config shape returned from agent_channels.config for Telegram */
export interface TelegramChannelConfig {
  bot_token: string
  dm_enabled?: boolean
  group_ids?: string[]
  creator_id?: string
  history_window?: number
  auto_follow_threads?: boolean
  include_reactions_in_history?: boolean
}

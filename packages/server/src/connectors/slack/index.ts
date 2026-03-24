import _bolt from '@slack/bolt'
// @slack/bolt is CommonJS; destructure after the default import
const { App } = _bolt as any
import { randomUUID } from 'crypto'
import chalk from 'chalk'
import { getDb } from '../../db.js'
import { enqueueInvocation } from '../../queue-worker.js'
import type { Connector, SlackIntegrationConfig } from '../types.js'
import { toSlackMarkdown } from './format.js'
import type { SlackTriggerMeta } from './context.js'

export class SlackConnector implements Connector {
  readonly platform = 'slack' as const
  readonly agentId: string

  private config: SlackIntegrationConfig
  private app: InstanceType<typeof App>
  private botUserId: string | null = null

  constructor(agentId: string, config: SlackIntegrationConfig) {
    this.agentId = agentId
    this.config = config
    this.app = new App({
      token: config.bot_token,
      appToken: config.app_token,
      socketMode: true,
      // Suppress the default Bolt logger to avoid noise
      logLevel: 'error' as any,
    })
  }

  async start(): Promise<void> {
    // Resolve bot user ID for mention detection
    try {
      const auth = await this.app.client.auth.test({ token: this.config.bot_token })
      this.botUserId = auth.user_id as string
    } catch (err) {
      console.warn(chalk.yellow('[slack]'), 'could not resolve bot user ID:', err instanceof Error ? err.message : err)
    }

    // DM handler — fires for all messages in DM channels
    this.app.message(async ({ message }: { message: any }) => {
      try {
        // Only handle top-level user messages (no subtypes = normal message)
        if ('subtype' in message && message.subtype) return
        if (!('channel_type' in message) || message.channel_type !== 'im') return
        if (!('user' in message) || !message.user) return
        await this.handleDM(message as any)
      } catch (err) {
        console.error(chalk.red('[slack]'), 'DM handler error:', err instanceof Error ? err.message : err)
      }
    })

    // @mention handler — fires when the bot is @mentioned in any channel
    this.app.event('app_mention', async ({ event }: { event: any }) => {
      try {
        await this.handleChannelMention(event as any)
      } catch (err) {
        console.error(chalk.red('[slack]'), 'mention handler error:', err instanceof Error ? err.message : err)
      }
    })

    await this.app.start()
    console.log(chalk.green('[slack]'), `connector started (agent: ${this.agentId}, bot: ${this.botUserId ?? 'unknown'})`)
  }

  async stop(): Promise<void> {
    await this.app.stop()
    console.log(chalk.dim('[slack]'), `connector stopped (agent: ${this.agentId})`)
  }

  async sendMessage(scopeId: string, threadId: string | null, text: string): Promise<void> {
    await this.app.client.chat.postMessage({
      token: this.config.bot_token,
      channel: scopeId,
      text: toSlackMarkdown(text),
      ...(threadId ? { thread_ts: threadId } : {}),
    })
  }

  async addReaction(externalMsgId: string, emoji: string): Promise<void> {
    // externalMsgId is stored as "channelId:ts"
    const colonIdx = externalMsgId.indexOf(':')
    if (colonIdx === -1) {
      console.warn(chalk.yellow('[slack]'), 'addReaction: malformed externalMsgId:', externalMsgId)
      return
    }
    const channel = externalMsgId.slice(0, colonIdx)
    const timestamp = externalMsgId.slice(colonIdx + 1)
    const name = emoji.replace(/:/g, '').trim()

    await this.app.client.reactions.add({
      token: this.config.bot_token,
      channel,
      timestamp,
      name,
    })
  }

  // ── Private handlers ───────────────────────────────────────────────────────

  private async handleDM(message: {
    channel: string
    user: string
    text?: string
    ts: string
  }): Promise<void> {
    if (this.config.dm_enabled === false) return

    const { channel: channelId, user: senderId, text = '', ts } = message
    const externalMsgId = `${channelId}:${ts}`

    const senderName = await this.resolveUserName(senderId)

    // Deduplicate + store inbound
    if (!this.storeInbound({
      scopeType: 'dm', scopeId: channelId, threadId: null,
      externalMsgId, senderId, senderName, content: text,
      raw: JSON.stringify(message),
    })) return  // already processed

    // Auto-register trigger row
    const triggerId = this.ensureTrigger('slack_dm', `Slack DM — ${senderName}`, 'dm', channelId)
    if (!this.isTriggerEnabled(triggerId)) return

    const ctx: SlackTriggerMeta = {
      platform: 'slack',
      scopeType: 'dm',
      scopeId: channelId,
      threadId: null,
      senderName,
      senderId,
      externalMsgId,
    }

    enqueueInvocation({
      agentId: this.agentId,
      triggerId,
      triggerType: 'slack_dm',
      prompt: text,
      triggerContext: ctx,
    })
  }

  private async handleChannelMention(event: {
    channel: string
    user: string
    text: string
    ts: string
    thread_ts?: string
  }): Promise<void> {
    const { channel: channelId, user: senderId, text, ts, thread_ts } = event
    // If already in a thread use its thread_ts; otherwise reply to this message (creating a new thread)
    const threadId = thread_ts ?? ts
    const externalMsgId = `${channelId}:${ts}`

    const [senderName, channelName] = await Promise.all([
      this.resolveUserName(senderId),
      this.resolveChannelName(channelId),
    ])

    // Strip the bot @mention from the content so the agent sees clean text
    const cleanContent = text.replace(/<@[A-Z0-9]+>/g, '').trim()

    // Deduplicate + store inbound
    if (!this.storeInbound({
      scopeType: 'channel', scopeId: channelId, threadId,
      externalMsgId, senderId, senderName, content: cleanContent,
      raw: JSON.stringify(event),
    })) return  // already processed

    // Auto-register trigger row
    const label = channelName ? `Slack — #${channelName}` : `Slack — ${channelId}`
    const triggerId = this.ensureTrigger('slack_channel', label, 'channel', channelId)
    if (!this.isTriggerEnabled(triggerId)) return

    const ctx: SlackTriggerMeta = {
      platform: 'slack',
      scopeType: 'channel',
      scopeId: channelId,
      threadId,
      senderName,
      senderId,
      externalMsgId,
      channelName,
    }

    enqueueInvocation({
      agentId: this.agentId,
      triggerId,
      triggerType: 'slack_channel',
      prompt: cleanContent,
      triggerContext: ctx,
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Store an inbound message, deduplicating on externalMsgId.
   * Returns false if already stored (skip further processing).
   */
  private storeInbound(opts: {
    scopeType: string
    scopeId: string
    threadId: string | null
    externalMsgId: string
    senderId: string
    senderName: string
    content: string
    raw: string
  }): boolean {
    try {
      getDb().prepare(`
        INSERT INTO platform_messages
          (agent_id, platform, message_type, direction, scope_type, scope_id, thread_id,
           external_msg_id, sender_id, sender_name, sender_type, content, raw_payload)
        VALUES (?, 'slack', 'message', 'inbound', ?, ?, ?, ?, ?, ?, 'user', ?, ?)
      `).run(
        this.agentId,
        opts.scopeType, opts.scopeId, opts.threadId,
        opts.externalMsgId, opts.senderId, opts.senderName,
        opts.content, opts.raw,
      )
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE')) return false  // already processed
      throw err
    }
  }

  private ensureTrigger(
    type: string,
    label: string,
    scopeType: string,
    scopeId: string,
  ): string {
    const db = getDb()
    const existing = db.prepare(
      'SELECT id FROM agent_triggers WHERE agent_id = ? AND type = ? AND scope_id = ?'
    ).get(this.agentId, type, scopeId) as { id: string } | undefined

    if (existing) return existing.id

    const id = randomUUID()
    db.prepare(`
      INSERT INTO agent_triggers (id, agent_id, type, label, platform, scope_type, scope_id)
      VALUES (?, ?, ?, ?, 'slack', ?, ?)
    `).run(id, this.agentId, type, label, scopeType, scopeId)
    return id
  }

  private isTriggerEnabled(triggerId: string): boolean {
    const row = getDb()
      .prepare('SELECT enabled FROM agent_triggers WHERE id = ?')
      .get(triggerId) as { enabled: number } | undefined
    return row?.enabled === 1
  }

  private async resolveUserName(userId: string): Promise<string> {
    try {
      const info = await this.app.client.users.info({ token: this.config.bot_token, user: userId })
      const user = info.user as any
      return user?.real_name ?? user?.name ?? userId
    } catch {
      return userId
    }
  }

  private async resolveChannelName(channelId: string): Promise<string | undefined> {
    try {
      const info = await this.app.client.conversations.info({ token: this.config.bot_token, channel: channelId })
      return (info.channel as any)?.name as string | undefined
    } catch {
      return undefined
    }
  }
}

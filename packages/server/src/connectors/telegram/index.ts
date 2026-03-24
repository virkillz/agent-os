import { Telegraf } from 'telegraf'
import { randomUUID } from 'crypto'
import chalk from 'chalk'
import { getDb } from '../../db.js'
import { enqueueInvocation } from '../../queue-worker.js'
import type { Connector, TelegramIntegrationConfig } from '../types.js'
import { toTelegramText } from './format.js'
import type { TelegramTriggerMeta } from './context.js'

export class TelegramConnector implements Connector {
  readonly platform = 'telegram' as const
  readonly agentId: string

  private config: TelegramIntegrationConfig
  private bot: Telegraf
  private botUsername: string | null = null

  constructor(agentId: string, config: TelegramIntegrationConfig) {
    this.agentId = agentId
    this.config = config
    this.bot = new Telegraf(config.bot_token)
  }

  async start(): Promise<void> {
    this.bot.on('message', async (ctx) => {
      try {
        await this.handleMessage(ctx)
      } catch (err) {
        console.error(chalk.red('[telegram]'), 'message handler error:', err instanceof Error ? err.message : err)
      }
    })

    // launch() starts long polling and resolves once the bot is ready
    await this.bot.launch()
    this.botUsername = this.bot.botInfo?.username ?? null
    console.log(chalk.green('[telegram]'), `connector started (agent: ${this.agentId}, bot: @${this.botUsername ?? 'unknown'})`)
  }

  async stop(): Promise<void> {
    this.bot.stop()
    console.log(chalk.dim('[telegram]'), `connector stopped (agent: ${this.agentId})`)
  }

  async sendMessage(scopeId: string, _threadId: string | null, text: string): Promise<void> {
    await this.bot.telegram.sendMessage(scopeId, toTelegramText(text))
  }

  async addReaction(externalMsgId: string, emoji: string): Promise<void> {
    // externalMsgId is stored as "chatId:messageId"
    const colonIdx = externalMsgId.indexOf(':')
    if (colonIdx === -1) {
      console.warn(chalk.yellow('[telegram]'), 'addReaction: malformed externalMsgId:', externalMsgId)
      return
    }
    const chatId = externalMsgId.slice(0, colonIdx)
    const messageId = parseInt(externalMsgId.slice(colonIdx + 1), 10)
    try {
      // setMessageReaction requires Bot API 7.0+
      await (this.bot.telegram as any).callApi('setMessageReaction', {
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: 'emoji', emoji }],
      })
    } catch (err) {
      console.warn(chalk.yellow('[telegram]'), 'addReaction failed:', err instanceof Error ? err.message : err)
    }
  }

  // ── Private handlers ───────────────────────────────────────────────────────

  private async handleMessage(ctx: any): Promise<void> {
    const msg = ctx.message
    if (!msg?.text || !msg.from) return

    const chatType: string = ctx.chat?.type  // 'private' | 'group' | 'supergroup'
    const chatId = String(ctx.chat?.id ?? '')
    const externalMsgId = `${chatId}:${msg.message_id}`
    const senderId = String(msg.from.id)
    const senderName =
      [msg.from.first_name as string | undefined, msg.from.last_name as string | undefined]
        .filter(Boolean)
        .join(' ') || (msg.from.username as string | undefined) || senderId
    const replyToMsgId = msg.reply_to_message
      ? `${chatId}:${msg.reply_to_message.message_id}`
      : null

    if (chatType === 'private') {
      await this.handleDM({ chatId, senderId, senderName, text: msg.text, externalMsgId, replyToMsgId, raw: JSON.stringify(msg) })
    } else if (chatType === 'group' || chatType === 'supergroup') {
      await this.handleGroup(ctx, { chatId, senderId, senderName, text: msg.text, externalMsgId, replyToMsgId, raw: JSON.stringify(msg) })
    }
  }

  private async handleDM(opts: {
    chatId: string
    senderId: string
    senderName: string
    text: string
    externalMsgId: string
    replyToMsgId: string | null
    raw: string
  }): Promise<void> {
    if (this.config.dm_enabled === false) return

    const { chatId, senderId, senderName, text, externalMsgId, replyToMsgId, raw } = opts

    if (!this.storeInbound({ scopeType: 'dm', scopeId: chatId, externalMsgId, replyToMsgId, senderId, senderName, content: text, raw })) {
      return  // duplicate
    }

    const triggerId = this.ensureTrigger('telegram_dm', `Telegram DM — ${senderName}`, 'dm', chatId)
    if (!this.isTriggerEnabled(triggerId)) return

    const triggerMeta: TelegramTriggerMeta = { platform: 'telegram', scopeType: 'dm', scopeId: chatId, threadId: null, senderName, senderId, externalMsgId }

    enqueueInvocation({ agentId: this.agentId, triggerId, triggerType: 'telegram_dm', prompt: text, triggerContext: triggerMeta })
  }

  private async handleGroup(ctx: any, opts: {
    chatId: string
    senderId: string
    senderName: string
    text: string
    externalMsgId: string
    replyToMsgId: string | null
    raw: string
  }): Promise<void> {
    const { chatId, senderId, senderName, text, externalMsgId, replyToMsgId, raw } = opts
    const groupTitle = ctx.chat?.title as string | undefined

    // Store all group messages for conversation history, regardless of mention
    if (!this.storeInbound({ scopeType: 'group', scopeId: chatId, externalMsgId, replyToMsgId, senderId, senderName, content: text, raw })) {
      return  // duplicate
    }

    // Respond only if @mentioned or if someone replied to one of the agent's messages
    const isMentioned = this.isBotMentioned(ctx.message)
    const isReplyToAgent = this.isReplyToAgentMessage(ctx.message)
    if (!isMentioned && !isReplyToAgent) return

    const label = groupTitle ? `Telegram — ${groupTitle}` : `Telegram — ${chatId}`
    const triggerId = this.ensureTrigger('telegram_group', label, 'group', chatId)
    if (!this.isTriggerEnabled(triggerId)) return

    // Strip @mention from the prompt the agent sees
    const cleanContent = text.replace(/@\w+/g, '').trim() || text

    const triggerMeta: TelegramTriggerMeta = { platform: 'telegram', scopeType: 'group', scopeId: chatId, threadId: null, senderName, senderId, externalMsgId, groupTitle }

    enqueueInvocation({ agentId: this.agentId, triggerId, triggerType: 'telegram_group', prompt: cleanContent, triggerContext: triggerMeta })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private isBotMentioned(msg: any): boolean {
    if (!this.botUsername) return false
    const entities: Array<{ type: string; offset: number; length: number }> | undefined = msg.entities
    if (!entities) return false
    return entities.some((e) => {
      if (e.type !== 'mention') return false
      const mentioned: string = (msg.text as string).slice(e.offset, e.offset + e.length)
      return mentioned.toLowerCase() === `@${this.botUsername!.toLowerCase()}`
    })
  }

  /** Returns true if this message is a reply to a message the agent sent */
  private isReplyToAgentMessage(msg: any): boolean {
    if (!msg.reply_to_message?.from) return false
    // The replied-to message was from our bot
    return msg.reply_to_message.from.username === this.botUsername
  }

  private storeInbound(opts: {
    scopeType: string
    scopeId: string
    externalMsgId: string
    replyToMsgId: string | null
    senderId: string
    senderName: string
    content: string
    raw: string
  }): boolean {
    try {
      getDb().prepare(`
        INSERT INTO platform_messages
          (agent_id, platform, message_type, direction, scope_type, scope_id, thread_id,
           external_msg_id, reply_to_msg_id, sender_id, sender_name, sender_type, content, raw_payload)
        VALUES (?, 'telegram', 'message', 'inbound', ?, ?, NULL, ?, ?, ?, ?, 'user', ?, ?)
      `).run(
        this.agentId,
        opts.scopeType, opts.scopeId,
        opts.externalMsgId, opts.replyToMsgId,
        opts.senderId, opts.senderName,
        opts.content, opts.raw,
      )
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE')) return false  // already processed
      throw err
    }
  }

  private ensureTrigger(type: string, label: string, scopeType: string, scopeId: string): string {
    const db = getDb()
    const existing = db.prepare(
      'SELECT id FROM agent_triggers WHERE agent_id = ? AND type = ? AND scope_id = ?'
    ).get(this.agentId, type, scopeId) as { id: string } | undefined

    if (existing) return existing.id

    const id = randomUUID()
    db.prepare(`
      INSERT INTO agent_triggers (id, agent_id, type, label, platform, scope_type, scope_id)
      VALUES (?, ?, ?, ?, 'telegram', ?, ?)
    `).run(id, this.agentId, type, label, scopeType, scopeId)
    return id
  }

  private isTriggerEnabled(triggerId: string): boolean {
    const row = getDb()
      .prepare('SELECT enabled FROM agent_triggers WHERE id = ?')
      .get(triggerId) as { enabled: number } | undefined
    return row?.enabled === 1
  }
}

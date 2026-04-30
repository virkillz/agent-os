import chalk from 'chalk'
import { getDb, type InvocationQueueRow } from './db.js'
import { invokeAgent, chatWithChannel, isDebugMode, type AgentRecord, type ModelConfig } from './agent-runner.js'
import { eventBus } from './event-bus.js'
import { connectorLoader } from './connectors/loader.js'
import { type SlackTriggerMeta } from './connectors/slack/context.js'
import { type TelegramTriggerMeta } from './connectors/telegram/context.js'
import type { Attachment } from './connectors/types.js'

// ── Platform trigger context ───────────────────────────────────────────────

type PlatformTriggerContext = SlackTriggerMeta | TelegramTriggerMeta

/**
 * Build a compact one-line header prepended to each platform message so the
 * agent always knows who sent it and can reference the message ID for reactions.
 * The session itself maintains full conversation history — no history injection needed.
 */
function buildMessageHeader(ctx: PlatformTriggerContext): string {
  if (ctx.platform === 'telegram') {
    const surface = ctx.scopeType === 'group'
      ? `Telegram Group${(ctx as TelegramTriggerMeta).groupTitle ? ' "' + (ctx as TelegramTriggerMeta).groupTitle + '"' : ''}`
      : 'Telegram DM'
    return `[${surface} | From: ${ctx.senderName} | msg_id:${ctx.externalMsgId}]`
  }
  const surface = ctx.scopeType === 'channel'
    ? `Slack #${(ctx as SlackTriggerMeta).channelName ?? ctx.scopeId}`
    : 'Slack DM'
  return `[${surface} | From: ${ctx.senderName} | msg_id:${ctx.externalMsgId}]`
}

/** Derive a stable channel key from the trigger context for session lookup. */
function buildChannelKey(ctx: PlatformTriggerContext): string {
  if (ctx.platform === 'telegram') {
    return `telegram:${ctx.scopeType}:${ctx.scopeId}`
  }
  // Slack: threads are isolated sessions; top-level DMs share one session
  if (ctx.scopeType === 'channel' && ctx.threadId) {
    return `slack:channel:${ctx.scopeId}:${ctx.threadId}`
  }
  return `slack:${ctx.scopeType}:${ctx.scopeId}`
}

function getFallbackModel(): ModelConfig {
  return { provider: 'openrouter', modelId: 'moonshotai/kimi-k2.5', thinkingLevel: 'low' }
}

function retryDelayMs(retryCount: number): number {
  if (retryCount === 0) return 10_000
  if (retryCount === 1) return 30_000
  if (retryCount === 2) return 60_000
  return 120_000
}

function retryAfterIso(retryCount: number): string {
  return new Date(Date.now() + retryDelayMs(retryCount)).toISOString()
}

async function processRow(row: InvocationQueueRow): Promise<void> {
  const db = getDb()

  // Mark as processing
  db.prepare("UPDATE invocation_queue SET status = 'processing' WHERE id = ?").run(row.id)

  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND is_active = 1').get(row.agent_id) as
    | (AgentRecord & { is_active: number })
    | undefined

  if (!agent) {
    db.prepare("UPDATE invocation_queue SET status = 'failed', processed_at = datetime('now') WHERE id = ?").run(row.id)
    eventBus.emit({ type: 'invocation:failed', agentId: row.agent_id, triggerType: row.trigger_type, queueId: row.id, error: 'Agent not found or inactive' })
    return
  }

  let payload: { prompt: string; triggerContext?: PlatformTriggerContext; attachments?: Attachment[] }
  try {
    payload = JSON.parse(row.payload)
  } catch {
    db.prepare("UPDATE invocation_queue SET status = 'failed', processed_at = datetime('now') WHERE id = ?").run(row.id)
    eventBus.emit({ type: 'invocation:failed', agentId: row.agent_id, triggerType: row.trigger_type, queueId: row.id, error: 'Invalid payload JSON' })
    return
  }

  if (isDebugMode()) {
    console.log(chalk.cyan('[queue-worker]'), chalk.bold('processing'), `queueId=${row.id}`, `agent=${agent.name}`, `type=${row.trigger_type}`)
  }

  const ctx = payload.triggerContext
  const attachments = payload.attachments

  try {
    let response: { text: string; generatedImages: Attachment[] }
    if (ctx) {
      // Platform message (Telegram/Slack): use the persistent channel session so the
      // agent has full conversation memory. Prepend a compact header with sender info
      // and message ID (needed for reactions); the session handles history itself.
      const channelKey = buildChannelKey(ctx)
      const header = buildMessageHeader(ctx)
      const message = `${header}\n${payload.prompt}`
      response = await chatWithChannel(agent, channelKey, ctx.platform, message, getFallbackModel(), ctx.scopeType, ctx.scopeId, attachments)
    } else {
      // Scheduled / other non-platform trigger: isolated fresh session (existing behaviour)
      response = await invokeAgent(agent, payload.prompt, getFallbackModel(), { attachments })
    }

    // Store outbound platform message and deliver via connector
    if (ctx) {
      db.prepare(`
        INSERT OR IGNORE INTO platform_messages
          (agent_id, platform, message_type, direction, scope_type, scope_id, thread_id,
           sender_id, sender_name, sender_type, content)
        VALUES (?, ?, 'message', 'outbound', ?, ?, ?, ?, ?, 'agent', ?)
      `).run(
        row.agent_id, ctx.platform,
        ctx.scopeType, ctx.scopeId, ctx.threadId,
        row.agent_id, agent.name, response.text,
      )

      const connector = connectorLoader.getConnector(row.agent_id, ctx.platform)
      if (connector) {
        await connector.sendMessage(ctx.scopeId, ctx.threadId, response.text)
        // Send any generated images after the text message
        for (const img of response.generatedImages) {
          await connector.sendImage(ctx.scopeId, ctx.threadId, img)
        }
      } else {
        console.warn(chalk.yellow('[queue-worker]'), `no active connector for ${ctx.platform}, agent ${row.agent_id}`)
      }
    }

    // Mark done
    db.prepare("UPDATE invocation_queue SET status = 'done', processed_at = datetime('now') WHERE id = ?").run(row.id)

    // Update trigger stats
    if (row.trigger_id) {
      db.prepare("UPDATE agent_triggers SET last_fired_at = datetime('now'), fire_count = fire_count + 1 WHERE id = ?")
        .run(row.trigger_id)
    }

    eventBus.emit({ type: 'invocation:completed', agentId: row.agent_id, triggerType: row.trigger_type, queueId: row.id })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const is429 = /429|rate.?limit|too.?many.?request/i.test(msg)
    const newRetryCount = row.retry_count + 1

    if (newRetryCount > 3) {
      db.prepare("UPDATE invocation_queue SET status = 'failed', processed_at = datetime('now') WHERE id = ?").run(row.id)
      eventBus.emit({ type: 'invocation:failed', agentId: row.agent_id, triggerType: row.trigger_type, queueId: row.id, error: msg })
      console.error(`[queue-worker] queueId=${row.id} permanently failed after ${newRetryCount} retries: ${msg}`)
    } else {
      const retryAfter = retryAfterIso(newRetryCount)
      db.prepare("UPDATE invocation_queue SET status = 'pending', retry_count = ?, retry_after = ? WHERE id = ?")
        .run(newRetryCount, retryAfter, row.id)

      if (is429) {
        eventBus.emit({ type: 'invocation:rate_limited', agentId: row.agent_id, retryAfter })
      }

      if (isDebugMode()) {
        console.log(chalk.cyan('[queue-worker]'), chalk.yellow('retry'), `queueId=${row.id}`, `attempt=${newRetryCount}`, `after=${retryAfter}`)
      }
    }
  }
}

/**
 * Enqueue an invocation for an agent.
 * Returns the new invocation_queue row id.
 */
export function enqueueInvocation(opts: {
  agentId: string
  triggerId: string | null
  triggerType: string
  prompt: string
  triggerContext?: PlatformTriggerContext
  attachments?: Attachment[]
}): number {
  const db = getDb()
  const payload = JSON.stringify({
    prompt: opts.prompt,
    ...(opts.triggerContext ? { triggerContext: opts.triggerContext } : {}),
    ...(opts.attachments ? { attachments: opts.attachments } : {}),
  })
  const result = db.prepare(
    'INSERT INTO invocation_queue (agent_id, trigger_id, trigger_type, payload) VALUES (?, ?, ?, ?)'
  ).run(opts.agentId, opts.triggerId, opts.triggerType, payload) as { lastInsertRowid: number | bigint }

  const queueId = Number(result.lastInsertRowid)
  eventBus.emit({ type: 'invocation:queued', agentId: opts.agentId, triggerType: opts.triggerType, queueId })
  return queueId
}

// Track agents currently being processed to avoid parallel runs per agent
const processing = new Set<string>()

export function startQueueWorker(): void {
  // ── Recovery: reset rows stuck in processing for >5 min (crashed runs)
  {
    const db = getDb()
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    const stuck = db.prepare(
      "SELECT id FROM invocation_queue WHERE status = 'processing' AND created_at <= ?"
    ).all(fiveMinAgo) as { id: number }[]
    for (const row of stuck) {
      db.prepare("UPDATE invocation_queue SET status = 'pending', retry_count = retry_count + 1 WHERE id = ?")
        .run(row.id)
      if (isDebugMode()) {
        console.log(chalk.cyan('[queue-worker]'), chalk.yellow('recovered stuck row'), `queueId=${row.id}`)
      }
    }
  }

  setInterval(async () => {
    const db = getDb()
    const now = new Date().toISOString()

    // Pick one pending row per agent that isn't already processing
    const rows = db.prepare(`
      SELECT * FROM invocation_queue
      WHERE status = 'pending'
        AND (retry_after IS NULL OR retry_after <= ?)
      ORDER BY created_at ASC
    `).all(now) as unknown as InvocationQueueRow[]

    // Deduplicate: one per agent
    const seen = new Set<string>()
    const toProcess: InvocationQueueRow[] = []
    for (const row of rows) {
      if (!seen.has(row.agent_id) && !processing.has(row.agent_id)) {
        seen.add(row.agent_id)
        toProcess.push(row)
      }
    }

    for (const row of toProcess) {
      processing.add(row.agent_id)
      processRow(row).finally(() => processing.delete(row.agent_id))
    }
  }, 5_000)
}

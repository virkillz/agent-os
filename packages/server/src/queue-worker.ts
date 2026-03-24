import chalk from 'chalk'
import { getDb, getSetting, type InvocationQueueRow } from './db.js'
import { invokeAgent, isDebugMode, type AgentRecord, type ModelConfig } from './agent-runner.js'
import { eventBus } from './event-bus.js'
import { connectorLoader } from './connectors/loader.js'
import { buildSlackContextAddendum, buildConversationHistoryBlock, type SlackTriggerMeta } from './connectors/slack/context.js'
import { buildTelegramContextAddendum, type TelegramTriggerMeta } from './connectors/telegram/context.js'

// ── Platform trigger context ───────────────────────────────────────────────

type PlatformTriggerContext = SlackTriggerMeta | TelegramTriggerMeta

function buildPlatformAddendum(
  ctx: PlatformTriggerContext,
  agentId: string,
  historyWindow: number,
): string {
  const db = getDb()

  // Build trigger context addendum text
  const contextText = ctx.platform === 'telegram'
    ? buildTelegramContextAddendum(ctx)
    : buildSlackContextAddendum(ctx)

  // Fetch conversation history from platform_messages
  const rows = db.prepare(`
    SELECT sender_name, sender_type, content, created_at
    FROM platform_messages
    WHERE agent_id = ?
      AND platform = ?
      AND scope_id = ?
      AND (
        (? IS NOT NULL AND thread_id = ?)
        OR (? IS NULL AND thread_id IS NULL)
      )
    ORDER BY created_at ASC
    LIMIT ?
  `).all(
    agentId, ctx.platform, ctx.scopeId,
    ctx.threadId, ctx.threadId,
    ctx.threadId,
    historyWindow,
  ) as { sender_name: string; sender_type: string; content: string; created_at: string }[]

  let historyLabel: string
  if (ctx.platform === 'telegram') {
    historyLabel = ctx.scopeType === 'dm'
      ? 'Telegram DM'
      : `Telegram ${ctx.groupTitle ? ctx.groupTitle : ctx.scopeId}`
  } else {
    historyLabel = ctx.scopeType === 'dm'
      ? 'Slack DM'
      : `Slack ${ctx.channelName ? '#' + ctx.channelName : ctx.scopeId}`
  }

  const historyText = buildConversationHistoryBlock(rows, historyLabel)

  return [contextText, historyText].filter(Boolean).join('\n\n')
}

function getDefaultModel(): ModelConfig {
  const stored = getSetting('default_model')
  if (stored) {
    try {
      return JSON.parse(stored) as ModelConfig
    } catch { /* fall through */ }
  }
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

  let payload: { prompt: string; triggerContext?: PlatformTriggerContext }
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

  // Build platform addendum (trigger context + conversation history) if this is a platform invocation
  const ctx = payload.triggerContext
  const historyWindow = 20  // TODO: read from integration config
  const systemPromptAddendum = ctx ? buildPlatformAddendum(ctx, row.agent_id, historyWindow) : undefined

  try {
    const response = await invokeAgent(agent, payload.prompt, getDefaultModel(), {
      systemPromptAddendum,
      rawPrompt: ctx !== undefined,
    })

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
        row.agent_id, agent.name, response,
      )

      const connector = connectorLoader.getConnector(row.agent_id, ctx.platform)
      if (connector) {
        await connector.sendMessage(ctx.scopeId, ctx.threadId, response)
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
}): number {
  const db = getDb()
  const payload = JSON.stringify({
    prompt: opts.prompt,
    ...(opts.triggerContext ? { triggerContext: opts.triggerContext } : {}),
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

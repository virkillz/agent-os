import { CronExpressionParser } from 'cron-parser'
import chalk from 'chalk'
import { getDb, getSetting, type ScheduleRow } from './db.js'
import { runScheduledTask, isDebugMode, type AgentRecord, type ModelConfig } from './agent-runner.js'
import { eventBus } from './event-bus.js'

function computeNextRun(cron: string): string {
  return CronExpressionParser.parse(cron).next().toDate().toISOString()
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

export function buildSchedulerPrompt(schedule: ScheduleRow): string {
  return schedule.prompt
}

export function startScheduler(): void {
  const db = getDb()

  // Initialize next_run_at for enabled schedules that don't have one yet
  const uninitialized = db
    .prepare('SELECT * FROM agent_schedules WHERE enabled = 1 AND next_run_at IS NULL')
    .all() as unknown as ScheduleRow[]
  for (const s of uninitialized) {
    try {
      db.prepare('UPDATE agent_schedules SET next_run_at = ? WHERE id = ?')
        .run(computeNextRun(s.cron), s.id)
    } catch { /* skip invalid cron */ }
  }

  setInterval(() => {
    const now = new Date().toISOString()
    const due = db
      .prepare('SELECT * FROM agent_schedules WHERE enabled = 1 AND next_run_at <= ?')
      .all(now) as unknown as ScheduleRow[]

    for (const s of due) {
      const agent = db
        .prepare('SELECT * FROM agents WHERE id = ? AND is_active = 1')
        .get(s.agent_id) as unknown as (AgentRecord & { is_active: number }) | undefined

      // Skip inactive agents
      if (!agent) continue

      // Advance to next run before firing so a crash doesn't re-fire
      let nextRun: string
      try {
        nextRun = computeNextRun(s.cron)
      } catch {
        continue
      }
      db.prepare('UPDATE agent_schedules SET last_run_at = ?, next_run_at = ? WHERE id = ?')
        .run(now, nextRun, s.id)

      eventBus.emit({ type: 'schedule:fired', agentId: s.agent_id, scheduleId: s.id, label: s.label })

      const triggerMsg = buildSchedulerPrompt(s)

      if (isDebugMode()) {
        const label = s.label || s.cron
        console.log(chalk.cyan(`[debug][scheduler]`), chalk.bold('⏰ fired'), `"${label}"`, chalk.dim(`→ agent: ${agent.name}`))
        console.log(chalk.cyan(`[debug][scheduler]`), chalk.dim('prompt:\n') + triggerMsg)
      }

      runScheduledTask(agent, triggerMsg, getDefaultModel())
        .catch(console.error)
    }
  }, 60_000)
}

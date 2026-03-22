import { Type } from '@sinclair/typebox'
import { CronExpressionParser } from 'cron-parser'
import { getDb } from '../../db.js'
import { eventBus } from '../../event-bus.js'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const schedulingTool: PlatformTool = {
  config: {
    id: 'scheduling',
    displayName: 'Scheduling',
    description: 'Recurring scheduled tasks via cron expressions',
    tools: [
      { id: 'create_self_schedule', displayName: 'Create Self Schedule', availableByDefault: true },
      { id: 'create_schedule', displayName: 'Create Schedule (Any Agent)', availableByDefault: false },
    ],
    systemPrompt: (enabled) => {
      const lines = [
        `### Scheduling`,
        `You can create recurring scheduled tasks using a cron expression.`,
        `- create_self_schedule — create a recurring task for yourself with label, cron expression, and prompt`,
      ]
      if (enabled.has('create_schedule')) {
        lines.push(`- create_schedule — create a recurring task for any agent by their ID`)
      }
      lines.push(
        `  Common cron examples:`,
        `    "0 11 * * *"   — every day at 11:00 AM UTC`,
        `    "0 9 * * 1"    — every Monday at 9:00 AM UTC`,
        `    "0 */4 * * *"  — every 4 hours`,
        `  Example: to send a daily report, create a schedule whose prompt calls send_direct_message.`,
      )
      return lines.join('\n')
    },
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'create_self_schedule',
        label: 'Create Self Schedule',
        description:
          'Create a recurring scheduled task for yourself. Use this to set up reports, reminders, or recurring actions on a cron schedule.',
        parameters: Type.Object({
          label: Type.String({ description: "A short name for this schedule, e.g. 'Daily report to admin'" }),
          cron: Type.String({ description: "Cron expression, e.g. '0 11 * * *' for daily at 11am UTC" }),
          prompt: Type.String({ description: 'The task instructions that will run on this schedule' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          let nextRun: Date
          try {
            nextRun = CronExpressionParser.parse(params.cron).next().toDate()
          } catch {
            throw new Error(`Invalid cron expression: "${params.cron}". Example: "0 11 * * *" for daily at 11am.`)
          }

          const db = getDb()
          const result = db.prepare(`
            INSERT INTO agent_schedules (agent_id, cron, prompt, label, enabled, next_run_at)
            VALUES (?, ?, ?, ?, 1, ?)
          `).run(ctx.agentId, params.cron, params.prompt, params.label, nextRun.toISOString()) as { lastInsertRowid: number | bigint }

          eventBus.emit({ type: 'schedule:created', agentId: ctx.agentId, scheduleId: result.lastInsertRowid as number, label: params.label })

          return ok(JSON.stringify({ success: true, schedule_id: result.lastInsertRowid, next_run_at: nextRun.toISOString() }))
        },
      },
      {
        name: 'create_schedule',
        label: 'Create Schedule (Any Agent)',
        description:
          'Create a recurring scheduled task for any agent by their ID. ' +
          'Use board_list_agents to look up agent IDs.',
        parameters: Type.Object({
          agentId: Type.String({ description: 'ID of the agent to schedule the task for' }),
          label: Type.String({ description: "A short name for this schedule, e.g. 'Weekly summary'" }),
          cron: Type.String({ description: "Cron expression, e.g. '0 9 * * 1' for every Monday at 9am UTC" }),
          prompt: Type.String({ description: 'The task instructions that will run on this schedule' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          let nextRun: Date
          try {
            nextRun = CronExpressionParser.parse(params.cron).next().toDate()
          } catch {
            throw new Error(`Invalid cron expression: "${params.cron}". Example: "0 9 * * 1" for every Monday at 9am.`)
          }

          const db = getDb()
          const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(params.agentId)
          if (!agent) throw new Error(`Agent ${params.agentId} not found`)

          const result = db.prepare(`
            INSERT INTO agent_schedules (agent_id, cron, prompt, label, enabled, next_run_at)
            VALUES (?, ?, ?, ?, 1, ?)
          `).run(params.agentId, params.cron, params.prompt, params.label, nextRun.toISOString()) as { lastInsertRowid: number | bigint }

          eventBus.emit({ type: 'schedule:created', agentId: params.agentId, scheduleId: result.lastInsertRowid as number, label: params.label })

          return ok(JSON.stringify({ success: true, schedule_id: result.lastInsertRowid, next_run_at: nextRun.toISOString() }))
        },
      },
    ]
  },
}

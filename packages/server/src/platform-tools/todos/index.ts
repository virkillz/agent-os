import { Type } from '@sinclair/typebox'
import { getDb } from '../../db.js'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const todosTool: PlatformTool = {
  config: {
    id: 'todos',
    displayName: 'Todos',
    description: 'Task list — add and complete todos that appear in your system prompt',
    tools: [
      { id: 'todo_add', displayName: 'Add Todo', availableByDefault: true },
      { id: 'todo_complete', displayName: 'Complete Todo', availableByDefault: true },
      { id: 'list_todos', displayName: 'List Todos', availableByDefault: true },
    ],
    systemPrompt: () =>
      `### Todo List\n` +
      `Use your todo list to track multi-step work you intend to continue across sessions.\n` +
      `- todo_add — add a task to your open todo list\n` +
      `- todo_complete — mark a todo as complete by its numeric ID\n` +
      `- list_todos — list all your todos (open and completed)`,
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'todo_add',
        label: 'Add Todo',
        description: 'Add a task to your open todo list. Todos are shown in your system prompt.',
        parameters: Type.Object({
          text: Type.String({ description: 'Task description' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const result = getDb()
            .prepare('INSERT INTO agent_todos (agent_id, text) VALUES (?, ?)')
            .run(ctx.agentId, params.text) as { lastInsertRowid: number | bigint }
          return ok(`Todo added (id: ${result.lastInsertRowid}).`)
        },
      },
      {
        name: 'todo_complete',
        label: 'Complete Todo',
        description: 'Mark one of your open todos as complete by its numeric ID.',
        parameters: Type.Object({
          id: Type.Number({ description: 'The numeric ID of the todo to mark complete' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          getDb()
            .prepare(
              `UPDATE agent_todos SET completed = 1, completed_at = datetime('now')
               WHERE id = ? AND agent_id = ?`,
            )
            .run(params.id, ctx.agentId)
          return ok(`Todo ${params.id} marked complete.`)
        },
      },
      {
        name: 'list_todos',
        label: 'List Todos',
        description: 'List all todos for this agent, including open and completed tasks.',
        parameters: Type.Object({
          filter: Type.Optional(
            Type.Union([Type.Literal('all'), Type.Literal('open'), Type.Literal('completed')], {
              description: "Filter todos by status: 'all', 'open', or 'completed' (default: 'all')",
            }),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const db = getDb()
          const filter = params.filter ?? 'all'

          let sql = `
            SELECT id, text, completed, completed_at, created_at
            FROM agent_todos
            WHERE agent_id = ?
          `
          if (filter === 'open') {
            sql += ` AND completed = 0`
          } else if (filter === 'completed') {
            sql += ` AND completed = 1`
          }
          sql += ` ORDER BY created_at DESC`

          const rows = db.prepare(sql).all(ctx.agentId) as {
            id: number
            text: string
            completed: number
            completed_at: string | null
            created_at: string
          }[]

          const todos = rows.map((row) => ({
            id: row.id,
            text: row.text,
            completed: row.completed === 1,
            completed_at: row.completed_at,
            created_at: row.created_at,
          }))

          return ok(JSON.stringify({ todos, count: todos.length, filter }))
        },
      },
    ]
  },
}

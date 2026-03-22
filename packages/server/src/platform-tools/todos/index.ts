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
    ],
    systemPrompt: () =>
      `### Todo List\n` +
      `Use your todo list to track multi-step work you intend to continue across sessions.\n` +
      `- todo_add — add a task to your open todo list\n` +
      `- todo_complete — mark a todo as complete by its numeric ID`,
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
    ]
  },
}

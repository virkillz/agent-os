import { Type } from '@sinclair/typebox'
import { getDb } from '../../db.js'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const memoryTool: PlatformTool = {
  config: {
    id: 'memory',
    displayName: 'Memory',
    description: 'Persistent memory — save facts and context that survive across sessions',
    tools: [
      { id: 'memory_add', displayName: 'Save to Memory', availableByDefault: true },
    ],
    systemPrompt: () =>
      `### Personal Notes\n` +
      `To be a good employee, you must remember things. Whenever you learn something worth remembering — especially related to work — write it to memory. If your task requires multi-step work you intend to continue, use your todo list.\n` +
      `- memory_add — save important facts to your persistent memory (injected into future sessions)`,
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'memory_add',
        label: 'Save to Memory',
        description:
          'Save a piece of information to your persistent memory. ' +
          'Use this to remember facts, decisions, or context that will be useful in future conversations. ' +
          'Your memory is injected into your system prompt at the start of each session.',
        parameters: Type.Object({
          content: Type.String({ description: 'What to remember — be concise and factual' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          getDb()
            .prepare('INSERT INTO agent_memory (agent_id, content) VALUES (?, ?)')
            .run(ctx.agentId, params.content)
          return ok('Saved to memory.')
        },
      },
    ]
  },
}

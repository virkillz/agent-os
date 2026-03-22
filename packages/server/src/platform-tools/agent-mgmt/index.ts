import { Type } from '@sinclair/typebox'
import { getDb } from '../../db.js'
import { eventBus } from '../../event-bus.js'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

const AVATAR_COLORS = [
  '#7c6af7', '#f76a6a', '#6af7a0', '#f7c46a',
  '#6ac5f7', '#f76ac0', '#a0f76a', '#f7906a',
]

export const agentMgmtTool: PlatformTool = {
  config: {
    id: 'agent-mgmt',
    displayName: 'Agent Management',
    description: 'Hire new AI agents on the platform',
    tools: [
      { id: 'create_agent', displayName: 'Hire Agent', availableByDefault: false },
    ],
    systemPrompt: () =>
      `### Hiring\n` +
      `You can create new AI agents on the platform.\n` +
      `- create_agent — hire a new agent with a name, role, description, and optional system prompt`,
  },

  // ctx is required by the interface but not needed for agent creation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getTools(_ctx: ToolContext) {
    return [
      {
        name: 'create_agent',
        label: 'Hire Agent',
        description:
          'Create a new AI agent on the platform. Use this to hire a specialist for a specific role or task. ' +
          "Returns the new agent's id, name, role, and description.",
        parameters: Type.Object({
          name: Type.String({ description: 'Agent name' }),
          role: Type.String({ description: 'Agent role or job title (e.g. "Copywriter", "Data Analyst")' }),
          description: Type.Optional(Type.String({ description: 'Short description of what this agent does' })),
          systemPrompt: Type.Optional(Type.String({ description: 'System prompt / instructions for the agent' })),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const { randomUUID } = await import('crypto')
          const db = getDb()
          const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
          const avatarUrl = `/default_avatar/avatar_${Math.floor(Math.random() * 17) + 1}.jpg`
          const agentId = randomUUID()
          db.prepare(`
            INSERT INTO agents (id, name, role, description, system_prompt, model_config, avatar_color, avatar_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            agentId,
            params.name.trim(),
            params.role.trim(),
            params.description?.trim() ?? '',
            params.systemPrompt?.trim() ?? '',
            '{}',
            avatarColor,
            avatarUrl,
          )
          eventBus.emit({ type: 'agent:created', agentId })
          const agent = db.prepare('SELECT id, name, role, description FROM agents WHERE id = ?').get(agentId)
          return ok(JSON.stringify(agent, null, 2))
        },
      },
    ]
  },
}

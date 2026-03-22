import { Type } from '@sinclair/typebox'
import { getDb } from '../../db.js'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const boardTool: PlatformTool = {
  config: {
    id: 'board',
    displayName: 'Board',
    description: 'Kanban board — list lanes and agents, manage cards assigned to you',
    tools: [
      { id: 'board_list_lanes', displayName: 'List Board Lanes', availableByDefault: true },
      { id: 'board_list_agents', displayName: 'List Agents', availableByDefault: true },
      { id: 'board_list_my_cards', displayName: 'List My Cards', availableByDefault: true },
      { id: 'board_create_card', displayName: 'Create Card', availableByDefault: true },
      { id: 'board_update_card', displayName: 'Update Card', availableByDefault: true },
      { id: 'board_move_card', displayName: 'Move Card', availableByDefault: true },
    ],
    systemPrompt: () =>
      `### Tasks\n` +
      `All tasks in this organization are managed via a kanban board with cards. Use these tools to manage your work:\n` +
      `- board_list_my_cards — list cards assigned to you; optionally filter by laneType (todo/in_progress/done)\n` +
      `- board_create_card — create a card (auto-placed in Todo lane); use board_list_agents to get the assigneeId\n` +
      `- board_update_card — update a card's title, description, result, or assignee by cardId\n` +
      `- board_move_card — move a card to a different lane by cardId and laneId\n` +
      `- board_list_agents — refresh the agent list mid-session if needed (pre-loaded in ## Team Members above)\n` +
      `- board_list_lanes — refresh the lane list mid-session if needed (pre-loaded in ## Board Lanes above)`,
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'board_list_lanes',
        label: 'List Board Lanes',
        description:
          'List all available lanes on the board. Returns each lane with its id, name, type (todo/in_progress/done), and description. ' +
          'Use this to discover lane IDs before moving cards.',
        parameters: Type.Object({}),
        execute: async () => {
          const db = getDb()
          const board = db.prepare('SELECT id FROM boards ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined
          if (!board) throw new Error('No board found')
          const lanes = db.prepare('SELECT * FROM lanes WHERE board_id = ? ORDER BY position ASC').all(board.id)
          return ok(JSON.stringify(lanes, null, 2))
        },
      },
      {
        name: 'board_list_agents',
        label: 'List Agents',
        description:
          'List all agents on the platform with their id, name, role, and description. ' +
          "Use this to look up an agent's ID before setting them as an assignee on a card.",
        parameters: Type.Object({}),
        execute: async () => {
          const agents = getDb()
            .prepare('SELECT id, name, role, description FROM agents ORDER BY name ASC')
            .all()
          return ok(JSON.stringify(agents, null, 2))
        },
      },
      {
        name: 'board_list_my_cards',
        label: 'List My Cards',
        description: 'List cards assigned to you. Optionally filter by card type: todo, in_progress, or done.',
        parameters: Type.Object({
          laneType: Type.Optional(
            Type.Union(
              [Type.Literal('todo'), Type.Literal('in_progress'), Type.Literal('done')],
              { description: 'Filter by lane type' },
            ),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const db = getDb()
          let query =
            `SELECT c.* FROM cards c JOIN lanes l ON l.id = c.lane_id ` +
            `WHERE c.assignee_id = ? AND c.is_archived = 0`
          const args: string[] = [ctx.agentId]
          if (params.laneType) {
            query += ' AND l.lane_type = ?'
            args.push(params.laneType)
          }
          query += ' ORDER BY c.position ASC'
          const cards = db.prepare(query).all(...args)
          return ok(JSON.stringify(cards, null, 2))
        },
      },
      {
        name: 'board_create_card',
        label: 'Create Board Card',
        description:
          'Create a new task card. It is automatically placed in the Todo lane. ' +
          'You will be recorded as the creator.',
        parameters: Type.Object({
          title: Type.String({ description: 'Card title' }),
          description: Type.Optional(Type.String({ description: 'Task description' })),
          assigneeId: Type.Optional(Type.String({ description: 'ID of the assignee (agent or user)' })),
          assigneeType: Type.Optional(
            Type.Union([Type.Literal('agent'), Type.Literal('user')], { description: 'Type of assignee' }),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const { randomUUID } = await import('crypto')
          const db = getDb()
          const board = db.prepare('SELECT id FROM boards ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined
          if (!board) throw new Error('No board found')
          const lane = db.prepare("SELECT id, name FROM lanes WHERE board_id = ? AND lane_type = 'todo' LIMIT 1").get(board.id) as { id: string; name: string } | undefined
          if (!lane) throw new Error('No todo lane found on the board')
          const pos = (db.prepare('SELECT COUNT(*) as c FROM cards WHERE lane_id = ?').get(lane.id) as { c: number }).c
          const cardId = randomUUID()
          db.prepare(`
            INSERT INTO cards (id, board_id, lane_id, title, description, result, assignee_id, assignee_type, created_by, created_by_type, position)
            VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, 'agent', ?)
          `).run(cardId, board.id, lane.id, params.title, params.description ?? '', params.assigneeId ?? null, params.assigneeType ?? null, ctx.agentId, pos)
          db.prepare(
            `INSERT INTO card_events (card_id, board_id, actor_id, actor_type, action, meta) VALUES (?, ?, ?, 'agent', 'created', ?)`
          ).run(cardId, board.id, ctx.agentId, JSON.stringify({ lane: lane.name, title: params.title }))
          const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId)
          return ok(JSON.stringify(card, null, 2))
        },
      },
      {
        name: 'board_update_card',
        label: 'Update Board Card',
        description: "Update a card's title, description, result, or assignee.",
        parameters: Type.Object({
          cardId: Type.String({ description: 'Card ID' }),
          title: Type.Optional(Type.String({ description: 'New title' })),
          description: Type.Optional(Type.String({ description: 'New task description' })),
          result: Type.Optional(Type.String({ description: 'Result or output of the task' })),
          assigneeId: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Assignee ID or null to unassign' })),
          assigneeType: Type.Optional(Type.Union([Type.Literal('agent'), Type.Literal('user'), Type.Null()], { description: 'Assignee type' })),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const db = getDb()
          const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.cardId) as Record<string, unknown> | undefined
          if (!card) throw new Error(`Card ${params.cardId} not found`)
          const changed: string[] = []
          if (params.title !== undefined && params.title !== card.title) changed.push('title')
          if (params.description !== undefined && params.description !== card.description) changed.push('description')
          if (params.result !== undefined && params.result !== card.result) changed.push('result')
          if (params.assigneeId !== undefined && params.assigneeId !== card.assignee_id) changed.push('assignee')
          db.prepare(`
            UPDATE cards SET
              title = ?, description = ?, result = ?, assignee_id = ?, assignee_type = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `).run(
            params.title ?? card.title,
            params.description ?? card.description,
            params.result ?? card.result,
            params.assigneeId !== undefined ? params.assigneeId : card.assignee_id,
            params.assigneeType !== undefined ? params.assigneeType : card.assignee_type,
            params.cardId,
          )
          if (changed.length > 0) {
            db.prepare(
              `INSERT INTO card_events (card_id, board_id, actor_id, actor_type, action, meta) VALUES (?, ?, ?, 'agent', 'updated', ?)`
            ).run(params.cardId, card.board_id as string, ctx.agentId, JSON.stringify({ changed }))
          }
          const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.cardId)
          return ok(JSON.stringify(updated, null, 2))
        },
      },
      {
        name: 'board_move_card',
        label: 'Move Board Card',
        description: 'Move a card to a different lane. Use board_list_lanes to get available lane IDs.',
        parameters: Type.Object({
          cardId: Type.String({ description: 'Card ID' }),
          laneId: Type.String({ description: 'Destination lane ID' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const db = getDb()
          const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.cardId) as Record<string, unknown> | undefined
          if (!card) throw new Error(`Card ${params.cardId} not found`)
          const boardId = card.board_id as string
          const toLane = db.prepare('SELECT id, name FROM lanes WHERE id = ? AND board_id = ?').get(params.laneId, boardId) as { id: string; name: string } | undefined
          if (!toLane) throw new Error(`Lane ${params.laneId} not found on this board`)
          const fromLane = db.prepare('SELECT name FROM lanes WHERE id = ?').get(card.lane_id as string) as { name: string } | undefined
          const pos = (db.prepare('SELECT COUNT(*) as c FROM cards WHERE lane_id = ?').get(params.laneId) as { c: number }).c
          db.prepare(`UPDATE cards SET lane_id = ?, position = ?, updated_at = datetime('now') WHERE id = ?`).run(params.laneId, pos, params.cardId)
          db.prepare(
            `INSERT INTO card_events (card_id, board_id, actor_id, actor_type, action, meta) VALUES (?, ?, ?, 'agent', 'moved', ?)`
          ).run(params.cardId, boardId, ctx.agentId, JSON.stringify({ from_lane: fromLane?.name ?? '', to_lane: toLane.name }))
          const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(params.cardId)
          return ok(JSON.stringify(updated, null, 2))
        },
      },
    ]
  },
}


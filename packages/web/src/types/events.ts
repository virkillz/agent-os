export type AppEvent =
  | { type: 'connected' }
  // ── Agent events ─────────────────────────────────────────────────────────────
  | { type: 'agent:thinking'; agentId: string }
  | { type: 'agent:reply'; agentId: string; preview: string }
  | { type: 'agent:idle'; agentId: string }
  | { type: 'agent:error'; agentId: string; error: string }
  | { type: 'todo:created'; agentId: string; todo: object }
  | { type: 'todo:updated'; agentId: string; todo: object }
  | { type: 'todo:deleted'; agentId: string; todoId: number }
  | { type: 'memory:created'; agentId: string; entry: object }
  | { type: 'memory:deleted'; agentId: string; entryId: number }
  | { type: 'schedule:fired'; agentId: string; scheduleId: number; label: string }
  | { type: 'schedule:created'; agentId: string; scheduleId: number; label: string }
  | { type: 'workspace:change'; path: string; action: 'created' | 'updated' | 'deleted' }
  // ── Plugin events ─────────────────────────────────────────────────────────────
  | { type: 'plugin:configured'; pluginId: string }
  // ── Board events ──────────────────────────────────────────────────────────────
  | { type: 'board:card_moved'; cardId: string; boardId: string; laneId: string; title: string }
  // ── Channel events ────────────────────────────────────────────────────────────
  | { type: 'channel:message'; channelId: string; senderId: string; senderType: string; senderName: string; content: string; messageId: number }
  // ── Chat events ───────────────────────────────────────────────────────────────
  | { type: 'chat:message'; agentId: string; agentName: string; role: 'assistant'; content: string; messageId: number }
  // ── Notification events ───────────────────────────────────────────────────────
  | { type: 'notification:created'; notification: { id: string; type: string; message: string; source_event: string; meta: string; created_at: string } }

import type { MemoryRow, NotificationRow, TodoRow } from './db.js'

export type AppEvent =
  | { type: 'connected' }
  // ── Agent events ─────────────────────────────────────────────────────────────
  | { type: 'agent:created'; agentId: string }
  | { type: 'agent:thinking'; agentId: string }
  | { type: 'agent:reply'; agentId: string; preview: string }
  | { type: 'agent:idle'; agentId: string }
  | { type: 'agent:error'; agentId: string; error: string }
  | { type: 'todo:created'; agentId: string; todo: TodoRow }
  | { type: 'todo:updated'; agentId: string; todo: TodoRow }
  | { type: 'todo:deleted'; agentId: string; todoId: number }
  | { type: 'memory:created'; agentId: string; entry: MemoryRow }
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
  | { type: 'notification:created'; notification: NotificationRow }

type Handler = (event: AppEvent) => void

class EventBus {
  private handlers: Handler[] = []

  emit(event: AppEvent): void {
    for (const h of this.handlers) h(event)
  }

  on(handler: Handler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }
}

export const eventBus = new EventBus()

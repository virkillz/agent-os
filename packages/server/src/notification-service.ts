import { randomUUID } from 'crypto'
import { getDb, type NotificationRow } from './db.js'
import { eventBus } from './event-bus.js'

export type NotificationType = 'agent' | 'board' | 'schedule' | 'error' | 'dm'

export interface CreateNotificationOpts {
  type: NotificationType
  message: string
  sourceEvent: string
  meta?: Record<string, unknown>
}

export function createNotification(opts: CreateNotificationOpts): NotificationRow {
  const db = getDb()
  const id = randomUUID()
  const meta = JSON.stringify(opts.meta ?? {})

  db.prepare(
    `INSERT INTO notifications (id, type, message, source_event, meta) VALUES (?, ?, ?, ?, ?)`
  ).run(id, opts.type, opts.message, opts.sourceEvent, meta)

  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as unknown as NotificationRow

  eventBus.emit({ type: 'notification:created', notification: row })

  return row
}

import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'

let wss: WebSocketServer | null = null

export interface WsEvent {
  type: string
  [key: string]: unknown
}

export function initWss(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message)
    })
    // Send a welcome ping so the client knows the connection is live
    ws.send(JSON.stringify({ type: 'connected' }))
  })
}

export function broadcast(event: WsEvent): void {
  if (!wss) return
  const payload = JSON.stringify(event)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload)
      } catch (err) {
        // Ignore EPIPE and other send errors for disconnected clients
      }
    }
  }
}

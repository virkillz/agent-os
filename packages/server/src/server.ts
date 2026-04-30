import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { createServer } from 'http'
import path from 'path'
import fs from 'fs'
import { initWss, broadcast } from './ws.js'
import { eventBus } from './event-bus.js'
import { createSettingsRouter } from './api/settings.js'
import { createAgentsRouter } from './api/agents.js'
import { createChatRouter } from './api/chat.js'
import { createMemoryRouter } from './api/memory.js'
import { createTodosRouter } from './api/todos.js'
import { createSchedulesRouter } from './api/schedules.js'
import { createWorkspaceRouter } from './api/workspace.js'
import { createPluginsRouter } from './api/plugins.js'
import { createUsersRouter, createSetupRouter } from './api/users.js'
// import { createBoardsRouter } from './api/boards.js'
import { createSkillsRouter } from './api/skills.js'
import { createPlatformToolsRouter } from './api/platform-tools.js'
import { createNotificationsRouter } from './api/notifications.js'
import { createTriggersRouter } from './api/triggers.js'
import { createIntegrationsRouter } from './api/integrations.js'
import { createConnectionProfilesRouter } from './api/connection-profiles.js'
import { createMcpRouter } from './api/mcp.js'
import { createNotification } from './notification-service.js'
import { startQueueWorker } from './queue-worker.js'
import { connectorLoader } from './connectors/loader.js'
import { getDb } from './db.js'

export function createApp(opts: { webDistDir?: string; workspaceDir?: string; dataDir?: string } = {}) {
  const app = express()

  app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
  app.use(express.json())
  app.use(cookieParser())

  // Serve user avatar uploads
  if (opts.dataDir) {
    const userAvatarsDir = path.join(opts.dataDir, 'user_avatars')
    fs.mkdirSync(userAvatarsDir, { recursive: true })
    app.use('/user_avatars', express.static(userAvatarsDir))
  }

  // ── Auth + setup ────────────────────────────────────────────────────────────
  app.use('/api/setup', createSetupRouter())
  app.use('/api/users', createUsersRouter())

  // ── Core platform ───────────────────────────────────────────────────────────
  app.use('/api/settings', createSettingsRouter())
  app.use('/api/agents', createAgentsRouter())
  app.use('/api/agents', createChatRouter())
  app.use('/api/agents', createMemoryRouter())
  app.use('/api/agents', createTodosRouter())
  app.use('/api/agents', createSchedulesRouter())
  app.use('/api/workspace', createWorkspaceRouter(opts.workspaceDir ?? process.cwd()))
  app.use('/api/plugins', createPluginsRouter())
  app.use('/api/platform-tools', createPlatformToolsRouter())
  app.use('/api/skills', createSkillsRouter(opts.workspaceDir ?? process.cwd()))

  // ── New platform primitives ─────────────────────────────────────────────────
  // app.use('/api/boards', createBoardsRouter())
  app.use('/api/notifications', createNotificationsRouter())
  app.use('/api/agents', createTriggersRouter())
  app.use('/api/agents', createIntegrationsRouter())
  app.use('/api/connection-profiles', createConnectionProfilesRouter())
  app.use('/api/mcp', createMcpRouter())

  // Health check
  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  // Serve built web app in production
  if (opts.webDistDir && fs.existsSync(opts.webDistDir)) {
    app.use(express.static(opts.webDistDir))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(opts.webDistDir!, 'index.html'))
    })
  }

  return app
}

export function startServer(port: number, webDistDir?: string, workspaceDir?: string, dataDir?: string) {
  const app = createApp({ webDistDir, workspaceDir, dataDir })
  const server = createServer(app)
  initWss(server)
  eventBus.on((event) => broadcast(event))

  // Map domain events → persistent notifications for all human users
  eventBus.on((event) => {
    function agentName(agentId: string): string {
      const row = getDb().prepare('SELECT name FROM agents WHERE id = ?').get(agentId) as { name: string } | undefined
      return row?.name ?? agentId
    }

    if (event.type === 'agent:error') {
      createNotification({ type: 'error', message: `${agentName(event.agentId)}: ${event.error}`, sourceEvent: 'agent:error', meta: { agentId: event.agentId } })
    } else if (event.type === 'agent:idle') {
      createNotification({ type: 'agent', message: `${agentName(event.agentId)} finished`, sourceEvent: 'agent:idle', meta: { agentId: event.agentId } })
    } else if (event.type === 'schedule:fired') {
      createNotification({ type: 'schedule', message: `Schedule fired for ${agentName(event.agentId)}: ${event.label || 'unnamed'}`, sourceEvent: 'schedule:fired', meta: { agentId: event.agentId, scheduleId: event.scheduleId } })
    } else if (event.type === 'schedule:created') {
      createNotification({ type: 'schedule', message: `${agentName(event.agentId)} created schedule: ${event.label || 'unnamed'}`, sourceEvent: 'schedule:created', meta: { agentId: event.agentId, scheduleId: event.scheduleId } })
    }
  })

  startQueueWorker()
  void connectorLoader.start()

  server.listen(port, () => {
    console.log(`  Server running at http://localhost:${port}`)
  })

  return server
}

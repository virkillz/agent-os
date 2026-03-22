import { Router } from 'express'
import { platformToolLoader } from '../platform-tools/loader.js'

export function createPlatformToolsRouter(): Router {
  const router = Router()

  // GET /api/platform-tools
  // Returns all platform tool groups with their per-tool entries.
  router.get('/', (_req, res) => {
    const groups = platformToolLoader.getAll().map((group) => ({
      id: group.config.id,
      displayName: group.config.displayName,
      description: group.config.description,
      tools: group.config.tools,
    }))
    res.json(groups)
  })

  return router
}

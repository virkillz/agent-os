import fs from 'fs'
import path from 'path'
import { Type } from '@sinclair/typebox'
import type { PlatformTool, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const workspaceTool: PlatformTool = {
  config: {
    id: 'workspace',
    displayName: 'Workspace',
    description: 'Read and write files in the shared project workspace directory',
    tools: [
      { id: 'workspace_read', displayName: 'Workspace Read', availableByDefault: true },
      { id: 'workspace_write', displayName: 'Workspace Write', availableByDefault: true },
    ],
    systemPrompt: (enabled) => {
      const lines = [
        `### Deliverables`,
        `When asked to do something, write your output into a file inside your workspace directory.`,
      ]
      if (enabled.has('workspace_read')) lines.push(`- workspace_read — read a file from the shared workspace`)
      if (enabled.has('workspace_write')) lines.push(`- workspace_write — write or overwrite a file in the shared workspace`)
      lines.push(`When you complete a task, update the card's result with what you did and include a link to the file you created or updated.`)
      return lines.join('\n')
    },
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'workspace_read',
        label: 'Workspace Read',
        description:
          'Read a file from the shared project workspace. ' +
          `Workspace root: ${ctx.workspaceDir}. Paths are relative to the workspace root.`,
        parameters: Type.Object({
          path: Type.String({ description: 'File path relative to the workspace root' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const resolved = path.resolve(ctx.workspaceDir, params.path)
          if (!resolved.startsWith(ctx.workspaceDir)) throw new Error('Path traversal not allowed')
          if (!fs.existsSync(resolved)) throw new Error(`File not found: ${params.path}`)
          return ok(fs.readFileSync(resolved, 'utf-8'))
        },
      },
      {
        name: 'workspace_write',
        label: 'Workspace Write',
        description:
          'Write or overwrite a file in the shared project workspace. ' +
          'Creates parent directories automatically. ' +
          `Workspace root: ${ctx.workspaceDir}. Paths are relative to the workspace root.`,
        parameters: Type.Object({
          path: Type.String({ description: 'File path relative to the workspace root' }),
          content: Type.String({ description: 'Content to write' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const resolved = path.resolve(ctx.workspaceDir, params.path)
          if (!resolved.startsWith(ctx.workspaceDir)) throw new Error('Path traversal not allowed')
          fs.mkdirSync(path.dirname(resolved), { recursive: true })
          fs.writeFileSync(resolved, params.content, 'utf-8')
          return ok(`Written: ${params.path}`)
        },
      },
    ]
  },
}

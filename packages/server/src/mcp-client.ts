import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Type } from '@sinclair/typebox'
import type { ToolDefinition } from './platform-tools/types.js'
import { getDb } from './db.js'

export interface McpServerRow {
  id: string
  name: string
  description: string
  command: string
  args: string
  env: string
  enabled: number
}

export interface McpToolSet {
  tools: ToolDefinition[]
  sections: string[]
  cleanup: () => Promise<void>
}

function filterEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) result[key] = value
  }
  return result
}

export async function getMcpToolsForAgent(agentId: string): Promise<McpToolSet> {
  const db = getDb()
  const servers = db.prepare(`
    SELECT s.* FROM mcp_servers s
    JOIN agent_mcp_servers ams ON ams.mcp_server_id = s.id
    WHERE ams.agent_id = ? AND s.enabled = 1 AND ams.enabled = 1
  `).all(agentId) as unknown as McpServerRow[]

  const tools: ToolDefinition[] = []
  const sections: string[] = []
  const transports: StdioClientTransport[] = []
  const clients: Client[] = []

  for (const server of servers) {
    try {
      const args = JSON.parse(server.args || '[]') as string[]
      const envVars = JSON.parse(server.env || '{}') as Record<string, string>

      const transport = new StdioClientTransport({
        command: server.command,
        args,
        env: { ...filterEnv(process.env), ...envVars },
      })
      transports.push(transport)

      const client = new Client({ name: 'agentos', version: '0.1.0' })
      clients.push(client)

      await client.connect(transport)
      console.log(`[mcp] Connected to server "${server.name}" (${server.id})`)

      const result = await client.listTools()
      if (!result.tools.length) {
        console.log(`[mcp] Server "${server.name}" has no tools`)
        continue
      }
      console.log(`[mcp] Discovered ${result.tools.length} tool(s) from "${server.name}"`)

      const toolLines: string[] = []
      for (const mcpTool of result.tools) {
        const toolId = `mcp_${server.id}_${mcpTool.name}`
        const schema = mcpTool.inputSchema || { type: 'object', properties: {} }

        tools.push({
          name: toolId,
          label: mcpTool.name,
          description: mcpTool.description || `MCP tool ${mcpTool.name} from ${server.name}`,
          parameters: Type.Unsafe<unknown>(schema as any),
          execute: async (_toolCallId, params, _signal) => {
            const callResult = await client.callTool({
              name: mcpTool.name,
              arguments: params as Record<string, unknown>,
            })

            const parts: string[] = []
            for (const item of callResult.content as Array<{ type: string; text?: string; mimeType?: string; resource?: unknown }>) {
              if (item.type === 'text') {
                parts.push(item.text ?? '')
              } else if (item.type === 'image') {
                parts.push(`[Image: ${item.mimeType ?? 'unknown'}]`)
              } else if (item.type === 'resource') {
                const res = item.resource as { uri: string; text?: string; blob?: string }
                parts.push(`[Resource: ${res.uri}]\n${res.text ?? res.blob ?? ''}`)
              } else {
                parts.push(JSON.stringify(item))
              }
            }

            return {
              content: [{ type: 'text', text: parts.join('\n') }],
              details: callResult,
            }
          },
        })

        toolLines.push(`- ${toolId} — ${mcpTool.description || mcpTool.name}`)
      }

      if (toolLines.length) {
        sections.push(
          `### MCP Tools: ${server.name}\n` +
            (server.description ? `${server.description}\n` : '') +
            toolLines.join('\n'),
        )
      }
    } catch (err) {
      console.error(
        `[mcp] Failed to connect to server "${server.name}" (${server.id}):`,
        err,
      )
    }
  }

  return {
    tools,
    sections,
    cleanup: async () => {
      for (const client of clients) {
        try {
          await client.close()
        } catch {
          /* ignore */
        }
      }
      for (const transport of transports) {
        try {
          await transport.close()
        } catch {
          /* ignore */
        }
      }
    },
  }
}

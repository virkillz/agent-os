import { getModel } from '@mariozechner/pi-ai'
import {
  createAgentSession,
  createCodingTools,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  SessionManager,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent'
import path from 'path'
import fs from 'fs'
import chalk from 'chalk'
import { getAgentMemory, getAgentTodos, getAgentRoles, getSetting, getAllAgents, getBoardLanes, getAgentChannels } from './db.js'
import { eventBus } from './event-bus.js'
import { buildAgentTools } from './platform-tools.js'
import { platformToolLoader } from './platform-tools/loader.js'
import { pluginLoader } from './plugin-loader.js'

let debugMode = false

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled
}

export function isDebugMode(): boolean {
  return debugMode
}

function dbg(agentName: string, ...args: unknown[]): void {
  if (!debugMode) return
  const prefix = chalk.cyan(`[debug][${agentName}]`)
  console.log(prefix, ...args)
}

export interface ModelConfig {
  provider: string
  modelId: string
  thinkingLevel?: string
  tools?: string[]
  disabledTools?: string[]
  allowedSkills?: string[]
}

export interface AgentRecord {
  id: string
  name: string
  role: string
  description: string
  system_prompt: string
  model_config: string
  source: string
}

interface LiveSession {
  session: Awaited<ReturnType<typeof createAgentSession>>['session']
  unsubscribe: (() => void) | null
}

// One persistent session per agent, keyed by agent ID.
const liveSessions = new Map<string, LiveSession>()

// Pending resolve callbacks for in-flight chat requests.
const pending = new Map<string, { chunks: string[]; resolve: (text: string) => void }>()

let dataDir = process.cwd()

export function setDataDir(dir: string): void {
  dataDir = dir
}

export function resolveWorkspaceDir(): string {
  return path.join(dataDir, 'workspace')
}

export function resolveSessionsDir(agentId: string): string {
  return path.join(dataDir, 'sessions', agentId)
}

const DEFAULT_SOP = ``

function ensureSopFile(workspaceDir: string): void {
  fs.mkdirSync(workspaceDir, { recursive: true })
  const sopPath = path.join(workspaceDir, 'SOP.md')
  if (!fs.existsSync(sopPath)) {
    fs.writeFileSync(sopPath, DEFAULT_SOP, 'utf-8')
  }
}

export function buildSystemPrompt(agent: AgentRecord, workspaceDir: string): string {
  // ── Layer 1: Platform prompt ─────────────────────────────────────────────
  const companyName = getSetting('company_name') ?? 'this company'
  const rawPlatformPrompt = getSetting('platform_prompt') ??
    'You are an AI agent working for {company_name}. You have access to the working directory at {working_directory}. Follow the Standard Operating Procedure in SOP.md and your job description.'
  const platformPrompt = rawPlatformPrompt
    .replace('{company_name}', companyName)
    .replace('{working_directory}', workspaceDir)

  // ── Layer 2: SOP.md ──────────────────────────────────────────────────────
  const sopPath = path.join(workspaceDir, 'SOP.md')
  const sopBlock = fs.existsSync(sopPath)
    ? `## Standard Operating Procedure\n${fs.readFileSync(sopPath, 'utf-8').trim()}`
    : ''

  // ── Layer 3: Role prompts ────────────────────────────────────────────────
  const roles = getAgentRoles(agent.id)
  const roleBlock = roles.length
    ? roles.map((r) => `## Role: ${r.name}\n${r.prompt}`).join('\n\n')
    : ''

  // ── Layer 4: Identity prompt ─────────────────────────────────────────────
  const projectDir = path.dirname(workspaceDir)
  const identityBlock = agent.system_prompt
    .trim()
    .replace(/{working_directory}/g, workspaceDir)
    .replace(/{project_dir}/g, projectDir)

  // ── Dynamic context: memory + todos ─────────────────────────────────────
  const memories = getAgentMemory(agent.id)
  const todos = getAgentTodos(agent.id, true)

  const memoryBlock = memories.length
    ? `## Your Memory\n${memories.map((m) => `- ${m.content}`).join('\n')}`
    : ''
  const todoBlock = todos.length
    ? `## Your Open Todos\n${todos.map((t) => `[${t.id}] ${t.text}`).join('\n')}`
    : ''

  // ── Static context: agents + lanes ───────────────────────────────────────
  const allAgents = getAllAgents()
  const agentsBlock = allAgents.length
    ? `## Directory \n\n### Available Team Members\n${allAgents.map((a) => `- ${a.name} (id: ${a.id}) — ${a.role}`).join('\n')}`
    : ''

  const lanes = getBoardLanes()
  const lanesBlock = lanes.length
    ? `### Available Board Lanes\n${lanes.map((l) => `- ${l.name} (id: ${l.id}, type: ${l.type})`).join('\n')}`
    : ''

  const channels = getAgentChannels(agent.id)
  const channelsBlock = channels.length
    ? `### Available Channels\n${channels.map((c: { id: string; name: string }) => `- #${c.name} (id: ${c.id})`).join('\n')}`
    : ''

  // ── Build toolsBlock from active platform tool groups + plugins ───────────
  let agentToolIds: string[] = []
  let disabledToolIds: string[] = []
  try {
    const mc = JSON.parse(agent.model_config || '{}')
    agentToolIds = mc.tools ?? []
    disabledToolIds = mc.disabledTools ?? []
  } catch {
    // model_config parse failure — use empty lists
  }

  // Active = defaults + explicitly enabled, minus explicitly disabled
  const disabled = new Set(disabledToolIds)
  const activeToolIds = new Set([
    ...[...platformToolLoader.getDefaultToolIds()].filter(id => !disabled.has(id)),
    ...agentToolIds.filter(id => !disabled.has(id)),
  ])

  const toolSections = platformToolLoader.getSystemPromptSections(activeToolIds)

  // Append plugin tool descriptions if any are enabled
  const dummyCtx = { agentId: agent.id, workspaceDir }
  const pluginTools = pluginLoader.getToolsForIds(agentToolIds, dummyCtx)
  if (pluginTools.length > 0) {
    toolSections.push(
      `### Plugin Tools\n` +
      pluginTools.map((t) => `- ${t.name} — ${t.description}`).join('\n')
    )
  }

  const toolsBlock =
    `## How You Work\n\nAs a virtual employee, here is how you operate.\n\n` +
    toolSections.join('\n\n')

  return [identityBlock, platformPrompt, roleBlock, sopBlock, toolsBlock, agentsBlock, lanesBlock, channelsBlock, memoryBlock, todoBlock]
    .filter(Boolean)
    .join('\n\n')
}

function resolveModelConfig(modelConfigJson: string, defaultConfig: ModelConfig): ModelConfig {
  try {
    const parsed = JSON.parse(modelConfigJson)
    return { ...defaultConfig, ...parsed }
  } catch {
    return defaultConfig
  }
}

async function createLiveSession(
  agent: AgentRecord,
  defaultModel: ModelConfig,
  systemPromptOverride?: string,
): Promise<LiveSession> {
  const config = resolveModelConfig(agent.model_config, defaultModel)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let model = getModel(config.provider as any, config.modelId as any)
  
  // Fallback: if model not found in registry but provider is openrouter, create custom model
  if (!model && config.provider === 'openrouter') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model = {
      id: config.modelId,
      name: config.modelId,
      api: 'openai-completions',
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: false,
      input: ['text'],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: 128000,
      maxTokens: 16000,
    } as any
    console.log(`[agent-runner] Using custom OpenRouter model: ${config.modelId}`)
  }
  
  if (!model) throw new Error(`Model not found: ${config.provider}/${config.modelId}`)

  const workspaceDir = resolveWorkspaceDir()
  ensureSopFile(workspaceDir)
  const systemPrompt = systemPromptOverride ?? buildSystemPrompt(agent, workspaceDir)
  if (debugMode) {
    dbg(agent.name, chalk.bold('── NEW SESSION ──'))
    dbg(agent.name, chalk.dim('system prompt:\n') + systemPrompt)
  }
  const sessionsDir = path.join(dataDir, 'sessions', agent.id)

  // Build platform tools from the agent's declared tool list
  const toolIds: string[] = config.tools ?? []
  const disabledTools: string[] = config.disabledTools ?? []
  const customTools = buildAgentTools(toolIds, { agentId: agent.id, workspaceDir }, disabledTools)

  const allowedSkills: string[] | undefined = config.allowedSkills

  const loader = new DefaultResourceLoader({
    cwd: workspaceDir,
    systemPromptOverride: () => systemPrompt,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    appendSystemPromptOverride: () => [],
    ...(allowedSkills && {
      skillsOverride: (base) => ({
        ...base,
        skills: base.skills.filter((s) => allowedSkills.includes(s.name)),
      }),
    }),
  })
  await loader.reload()

  const { session } = await createAgentSession({
    cwd: workspaceDir,
    model,
    thinkingLevel: (config.thinkingLevel ?? 'low') as 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
    authStorage: AuthStorage.create(),
    modelRegistry: new ModelRegistry(AuthStorage.create()),
    resourceLoader: loader,
    tools: createCodingTools(workspaceDir),
    customTools,
    sessionManager: SessionManager.create(dataDir, sessionsDir),
  })

  const liveSession: LiveSession = { session, unsubscribe: null }

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    const p = pending.get(agent.id)

    // Debug logging for all notable events
    if (debugMode) {
      switch (event.type) {
        case 'agent_start':
          dbg(agent.name, chalk.bold('▶ agent_start'))
          break
        case 'agent_end':
          dbg(agent.name, chalk.bold('■ agent_end'), `(${event.messages?.length ?? 0} messages)`)
          break
        case 'turn_start':
          dbg(agent.name, chalk.dim('↻ turn_start'))
          break
        case 'turn_end':
          dbg(agent.name, chalk.dim('↺ turn_end'))
          break
        case 'message_start':
          dbg(agent.name, chalk.yellow('◆ message_start'), event.message?.role ?? '')
          break
        case 'message_end':
          dbg(agent.name, chalk.yellow('◇ message_end'), event.message?.role ?? '')
          break
        case 'tool_execution_start': {
          const argsStr = JSON.stringify(event.args ?? {})
          dbg(agent.name, chalk.magenta('⚡ tool_call'), chalk.bold(event.toolName), argsStr.length > 300 ? argsStr.slice(0, 300) + '…' : argsStr)
          break
        }
        case 'tool_execution_end': {
          const resultStr = JSON.stringify(event.result ?? '')
          const status = event.isError ? chalk.red('ERROR') : chalk.green('OK')
          dbg(agent.name, chalk.magenta('⚡ tool_result'), chalk.bold(event.toolName), status, resultStr.length > 300 ? resultStr.slice(0, 300) + '…' : resultStr)
          break
        }
        case 'auto_compaction_start':
          dbg(agent.name, chalk.blue('⚙ compaction_start'), event.reason)
          break
        case 'auto_compaction_end':
          dbg(agent.name, chalk.blue('⚙ compaction_end'), event.aborted ? 'aborted' : 'done', event.errorMessage ?? '')
          break
        case 'auto_retry_start':
          dbg(agent.name, chalk.red('↺ retry'), `attempt ${event.attempt}/${event.maxAttempts}`, event.errorMessage)
          break
        case 'auto_retry_end':
          dbg(agent.name, chalk.red('↺ retry_end'), event.success ? chalk.green('success') : chalk.red('failed'), event.finalError ?? '')
          break
      }
    }

    if (!p) return
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      const delta = event.assistantMessageEvent.delta
      if (debugMode) {
        process.stdout.write(chalk.cyan(`[debug][${agent.name}] `) + chalk.dim('text: ') + delta)
      }
      p.chunks.push(delta)
      if (p.chunks.length === 1) {
        eventBus.emit({ type: 'agent:reply', agentId: agent.id, preview: delta.slice(0, 80) })
      }
    }
  })

  // Pi SDK subscribe may or may not return an unsubscribe fn
  liveSession.unsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null

  return liveSession
}

export async function chatWithAgent(
  agent: AgentRecord,
  message: string,
  defaultModel: ModelConfig,
): Promise<string> {
  if (!liveSessions.has(agent.id)) {
    const live = await createLiveSession(agent, defaultModel)
    liveSessions.set(agent.id, live)
  }

  const live = liveSessions.get(agent.id)!

  eventBus.emit({ type: 'agent:thinking', agentId: agent.id })

  if (debugMode) {
    dbg(agent.name, chalk.green('→ sending:'), message.length > 500 ? message.slice(0, 500) + '…' : message)
  }

  return new Promise((resolve, reject) => {
    pending.set(agent.id, { chunks: [], resolve })

    live.session.prompt(message, { streamingBehavior: 'followUp' })
      .then(() => live.session.agent.waitForIdle())
      .then(() => {
        const p = pending.get(agent.id)
        pending.delete(agent.id)
        const text = p?.chunks.join('') ?? ''
        eventBus.emit({ type: 'agent:idle', agentId: agent.id })
        resolve(text)
      })
      .catch((err: unknown) => {
        pending.delete(agent.id)
        liveSessions.delete(agent.id)
        const msg = err instanceof Error ? err.message : String(err)
        eventBus.emit({ type: 'agent:error', agentId: agent.id, error: msg })
        reject(err)
      })
  })
}

export function clearSession(agentId: string): void {
  const live = liveSessions.get(agentId)
  if (live?.unsubscribe) live.unsubscribe()
  liveSessions.delete(agentId)
}

/**
 * Run a scheduled task in a fresh, isolated session that is never stored in
 * liveSessions.  The full context is: buildSystemPrompt + the task message.
 */
export async function runScheduledTask(
  agent: AgentRecord,
  taskPrompt: string,
  defaultModel: ModelConfig,
): Promise<string> {
  const workspaceDir = resolveWorkspaceDir()
  ensureSopFile(workspaceDir)
  const systemPrompt = buildSystemPrompt(agent, workspaceDir)
  const userMessage = `------------------------\nNow your current task is:\n${taskPrompt}`

  const live = await createLiveSession(agent, defaultModel, systemPrompt)

  if (debugMode) {
    dbg(agent.name, chalk.bold('── SCHEDULED TASK ──'))
    dbg(agent.name, chalk.dim('task:\n') + userMessage)
  }

  return new Promise((resolve, reject) => {
    const chunks: string[] = []
    const unsubscribe = live.session.subscribe((event: AgentSessionEvent) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        chunks.push(event.assistantMessageEvent.delta)
        if (chunks.length === 1) {
          eventBus.emit({ type: 'agent:reply', agentId: agent.id, preview: chunks[0].slice(0, 80) })
        }
      }
    })

    eventBus.emit({ type: 'agent:thinking', agentId: agent.id })

    live.session.prompt(userMessage, { streamingBehavior: 'followUp' })
      .then(() => live.session.agent.waitForIdle())
      .then(() => {
        if (typeof unsubscribe === 'function') unsubscribe()
        if (live.unsubscribe) live.unsubscribe()
        eventBus.emit({ type: 'agent:idle', agentId: agent.id })
        resolve(chunks.join(''))
      })
      .catch((err: unknown) => {
        if (typeof unsubscribe === 'function') unsubscribe()
        if (live.unsubscribe) live.unsubscribe()
        const msg = err instanceof Error ? err.message : String(err)
        eventBus.emit({ type: 'agent:error', agentId: agent.id, error: msg })
        reject(err)
      })
  })
}

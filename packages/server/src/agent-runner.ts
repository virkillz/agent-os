import { getModel, type ImageContent } from '@mariozechner/pi-ai'
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
import { fileURLToPath } from 'url'

// Built-in skills directory — skills placed here are available to all agents by default
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUILTIN_SKILLS_DIR = path.join(__dirname, 'skills')
import chalk from 'chalk'
import {
  getAgentMemory, getAgentTodos, getDb, getSetting,
  getActiveChannelSession, createChannelSession, endChannelSession,
  type ConnectionProfileRow,
} from './db.js'
import { eventBus } from './event-bus.js'
import { buildAgentTools } from './platform-tools.js'
import { platformToolLoader } from './platform-tools/loader.js'
import { pluginLoader } from './plugin-loader.js'
import { getMcpToolsForAgent } from './mcp-client.js'
import type { Attachment } from './connectors/types.js'

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
  connectionProfileId?: string
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
  mcpCleanup?: () => Promise<void>
}

// Persistent sessions keyed by "${agentId}:${channelSessionId}".
// Each channel (web, telegram DM, slack channel, etc.) gets its own session.
const liveSessions = new Map<string, LiveSession>()

export interface AgentResponse {
  text: string
  generatedImages: Attachment[]
}

// Pending resolve callbacks for in-flight chat requests, keyed by liveKey.
const pending = new Map<string, { chunks: string[]; generatedImages: Attachment[]; resolve: (response: AgentResponse) => void }>()

let dataDir = process.cwd()

export function setDataDir(dir: string): void {
  dataDir = dir
}

export function getDataDir(): string {
  return dataDir
}

export function resolveWorkspaceDir(): string {
  return path.join(dataDir, 'workspace')
}

export function resolveSessionsDir(agentId: string): string {
  return path.join(dataDir, 'sessions', agentId)
}

export function buildSystemPrompt(
  agent: AgentRecord,
  workspaceDir: string,
  includeTodos = false,
): string {
  const projectDir = path.dirname(workspaceDir)

  // ── Layer 0: Platform prompt (global base prompt) ────────────────────────
  const platformPromptRaw = getSetting('platform_prompt') ?? 'You are an AI agent. You have access to the working directory at {working_directory}.'
  const platformBlock = platformPromptRaw
    .replace(/{working_directory}/g, workspaceDir)
    .replace(/{project_dir}/g, projectDir)
    .trim()

  // ── Layer 1: Identity prompt ─────────────────────────────────────────────
  const identityBlock = agent.system_prompt
    .trim()
    .replace(/{working_directory}/g, workspaceDir)
    .replace(/{project_dir}/g, projectDir)

  // ── Dynamic context: memory + todos ─────────────────────────────────────
  const memories = getAgentMemory(agent.id)
  const todos = includeTodos ? getAgentTodos(agent.id, true) : []

  const memoryBlock = memories.length
    ? `## Your Memory\n${memories.map((m) => `- ${m.content}`).join('\n')}`
    : ''
  const todoBlock = todos.length
    ? `## Your Open Todos\n${todos.map((t) => `[${t.id}] ${t.text}`).join('\n')}`
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

  return [platformBlock, identityBlock, toolsBlock, memoryBlock, todoBlock]
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

/**
 * Check if the current model configuration supports vision (image input).
 * Checks the connection profile's is_vision flag or the model registry input capabilities.
 */
function modelSupportsVision(config: ModelConfig): boolean {
  // Check connection profile first
  if (config.connectionProfileId) {
    const profile = getDb()
      .prepare('SELECT is_vision FROM connection_profiles WHERE id = ?')
      .get(config.connectionProfileId) as { is_vision: number } | undefined
    if (profile?.is_vision === 1) return true
  }

  // Check Pi SDK Model registry input capabilities
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = getModel(config.provider as any, config.modelId as any)
    if (model?.input?.includes('image')) return true
  } catch {
    // Model not in registry, fall through
  }

  return false
}

/**
 * Find a vision-capable fallback model from connection profiles.
 * Returns null if none found.
 */
function findVisionFallbackModel(): ModelConfig | null {
  const db = getDb()
  const profile = db.prepare(
    'SELECT id, provider_type, model_id FROM connection_profiles WHERE is_vision = 1 ORDER BY is_default DESC, created_at ASC LIMIT 1'
  ).get() as { id: string; provider_type: string; model_id: string } | undefined

  if (profile) {
    return {
      provider: profile.provider_type,
      modelId: profile.model_id,
      connectionProfileId: profile.id,
    }
  }

  return null
}

async function createLiveSession(
  agent: AgentRecord,
  defaultModel: ModelConfig,
  systemPromptOverride?: string,
  channelSessionId?: string,
  includeTodos = false,
): Promise<LiveSession> {
  const config = resolveModelConfig(agent.model_config, defaultModel)

  // Load MCP tools for this agent
  const mcp = await getMcpToolsForAgent(agent.id)

  try {
  // Check if agent has a connection profile assigned
  let connectionProfile: ConnectionProfileRow | null = null
  if (config.connectionProfileId) {
    connectionProfile = getDb()
      .prepare('SELECT * FROM connection_profiles WHERE id = ?')
      .get(config.connectionProfileId) as unknown as ConnectionProfileRow | undefined ?? null
    if (connectionProfile) {
      config.provider = connectionProfile.provider_type
      config.modelId = connectionProfile.model_id || config.modelId
      if (debugMode) dbg(agent.name, chalk.dim(`connection profile: "${connectionProfile.name}" (${connectionProfile.id})`))
    }
  }

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

  // Fallback: if model not found in registry but we have a connection profile with base_url, create custom model
  if (!model && connectionProfile?.base_url) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model = {
      id: config.modelId,
      name: config.modelId,
      api: 'openai-completions',
      provider: config.provider,
      baseUrl: connectionProfile.base_url,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16000,
    } as any
    console.log(`[agent-runner] Using connection profile model: ${config.provider}/${config.modelId}`)
  }
  
  if (!model) throw new Error(`Model not found: ${config.provider}/${config.modelId}`)

  const workspaceDir = resolveWorkspaceDir()
  let systemPrompt = systemPromptOverride ?? buildSystemPrompt(agent, workspaceDir, includeTodos)
  if (mcp.sections.length > 0) {
    systemPrompt += '\n\n' + mcp.sections.join('\n\n')
  }
  if (debugMode) {
    dbg(agent.name, chalk.bold('── NEW SESSION ──'))
    dbg(agent.name, chalk.dim('system prompt:\n') + systemPrompt)
  }
  const sessionsDir = channelSessionId
    ? path.join(dataDir, 'sessions', agent.id, channelSessionId)
    : path.join(dataDir, 'sessions', agent.id)

  // Build platform tools from the agent's declared tool list
  const toolIds: string[] = config.tools ?? []
  const disabledTools: string[] = config.disabledTools ?? []
  const customTools = [
    ...buildAgentTools(toolIds, { agentId: agent.id, workspaceDir }, disabledTools),
    ...mcp.tools,
  ]

  const allowedSkills: string[] | undefined = config.allowedSkills

  const loader = new DefaultResourceLoader({
    cwd: workspaceDir,
    systemPromptOverride: () => systemPrompt,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    appendSystemPromptOverride: () => [],
    // Inject built-in and user-installed skills
    additionalSkillPaths: [BUILTIN_SKILLS_DIR, path.join(dataDir, 'skills')],
    ...(allowedSkills && {
      skillsOverride: (base) => ({
        ...base,
        skills: base.skills.filter((s) => allowedSkills.includes(s.name)),
      }),
    }),
  })
  await loader.reload()

  // Resolve auth — prefer connection profile key, fall back to env-var auth
  const authStorage = AuthStorage.inMemory()
  if (connectionProfile?.api_key) {
    authStorage.setRuntimeApiKey(config.provider, connectionProfile.api_key)
    if (debugMode) dbg(agent.name, chalk.dim(`auth: connection profile key for "${connectionProfile.name}"`))
  } else if (debugMode) {
    dbg(agent.name, chalk.dim('auth: falling back to env var'))
  }

  const { session } = await createAgentSession({
    cwd: workspaceDir,
    model,
    thinkingLevel: (config.thinkingLevel ?? 'low') as 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh',
    authStorage,
    modelRegistry: new ModelRegistry(authStorage),
    resourceLoader: loader,
    tools: createCodingTools(workspaceDir),
    customTools,
    sessionManager: SessionManager.create(dataDir, sessionsDir),
  })

  const liveSession: LiveSession = { session, unsubscribe: null, mcpCleanup: mcp.cleanup }

  const pendingKey = channelSessionId ? `${agent.id}:${channelSessionId}` : agent.id

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    const p = pending.get(pendingKey)

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
    if (event.type === 'tool_execution_end' && event.result?.content) {
      const images = event.result.content.filter(
        (c: any) => c.type === 'image' && c.data && c.mimeType,
      )
      for (const img of images) {
        p.generatedImages.push({ type: 'image', mimeType: img.mimeType, data: img.data })
      }
    }
  })

  // Pi SDK subscribe may or may not return an unsubscribe fn
  liveSession.unsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null

  return liveSession
  } catch (err) {
    await mcp.cleanup()
    throw err
  }
}

/** Web UI chat — delegates to chatWithChannel using the 'web:dm:default' channel key. */
export async function chatWithAgent(
  agent: AgentRecord,
  message: string,
  defaultModel: ModelConfig,
): Promise<AgentResponse> {
  return chatWithChannel(agent, 'web:dm:default', 'web', message, defaultModel, 'dm', 'default')
}

/**
 * Send a message on a persistent channel session.
 * The channel is identified by channelKey (e.g. "telegram:dm:123456").
 * A channel_sessions row is created on first use; subsequent messages reuse
 * the same row and the same on-disk SDK session (full conversation memory).
 */
export async function chatWithChannel(
  agent: AgentRecord,
  channelKey: string,
  platform: string,
  message: string,
  defaultModel: ModelConfig,
  scopeType?: string,
  scopeId?: string,
  attachments?: Attachment[],
): Promise<AgentResponse> {
  let channelSession = getActiveChannelSession(agent.id, channelKey)
  if (!channelSession) {
    channelSession = createChannelSession(agent.id, channelKey, platform, scopeType, scopeId)
  }

  const liveKey = `${agent.id}:${channelSession.id}`
  const hasImages = attachments && attachments.length > 0

  // Determine effective model config
  let effectiveModel = defaultModel
  if (hasImages) {
    const agentConfig = resolveModelConfig(agent.model_config, defaultModel)
    if (!modelSupportsVision(agentConfig)) {
      const fallback = findVisionFallbackModel()
      if (fallback) {
        effectiveModel = fallback
        if (debugMode) {
          dbg(agent.name, chalk.yellow('→ vision fallback:'), `${fallback.provider}/${fallback.modelId}`)
        }
      }
    }
  }

  if (!liveSessions.has(liveKey)) {
    const live = await createLiveSession(agent, effectiveModel, undefined, channelSession.id, false)
    liveSessions.set(liveKey, live)
  }

  const live = liveSessions.get(liveKey)!

  eventBus.emit({ type: 'agent:thinking', agentId: agent.id })

  if (debugMode) {
    dbg(agent.name, chalk.green('→ channel:'), channelKey)
    dbg(agent.name, chalk.green('→ sending:'), message.length > 500 ? message.slice(0, 500) + '…' : message)
    if (hasImages) dbg(agent.name, chalk.green('→ images:'), attachments.length)
  }

  // Convert attachments to Pi SDK ImageContent format
  const images: ImageContent[] | undefined = hasImages
    ? attachments.map((a) => ({ type: 'image', data: a.data, mimeType: a.mimeType }))
    : undefined

  return new Promise((resolve, reject) => {
    pending.set(liveKey, { chunks: [], generatedImages: [], resolve })

    live.session.prompt(message, { streamingBehavior: 'followUp', images })
      .then(() => live.session.agent.waitForIdle())
      .then(() => {
        const p = pending.get(liveKey)
        pending.delete(liveKey)
        const text = p?.chunks.join('') ?? ''
        eventBus.emit({ type: 'agent:idle', agentId: agent.id })
        resolve({ text, generatedImages: p?.generatedImages ?? [] })
      })
      .catch((err: unknown) => {
        pending.delete(liveKey)
        const live = liveSessions.get(liveKey)
        if (live?.mcpCleanup) live.mcpCleanup().catch(() => {})
        liveSessions.delete(liveKey)
        const msg = err instanceof Error ? err.message : String(err)
        eventBus.emit({ type: 'agent:error', agentId: agent.id, error: msg })
        reject(err)
      })
  })
}

/**
 * Remove all live sessions for an agent from the in-memory map.
 * Forces the next message to reload the session from disk (picks up updated system prompt).
 * Does NOT end channel_sessions records — use endAndClearChannelSession for that.
 */
export function clearSession(agentId: string): void {
  for (const [key, live] of [...liveSessions.entries()]) {
    if (key.startsWith(`${agentId}:`)) {
      if (live.unsubscribe) live.unsubscribe()
      live.mcpCleanup?.().catch(() => {})
      liveSessions.delete(key)
    }
  }
}

/**
 * End a channel's conversation: marks the channel_sessions row as ended and
 * removes the live session from memory. The next message starts a fresh session.
 */
export function endAndClearChannelSession(agentId: string, channelKey: string): void {
  const channelSession = getActiveChannelSession(agentId, channelKey)
  if (!channelSession) return
  endChannelSession(channelSession.id)
  const liveKey = `${agentId}:${channelSession.id}`
  const live = liveSessions.get(liveKey)
  if (live?.unsubscribe) live.unsubscribe()
  live?.mcpCleanup?.().catch(() => {})
  liveSessions.delete(liveKey)
}

export interface InvokeAgentOpts {
  /**
   * Extra text appended to the base system prompt (after a blank line).
   * Used by platform connectors to inject trigger context + conversation history.
   */
  systemPromptAddendum?: string
  /**
   * When true, the prompt is passed to the session as-is without the
   * scheduler "Now your current task is:" wrapper.
   * Platform (Slack/Telegram) invocations should set this to true.
   */
  rawPrompt?: boolean
  /** Image attachments to include with the prompt */
  attachments?: Attachment[]
}

/**
 * Unified invocation entry point — runs a fresh isolated session for any
 * non-interactive trigger (scheduler, Slack, Telegram, etc.).
 */
export async function invokeAgent(
  agent: AgentRecord,
  prompt: string,
  defaultModel: ModelConfig,
  opts?: InvokeAgentOpts,
): Promise<AgentResponse> {
  return runScheduledTask(agent, prompt, defaultModel, opts)
}

/**
 * Run a scheduled task in a fresh, isolated session that is never stored in
 * liveSessions.  The full context is: buildSystemPrompt + the task message.
 */
export async function runScheduledTask(
  agent: AgentRecord,
  taskPrompt: string,
  defaultModel: ModelConfig,
  opts?: InvokeAgentOpts,
): Promise<AgentResponse> {
  const workspaceDir = resolveWorkspaceDir()
  const baseSystemPrompt = buildSystemPrompt(agent, workspaceDir, true)
  const systemPrompt = opts?.systemPromptAddendum
    ? `${baseSystemPrompt}\n\n${opts.systemPromptAddendum}`
    : baseSystemPrompt
  const userMessage = opts?.rawPrompt
    ? taskPrompt
    : `------------------------\nNow your current task is:\n${taskPrompt}`

  // Determine effective model config (with vision fallback if images attached)
  let effectiveModel = defaultModel
  const attachments = opts?.attachments
  const hasImages = attachments && attachments.length > 0

  if (hasImages) {
    const agentConfig = resolveModelConfig(agent.model_config, defaultModel)
    if (!modelSupportsVision(agentConfig)) {
      const fallback = findVisionFallbackModel()
      if (fallback) {
        effectiveModel = fallback
        if (debugMode) {
          dbg(agent.name, chalk.yellow('→ vision fallback:'), `${fallback.provider}/${fallback.modelId}`)
        }
      }
    }
  }

  const live = await createLiveSession(agent, effectiveModel, systemPrompt)

  if (debugMode) {
    dbg(agent.name, chalk.bold('── SCHEDULED TASK ──'))
    dbg(agent.name, chalk.dim('task:\n') + userMessage)
    if (hasImages) dbg(agent.name, chalk.green('→ images:'), attachments.length)
  }

  // Convert attachments to Pi SDK ImageContent format
  const images: ImageContent[] | undefined = hasImages
    ? attachments.map((a) => ({ type: 'image', data: a.data, mimeType: a.mimeType }))
    : undefined

  return new Promise((resolve, reject) => {
    const chunks: string[] = []
    const generatedImages: Attachment[] = []
    const unsubscribe = live.session.subscribe((event: AgentSessionEvent) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        chunks.push(event.assistantMessageEvent.delta)
        if (chunks.length === 1) {
          eventBus.emit({ type: 'agent:reply', agentId: agent.id, preview: chunks[0].slice(0, 80) })
        }
      }
      if (event.type === 'tool_execution_end' && event.result?.content) {
        const imgs = event.result.content.filter(
          (c: any) => c.type === 'image' && c.data && c.mimeType,
        )
        for (const img of imgs) {
          generatedImages.push({ type: 'image', mimeType: img.mimeType, data: img.data })
        }
      }
    })

    eventBus.emit({ type: 'agent:thinking', agentId: agent.id })

    live.session.prompt(userMessage, { streamingBehavior: 'followUp', images })
      .then(() => live.session.agent.waitForIdle())
      .then(() => {
        if (typeof unsubscribe === 'function') unsubscribe()
        if (live.unsubscribe) live.unsubscribe()
        live.mcpCleanup?.().catch(() => {})
        eventBus.emit({ type: 'agent:idle', agentId: agent.id })
        resolve({ text: chunks.join(''), generatedImages })
      })
      .catch((err: unknown) => {
        if (typeof unsubscribe === 'function') unsubscribe()
        if (live.unsubscribe) live.unsubscribe()
        live.mcpCleanup?.().catch(() => {})
        const msg = err instanceof Error ? err.message : String(err)
        eventBus.emit({ type: 'agent:error', agentId: agent.id, error: msg })
        reject(err)
      })
  })
}

const BASE = '/api'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? res.statusText)
  }
  return res.json()
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface Settings {
  firstRun: boolean
  needsSetup: boolean
  companyName: string
  companyMission: string
  companyLogo: string
  platformPrompt: string
  defaultModel: { provider: string; modelId: string; thinkingLevel: string }
}

export interface Provider {
  id: string
  label: string
  envKey: string
  recommended: boolean
  configured: boolean
  defaultModel: string
}

export const api = {
  settings: {
    get: () => req<Settings>('GET', '/settings'),
    update: (data: Partial<Omit<Settings, 'firstRun'>>) => req<{ ok: boolean }>('POST', '/settings', data),
    providers: () => req<Provider[]>('GET', '/settings/providers'),
    saveProviderKey: (id: string, apiKey: string) =>
      req<{ ok: boolean }>('POST', `/settings/providers/${id}`, { apiKey }),
    removeProviderKey: (id: string) =>
      req<{ ok: boolean }>('DELETE', `/settings/providers/${id}`),
    testProvider: (id: string) =>
      req<{ ok: boolean; error?: string }>('POST', `/settings/providers/${id}/test`),
  },

  // ─── Auth / Users ─────────────────────────────────────────────────────────

  auth: {
    me: () => req<User>('GET', '/users/me'),
    login: (username: string, password: string) =>
      req<User>('POST', '/users/login', { username, password }),
    logout: () => req<{ ok: boolean }>('POST', '/users/logout'),
    setup: (data: { username: string; displayName: string; password: string; companyName: string }) =>
      req<User>('POST', '/setup', data),
  },

  users: {
    list: () => req<User[]>('GET', '/users'),
    create: (data: { username: string; displayName: string; password: string; isAdmin?: boolean }) =>
      req<User>('POST', '/users', data),
    update: (id: string, data: { displayName?: string; password?: string; avatarColor?: string; bio?: string }) =>
      req<User>('PUT', `/users/${id}`, data),
    uploadAvatar: (id: string, file: File) => {
      const form = new FormData()
      form.append('avatar', file)
      return fetch(`/api/users/${id}/avatar`, { method: 'POST', credentials: 'include', body: form })
        .then(r => r.json()) as Promise<User>
    },
    delete: (id: string) => req<{ ok: boolean }>('DELETE', `/users/${id}`),
  },

  // ─── Roles ────────────────────────────────────────────────────────────────

  roles: {
    list: () => req<Role[]>('GET', '/roles'),
    get: (id: string) => req<Role>('GET', `/roles/${id}`),
    create: (data: { name: string; description?: string; prompt?: string }) =>
      req<Role>('POST', '/roles', data),
    update: (id: string, data: { name?: string; description?: string; prompt?: string }) =>
      req<Role>('PUT', `/roles/${id}`, data),
    delete: (id: string) => req<{ ok: boolean }>('DELETE', `/roles/${id}`),
    forAgent: (agentId: string) => req<Role[]>('GET', `/roles/agent/${agentId}`),
    assignToAgent: (agentId: string, roleIds: string[]) =>
      req<Role[]>('PUT', `/roles/agent/${agentId}`, { roleIds }),
  },

  // ─── Agents ───────────────────────────────────────────────────────────────

  agents: {
    list: () => req<Agent[]>('GET', '/agents'),
    get: (id: string) => req<Agent>('GET', `/agents/${id}`),
    create: (data: CreateAgentInput) => req<Agent>('POST', '/agents', data),
    update: (id: string, data: Partial<CreateAgentInput>) => req<Agent>('PUT', `/agents/${id}`, data),
    delete: (id: string) => req<{ ok: boolean }>('DELETE', `/agents/${id}`),
    toggleActive: (id: string) => req<{ id: string; is_active: boolean }>('POST', `/agents/${id}/toggle-active`),
    previewPrompt: (id: string) => req<{ prompt: string }>('GET', `/agents/${id}/preview-prompt`),
  },

  // ─── Chat (direct agent DM — legacy) ─────────────────────────────────────

  chat: {
    history: (agentId: string) => req<ChatMessage[]>('GET', `/agents/${agentId}/chat`),
    send: (agentId: string, message: string) =>
      req<{ reply: string }>('POST', `/agents/${agentId}/chat`, { message }),
    clear: (agentId: string) => req<{ ok: boolean }>('DELETE', `/agents/${agentId}/chat`),
    editMessage: (agentId: string, msgId: number, content: string) =>
      req<{ ok: boolean }>('PATCH', `/agents/${agentId}/chat/${msgId}`, { content }),
    deleteMessage: (agentId: string, msgId: number) =>
      req<{ ok: boolean }>('DELETE', `/agents/${agentId}/chat/${msgId}`),
  },

  // ─── Sessions ─────────────────────────────────────────────────────────────

  sessions: {
    list: (agentId: string) => req<SessionFile[]>('GET', `/agents/${agentId}/sessions`),
    read: (agentId: string, filename: string) =>
      req<SessionEvent[]>('GET', `/agents/${agentId}/sessions/${encodeURIComponent(filename)}`),
  },

  // ─── Memory ───────────────────────────────────────────────────────────────

  memory: {
    list:   (agentId: string) => req<MemoryEntry[]>('GET', `/agents/${agentId}/memory`),
    create: (agentId: string, content: string) =>
      req<MemoryEntry>('POST', `/agents/${agentId}/memory`, { content }),
    update: (agentId: string, id: number, content: string) =>
      req<MemoryEntry>('PUT', `/agents/${agentId}/memory/${id}`, { content }),
    delete: (agentId: string, id: number) =>
      req<{ ok: boolean }>('DELETE', `/agents/${agentId}/memory/${id}`),
  },

  // ─── Todos ────────────────────────────────────────────────────────────────

  todos: {
    list:   (agentId: string) => req<TodoItem[]>('GET', `/agents/${agentId}/todos`),
    create: (agentId: string, text: string) =>
      req<TodoItem>('POST', `/agents/${agentId}/todos`, { text }),
    patch:  (agentId: string, id: number, data: { completed?: boolean; text?: string }) =>
      req<TodoItem>('PATCH', `/agents/${agentId}/todos/${id}`, data),
    delete: (agentId: string, id: number) =>
      req<{ ok: boolean }>('DELETE', `/agents/${agentId}/todos/${id}`),
  },

  // ─── Schedules ────────────────────────────────────────────────────────────

  schedules: {
    list:   (agentId: string) => req<Schedule[]>('GET', `/agents/${agentId}/schedules`),
    create: (agentId: string, data: { cron: string; prompt: string; label?: string }) =>
      req<Schedule>('POST', `/agents/${agentId}/schedules`, data),
    patch:  (agentId: string, id: number, data: Partial<Pick<Schedule, 'cron' | 'prompt' | 'label' | 'enabled'>>) =>
      req<Schedule>('PATCH', `/agents/${agentId}/schedules/${id}`, data),
    delete: (agentId: string, id: number) =>
      req<{ ok: boolean }>('DELETE', `/agents/${agentId}/schedules/${id}`),
    previewPrompt: (agentId: string, id: number) =>
      req<{ prompt: string }>('GET', `/agents/${agentId}/schedules/${id}/preview`),
  },

  // ─── Workspace ────────────────────────────────────────────────────────────

  workspace: {
    list: () => req<FileEntry[]>('GET', '/workspace'),
    downloadUrl: (filePath: string) => `${BASE}/workspace/download?path=${encodeURIComponent(filePath)}`,
    upload: (file: File, agentId?: string) => {
      const fd = new FormData()
      fd.append('file', file)
      const url = agentId
        ? `${BASE}/workspace/upload?agentId=${encodeURIComponent(agentId)}`
        : `${BASE}/workspace/upload`
      return fetch(url, { method: 'POST', credentials: 'include', body: fd }).then((r) => {
        if (!r.ok) throw new Error('Upload failed')
        return r.json() as Promise<FileEntry>
      })
    },
    delete: (filePath: string) =>
      req<{ ok: boolean }>('DELETE', `/workspace?path=${encodeURIComponent(filePath)}`),
    read: (filePath: string) =>
      fetch(`${BASE}/workspace/download?path=${encodeURIComponent(filePath)}`, { credentials: 'include' })
        .then((r) => { if (!r.ok) throw new Error('Read failed'); return r.text() }),
    save: (filePath: string, content: string) =>
      fetch(`${BASE}/workspace/content?path=${encodeURIComponent(filePath)}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'text/plain' },
        body: content,
      }).then((r) => { if (!r.ok) throw new Error('Save failed'); return r.json() as Promise<{ ok: boolean }> }),
  },

  // ─── Skills ───────────────────────────────────────────────────────────────

  skills: {
    list: () => req<Skill[]>('GET', '/skills'),
    install: (repo: string, branch?: string) =>
      req<{ ok: boolean; name: string; description: string }>('POST', '/skills/install', { repo, branch }),
    uninstall: (name: string) => req<{ ok: boolean }>('DELETE', `/skills/${encodeURIComponent(name)}`),
  },

  // ─── Plugins ──────────────────────────────────────────────────────────────

  plugins: {
    list: () => req<Plugin[]>('GET', '/plugins'),
    configure: (id: string, key: string, value: string) =>
      req<{ ok: boolean; configured: boolean }>('POST', `/plugins/${id}/configure`, { key, value }),
    removeConfigure: (id: string) => req<{ ok: boolean }>('DELETE', `/plugins/${id}/configure`),
  },

  // ─── Platform Tools ───────────────────────────────────────────────────────

  platformTools: {
    list: () => req<PlatformToolGroup[]>('GET', '/platform-tools'),
  },

  // ─── Boards ───────────────────────────────────────────────────────────────

  boards: {
    list: () => req<Board[]>('GET', '/boards'),
    listLanes: () => req<Lane[]>('GET', '/boards/lanes'),
    get: (id: string) => req<BoardFull>('GET', `/boards/${id}`),
    create: (name: string) => req<BoardFull>('POST', '/boards', { name }),
    addLane: (boardId: string, name: string, laneType?: 'todo' | 'in_progress' | 'done') =>
      req<Lane>('POST', `/boards/${boardId}/lanes`, { name, laneType }),
    updateLane: (boardId: string, laneId: string, data: { name?: string; position?: number; laneType?: 'todo' | 'in_progress' | 'done' }) =>
      req<Lane>('PUT', `/boards/${boardId}/lanes/${laneId}`, data),
    deleteLane: (boardId: string, laneId: string) =>
      req<{ ok: boolean }>('DELETE', `/boards/${boardId}/lanes/${laneId}`),
    addLaneRule: (boardId: string, laneId: string, ruleType: LaneRule['rule_type'], targetId?: string) =>
      req<LaneRule>('POST', `/boards/${boardId}/lanes/${laneId}/rules`, { ruleType, targetId }),
    deleteLaneRule: (boardId: string, laneId: string, ruleId: string) =>
      req<{ ok: boolean }>('DELETE', `/boards/${boardId}/lanes/${laneId}/rules/${ruleId}`),
    update: (id: string, name: string) => req<Board>('PUT', `/boards/${id}`, { name }),
    delete: (id: string) => req<{ ok: boolean }>('DELETE', `/boards/${id}`),
    addCard: (boardId: string, data: { laneId?: string; title: string; description?: string; result?: string; assigneeId?: string; assigneeType?: 'agent' | 'user' }) =>
      req<Card>('POST', `/boards/${boardId}/cards`, data),
    updateCard: (boardId: string, cardId: string, data: { title?: string; description?: string; result?: string; assigneeId?: string | null; assigneeType?: 'agent' | 'user' | null }) =>
      req<Card>('PUT', `/boards/${boardId}/cards/${cardId}`, data),
    moveCard: (boardId: string, cardId: string, laneId: string, position?: number) =>
      req<Card>('POST', `/boards/${boardId}/cards/${cardId}/move`, { laneId, position }),
    deleteCard: (boardId: string, cardId: string) =>
      req<{ ok: boolean }>('DELETE', `/boards/${boardId}/cards/${cardId}`),
    cardEvents: (boardId: string, cardId: string) =>
      req<CardEvent[]>('GET', `/boards/${boardId}/cards/${cardId}/events`),
    archiveCard: (boardId: string, cardId: string) =>
      req<{ ok: boolean }>('POST', `/boards/${boardId}/cards/${cardId}/archive`),
    unarchiveCard: (boardId: string, cardId: string) =>
      req<Card>('POST', `/boards/${boardId}/cards/${cardId}/unarchive`),
    archivedCards: (boardId: string) =>
      req<Card[]>('GET', `/boards/${boardId}/archived-cards`),
  },

  // ─── Notifications ────────────────────────────────────────────────────────

  notifications: {
    list: (limit = 50, offset = 0) =>
      req<Notification[]>('GET', `/notifications?limit=${limit}&offset=${offset}`),
    markRead: (id: string) =>
      req<{ ok: boolean }>('POST', `/notifications/${id}/read`),
    markAllRead: () =>
      req<{ ok: boolean }>('POST', '/notifications/read-all'),
  },

  // ─── Channels ─────────────────────────────────────────────────────────────

  channels: {
    list: () => req<Channel[]>('GET', '/channels'),
    listDms: () => req<DmChannel[]>('GET', '/channels/dms'),
    publicChannel: () => req<Channel>('GET', '/channels/public'),
    create: (name: string) => req<Channel>('POST', '/channels', { name }),
    delete: (id: string) => req<{ ok: boolean }>('DELETE', `/channels/${id}`),
    messages: (channelId: string, limit = 100) =>
      req<ChannelMessage[]>('GET', `/channels/${channelId}/messages?limit=${limit}`),
    send: (channelId: string, content: string) =>
      req<{ id: number }>('POST', `/channels/${channelId}/messages`, { content }),
    getDm: (partnerId: string) => req<Channel>('GET', `/channels/dm/${partnerId}`),
    sendDm: (channelId: string, content: string) =>
      req<{ id: number }>('POST', `/channels/dm/${channelId}/messages`, { content }),
    editMessage: (channelId: string, msgId: number, content: string) =>
      req<{ ok: boolean }>('PATCH', `/channels/${channelId}/messages/${msgId}`, { content }),
    deleteMessage: (channelId: string, msgId: number) =>
      req<{ ok: boolean }>('DELETE', `/channels/${channelId}/messages/${msgId}`),
    members: (channelId: string) =>
      req<{ id: string; name: string; role: string; avatar_color: string }[]>('GET', `/channels/${channelId}/members`),
    addMember: (channelId: string, agentId: string) =>
      req<{ ok: boolean }>('POST', `/channels/${channelId}/members`, { agentId }),
    removeMember: (channelId: string, agentId: string) =>
      req<{ ok: boolean }>('DELETE', `/channels/${channelId}/members/${agentId}`),
  },
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface User {
  id: string
  username: string
  display_name: string
  avatar_color: string
  avatar_url: string
  bio: string
  is_admin: number
  created_at: string
}

export interface Role {
  id: string
  name: string
  description: string
  prompt: string
  created_at: string
}

export interface Agent {
  id: string
  name: string
  role: string
  description: string
  system_prompt: string
  model_config: string
  modelConfig: { provider?: string; modelId?: string; thinkingLevel?: string; allowedSkills?: string[]; tools?: string[]; disabledTools?: string[] }
  source: string
  avatar_color: string
  avatar_url: string
  is_active: number
  is_default: number
  created_at: string
  updated_at: string
}

export interface CreateAgentInput {
  name: string
  role: string
  description?: string
  systemPrompt?: string
  modelConfig?: { provider?: string; modelId?: string; thinkingLevel?: string }
  avatarUrl?: string
  avatarColor?: string
}

export interface ChatMessage {
  id: number
  agent_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface SessionFile {
  filename: string
  size: number
  mtime: string
}

export interface SessionEvent {
  type: string
  id?: string
  parentId?: string | null
  timestamp?: string
  [key: string]: unknown
}

export interface MemoryEntry {
  id: number
  agent_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface TodoItem {
  id: number
  agent_id: string
  text: string
  completed: number
  completed_at: string | null
  created_at: string
}

export interface Schedule {
  id: number
  agent_id: string
  cron: string
  prompt: string
  label: string
  enabled: number
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

export interface FileEntry {
  path: string
  name: string
  size_bytes: number
  mime_type: string
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export interface Skill {
  name: string
  description: string
  repo: string | null
}

export interface PluginEnvVar {
  key: string
  required: boolean
  description: string
  hasValue: boolean
}

export interface Plugin {
  id: string
  display_name: string
  description: string
  configured: boolean
  envVars: PluginEnvVar[]
  hasAllRequired: boolean
  toolIds: string[]
}

export interface PlatformToolEntry {
  id: string
  displayName: string
  availableByDefault: boolean
}

export interface PlatformToolGroup {
  id: string
  displayName: string
  description: string
  tools: PlatformToolEntry[]
}

export interface Board {
  id: string
  name: string
  created_at: string
}

export interface Lane {
  id: string
  board_id: string
  name: string
  description: string
  position: number
  lane_type: 'todo' | 'in_progress' | 'done'
}

export interface Card {
  id: string
  board_id: string
  lane_id: string
  title: string
  description: string
  result: string
  assignee_id: string | null
  assignee_type: 'agent' | 'user' | null
  created_by: string
  created_by_type: string
  position: number
  is_archived: number
  created_at: string
  updated_at: string
}

export interface CardEvent {
  id: number
  card_id: string
  board_id: string
  actor_id: string
  actor_type: 'agent' | 'user'
  action: 'created' | 'moved' | 'updated' | 'deleted'
  meta: string
  created_at: string
}

export interface LaneRule {
  id: string
  lane_id: string
  rule_type: 'admin_only' | 'role' | 'employee'
  target_id: string | null
}

export interface BoardFull extends Board {
  lanes: Lane[]
  cards: Card[]
  rules: LaneRule[]
}

export interface Channel {
  id: string
  name: string
  is_dm: number
  created_at: string
}

export interface DmChannel extends Channel {
  partner_id: string
  partner_name: string
  partner_type: 'agent' | 'user'
  partner_avatar_color: string
}

export interface ChannelMessage {
  id: number
  channel_id: string
  sender_id: string
  sender_type: 'agent' | 'user'
  content: string
  created_at: string
}

export interface Notification {
  id: string
  type: 'agent' | 'board' | 'schedule' | 'error' | 'dm'
  message: string
  source_event: string
  meta: string
  created_at: string
  is_read: boolean
}

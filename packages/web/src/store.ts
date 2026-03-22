import { create } from 'zustand'
import {
  api,
  type Agent,
  type Notification,
  type Settings,
  type Provider,
  type MemoryEntry,
  type TodoItem,
  type Schedule,
  type FileEntry,
  type Plugin,
} from './api.ts'

interface AppState {
  // Settings
  settings: Settings | null
  providers: Provider[]
  loadSettings: () => Promise<void>
  updateSettings: (data: Partial<Omit<Settings, 'firstRun'>>) => Promise<void>
  loadProviders: () => Promise<void>

  // Agents
  agents: Agent[]
  loadAgents: () => Promise<void>
  addAgent: (data: Parameters<typeof api.agents.create>[0]) => Promise<Agent>
  updateAgent: (id: string, data: Parameters<typeof api.agents.update>[1]) => Promise<Agent>
  deleteAgent: (id: string) => Promise<void>
  toggleAgentActive: (id: string) => Promise<void>

  // Agent status (driven by WS events)
  agentStatus: Record<string, 'idle' | 'thinking' | 'error'>
  setAgentStatus: (agentId: string, status: 'idle' | 'thinking' | 'error') => void

  // Memory (per-agent, loaded on demand)
  memory: Record<string, MemoryEntry[]>
  loadMemory: (agentId: string) => Promise<void>
  addMemory: (agentId: string, content: string) => Promise<void>
  updateMemory: (agentId: string, id: number, content: string) => Promise<void>
  deleteMemory: (agentId: string, id: number) => Promise<void>

  // Todos (per-agent, loaded on demand)
  todos: Record<string, TodoItem[]>
  loadTodos: (agentId: string) => Promise<void>
  addTodo: (agentId: string, text: string) => Promise<void>
  patchTodo: (agentId: string, id: number, data: { completed?: boolean; text?: string }) => Promise<void>
  deleteTodo: (agentId: string, id: number) => Promise<void>

  // Schedules (per-agent, loaded on demand)
  schedules: Record<string, Schedule[]>
  loadSchedules: (agentId: string) => Promise<void>
  addSchedule: (agentId: string, data: { cron: string; prompt: string; label?: string }) => Promise<void>
  patchSchedule: (agentId: string, id: number, data: Partial<Pick<Schedule, 'cron' | 'prompt' | 'label' | 'enabled'>>) => Promise<void>
  deleteSchedule: (agentId: string, id: number) => Promise<void>

  // Notifications
  notifications: Notification[]
  notificationsLoaded: boolean
  loadNotifications: () => Promise<void>
  prependNotification: (n: Notification) => void
  markNotificationRead: (id: string) => Promise<void>
  markAllNotificationsRead: () => Promise<void>

  // Unread DM channels (set of channel IDs with unread messages)
  unreadDmChannels: Set<string>
  addUnreadDm: (channelId: string) => void
  markDmRead: (channelId: string) => void

  // Workspace
  workspaceFiles: FileEntry[]
  loadWorkspace: () => Promise<void>
  deleteWorkspaceFile: (path: string) => Promise<void>

  // Plugins
  plugins: Plugin[]
  loadPlugins: () => Promise<void>
  configurePlugin: (id: string, key: string, value: string) => Promise<void>
  removePluginConfig: (id: string) => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  settings: null,
  providers: [],
  agents: [],
  agentStatus: {},
  memory: {},
  todos: {},
  schedules: {},
  notifications: [],
  notificationsLoaded: false,
  unreadDmChannels: new Set<string>(),
  workspaceFiles: [],
  plugins: [],

  // ─── Settings ───────────────────────────────────────────────────────────────

  loadSettings: async () => {
    const settings = await api.settings.get()
    set({ settings })
  },

  updateSettings: async (data) => {
    await api.settings.update(data)
    await get().loadSettings()
  },

  loadProviders: async () => {
    const providers = await api.settings.providers()
    set({ providers })
  },

  // ─── Agents ─────────────────────────────────────────────────────────────────

  loadAgents: async () => {
    const agents = await api.agents.list()
    set({ agents })
  },

  addAgent: async (data) => {
    const agent = await api.agents.create(data)
    set((s) => ({ agents: [...s.agents, agent] }))
    return agent
  },

  updateAgent: async (id, data) => {
    const agent = await api.agents.update(id, data)
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? agent : a)) }))
    return agent
  },

  deleteAgent: async (id) => {
    await api.agents.delete(id)
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) }))
  },

  toggleAgentActive: async (id) => {
    const result = await api.agents.toggleActive(id)
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, is_active: result.is_active ? 1 : 0 } : a)),
    }))
  },

  // ─── Agent status ───────────────────────────────────────────────────────────

  setAgentStatus: (agentId, status) => {
    set((s) => ({ agentStatus: { ...s.agentStatus, [agentId]: status } }))
  },

  // ─── Memory ─────────────────────────────────────────────────────────────────

  loadMemory: async (agentId) => {
    const entries = await api.memory.list(agentId)
    set((s) => ({ memory: { ...s.memory, [agentId]: entries } }))
  },

  addMemory: async (agentId, content) => {
    const entry = await api.memory.create(agentId, content)
    set((s) => ({ memory: { ...s.memory, [agentId]: [...(s.memory[agentId] ?? []), entry] } }))
  },

  updateMemory: async (agentId, id, content) => {
    const entry = await api.memory.update(agentId, id, content)
    set((s) => ({
      memory: {
        ...s.memory,
        [agentId]: (s.memory[agentId] ?? []).map((e) => (e.id === id ? entry : e)),
      },
    }))
  },

  deleteMemory: async (agentId, id) => {
    await api.memory.delete(agentId, id)
    set((s) => ({
      memory: {
        ...s.memory,
        [agentId]: (s.memory[agentId] ?? []).filter((e) => e.id !== id),
      },
    }))
  },

  // ─── Todos ──────────────────────────────────────────────────────────────────

  loadTodos: async (agentId) => {
    const items = await api.todos.list(agentId)
    set((s) => ({ todos: { ...s.todos, [agentId]: items } }))
  },

  addTodo: async (agentId, text) => {
    const item = await api.todos.create(agentId, text)
    set((s) => ({ todos: { ...s.todos, [agentId]: [...(s.todos[agentId] ?? []), item] } }))
  },

  patchTodo: async (agentId, id, data) => {
    const item = await api.todos.patch(agentId, id, data)
    set((s) => ({
      todos: {
        ...s.todos,
        [agentId]: (s.todos[agentId] ?? []).map((t) => (t.id === id ? item : t)),
      },
    }))
  },

  deleteTodo: async (agentId, id) => {
    await api.todos.delete(agentId, id)
    set((s) => ({
      todos: {
        ...s.todos,
        [agentId]: (s.todos[agentId] ?? []).filter((t) => t.id !== id),
      },
    }))
  },

  // ─── Schedules ──────────────────────────────────────────────────────────────

  loadSchedules: async (agentId) => {
    const items = await api.schedules.list(agentId)
    set((s) => ({ schedules: { ...s.schedules, [agentId]: items } }))
  },

  addSchedule: async (agentId, data) => {
    const item = await api.schedules.create(agentId, data)
    set((s) => ({ schedules: { ...s.schedules, [agentId]: [...(s.schedules[agentId] ?? []), item] } }))
  },

  patchSchedule: async (agentId, id, data) => {
    const item = await api.schedules.patch(agentId, id, data)
    set((s) => ({
      schedules: {
        ...s.schedules,
        [agentId]: (s.schedules[agentId] ?? []).map((sc) => (sc.id === id ? item : sc)),
      },
    }))
  },

  deleteSchedule: async (agentId, id) => {
    await api.schedules.delete(agentId, id)
    set((s) => ({
      schedules: {
        ...s.schedules,
        [agentId]: (s.schedules[agentId] ?? []).filter((sc) => sc.id !== id),
      },
    }))
  },

  // ─── Notifications ──────────────────────────────────────────────────────────

  loadNotifications: async () => {
    const items = await api.notifications.list()
    set({ notifications: items, notificationsLoaded: true })
  },

  prependNotification: (n) => {
    set((s) => ({ notifications: [n, ...s.notifications] }))
  },

  markNotificationRead: async (id) => {
    await api.notifications.markRead(id)
    set((s) => ({
      notifications: s.notifications.map((n) => n.id === id ? { ...n, is_read: true } : n),
    }))
  },

  markAllNotificationsRead: async () => {
    await api.notifications.markAllRead()
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
    }))
  },

  // ─── Unread DMs ─────────────────────────────────────────────────────────────

  addUnreadDm: (channelId) => {
    set((s) => {
      const next = new Set(s.unreadDmChannels)
      next.add(channelId)
      return { unreadDmChannels: next }
    })
  },

  markDmRead: (channelId) => {
    set((s) => {
      const next = new Set(s.unreadDmChannels)
      next.delete(channelId)
      return { unreadDmChannels: next }
    })
  },

  // ─── Workspace ──────────────────────────────────────────────────────────────

  loadWorkspace: async () => {
    const files = await api.workspace.list()
    set({ workspaceFiles: files })
  },

  deleteWorkspaceFile: async (filePath) => {
    await api.workspace.delete(filePath)
    set((s) => ({ workspaceFiles: s.workspaceFiles.filter((f) => f.path !== filePath) }))
  },

  // ─── Plugins ────────────────────────────────────────────────────────────────

  loadPlugins: async () => {
    const plugins = await api.plugins.list()
    set({ plugins })
  },

  configurePlugin: async (id, key, value) => {
    await api.plugins.configure(id, key, value)
    const plugins = await api.plugins.list()
    set({ plugins })
  },

  removePluginConfig: async (id) => {
    await api.plugins.removeConfigure(id)
    const plugins = await api.plugins.list()
    set({ plugins })
  },
}))

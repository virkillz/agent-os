import { useEffect, useState, useRef, useCallback } from 'react'
import { useStore } from '../store.ts'
import { api, type TreeNode } from '../api.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'

const TEXT_EXTENSIONS = new Set([
  'md', 'txt', 'json', 'js', 'ts', 'tsx', 'jsx', 'html', 'htm', 'css',
  'yaml', 'yml', 'toml', 'sh', 'bash', 'py', 'rb', 'go', 'rs', 'java',
  'c', 'cpp', 'h', 'hpp', 'csv', 'xml', 'svg', 'env', 'gitignore',
  'log', 'ini', 'conf', 'config',
])

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif',
])

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_EXTENSIONS.has(ext) || !name.includes('.')
}

function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Explorer() {
  const { workspaceTree, loadWorkspaceTree } = useStore()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<TreeNode | null>(null)
  const [createMode, setCreateMode] = useState<'file' | 'dir' | null>(null)
  const [createParent, setCreateParent] = useState<string>('')
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadWorkspaceTree() }, [loadWorkspaceTree])

  useAppEvents((event) => {
    if (event.type === 'workspace:change') loadWorkspaceTree()
  })

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const expandTo = useCallback((path: string) => {
    const parts = path.split('/')
    let current = ''
    setExpanded((prev) => {
      const next = new Set(prev)
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i]
        next.add(current)
      }
      return next
    })
  }, [])

  async function handleSelect(node: TreeNode) {
    setSelectedPath(node.path)
    setSelectedNode(node)
    setFileContent(null)
    setEditing(false)
    if (node.type === 'file') {
      if (isTextFile(node.name)) {
        setLoading(true)
        try {
          const content = await api.workspace.read(node.path)
          setFileContent(content)
        } catch {
          setFileContent('(Unable to read file)')
        } finally {
          setLoading(false)
        }
      }
    }
  }

  function handleEdit() {
    setEditContent(fileContent ?? '')
    setEditing(true)
  }

  async function handleSave() {
    if (!selectedNode) return
    setSaving(true)
    try {
      await api.workspace.save(selectedNode.path, editContent)
      setFileContent(editContent)
      setEditing(false)
    } finally { setSaving(false) }
  }

  async function handleDelete(node: TreeNode) {
    await api.workspace.delete(node.path)
    setConfirmDelete(null)
    if (selectedPath === node.path) {
      setSelectedPath(null)
      setSelectedNode(null)
      setFileContent(null)
      setEditing(false)
    }
  }

  function startCreate(mode: 'file' | 'dir', parentPath: string) {
    setCreateMode(mode)
    setCreateParent(parentPath)
    setCreateName('')
    setCreateError('')
    setTimeout(() => createInputRef.current?.focus(), 50)
  }

  async function handleCreate() {
    if (!createName.trim()) return
    const name = createName.trim()
    const fullPath = createParent ? `${createParent}/${name}` : name
    try {
      if (createMode === 'dir') {
        await api.workspace.mkdir(fullPath)
      } else {
        await api.workspace.save(fullPath, '')
      }
      setCreateMode(null)
      setCreateName('')
      expandTo(fullPath)
      await loadWorkspaceTree()
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') setCreateMode(null)
  }

  return (
    <div className="flex h-full">
      {/* File tree */}
      <div className="w-80 flex-shrink-0 border-r border-border flex flex-col bg-surface-1">
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Explorer</h2>
          <div className="flex gap-1">
            <button
              className="p-1.5 rounded hover:bg-surface-3 transition-colors"
              title="New file"
              onClick={() => startCreate('file', '')}
            >
              <NewFileIcon />
            </button>
            <button
              className="p-1.5 rounded hover:bg-surface-3 transition-colors"
              title="New folder"
              onClick={() => startCreate('dir', '')}
            >
              <NewFolderIcon />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {workspaceTree.length === 0 && (
            <p className="text-xs text-muted text-center py-8">No files yet.</p>
          )}
          {workspaceTree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={toggleExpanded}
              onSelect={handleSelect}
              onDelete={(n) => setConfirmDelete(n)}
              onCreate={startCreate}
            />
          ))}
        </div>
      </div>

      {/* Detail / Editor panel */}
      <div className="flex-1 overflow-y-auto p-8">
        {selectedNode ? (
          <div className="max-w-3xl">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-surface-3 border border-border rounded-lg flex items-center justify-center flex-shrink-0">
                  {selectedNode.type === 'dir' ? <FolderIcon /> : <FileIcon name={selectedNode.name} />}
                </div>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedNode.name}</h2>
                  <p className="text-xs text-muted break-all">{selectedNode.path}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedNode.type === 'file' && (
                  <>
                    {fileContent != null && !editing && (
                      <button
                        className="px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-surface-3 transition-colors"
                        style={{ color: 'var(--text-primary)' }}
                        onClick={handleEdit}
                      >
                        Edit
                      </button>
                    )}
                    <a
                      href={api.workspace.downloadUrl(selectedNode.path)}
                      download={selectedNode.name}
                      className="px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-surface-3 transition-colors inline-flex items-center gap-1.5 no-underline"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      <DownloadIcon />
                      Download
                    </a>
                  </>
                )}
                <button
                  className="px-3 py-1.5 rounded-lg text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={() => setConfirmDelete(selectedNode)}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* File info */}
            {selectedNode.type === 'file' && (
              <div className="flex gap-4 mb-4 text-xs text-muted">
                <span>{formatBytes(selectedNode.size_bytes)}</span>
                <span>{isTextFile(selectedNode.name) ? 'Text' : isImageFile(selectedNode.name) ? 'Image' : 'Binary'}</span>
              </div>
            )}

            {/* Directory children */}
            {selectedNode.type === 'dir' && (
              <div className="bg-surface-2 border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted">Contents</span>
                  <div className="flex gap-1">
                    <button
                      className="p-1 rounded hover:bg-surface-3 transition-colors"
                      title="New file"
                      onClick={() => startCreate('file', selectedNode.path)}
                    >
                      <NewFileIcon small />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-surface-3 transition-colors"
                      title="New folder"
                      onClick={() => startCreate('dir', selectedNode.path)}
                    >
                      <NewFolderIcon small />
                    </button>
                  </div>
                </div>
                {selectedNode.children && selectedNode.children.length > 0 ? (
                  <div className="space-y-1">
                    {selectedNode.children.map((child) => (
                      <button
                        key={child.path}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-surface-3 transition-colors"
                        onClick={() => handleSelect(child)}
                      >
                        {child.type === 'dir' ? <FolderIcon small /> : <FileIcon name={child.name} small />}
                        <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{child.name}</span>
                        {child.type === 'file' && <span className="text-xs text-muted">{formatBytes(child.size_bytes)}</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted text-center py-4">Empty directory</p>
                )}
              </div>
            )}

            {/* File viewer / editor */}
            {selectedNode.type === 'file' && fileContent != null && (
              <div className="bg-surface-2 border border-border rounded-xl overflow-hidden mt-4">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-xs text-muted">{selectedNode.path}</span>
                  {editing ? (
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-muted hover:text-subtle transition-colors"
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="text-xs font-medium text-accent hover:opacity-80 transition-opacity disabled:opacity-50"
                        onClick={handleSave}
                        disabled={saving}
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-xs text-muted hover:text-subtle transition-colors"
                      onClick={() => setFileContent(null)}
                    >
                      Close
                    </button>
                  )}
                </div>
                {editing ? (
                  <textarea
                    className="w-full bg-transparent text-xs font-mono p-4 resize-none outline-none"
                    style={{ color: 'var(--text-primary)', minHeight: '400px' }}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    spellCheck={false}
                  />
                ) : (
                  <pre
                    className="text-xs font-mono p-4 overflow-x-auto whitespace-pre-wrap break-words"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {fileContent}
                  </pre>
                )}
              </div>
            )}

            {selectedNode.type === 'file' && loading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'rgb(var(--accent))', borderTopColor: 'transparent' }} />
              </div>
            )}

            {selectedNode.type === 'file' && !isTextFile(selectedNode.name) && !loading && fileContent == null && (
              <div className="bg-surface-2 border border-border rounded-xl p-6 text-center">
                {isImageFile(selectedNode.name) ? (
                  <img
                    src={api.workspace.downloadUrl(selectedNode.path)}
                    alt={selectedNode.name}
                    className="max-w-full max-h-[70vh] mx-auto rounded-lg"
                  />
                ) : (
                  <p className="text-sm text-muted">Binary file — download to view</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="bg-surface-2 border border-border rounded-xl px-8 py-6 text-center">
              <div className="w-10 h-10 bg-surface-3 rounded-xl flex items-center justify-center mx-auto mb-3">
                <FolderIcon large />
              </div>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Select a file or folder to explore</p>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {createMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreateMode(null)}>
          <div className="bg-surface-2 border border-border rounded-xl p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              {createMode === 'dir' ? 'New Folder' : 'New File'}
            </h3>
            {createParent && (
              <p className="text-xs text-muted mb-2 break-all">in /{createParent}</p>
            )}
            <input
              ref={createInputRef}
              className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent mb-3"
              style={{ color: 'var(--text-primary)' }}
              placeholder={createMode === 'dir' ? 'folder-name' : 'file.txt'}
              value={createName}
              onChange={(e) => { setCreateName(e.target.value); setCreateError('') }}
              onKeyDown={handleKeyDown}
            />
            {createError && <p className="text-xs text-red-400 mb-3">{createError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-surface-3 transition-colors"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => setCreateMode(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-colors"
                onClick={handleCreate}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-surface-2 border border-border rounded-xl p-6 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Delete {confirmDelete.type === 'dir' ? 'folder' : 'file'}?
            </h3>
            <p className="text-xs text-muted mb-5 break-all">{confirmDelete.path}</p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-surface-3 transition-colors"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                onClick={() => handleDelete(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TreeItem({
  node,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelect,
  onDelete,
  onCreate,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  selectedPath: string | null
  onToggle: (path: string) => void
  onSelect: (node: TreeNode) => void
  onDelete: (node: TreeNode) => void
  onCreate: (mode: 'file' | 'dir', parentPath: string) => void
}) {
  const isExpanded = expanded.has(node.path)
  const isSelected = selectedPath === node.path
  const hasChildren = node.type === 'dir' && (node.children?.length ?? 0) > 0

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 cursor-pointer transition-colors ${
          isSelected ? 'bg-surface-3' : 'hover:bg-surface-2'
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => {
          if (node.type === 'dir') onToggle(node.path)
          onSelect(node)
        }}
      >
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {node.type === 'dir' ? (
            <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
              <ChevronRightIcon />
            </span>
          ) : (
            <span className="w-4" />
          )}
        </span>
        {node.type === 'dir' ? (
          <FolderIcon small />
        ) : (
          <FileIcon name={node.name} small />
        )}
        <span
          className="flex-1 text-sm truncate"
          style={{ color: isSelected ? 'var(--text-primary)' : 'var(--subtle)' }}
        >
          {node.name}
        </span>
        <span className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
          {node.type === 'dir' && (
            <>
              <button
                className="p-1 rounded hover:bg-surface-3 transition-colors"
                title="New file"
                onClick={(e) => { e.stopPropagation(); onCreate('file', node.path) }}
              >
                <NewFileIcon tiny />
              </button>
              <button
                className="p-1 rounded hover:bg-surface-3 transition-colors"
                title="New folder"
                onClick={(e) => { e.stopPropagation(); onCreate('dir', node.path) }}
              >
                <NewFolderIcon tiny />
              </button>
            </>
          )}
          <button
            className="p-1 rounded hover:bg-red-500/10 transition-colors"
            title="Delete"
            onClick={(e) => { e.stopPropagation(); onDelete(node) }}
          >
            <TrashIcon />
          </button>
        </span>
      </div>
      {node.type === 'dir' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
              onCreate={onCreate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ChevronRightIcon() {
  return (
    <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function FileIcon({ name, small }: { name: string; small?: boolean }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const cls = small ? 'w-4 h-4' : 'w-5 h-5'
  const color = ext === 'mp4' || ext === 'mov' ? '#f59e0b'
    : ext === 'mp3' || ext === 'wav' ? '#8b5cf6'
    : ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'bmp' || ext === 'ico' || ext === 'avif' ? '#10b981'
    : ext === 'md' || ext === 'txt' ? '#6b7280'
    : ext === 'json' ? '#3b82f6'
    : '#6b7280'
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function FolderIcon({ small, large }: { small?: boolean; large?: boolean }) {
  const cls = large ? 'w-6 h-6 text-accent' : small ? 'w-4 h-4' : 'w-5 h-5'
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: 'var(--accent)' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  )
}

function NewFileIcon({ small, tiny }: { small?: boolean; tiny?: boolean }) {
  const cls = tiny ? 'w-3 h-3' : small ? 'w-3.5 h-3.5' : 'w-4 h-4'
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--subtle)' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 0v3.75m0-3.75h3.75m-3.75 0H8.25" />
    </svg>
  )
}

function NewFolderIcon({ small, tiny }: { small?: boolean; tiny?: boolean }) {
  const cls = tiny ? 'w-3 h-3' : small ? 'w-3.5 h-3.5' : 'w-4 h-4'
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--subtle)' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 0v3.75m0-3.75h3.75m-3.75 0H8.25" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

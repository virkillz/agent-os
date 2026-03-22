import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.ts'
import { api, type FileEntry } from '../api.ts'
import { useAppEvents } from '../hooks/useAppEvents.ts'

const TEXT_EXTENSIONS = new Set([
  'md', 'txt', 'json', 'js', 'ts', 'tsx', 'jsx', 'html', 'htm', 'css',
  'yaml', 'yml', 'toml', 'sh', 'bash', 'py', 'rb', 'go', 'rs', 'java',
  'c', 'cpp', 'h', 'hpp', 'csv', 'xml', 'svg', 'env', 'gitignore',
  'log', 'ini', 'conf', 'config',
])

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_EXTENSIONS.has(ext) || !name.includes('.')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function dirOf(filePath: string): string {
  const idx = filePath.lastIndexOf('/')
  return idx === -1 ? '' : filePath.slice(0, idx)
}

export default function Workspace() {
  const { workspaceFiles, loadWorkspace, deleteWorkspaceFile } = useStore()
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<FileEntry | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadWorkspace() }, [loadWorkspace])

  useAppEvents((event) => {
    if (event.type === 'workspace:change') loadWorkspace()
  })

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await api.workspace.upload(file)
      }
      await loadWorkspace()
    } finally { setUploading(false) }
  }

  async function handleDelete(file: FileEntry) {
    await deleteWorkspaceFile(file.path)
    setConfirmDelete(null)
    if (selected?.path === file.path) { setSelected(null); setFileContent(null); setEditing(false) }
  }

  async function handleRead(file: FileEntry) {
    const content = await api.workspace.read(file.path)
    setFileContent(content)
    setEditing(false)
  }

  function handleEdit() {
    setEditContent(fileContent ?? '')
    setEditing(true)
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      await api.workspace.save(selected.path, editContent)
      setFileContent(editContent)
      setEditing(false)
    } finally { setSaving(false) }
  }

  // Group files by directory
  const groups = new Map<string, FileEntry[]>()
  for (const f of workspaceFiles) {
    const dir = dirOf(f.path)
    if (!groups.has(dir)) groups.set(dir, [])
    groups.get(dir)!.push(f)
  }
  const sortedDirs = Array.from(groups.keys()).sort()

  return (
    <div className="flex h-full">
      {/* File tree */}
      <div className="w-80 flex-shrink-0 border-r border-border flex flex-col bg-surface-1">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Workspace</h2>

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              handleUpload(e.dataTransfer.files)
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            {uploading ? (
              <p className="text-xs text-muted">Uploading...</p>
            ) : (
              <>
                <UploadIcon />
                <p className="text-xs text-muted mt-1">Drop files or click to upload</p>
              </>
            )}
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto py-2">
          {workspaceFiles.length === 0 && (
            <p className="text-xs text-muted text-center py-8">No files yet.</p>
          )}

          {sortedDirs.map((dir) => (
            <div key={dir}>
              {dir && (
                <div className="px-4 py-1.5 text-[10px] font-medium text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <FolderIcon />
                  {dir}
                </div>
              )}
              {groups.get(dir)!.map((file) => (
                <button
                  key={file.path}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                    selected?.path === file.path ? 'bg-surface-3' : 'hover:bg-surface-2'
                  }`}
                  onClick={() => { setSelected(file); setFileContent(null); setEditing(false) }}
                >
                  <FileIcon name={file.name} />
                  <span
                    className="flex-1 text-sm truncate"
                    style={{ color: selected?.path === file.path ? 'var(--text-primary)' : 'var(--subtle)' }}
                  >
                    {file.name}
                  </span>
                  <span className="text-[10px] text-muted flex-shrink-0">{formatBytes(file.size_bytes)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto p-8">
        {selected ? (
          <div className="max-w-2xl">
            <div className="bg-surface-2 border border-border rounded-xl p-5 mb-4">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 bg-surface-3 border border-border rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileIcon name={selected.name} large />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{selected.name}</h2>
                  <p className="text-xs text-muted mt-0.5 break-all">{selected.path}</p>
                </div>
              </div>

              <div className="space-y-2.5 mb-5">
                <DetailRow label="Size" value={formatBytes(selected.size_bytes)} />
                <DetailRow label="Type" value={selected.mime_type} />
                <DetailRow label="Uploaded by" value={selected.uploaded_by ?? 'Human'} />
                <DetailRow label="Created" value={formatDate(selected.created_at)} />
                <DetailRow label="Modified" value={formatDate(selected.updated_at)} />
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  className="px-4 py-2 rounded-lg text-sm border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={() => setConfirmDelete(selected)}
                >
                  Delete
                </button>
                <div className="flex gap-2">
                  {isTextFile(selected.name) && !fileContent && (
                    <button
                      className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-surface-3 transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={() => handleRead(selected)}
                    >
                      View
                    </button>
                  )}
                  {fileContent && !editing && (
                    <button
                      className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-surface-3 transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={handleEdit}
                    >
                      Edit
                    </button>
                  )}
                  <a
                    href={api.workspace.downloadUrl(selected.path)}
                    download={selected.name}
                    className="btn-primary text-sm px-4 py-2 inline-flex items-center gap-2 no-underline"
                  >
                    <DownloadIcon />
                    Download
                  </a>
                </div>
              </div>
            </div>

            {/* File viewer / editor */}
            {fileContent !== null && (
              <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-xs text-muted">{selected.path}</span>
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
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="bg-surface-2 border border-border rounded-xl px-8 py-6 text-center">
              <div className="w-10 h-10 bg-surface-3 rounded-xl flex items-center justify-center mx-auto mb-3">
                <FolderIcon large />
              </div>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Select a file to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-surface-2 border border-border rounded-xl p-6 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Delete file?</h3>
            <p className="text-xs text-muted mb-5 break-all">{confirmDelete.name}</p>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted w-24 flex-shrink-0 pt-px">{label}</span>
      <span className="text-xs font-medium break-all" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function FileIcon({ name, large }: { name: string; large?: boolean }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const cls = large ? 'w-6 h-6' : 'w-4 h-4'
  const color = ext === 'mp4' || ext === 'mov' ? '#f59e0b'
    : ext === 'mp3' || ext === 'wav' ? '#8b5cf6'
    : ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' ? '#10b981'
    : ext === 'md' || ext === 'txt' ? '#6b7280'
    : ext === 'json' ? '#3b82f6'
    : '#6b7280'

  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function FolderIcon({ large }: { large?: boolean }) {
  const cls = large ? 'w-6 h-6 text-accent' : 'w-3.5 h-3.5'
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: large ? 'var(--accent)' : 'var(--muted)' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg className="w-5 h-5 mx-auto text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

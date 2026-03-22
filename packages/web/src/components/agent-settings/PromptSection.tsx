import { useEffect, useState } from 'react'
import { api } from '../../api.ts'

export function PromptSection({ agentId }: { agentId: string }) {
  const [prompt, setPrompt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.agents.previewPrompt(agentId)
      .then((r) => setPrompt(r.prompt))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [agentId])

  function handleCopy() {
    if (!prompt) return
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-start justify-center py-8 px-6">
      <div className="w-full max-w-3xl bg-gray-900/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-6 animate-zoom-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Combined System Prompt
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Read-only preview of the full prompt sent to the model at session start.
            </p>
          </div>
          {prompt && (
            <button
              className="btn-secondary text-xs px-3 py-1.5"
              onClick={handleCopy}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>

        {loading && (
          <div className="text-sm text-muted py-8 text-center">Loading…</div>
        )}
        {error && (
          <div className="text-sm text-red-400 py-4">{error}</div>
        )}
        {prompt && (
          <pre
            className="text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap rounded-xl p-4"
            style={{
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'var(--subtle)',
              fontFamily: 'ui-monospace, monospace',
              maxHeight: '65vh',
              overflowY: 'auto',
            }}
          >
            {prompt}
          </pre>
        )}
      </div>
    </div>
  )
}

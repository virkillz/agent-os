import { useEffect, useState } from 'react'
import { api } from '../../api.ts'

interface PromptSectionData {
  label: string
  content: string
  color: string
}

export function PromptSection({ agentId }: { agentId: string }) {
  const [sections, setSections] = useState<PromptSectionData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.agents.previewPrompt(agentId)
      .then((r) => {
        // Parse the combined prompt back into sections
        const parsed = parsePromptIntoSections(r.prompt)
        setSections(parsed)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [agentId])

  const fullPrompt = sections.map((s) => s.content).join('\n\n')

  function handleCopy() {
    if (!fullPrompt) return
    navigator.clipboard.writeText(fullPrompt).then(() => {
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
          {sections.length > 0 && (
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

        <div className="space-y-4">
          {sections.map((section, idx) => (
            <div key={idx} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${section.color}33` }}>
              <div
                className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ background: `${section.color}1a`, color: section.color }}
              >
                {section.label}
              </div>
              <pre
                className="text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap p-4"
                style={{
                  background: 'rgba(0,0,0,0.25)',
                  color: 'var(--subtle)',
                  fontFamily: 'ui-monospace, monospace',
                  maxHeight: '40vh',
                  overflowY: 'auto',
                }}
              >
                {section.content}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function parsePromptIntoSections(prompt: string): PromptSectionData[] {
  const sections: PromptSectionData[] = []

  // Known section markers in order of appearance
  const markers = [
    { prefix: '### MCP Tools:', labelPrefix: 'MCP:', color: '#6ac5f7' },
    { prefix: '## Trust Policy', labelPrefix: 'Trust Policy', color: '#f76a6a' },
    { prefix: '## Available Skills', labelPrefix: 'Skills', color: '#f7c46a' },
  ]

  let remaining = prompt

  // Find the first occurrence of any marker
  const findFirstMarker = (text: string) => {
    let firstIdx = -1
    let firstMarker: typeof markers[0] | null = null
    for (const m of markers) {
      const idx = text.indexOf(m.prefix)
      if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
        firstIdx = idx
        firstMarker = m
      }
    }
    return { idx: firstIdx, marker: firstMarker }
  }

  // Extract base prompt (everything before first marker)
  const first = findFirstMarker(remaining)
  if (first.idx !== -1) {
    const baseContent = remaining.slice(0, first.idx).trim()
    if (baseContent) {
      sections.push({ label: 'Base System Prompt', content: baseContent, color: '#7c6af7' })
    }
    remaining = remaining.slice(first.idx)
  }

  // Parse each section by its marker
  while (remaining.length > 0) {
    const current = findFirstMarker(remaining)
    if (current.idx === -1 || !current.marker) break

    // Find where this section ends (start of next marker, or end of string)
    let endIdx = remaining.length
    for (const m of markers) {
      if (m.prefix === current.marker.prefix) continue
      const nextIdx = remaining.indexOf(m.prefix, current.idx + 1)
      if (nextIdx !== -1 && nextIdx < endIdx) {
        endIdx = nextIdx
      }
    }

    const content = remaining.slice(current.idx, endIdx).trim()
    let label = current.marker.labelPrefix

    // Extract a more specific label where possible
    if (current.marker.labelPrefix === 'MCP:') {
      const firstLine = content.split('\n')[0]
      const serverName = firstLine.replace('### MCP Tools:', '').trim()
      if (serverName) label = `MCP: ${serverName}`
    }

    sections.push({
      label,
      content,
      color: current.marker.color,
    })

    remaining = remaining.slice(endIdx)
  }

  // If no sections were found, treat the whole thing as base
  if (sections.length === 0 && prompt.trim()) {
    sections.push({ label: 'Base System Prompt', content: prompt.trim(), color: '#7c6af7' })
  }

  return sections
}

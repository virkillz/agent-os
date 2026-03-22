import { Type } from '@sinclair/typebox'
import type { RascalPlugin } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

async function fetchReadable(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; rascal-bot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)

  const contentType = res.headers.get('content-type') ?? ''

  // For plain text / JSON, return as-is (truncated)
  if (contentType.includes('text/plain') || contentType.includes('application/json')) {
    const text = await res.text()
    return text.length > 8000 ? text.slice(0, 8000) + '\n\n[truncated]' : text
  }

  const html = await res.text()

  // Dynamic import to avoid loading jsdom at startup
  const { JSDOM } = await import('jsdom')
  const { Readability } = await import('@mozilla/readability')

  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  if (!article || !article.textContent?.trim()) {
    // Readability failed — strip all tags and return raw text
    const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const result = stripped.length > 8000 ? stripped.slice(0, 8000) + '\n\n[truncated]' : stripped
    return result
  }

  const content = article.textContent.replace(/\n{3,}/g, '\n\n').trim()
  const header = [article.title, article.byline, article.siteName]
    .filter(Boolean)
    .join(' · ')

  const full = header ? `${header}\n\n${content}` : content
  return full.length > 12000 ? full.slice(0, 12000) + '\n\n[truncated]' : full
}

export const fetchContentPlugin: RascalPlugin = {
  config: {
    id: 'fetch-content',
    displayName: 'Fetch Content',
    description: 'Fetch a URL and extract the readable text content from web pages and articles',
    env: [],
    toolIds: ['fetch_content'],
  },

  getTools(_ctx) {
    return [
      {
        name: 'fetch_content',
        label: 'Fetch Content',
        description:
          'Fetch a URL and return the readable text content of the page. ' +
          'Uses Mozilla Readability to extract the main article body, stripping ads and navigation. ' +
          'Useful for reading articles, news stories, documentation pages, or any web content.',
        parameters: Type.Object({
          url: Type.String({ description: 'The URL to fetch' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const content = await fetchReadable(params.url)
          return ok(content)
        },
      },
    ]
  },
}

import { Type } from '@sinclair/typebox'
import type { RascalPlugin } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const braveSearchPlugin: RascalPlugin = {
  config: {
    id: 'brave-search',
    displayName: 'Brave Search',
    description: 'Web search via Brave Search API — returns organic results, news, and images',
    env: [
      {
        key: 'BRAVE_API_KEY',
        required: true,
        description: 'API key from brave.com/search/api — sign up for a free or paid plan',
      },
    ],
    toolIds: ['brave_web_search'],
  },

  getTools(_ctx) {
    return [
      {
        name: 'brave_web_search',
        label: 'Brave Web Search',
        description:
          'Search the web using Brave Search API. ' +
          'Returns titles, URLs, and descriptions of the top results.',
        parameters: Type.Object({
          query: Type.String({ description: 'Search query' }),
          count: Type.Optional(
            Type.Number({
              description: 'Number of results to return (default: 10, max: 20)',
            }),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const apiKey = process.env.BRAVE_API_KEY
          if (!apiKey) throw new Error('BRAVE_API_KEY is not configured')

          const count = Math.min(params.count ?? 10, 20)
          const url = new URL('https://api.search.brave.com/res/v1/web/search')
          url.searchParams.set('q', params.query)
          url.searchParams.set('count', String(count))

          const res = await fetch(url.toString(), {
            headers: {
              Accept: 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': apiKey,
            },
          })

          if (!res.ok) {
            const msg = await res.text()
            throw new Error(`Brave Search API error ${res.status}: ${msg}`)
          }

          const data = await res.json() as {
            web?: { results?: Array<{ title: string; url: string; description?: string }> }
          }

          const results = data.web?.results ?? []
          if (results.length === 0) {
            return ok(`No results found for: ${params.query}`)
          }

          const formatted = results
            .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description ?? ''}`)
            .join('\n\n')

          return ok(`Search results for "${params.query}":\n\n${formatted}`)
        },
      },
    ]
  },

  async healthCheck() {
    const apiKey = process.env.BRAVE_API_KEY
    if (!apiKey) return { ok: false, message: 'BRAVE_API_KEY not set' }
    try {
      const res = await fetch(
        'https://api.search.brave.com/res/v1/web/search?q=test&count=1',
        {
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey,
          },
        },
      )
      return res.ok
        ? { ok: true }
        : { ok: false, message: `API returned ${res.status}` }
    } catch (e) {
      return { ok: false, message: String(e) }
    }
  },
}

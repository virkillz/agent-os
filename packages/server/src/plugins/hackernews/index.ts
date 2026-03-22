import { Type } from '@sinclair/typebox'
import type { RascalPlugin } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

interface HNStory {
  rank: number
  itemId: string
  title: string
  url: string
  points: number
  comments: number
}

async function fetchHNPage(page = 1): Promise<HNStory[]> {
  const url = `https://news.ycombinator.com/news${page > 1 ? `?p=${page}` : ''}`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rascal-bot/1.0)' },
  })
  if (!response.ok) throw new Error(`Failed to fetch HN: ${response.status}`)

  const html = await response.text()
  const stories: HNStory[] = []

  const storyRegex =
    /<tr class="athing submission" id="(\d+)">([\s\S]*?)<\/tr>\s*<tr>([\s\S]*?)<\/tr>/g
  const titleRegex = /<span class="titleline"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/
  const rankRegex = /<span class="rank">(\d+)\.<\/span>/
  const scoreRegex = /<span class="score" id="score_\d+">(\d+) points?<\/span>/
  const commentsRegex = />(\d+)&nbsp;comment|>discuss</

  let match: RegExpExecArray | null
  while ((match = storyRegex.exec(html)) !== null) {
    const itemId = match[1]
    const storyBlock = match[2]
    const subtextBlock = match[3]

    const rankMatch = storyBlock.match(rankRegex)
    const rank = rankMatch ? parseInt(rankMatch[1]) : stories.length + 1

    const titleMatch = storyBlock.match(titleRegex)
    if (!titleMatch) continue

    let storyUrl = titleMatch[1]
    const title = titleMatch[2].replace(/<[^>]+>/g, '')

    if (storyUrl.startsWith('item?id=')) {
      storyUrl = `https://news.ycombinator.com/${storyUrl}`
    }

    const scoreMatch = subtextBlock.match(scoreRegex)
    const points = scoreMatch ? parseInt(scoreMatch[1]) : 0

    const commentsMatch = subtextBlock.match(commentsRegex)
    const comments = commentsMatch?.[1] ? parseInt(commentsMatch[1]) : 0

    stories.push({ rank, itemId, title, url: storyUrl, points, comments })
  }

  return stories
}

async function fetchHNComments(itemId: string): Promise<string> {
  const apiUrl = `https://hacker-news.firebaseio.com/v0/item/${itemId}.json`
  const res = await fetch(apiUrl)
  if (!res.ok) throw new Error(`HN API error: ${res.status}`)

  const item = await res.json() as {
    title?: string
    url?: string
    score?: number
    by?: string
    descendants?: number
    kids?: number[]
    text?: string
  }

  const kids = item.kids?.slice(0, 10) ?? []
  if (kids.length === 0) return 'No top-level comments.'

  const commentFetches = kids.map(async (id: number) => {
    const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    if (!r.ok) return null
    return r.json() as Promise<{ by?: string; text?: string; deleted?: boolean; dead?: boolean }>
  })

  const commentItems = await Promise.all(commentFetches)
  const lines: string[] = []
  for (const c of commentItems) {
    if (!c || c.deleted || c.dead || !c.text) continue
    const text = c.text.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
    lines.push(`**${c.by}:** ${text}`)
  }

  return lines.join('\n\n') || 'No readable comments found.'
}

export const hackernewsPlugin: RascalPlugin = {
  config: {
    id: 'hackernews',
    displayName: 'Hacker News',
    description: 'Browse Hacker News top stories and read discussion threads',
    env: [],
    toolIds: ['hackernews_top_stories', 'hackernews_get_comments'],
  },

  getTools(_ctx) {
    return [
      {
        name: 'hackernews_top_stories',
        label: 'HN Top Stories',
        description:
          'Fetch the top stories from Hacker News front page. ' +
          'Returns rank, title, URL, upvote points, and comment count for up to 30 stories per page.',
        parameters: Type.Object({
          page: Type.Optional(
            Type.Number({
              description: 'Page number (1–3). Defaults to 1.',
              minimum: 1,
              maximum: 3,
            }),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const page = params.page ?? 1
          const stories = await fetchHNPage(page)
          if (stories.length === 0) return ok('No stories found.')

          const formatted = stories
            .map(
              (s) =>
                `${s.rank}. **${s.title}**\n   ${s.url}\n   ▲ ${s.points} pts · 💬 ${s.comments} comments · itemId: ${s.itemId}`,
            )
            .join('\n\n')

          return ok(`**Hacker News — Top Stories (page ${page})**\n\n${formatted}`)
        },
      },
      {
        name: 'hackernews_get_comments',
        label: 'HN Get Comments',
        description:
          'Fetch the top comments for a Hacker News story by its item ID. ' +
          'Use hackernews_top_stories to get item IDs. Returns the first 10 top-level comments.',
        parameters: Type.Object({
          itemId: Type.String({ description: 'Hacker News item ID (numeric string)' }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const comments = await fetchHNComments(params.itemId)
          return ok(`**HN Comments for item ${params.itemId}**\n\n${comments}`)
        },
      },
    ]
  },
}

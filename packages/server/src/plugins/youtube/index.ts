import fs from 'fs'
import path from 'path'
import { Type } from '@sinclair/typebox'
import type { RascalPlugin, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const youtubePlugin: RascalPlugin = {
  config: {
    id: 'youtube',
    displayName: 'YouTube',
    description: 'Search YouTube videos and upload to a channel via YouTube Data API v3',
    env: [
      {
        key: 'YOUTUBE_API_KEY',
        required: true,
        description:
          'API key from Google Cloud Console with YouTube Data API v3 enabled (for search)',
      },
      {
        key: 'YOUTUBE_OAUTH_TOKEN',
        required: false,
        description:
          'OAuth2 access token for upload operations (obtain via google-auth-library or gcloud CLI)',
      },
    ],
    toolIds: ['youtube_search', 'youtube_upload'],
  },

  getTools(ctx: ToolContext) {
    return [
      // ── youtube_search ─────────────────────────────────────────────────────
      {
        name: 'youtube_search',
        label: 'YouTube: Search',
        description:
          'Search YouTube for videos matching a query. ' +
          'Returns a list of results with title, channel, view count, and URL.',
        parameters: Type.Object({
          query: Type.String({ description: 'Search query' }),
          max_results: Type.Optional(
            Type.Number({ description: 'Maximum results to return (1–50, default: 10)' }),
          ),
          order: Type.Optional(
            Type.Union(
              [
                Type.Literal('relevance'),
                Type.Literal('viewCount'),
                Type.Literal('date'),
                Type.Literal('rating'),
              ],
              { description: 'Sort order (default: relevance)' },
            ),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const apiKey = process.env.YOUTUBE_API_KEY
          if (!apiKey) throw new Error('YOUTUBE_API_KEY is not configured')

          const maxResults = Math.min(Math.max(params.max_results ?? 10, 1), 50)
          const order = params.order ?? 'relevance'
          const url = new URL('https://www.googleapis.com/youtube/v3/search')
          url.searchParams.set('part', 'snippet')
          url.searchParams.set('type', 'video')
          url.searchParams.set('q', params.query)
          url.searchParams.set('maxResults', String(maxResults))
          url.searchParams.set('order', order)
          url.searchParams.set('key', apiKey)

          const res = await fetch(url.toString())
          if (!res.ok) {
            const msg = await res.text()
            throw new Error(`YouTube API error ${res.status}: ${msg}`)
          }

          const json = await res.json() as {
            items?: Array<{
              id?: { videoId?: string }
              snippet?: { title?: string; channelTitle?: string }
            }>
          }

          const items = json.items ?? []
          if (!items.length) return ok('No results found.')

          const videoIds = items.map((i) => i.id?.videoId).filter(Boolean).join(',')

          const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
          statsUrl.searchParams.set('part', 'statistics')
          statsUrl.searchParams.set('id', videoIds)
          statsUrl.searchParams.set('key', apiKey)

          const statsRes = await fetch(statsUrl.toString())
          const statsJson = statsRes.ok
            ? (await statsRes.json() as {
                items?: Array<{ id?: string; statistics?: { viewCount?: string } }>
              })
            : { items: [] }
          const statsMap = new Map(
            (statsJson.items ?? []).map((s) => [s.id, s.statistics?.viewCount ?? '?']),
          )

          const lines = items.map((item) => {
            const vid = item.id?.videoId ?? ''
            const title = item.snippet?.title ?? 'Untitled'
            const channel = item.snippet?.channelTitle ?? 'Unknown'
            const views = statsMap.get(vid) ?? '?'
            return `- ${title}\n  Channel: ${channel} | Views: ${views}\n  URL: https://www.youtube.com/watch?v=${vid}`
          })

          return ok(lines.join('\n\n'))
        },
      },

      // ── youtube_upload ─────────────────────────────────────────────────────
      {
        name: 'youtube_upload',
        label: 'YouTube: Upload Video',
        description:
          'Upload a video file to YouTube. ' +
          'Requires YOUTUBE_OAUTH_TOKEN (OAuth2 access token with youtube.upload scope). ' +
          `Video path is relative to workspace: ${ctx.workspaceDir}`,
        parameters: Type.Object({
          video_path: Type.String({
            description: 'Path to the video file relative to workspace (e.g. "output/final.mp4")',
          }),
          title: Type.String({ description: 'Video title' }),
          description: Type.Optional(Type.String({ description: 'Video description' })),
          tags: Type.Optional(
            Type.Array(Type.String(), { description: 'List of tags/keywords' }),
          ),
          privacy: Type.Optional(
            Type.Union(
              [Type.Literal('public'), Type.Literal('unlisted'), Type.Literal('private')],
              { description: 'Privacy status (default: private)' },
            ),
          ),
          category_id: Type.Optional(
            Type.String({ description: 'YouTube category ID (default: "22" = People & Blogs)' }),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const oauthToken = process.env.YOUTUBE_OAUTH_TOKEN
          if (!oauthToken) {
            throw new Error(
              'YOUTUBE_OAUTH_TOKEN is not configured. ' +
              'YouTube upload requires an OAuth2 access token with the youtube.upload scope. ' +
              'Configure it via the Plugin Manager.',
            )
          }

          const videoPath = path.resolve(ctx.workspaceDir, params.video_path)
          if (!videoPath.startsWith(ctx.workspaceDir)) throw new Error('Path traversal not allowed')
          if (!fs.existsSync(videoPath)) throw new Error(`Video file not found: ${params.video_path}`)

          const metadata = {
            snippet: {
              title: params.title,
              description: params.description ?? '',
              tags: params.tags ?? [],
              categoryId: params.category_id ?? '22',
            },
            status: { privacyStatus: params.privacy ?? 'private' },
          }

          // Step 1: Initiate resumable upload session
          const initRes = await fetch(
            'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${oauthToken}`,
                'Content-Type': 'application/json',
                'X-Upload-Content-Type': 'video/*',
              },
              body: JSON.stringify(metadata),
            },
          )

          if (!initRes.ok) {
            const msg = await initRes.text()
            throw new Error(`YouTube upload init error ${initRes.status}: ${msg}`)
          }

          const uploadUrl = initRes.headers.get('location')
          if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL')

          // Step 2: Upload video bytes
          const videoBuffer = fs.readFileSync(videoPath)
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'video/*',
              'Content-Length': String(videoBuffer.length),
            },
            body: videoBuffer,
          })

          if (!uploadRes.ok) {
            const msg = await uploadRes.text()
            throw new Error(`YouTube upload error ${uploadRes.status}: ${msg}`)
          }

          const result = await uploadRes.json() as { id?: string }
          const videoId = result.id ?? 'unknown'
          return ok(
            `Video uploaded!\nVideo ID: ${videoId}\nURL: https://www.youtube.com/watch?v=${videoId}`,
          )
        },
      },
    ]
  },

  async healthCheck() {
    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) return { ok: false, message: 'YOUTUBE_API_KEY not set' }
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=US&key=${apiKey}`,
      )
      return res.ok
        ? { ok: true }
        : { ok: false, message: `API returned ${res.status}` }
    } catch (e) {
      return { ok: false, message: String(e) }
    }
  },
}

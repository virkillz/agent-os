import fs from 'fs'
import path from 'path'
import { Type } from '@sinclair/typebox'
import type { AgentOSPlugin, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const stableDiffusionPlugin: AgentOSPlugin = {
  config: {
    id: 'stable-diffusion',
    displayName: 'Stable Diffusion',
    description: 'Image generation via any SDAPI-compatible backend such as Automatic1111, Draw Things, etc.',
    env: [
      {
        key: 'STABLE_DIFFUSION_API_URL',
        required: true,
        description: 'Base URL of the SDAPI-compatible backend (e.g. https://virkill-image.ngrok.dev)',
      },
    ],
    toolIds: ['generate_image'],
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'generate_image',
        label: 'Stable Diffusion: Generate Image',
        description:
          'Generate an image from a text prompt using a Stable Diffusion API (SDAPI) compatible backend. ' +
          'Saves the image to a path relative to your workspace. ' +
          'Default params: width=578, height=768, CFG=1.0, steps=8.',
        parameters: Type.Object({
          prompt: Type.String({ description: 'Detailed description of the image to generate' }),
          output_path: Type.String({
            description: 'Output file path relative to workspace (e.g. "images/scene-01.png")',
          }),
          width: Type.Optional(
            Type.Number({ description: 'Image width in pixels (default: 578)' }),
          ),
          height: Type.Optional(
            Type.Number({ description: 'Image height in pixels (default: 768)' }),
          ),
          cfg_scale: Type.Optional(
            Type.Number({ description: 'CFG scale / guidance scale (default: 1.0)' }),
          ),
          steps: Type.Optional(
            Type.Number({ description: 'Number of inference steps (default: 8)' }),
          ),
          negative_prompt: Type.Optional(
            Type.String({ description: 'Things to avoid in the generated image' }),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const baseUrl = process.env.STABLE_DIFFUSION_API_URL
          if (!baseUrl) throw new Error('STABLE_DIFFUSION_API_URL is not configured')

          const width = params.width ?? 578
          const height = params.height ?? 768
          const cfgScale = params.cfg_scale ?? 1.0
          const steps = params.steps ?? 8
          const negativePrompt = params.negative_prompt ?? ''

          const apiUrl = `${baseUrl.replace(/\/$/, '')}/sdapi/v1/txt2img`

          // 3-minute timeout for image generation (can take 1-2 min)
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 180_000)

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              prompt: params.prompt,
              negative_prompt: negativePrompt,
              width,
              height,
              cfg_scale: cfgScale,
              steps
            }),
          }).finally(() => clearTimeout(timeoutId))

          if (!response.ok) {
            const msg = await response.text()
            throw new Error(`Stable Diffusion API error ${response.status}: ${msg}`)
          }

          const json = await response.json() as {
            images?: string[]
          }
          const images = json.images ?? []
          if (!images.length) throw new Error('Stable Diffusion returned no images')

          const outPath = path.resolve(ctx.workspaceDir, params.output_path)
          if (!outPath.startsWith(ctx.workspaceDir)) throw new Error('Path traversal not allowed')
          fs.mkdirSync(path.dirname(outPath), { recursive: true })
          const imageBuffer = Buffer.from(images[0], 'base64')
          fs.writeFileSync(outPath, imageBuffer)

          return {
            content: [
              { type: 'text' as const, text: `Image saved to: ${params.output_path}` },
              { type: 'image' as const, data: images[0], mimeType: 'image/png' },
            ],
            details: {},
          }
        },
      },
    ]
  },

  async healthCheck() {
    const baseUrl = process.env.STABLE_DIFFUSION_API_URL
    if (!baseUrl) return { ok: false, message: 'STABLE_DIFFUSION_API_URL not set' }
    try {
      const res = await fetch(baseUrl.replace(/\/$/, ''))
      return res.ok
        ? { ok: true }
        : { ok: false, message: `API returned ${res.status}` }
    } catch (e) {
      return { ok: false, message: String(e) }
    }
  },
}

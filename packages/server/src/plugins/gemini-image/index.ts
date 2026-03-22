import fs from 'fs'
import path from 'path'
import { Type } from '@sinclair/typebox'
import type { RascalPlugin, ToolContext } from '../types.js'

const IMAGEN_MODEL = 'imagen-3.0-generate-001'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const geminiImagePlugin: RascalPlugin = {
  config: {
    id: 'gemini-image',
    displayName: 'Gemini Image',
    description: 'Image generation via Google Gemini Imagen API',
    env: [
      {
        key: 'GEMINI_API_KEY',
        required: true,
        description: 'API key from Google AI Studio (aistudio.google.com)',
      },
    ],
    toolIds: ['gemini_generate_image'],
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'gemini_generate_image',
        label: 'Gemini: Generate Image',
        description:
          'Generate an image from a text prompt using Google Gemini Imagen. ' +
          'Saves the PNG to a path relative to your workspace. ' +
          'Returns the absolute path of the saved file.',
        parameters: Type.Object({
          prompt: Type.String({ description: 'Detailed description of the image to generate' }),
          output_path: Type.String({
            description: 'Output file path relative to workspace (e.g. "images/scene-01.png")',
          }),
          aspect_ratio: Type.Optional(
            Type.Union(
              [
                Type.Literal('1:1'),
                Type.Literal('16:9'),
                Type.Literal('9:16'),
                Type.Literal('4:3'),
                Type.Literal('3:4'),
              ],
              { description: 'Image aspect ratio (default: 16:9)' },
            ),
          ),
          sample_count: Type.Optional(
            Type.Number({ description: 'Number of images to generate (1–4, default: 1)' }),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const apiKey = process.env.GEMINI_API_KEY
          if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')

          const aspectRatio = params.aspect_ratio ?? '16:9'
          const sampleCount = Math.min(Math.max(params.sample_count ?? 1, 1), 4)

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instances: [{ prompt: params.prompt }],
                parameters: {
                  sampleCount,
                  aspectRatio,
                  safetySetting: 'block_only_high',
                  personGeneration: 'allow_adult',
                },
              }),
            },
          )

          if (!response.ok) {
            const msg = await response.text()
            throw new Error(`Gemini Imagen API error ${response.status}: ${msg}`)
          }

          const json = await response.json() as {
            predictions?: Array<{ bytesBase64Encoded?: string }>
          }
          const predictions = json.predictions ?? []
          if (!predictions.length) throw new Error('Gemini returned no images')

          const savedPaths: string[] = []
          for (let i = 0; i < predictions.length; i++) {
            const b64 = predictions[i].bytesBase64Encoded
            if (!b64) continue

            // For multiple images, suffix the filename
            const outRelPath = sampleCount > 1
              ? params.output_path.replace(/(\.\w+)$/, `-${i + 1}$1`)
              : params.output_path

            const outPath = path.resolve(ctx.workspaceDir, outRelPath)
            if (!outPath.startsWith(ctx.workspaceDir)) throw new Error('Path traversal not allowed')
            fs.mkdirSync(path.dirname(outPath), { recursive: true })
            fs.writeFileSync(outPath, Buffer.from(b64, 'base64'))
            savedPaths.push(outPath)
          }

          return ok(`Image(s) saved:\n${savedPaths.join('\n')}`)
        },
      },
    ]
  },

  async healthCheck() {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return { ok: false, message: 'GEMINI_API_KEY not set' }
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      )
      return res.ok
        ? { ok: true }
        : { ok: false, message: `API returned ${res.status}` }
    } catch (e) {
      return { ok: false, message: String(e) }
    }
  },
}

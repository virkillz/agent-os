import fs from 'fs'
import path from 'path'
import { Type } from '@sinclair/typebox'
import type { RascalPlugin, ToolContext } from '../types.js'

// Default voice: "Rachel" — warm, natural narration voice
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
const DEFAULT_MODEL = 'eleven_multilingual_v2'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

export const elevenlabsPlugin: RascalPlugin = {
  config: {
    id: 'elevenlabs',
    displayName: 'ElevenLabs',
    description: 'Text-to-speech audio generation via ElevenLabs API',
    env: [
      {
        key: 'ELEVENLABS_API_KEY',
        required: true,
        description: 'API key from elevenlabs.io → Profile → API Keys',
      },
    ],
    toolIds: ['elevenlabs_tts'],
  },

  getTools(ctx: ToolContext) {
    return [
      {
        name: 'elevenlabs_tts',
        label: 'ElevenLabs TTS',
        description:
          'Convert text to speech using ElevenLabs. ' +
          'Saves the audio file to a path relative to your workspace. ' +
          'Returns the absolute path of the saved file.',
        parameters: Type.Object({
          text: Type.String({ description: 'Text to convert to speech' }),
          output_path: Type.String({
            description: 'Output file path relative to workspace (e.g. "audio/narration.mp3")',
          }),
          voice_id: Type.Optional(
            Type.String({
              description: `ElevenLabs voice ID (default: Rachel — ${DEFAULT_VOICE_ID})`,
            }),
          ),
          model: Type.Optional(
            Type.String({
              description: `Model ID (default: ${DEFAULT_MODEL})`,
            }),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          const apiKey = process.env.ELEVENLABS_API_KEY
          if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured')

          const voiceId = params.voice_id ?? DEFAULT_VOICE_ID
          const model = params.model ?? DEFAULT_MODEL

          const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
                Accept: 'audio/mpeg',
              },
              body: JSON.stringify({
                text: params.text,
                model_id: model,
                voice_settings: { stability: 0.5, similarity_boost: 0.75 },
              }),
            },
          )

          if (!response.ok) {
            const msg = await response.text()
            throw new Error(`ElevenLabs API error ${response.status}: ${msg}`)
          }

          const outPath = path.resolve(ctx.workspaceDir, params.output_path)
          if (!outPath.startsWith(ctx.workspaceDir)) throw new Error('Path traversal not allowed')
          fs.mkdirSync(path.dirname(outPath), { recursive: true })

          const buffer = await response.arrayBuffer()
          fs.writeFileSync(outPath, Buffer.from(buffer))

          return ok(`Audio saved to ${outPath}`)
        },
      },
    ]
  },

  async healthCheck() {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) return { ok: false, message: 'ELEVENLABS_API_KEY not set' }
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': apiKey },
      })
      return res.ok
        ? { ok: true }
        : { ok: false, message: `API returned ${res.status}` }
    } catch (e) {
      return { ok: false, message: String(e) }
    }
  },
}

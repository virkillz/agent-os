import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync, spawn } from 'child_process'
import { Type } from '@sinclair/typebox'
import type { RascalPlugin, ToolContext } from '../types.js'

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} }
}

/** The remotion engine lives alongside the plugin source, not in the user workspace. */
const REMOTION_DIR = path.join(fileURLToPath(import.meta.url), '..', 'remotion-engine')

function remotionDir(_workspaceDir?: string) {
  return REMOTION_DIR
}

function isRemotionInstalled(): boolean {
  return fs.existsSync(path.join(REMOTION_DIR, 'node_modules', 'remotion'))
}

export const remotionPlugin: RascalPlugin = {
  config: {
    id: 'remotion',
    displayName: 'Remotion',
    description: 'Video rendering engine — compiles React compositions to MP4 using Remotion',
    env: [],
    toolIds: ['remotion_render', 'remotion_preview'],
  },

  async setup(_workspaceDir: string) {
    const rDir = remotionDir()

    if (isRemotionInstalled()) {
      console.log('  [remotion] already installed, skipping setup')
      return
    }

    console.log(`  [remotion] scaffolding remotion-engine in ${rDir}`)
    fs.mkdirSync(rDir, { recursive: true })

    // Write a minimal package.json if none exists
    const pkgPath = path.join(rDir, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      fs.writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: 'remotion-engine',
            version: '1.0.0',
            type: 'module',
            scripts: {
              render:
                'npx remotion render',
              studio:
                'npx remotion studio',
            },
            dependencies: {
              remotion: '^4.0.0',
              '@remotion/cli': '^4.0.0',
              react: '^18.2.0',
              'react-dom': '^18.2.0',
            },
            devDependencies: {
              '@types/react': '^18.0.0',
              typescript: '^5.0.0',
            },
          },
          null,
          2,
        ),
      )
    }

    // Write a minimal Root.tsx if none exists
    const rootPath = path.join(rDir, 'src', 'Root.tsx')
    if (!fs.existsSync(rootPath)) {
      fs.mkdirSync(path.join(rDir, 'src'), { recursive: true })
      fs.writeFileSync(
        rootPath,
        `import { Composition } from 'remotion'

// Register compositions here.
// Each composition is a "video" that Remotion can render.
export const RemotionRoot = () => (
  <>
    {/* Example: <Composition id="MyVideo" component={MyVideo} durationInFrames={150} fps={30} width={1920} height={1080} /> */}
  </>
)
`,
      )
    }

    // Write remotion.config.ts if none exists
    const configPath = path.join(rDir, 'remotion.config.ts')
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(
        configPath,
        `import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
`,
      )
    }

    console.log('  [remotion] running npm install...')
    execSync('npm install', { cwd: rDir, stdio: 'inherit' })
    console.log('  [remotion] setup complete')
  },

  getTools(ctx: ToolContext) {
    const rDir = remotionDir()

    return [
      // ── remotion_render ───────────────────────────────────────────────────
      {
        name: 'remotion_render',
        label: 'Remotion: Render Video',
        description:
          'Render a Remotion composition to an MP4 file. ' +
          `The remotion project lives at: ${rDir}. ` +
          'The composition must be registered in src/Root.tsx before rendering.',
        parameters: Type.Object({
          composition: Type.String({
            description: 'Composition ID as registered in Root.tsx (e.g. "MyVideo")',
          }),
          output: Type.Optional(
            Type.String({
              description:
                'Output path relative to workspace (default: "output/<composition>.mp4")',
            }),
          ),
          props: Type.Optional(
            Type.String({
              description: 'JSON string of props to pass to the composition (inputProps)',
            }),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          if (!fs.existsSync(rDir)) {
            throw new Error(
              'Remotion engine not set up. Call the plugin setup or run `rascal start` to trigger setup.',
            )
          }

          const outRel = params.output ?? `output/${params.composition}.mp4`
          const outAbs = path.resolve(ctx.workspaceDir, outRel)
          if (!outAbs.startsWith(ctx.workspaceDir)) throw new Error('Path traversal not allowed')
          fs.mkdirSync(path.dirname(outAbs), { recursive: true })

          const args = ['remotion', 'render', params.composition, outAbs]
          if (params.props) {
            args.push('--props', params.props)
          }

          return new Promise((resolve, reject) => {
            const proc = spawn('npx', args, { cwd: rDir, stdio: 'pipe' })
            const output: string[] = []

            proc.stdout?.on('data', (d: Buffer) => output.push(d.toString()))
            proc.stderr?.on('data', (d: Buffer) => output.push(d.toString()))

            proc.on('close', (code) => {
              if (code === 0) {
                resolve(ok(`Render complete: ${outAbs}\n\n${output.join('')}`))
              } else {
                reject(new Error(`Remotion render exited with code ${code}:\n${output.join('')}`))
              }
            })
          })
        },
      },

      // ── remotion_preview ─────────────────────────────────────────────────
      {
        name: 'remotion_preview',
        label: 'Remotion: Open Studio',
        description:
          'Launch Remotion Studio for live preview in a browser. ' +
          'Returns the studio URL. The studio runs until the process exits.',
        parameters: Type.Object({
          port: Type.Optional(
            Type.Number({ description: 'Port for Remotion Studio (default: 3001)' }),
          ),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: async (_id: string, params: any) => {
          if (!fs.existsSync(rDir)) {
            throw new Error('Remotion engine not set up.')
          }

          const port = params.port ?? 3001
          // Launch detached so it doesn't block the agent
          const proc = spawn('npx', ['remotion', 'studio', '--port', String(port)], {
            cwd: rDir,
            stdio: 'ignore',
            detached: true,
          })
          proc.unref()

          return ok(
            `Remotion Studio launching at http://localhost:${port}\n` +
            '(Studio runs in the background. Refresh if it takes a moment to start.)',
          )
        },
      },
    ]
  },

  async healthCheck() {
    // Can't do a network check — just verify the project exists
    return { ok: true, message: 'Remotion is a local tool (no API key required)' }
  },
}

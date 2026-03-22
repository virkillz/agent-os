#!/usr/bin/env node
// Wrapper that runs the server via tsx when available (dev), otherwise via the built dist.
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Try tsx first (dev/linked install)
const require = createRequire(import.meta.url)
let tsxBin
try {
  tsxBin = require.resolve('tsx/dist/cli.mjs', { paths: [root] })
} catch {
  tsxBin = null
}

const srcEntry = path.join(root, 'src/index.ts')
const distEntry = path.join(root, 'dist/index.js')

import { existsSync } from 'fs'

if (tsxBin && existsSync(srcEntry)) {
  // Dev mode: run TypeScript directly via tsx
  const result = spawnSync(process.execPath, [tsxBin, srcEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  })
  process.exit(result.status ?? 1)
} else if (existsSync(distEntry)) {
  // Production mode: run built JS
  const result = spawnSync(process.execPath, [distEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  })
  process.exit(result.status ?? 1)
} else {
  console.error('rascal: no built dist found. Run `npm run build` first.')
  process.exit(1)
}

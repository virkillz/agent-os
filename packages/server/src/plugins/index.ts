/**
 * Plugin registry — all built-in plugins are imported statically here.
 *
 * To add a new plugin:
 * 1. Create plugins/<name>/index.ts implementing AgentOSPlugin
 * 2. Create plugins/<name>/plugin.json with metadata
 * 3. Import and add it to builtInPlugins below
 */

import { braveSearchPlugin } from './brave-search/index.js'
import { elevenlabsPlugin } from './elevenlabs/index.js'
import { geminiImagePlugin } from './gemini-image/index.js'
import { hackernewsPlugin } from './hackernews/index.js'
import { fetchContentPlugin } from './fetch-content/index.js'

export { braveSearchPlugin, elevenlabsPlugin, geminiImagePlugin, hackernewsPlugin, fetchContentPlugin }

export const builtInPlugins = [
  braveSearchPlugin,
  elevenlabsPlugin,
  geminiImagePlugin,
  hackernewsPlugin,
  fetchContentPlugin,
]

import 'dotenv/config'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import { initDb } from './db.js'
import { setDataDir, setDebugMode } from './agent-runner.js'
import { setUserAvatarsDir } from './api/users.js'
import { setEnvFilePath } from './api/settings.js'
import { setPluginsEnvFilePath, seedBuiltInPlugins } from './api/plugins.js'
import { pluginLoader } from './plugin-loader.js'
import { platformToolLoader } from './platform-tools/loader.js'
import { startServer } from './server.js'
import { startScheduler } from './scheduler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const command = process.argv[2]
const PORT = parseInt(process.env.PORT ?? '3000', 10)

// Company directory: where rascal was started from (or explicit --dir flag)
const dirFlag = process.argv.indexOf('--dir')
const companyDir = dirFlag !== -1 ? path.resolve(process.argv[dirFlag + 1]) : process.cwd()

const debugFlag = process.argv.includes('--debug')
if (debugFlag) setDebugMode(true)

const DATA_DIR = path.join(companyDir, 'data')
const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace')
const ENV_FILE = path.join(companyDir, '.env')
const CONFIG_FILE = path.join(companyDir, 'rascal.json')

function printBanner() {
  console.log('')
  console.log(chalk.bold.white('  rascal-inc'))
  console.log(chalk.dim('  virtual company platform'))
  console.log('')
}

async function cmdInit() {
  printBanner()

  if (fs.existsSync(CONFIG_FILE)) {
    console.log(chalk.yellow('  Already initialized in this directory.'))
    console.log(chalk.dim(`  Run ${chalk.white('rascal start')} to launch.\n`))
    return
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true })

  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ version: '0.1.0' }, null, 2))
  fs.writeFileSync(ENV_FILE, '# API keys\n# OPENROUTER_API_KEY=sk-or-...\n')

  const gitignore = path.join(companyDir, '.gitignore')
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, '.env\ndata/\n')
  }

  console.log(chalk.green('  Initialized!'))
  console.log('')
  console.log(`  ${chalk.dim('config')}    ${CONFIG_FILE}`)
  console.log(`  ${chalk.dim('env')}       ${ENV_FILE}`)
  console.log(`  ${chalk.dim('data')}      ${DATA_DIR}`)
  console.log(`  ${chalk.dim('workspace')} ${WORKSPACE_DIR}`)
  console.log('')
  console.log(`  Run ${chalk.white('rascal start')} to launch.\n`)
}

async function cmdStart() {
  printBanner()

  // Load .env from company dir
  if (fs.existsSync(ENV_FILE)) {
    const { parse } = await import('dotenv')
    const envVars = parse(fs.readFileSync(ENV_FILE, 'utf-8'))
    for (const [k, v] of Object.entries(envVars)) {
      process.env[k] = v
    }
  }

  // Initialize services
  initDb(DATA_DIR)
  setDataDir(DATA_DIR)
  setUserAvatarsDir(path.join(DATA_DIR, 'user_avatars'))
  setEnvFilePath(ENV_FILE)
  setPluginsEnvFilePath(ENV_FILE)
  // Initialize platform tool loader
  platformToolLoader.init()
  // Initialize plugin loader — must run after env vars are loaded and DB is ready
  pluginLoader.setWorkspaceDir(WORKSPACE_DIR)
  pluginLoader.init()
  seedBuiltInPlugins()

  // Run setup for plugins that are already configured (e.g. on restart)
  await pluginLoader.runSetupForConfigured()

  startScheduler()

  // Resolve web dist — look relative to this file in production
  const webDist = path.join(__dirname, '../../web/dist')
  const webDistDir = fs.existsSync(webDist) ? webDist : undefined

  startServer(PORT, webDistDir, WORKSPACE_DIR, DATA_DIR)

  console.log(chalk.dim(`  company dir  ${companyDir}`))
  console.log(chalk.dim(`  data         ${DATA_DIR}`))
  if (!webDistDir) {
    console.log(chalk.dim(`  web          http://localhost:5173 ${chalk.yellow('(run web dev server separately)')}`))
  }
  if (debugFlag) {
    console.log(chalk.cyan(`  debug        ON — agent events, tool calls, and scheduler fires will be logged`))
  }
  console.log('')
  console.log(chalk.bold.green(`  Open http://localhost:${PORT} in your browser\n`))
}

switch (command) {
  case 'init':
    cmdInit().catch(console.error)
    break
  case 'start':
    cmdStart().catch(console.error)
    break
  default:
    printBanner()
    console.log('  Usage:')
    console.log('    rascal init    Initialize a new company directory')
    console.log('    rascal start   Start the server\n')
}

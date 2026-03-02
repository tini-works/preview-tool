import { Command } from 'commander'
import chalk from 'chalk'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { readConfig } from '../lib/config.js'
import { createViteConfig } from '../server/create-vite-config.js'
import { generateEntryFiles } from '../server/generate-entry.js'
import { generateAll } from '../generator/index.js'
import { createWatcher } from '../server/watcher.js'

export const devCommand = new Command('dev')
  .description('Start preview dev server')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .option('-p, --port <port>', 'Dev server port')
  .action(async (options: { cwd: string; port?: string }) => {
    const cwd = resolve(options.cwd)

    console.log(chalk.bold('\nPreview Tool — Dev Server\n'))

    const baseConfig = await readConfig(cwd)

    // Override port from CLI flag if provided (immutable)
    let config = baseConfig
    if (options.port) {
      const port = parseInt(options.port, 10)
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(chalk.red(`Invalid port: ${options.port}`))
        process.exit(1)
      }
      config = { ...baseConfig, port }
    }

    // Run v2 generation pipeline
    console.log(chalk.dim('Analyzing screens and generating mocks...'))
    try {
      const result = await generateAll(cwd, config)
      console.log(chalk.green(`  Screens found:    ${result.screensFound}`))
      console.log(chalk.green(`  Regions inferred: ${result.regionsInferred}`))
      console.log(chalk.green(`  Mocks generated:  ${result.mocksGenerated}`))
      console.log('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Generation failed: ${message}`))
      process.exit(1)
    }

    // Generate entry files (index.html + main.tsx)
    console.log(chalk.dim('Generating entry files...'))
    await generateEntryFiles(cwd, config)

    // Create Vite config
    console.log(chalk.dim('Starting Vite dev server...'))
    const viteConfig = await createViteConfig(cwd, config)

    try {
      // Dynamically require Vite from the host project
      const require = createRequire(join(cwd, 'package.json'))
      const vite = require('vite') as {
        createServer: (config: Record<string, unknown>) => Promise<{
          listen: () => Promise<void>
          config: { server: { port?: number } }
        }>
      }

      const server = await vite.createServer(viteConfig)
      await server.listen()

      const actualPort = server.config.server.port ?? config.port
      console.log('')
      console.log(chalk.green('  Preview server running at:'))
      console.log(chalk.cyan(`  http://localhost:${actualPort}`))
      console.log('')
      console.log(chalk.dim('  Press Ctrl+C to stop'))
      console.log('')

      // Start file watcher for incremental re-analysis
      const watcher = createWatcher(cwd, config, () => {
        console.log(chalk.dim('  Files changed — re-analyzed'))
      })

      const cleanupWatcher = () => {
        watcher.close()
      }
      process.on('SIGINT', () => { cleanupWatcher(); process.exit(0) })
      process.on('SIGTERM', () => { cleanupWatcher(); process.exit(0) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Failed to start dev server: ${message}`))
      console.error(chalk.dim('\nMake sure Vite is installed in your project:'))
      console.error(chalk.dim('  pnpm add -D vite @vitejs/plugin-react'))
      process.exit(1)
    }
  })

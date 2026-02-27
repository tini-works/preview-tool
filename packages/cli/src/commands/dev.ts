import { Command } from 'commander'
import chalk from 'chalk'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readConfig } from '../lib/config.js'
import { createViteConfig } from '../server/create-vite-config.js'
import { generateEntryFiles } from '../server/generate-entry.js'

export const devCommand = new Command('dev')
  .description('Start preview dev server')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .option('-p, --port <port>', 'Dev server port')
  .action(async (options: { cwd: string; port?: string }) => {
    const cwd = options.cwd

    console.log(chalk.bold('\nPreview Tool — Dev Server\n'))

    const config = await readConfig(cwd)

    // Override port from CLI flag if provided
    if (options.port) {
      config.port = parseInt(options.port, 10)
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Failed to start dev server: ${message}`))
      console.error(chalk.dim('\nMake sure Vite is installed in your project:'))
      console.error(chalk.dim('  pnpm add -D vite @vitejs/plugin-react'))
      process.exit(1)
    }
  })

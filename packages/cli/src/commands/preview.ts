import { Command } from 'commander'
import chalk from 'chalk'
import { existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { resolveSource } from '../resolver/resolve-source.js'
import { detectFramework } from '../resolver/detect-framework.js'
import { generateWrapperCode } from '../resolver/generate-wrapper.js'
import { installDependencies, ensureNodeModules } from '../resolver/install-deps.js'
import { initPreview } from './init.js'
import { readConfig, DEFAULT_CONFIG, PREVIEW_DIR } from '../lib/config.js'
import { generateEntryFiles } from '../server/generate-entry.js'
import { createViteConfig } from '../server/create-vite-config.js'
import { generateAll } from '../generator/index.js'
import { createWatcher } from '../server/watcher.js'

export const previewCommand = new Command('preview')
  .description('Preview an external app (init + generate + dev in one command)')
  .argument('<source>', 'Local path or GitHub URL to the frontend project')
  .option('--path <subdir>', 'Subdirectory within the repo (for monorepos)')
  .option('--keep', 'Keep cloned temp directory on exit')
  .option('-p, --port <port>', 'Dev server port')
  .action(async (source: string, options: {
    path?: string
    keep?: boolean
    port?: string
  }) => {
    console.log(chalk.bold('\nPreview Tool\n'))

    // Step 1: Resolve source
    console.log(chalk.dim(`Resolving source: ${source}`))
    const resolved = await resolveSource(source, {
      path: options.path,
      keep: options.keep,
    })
    console.log(chalk.dim(`  Working directory: ${resolved.cwd}`))

    // Register cleanup immediately for remote sources
    if (resolved.tempDir) {
      const cleanup = () => {
        try {
          rmSync(resolved.tempDir!, { recursive: true, force: true })
        } catch { /* best-effort */ }
      }
      process.on('SIGINT', () => { cleanup(); process.exit(0) })
      process.on('SIGTERM', () => { cleanup(); process.exit(0) })
      process.on('exit', cleanup)
    }

    // Step 2: Detect framework
    console.log(chalk.dim('\nDetecting framework...'))
    const framework = await detectFramework(resolved.cwd)
    console.log(`  Framework:  ${chalk.cyan(framework.name)}`)
    console.log(`  Bundler:    ${chalk.cyan(framework.bundler)}`)
    console.log(`  Pages:      ${chalk.cyan(framework.pagePattern)}`)
    if (framework.providers.length > 0) {
      console.log(`  Providers:  ${chalk.cyan(framework.providers.join(', '))}`)
    }
    if (framework.devToolStorePath) {
      console.log(`  DevTools:   ${chalk.cyan(framework.devToolStorePath)}`)
    }

    // Step 3: Install dependencies if needed
    if (resolved.isRemote || !ensureNodeModules(resolved.cwd)) {
      console.log(chalk.dim('\nInstalling dependencies...'))
      installDependencies(resolved.cwd)
    }

    // Step 4: Init .preview/ directory
    const previewDir = join(resolved.cwd, PREVIEW_DIR)
    if (!existsSync(previewDir)) {
      console.log(chalk.dim('\nInitializing .preview/ directory...'))
      const config = {
        ...DEFAULT_CONFIG,
        screenGlob: framework.pagePattern,
      }
      const wrapperCode = generateWrapperCode(framework.providers)
      await initPreview(resolved.cwd, config, wrapperCode)
    }

    // Step 5: Generate preview artifacts
    console.log(chalk.dim('\nGenerating preview artifacts...'))
    const config = await readConfig(resolved.cwd)

    try {
      const result = await generateAll(resolved.cwd, config)
      console.log(chalk.green(`  Screens found:    ${result.screensFound}`))
      console.log(chalk.green(`  Regions inferred: ${result.regionsInferred}`))
      console.log(chalk.green(`  Mocks generated:  ${result.mocksGenerated}`))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Generation failed: ${message}`))
      process.exit(1)
    }

    // Step 6: Start dev server (immutable config override)
    const effectiveConfig = options.port
      ? (() => {
          const port = parseInt(options.port!, 10)
          if (isNaN(port) || port < 1 || port > 65535) {
            console.error(chalk.red(`Invalid port: ${options.port}`))
            process.exit(1)
          }
          return { ...config, port }
        })()
      : config

    await generateEntryFiles(resolved.cwd, effectiveConfig)
    const viteConfig = await createViteConfig(resolved.cwd, effectiveConfig)

    try {
      const require = createRequire(join(resolved.cwd, 'package.json'))
      const vite = require('vite') as {
        createServer: (config: Record<string, unknown>) => Promise<{
          listen: () => Promise<void>
          config: { server: { port?: number } }
        }>
      }

      const server = await vite.createServer(viteConfig)
      await server.listen()

      const actualPort = server.config.server.port ?? effectiveConfig.port
      console.log('')
      console.log(chalk.green('  Preview ready at:'))
      console.log(chalk.cyan(`  http://localhost:${actualPort}`))
      console.log('')
      console.log(chalk.dim('  Press Ctrl+C to stop'))

      // Step 7: Start file watcher for incremental re-analysis
      const watcher = createWatcher(resolved.cwd, effectiveConfig, () => {
        console.log(chalk.dim('  Files changed — re-analyzed'))
      })

      // Consolidate all cleanup handlers
      const cleanupAll = () => {
        watcher.close()
        if (resolved.tempDir) {
          try { rmSync(resolved.tempDir, { recursive: true, force: true }) } catch { /* best-effort */ }
        }
        process.exit(0)
      }
      process.removeAllListeners('SIGINT')
      process.removeAllListeners('SIGTERM')
      process.on('SIGINT', cleanupAll)
      process.on('SIGTERM', cleanupAll)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Failed to start dev server: ${message}`))
      console.error(chalk.dim('\nMake sure Vite is installed in the target project:'))
      console.error(chalk.dim('  npm install -D vite @vitejs/plugin-react'))
      process.exit(1)
    }
  })

import { Command } from 'commander'
import chalk from 'chalk'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { readConfig, PREVIEW_DIR } from '../lib/config.js'
import { createViteConfig } from '../server/create-vite-config.js'
import { generateEntryFiles } from '../server/generate-entry.js'
import { detectFramework } from '../resolver/detect-framework.js'
import { syncWrapperProviders, generateWrapperCode } from '../resolver/generate-wrapper.js'
import { loadSpecs } from '../spec/spec-loader.js'
import { runSpecPipeline, toSafeFileName } from '../spec/spec-pipeline-orchestrator.js'

export const devCommand = new Command('dev')
  .description('Start preview dev server')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .option('-p, --port <port>', 'Dev server port')
  .option('--specs <dir>', 'Path to .specs/ directory for spec-driven preview')
  .action(async (options: { cwd: string; port?: string; specs?: string }) => {
    const cwd = resolve(options.cwd)

    console.log(chalk.bold('\nPreview Tool — Dev Server\n'))

    const config = await readConfig(cwd)

    // Override port from CLI flag if provided
    if (options.port) {
      config.port = parseInt(options.port, 10)
    }

    // Override specsDir from CLI flag if provided
    if (options.specs) {
      config.specsDir = resolve(options.specs)
    }

    // Validate specs directory exists
    if (config.specsDir && !existsSync(config.specsDir)) {
      console.error(chalk.red(`Specs directory not found: ${config.specsDir}`))
      console.error(chalk.dim('Create the directory or check the --specs path.'))
      process.exit(1)
    }

    // Auto-detect providers and generate wrapper in spec mode
    if (config.specsDir) {
      const framework = await detectFramework(cwd)
      const previewDir = join(cwd, PREVIEW_DIR)
      await mkdir(previewDir, { recursive: true })
      const wrapperPath = join(previewDir, 'wrapper.tsx')
      if (!existsSync(wrapperPath)) {
        await writeFile(wrapperPath, generateWrapperCode(framework.providers, { i18nPath: framework.i18nPath }), 'utf-8')
        console.log(chalk.dim(`Generated wrapper with providers: ${framework.providers.join(', ') || 'none'}`))
      } else {
        const result = syncWrapperProviders(wrapperPath, framework.providers)
        if (result.missingProviders.length > 0) {
          console.log(chalk.yellow(`  Missing providers in wrapper.tsx: ${result.missingProviders.join(', ')}`))
          console.log(chalk.yellow(`  Add them manually: ${wrapperPath}`))
        }
      }
    }

    // Run spec pipeline: AST analysis + mock generation
    let pipelineResult: Awaited<ReturnType<typeof runSpecPipeline>> | null = null
    if (config.specsDir) {
      const manifest = await loadSpecs(config.specsDir)
      const previewDir = join(cwd, PREVIEW_DIR)
      pipelineResult = await runSpecPipeline(manifest.screens, cwd, config.specsDir)

      // Write physical mock files
      const mocksDir = join(previewDir, 'mocks')
      await mkdir(mocksDir, { recursive: true })
      for (const [importPath, code] of pipelineResult.mockFiles) {
        const safeName = toSafeFileName(importPath)
        await writeFile(join(mocksDir, `${safeName}.ts`), code, 'utf-8')
      }

      // Write alias manifest
      await writeFile(
        join(previewDir, 'alias-manifest.json'),
        JSON.stringify(pipelineResult.aliasManifest, null, 2),
        'utf-8'
      )

      // Write screen source paths (used by React shim plugin to target screen files)
      if (pipelineResult.screenSourcePaths.length > 0) {
        await writeFile(
          join(previewDir, 'screen-source-paths.json'),
          JSON.stringify(pipelineResult.screenSourcePaths, null, 2),
          'utf-8'
        )
      }

      // Write screen state variable map for preview override
      if (Object.keys(pipelineResult.screenStateVars).length > 0) {
        await writeFile(
          join(previewDir, 'screen-state-vars.json'),
          JSON.stringify(pipelineResult.screenStateVars, null, 2),
          'utf-8'
        )
      }

      const hookCount = pipelineResult.mockFiles.size
      const regionCount = pipelineResult.enrichedScreens.reduce(
        (sum, s) => sum + Object.keys(s.enrichedRegions).length, 0
      )
      console.log(chalk.dim(`  Generated ${hookCount} mock modules, ${regionCount} regions`))

      // Validate screens — catch missing fields, identical states, translation mismatches
      const { validateScreens, printValidationResults } = await import('../spec/validate-screens.js')
      const validationResults = validateScreens(pipelineResult.enrichedScreens, cwd)
      const hasIssues = validationResults.some((r) => r.issues.length > 0)
      if (hasIssues) {
        console.log(chalk.dim('  Validating screens...'))
        printValidationResults(validationResults)
      }
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

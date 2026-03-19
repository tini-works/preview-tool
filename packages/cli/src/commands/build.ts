import { Command } from 'commander'
import chalk from 'chalk'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { resolveSource } from '../resolver/resolve-source.js'
import { detectFramework } from '../resolver/detect-framework.js'
import { generateWrapperCode, syncWrapperProviders } from '../resolver/generate-wrapper.js'
import { installDependencies, ensureNodeModules } from '../resolver/install-deps.js'
import { initPreview } from './init.js'
import { generateAllV2 } from '../generator/generate-all-v2.js'
import { DEFAULT_CONFIG, PREVIEW_DIR } from '../lib/config.js'
export const buildCommand = new Command('build')
  .description('Analyze screens and build static preview site')
  .argument('[source]', 'Path to React app (or GitHub URL)', '.')
  .option('--path <subdir>', 'Subdirectory within the repo (for monorepos)')
  .option('--keep', 'Keep cloned temp directory on exit')
  .option('--out <dir>', 'Output directory', 'dist-preview')
  .action(async (source: string, options: {
    path?: string
    keep?: boolean
    out: string
  }) => {
    console.log(chalk.bold('\nPreview Build\n'))

    // Step 1: Resolve source
    console.log(chalk.dim(`Resolving source: ${source}`))
    const resolved = await resolveSource(source, {
      path: options.path,
      keep: options.keep,
    })
    console.log(chalk.dim(`  Working directory: ${resolved.cwd}`))

    // Register cleanup for remote sources
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

    // Step 3: Install dependencies if needed
    if (resolved.isRemote || !ensureNodeModules(resolved.cwd)) {
      console.log(chalk.dim('\nInstalling dependencies...'))
      installDependencies(resolved.cwd)
    }

    // Step 4: Init .preview/ directory if missing
    const previewDir = join(resolved.cwd, PREVIEW_DIR)
    if (!existsSync(previewDir)) {
      console.log(chalk.dim('\nInitializing .preview/ directory...'))
      const initConfig = {
        ...DEFAULT_CONFIG,
        screenGlob: framework.pagePattern,
      }
      const wrapperCode = generateWrapperCode(framework.providers, { i18nPath: framework.i18nPath })
      await initPreview(resolved.cwd, initConfig, wrapperCode)
    }

    // Step 4b: Sync wrapper providers
    const wrapperPath = join(previewDir, 'wrapper.tsx')
    const syncResult = syncWrapperProviders(wrapperPath, framework.providers)
    if (syncResult.missingProviders.length > 0) {
      console.log(chalk.yellow(`  Missing providers in wrapper.tsx: ${syncResult.missingProviders.join(', ')}`))
      console.log(chalk.yellow(`  Add them manually: ${wrapperPath}`))
    }

    // Step 5: Run V2 analysis + generation pipeline
    console.log(chalk.dim('\nRunning V2 analysis pipeline...'))
    const result = await generateAllV2(resolved.cwd)

    const screenCount = result.screens.length
    const mockCount = result.analyses.reduce(
      (sum, a) => sum + a.mockModules.length,
      0,
    )

    console.log(chalk.green(`\n  Generated ${screenCount} screens, ${mockCount} mock modules`))
    console.log(chalk.dim(`\n  Static build coming soon. Generated artifacts in ${PREVIEW_DIR}/`))
  })

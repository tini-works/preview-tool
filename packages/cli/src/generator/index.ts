import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { discoverScreens } from '../analyzer/discover.js'
import { analyzeScreen } from '../analyzer/analyze-component.js'
import { generateMockFileContent } from './generate-mock.js'
import { generateAdapterFileContent } from './generate-adapter.js'
import type { PreviewConfig } from '../lib/config.js'
import { PREVIEW_DIR } from '../lib/config.js'
import type { ScreenAnalysis } from '../analyzer/types.js'

export interface GenerateResult {
  screensFound: number
  mocksGenerated: number
  adaptersGenerated: number
  overridesSkipped: number
  analyses: ScreenAnalysis[]
}

/**
 * Orchestrates the full generation pipeline:
 * discoverScreens → analyzeScreen → generateMock + generateAdapter → write files
 *
 * Files in `.preview/overrides/` are never overwritten — they are user-maintained.
 */
export async function generateAll(
  cwd: string,
  config: PreviewConfig
): Promise<GenerateResult> {
  const previewDir = join(cwd, PREVIEW_DIR)
  const mocksDir = join(previewDir, 'mocks')
  const adaptersDir = join(previewDir, 'adapters')
  const overridesDir = join(previewDir, 'overrides')

  // Ensure output directories
  await mkdir(mocksDir, { recursive: true })
  await mkdir(adaptersDir, { recursive: true })
  await mkdir(overridesDir, { recursive: true })

  // Step 1: Discover screens
  console.log(chalk.dim('Discovering screens...'))
  const screens = await discoverScreens(cwd, config.screenGlob)
  console.log(chalk.dim(`  Found ${screens.length} screen(s)`))

  if (screens.length === 0) {
    return {
      screensFound: 0,
      mocksGenerated: 0,
      adaptersGenerated: 0,
      overridesSkipped: 0,
      analyses: [],
    }
  }

  const analyses: ScreenAnalysis[] = []
  let mocksGenerated = 0
  let adaptersGenerated = 0
  let overridesSkipped = 0

  for (const screen of screens) {
    const safeName = routeToFileName(screen.route)
    console.log(chalk.dim(`  Analyzing: ${screen.route} (${screen.pattern})`))

    // Step 2: Analyze screen
    let analysis: ScreenAnalysis
    try {
      analysis = analyzeScreen(screen)
      analyses.push(analysis)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(chalk.yellow(`  Warning: Could not analyze ${screen.route}: ${message}`))
      continue
    }

    // Step 3: Generate mock file
    const mockFileName = `${safeName}.mock.ts`
    const mockPath = join(mocksDir, mockFileName)
    const mockContent = generateMockFileContent(analysis, cwd)
    await writeFile(mockPath, mockContent, 'utf-8')
    mocksGenerated++

    // Step 4: Generate adapter file
    const adapterFileName = `${safeName}.adapter.ts`
    const adapterPath = join(adaptersDir, adapterFileName)
    const adapterContent = generateAdapterFileContent(
      screen,
      adapterPath,
      mockPath,
      cwd
    )
    await writeFile(adapterPath, adapterContent, 'utf-8')
    adaptersGenerated++

    // Step 5: Skip override files that already exist (user-maintained)
    const overridePath = join(overridesDir, `${safeName}.ts`)
    if (existsSync(overridePath)) {
      overridesSkipped++
      console.log(chalk.dim(`    Override exists, skipping: overrides/${safeName}.ts`))
    }
  }

  return {
    screensFound: screens.length,
    mocksGenerated,
    adaptersGenerated,
    overridesSkipped,
    analyses,
  }
}

/**
 * Converts a route like "/booking/time-slots" to a safe file name "booking--time-slots"
 */
function routeToFileName(route: string): string {
  return route
    .replace(/^\//, '')
    .replace(/\//g, '--')
    .replace(/[^a-zA-Z0-9\-_]/g, '_') || 'root'
}

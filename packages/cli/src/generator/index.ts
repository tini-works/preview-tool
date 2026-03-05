import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import chalk from 'chalk'
import { discoverScreens } from '../analyzer/discover.js'
import { analyzeViewTree } from '../analyzer/analyze-view.js'
import { generateViewFileContent } from './generate-view.js'
import { generateModelFileContent } from './generate-model.js'
import { generateControllerFileContent } from './generate-controller.js'
import { collectAllFacts } from '../analyzer/collect-facts.js'
import { understandScreens } from '../analyzer/understand-screens.js'
import { analysisToModel, analysisToController } from './generate-from-analysis.js'
import { generateMockModules } from './generate-mock-from-analysis.js'
import type { PreviewConfig } from '../lib/config.js'
import { PREVIEW_DIR } from '../lib/config.js'
import type { DevToolConfig } from '../resolver/detect-framework.js'
import type {
  DiscoveredScreen,
  ViewTree,
} from '../analyzer/types.js'

export interface GenerateResult {
  screensFound: number
  viewsGenerated: number
  modelsGenerated: number
  controllersGenerated: number
  adaptersGenerated: number
  overridesSkipped: number
  mocksGenerated: number
}

/**
 * Orchestrates the full 4-stage generation pipeline:
 *
 * Stage 1: Discover screens via glob
 * Stage 2: Collect facts (parallel, shared ts-morph Project)
 * Stage 3: LLM understanding (one batch call + template fallback)
 * Stage 4: Generate files (view, model, controller, adapter, mocks)
 *
 * Override directory: .preview/overrides/{safeName}/ — if model.ts or controller.ts
 * exists there, generation is skipped for that file.
 */
export async function generateAll(
  cwd: string,
  config: PreviewConfig,
  devToolConfig?: DevToolConfig | null,
): Promise<GenerateResult> {
  const previewDir = join(cwd, PREVIEW_DIR)
  const screensDir = join(previewDir, 'screens')
  const mocksDir = join(previewDir, 'mocks')
  const overridesDir = join(previewDir, 'overrides')

  await mkdir(screensDir, { recursive: true })
  await mkdir(mocksDir, { recursive: true })
  await mkdir(overridesDir, { recursive: true })

  // Stage 1: Discover screens
  console.log(chalk.dim('Stage 1: Discovering screens...'))
  const screens = await discoverScreens(cwd, config.screenGlob)
  console.log(chalk.dim(`  Found ${screens.length} screen(s)`))

  if (screens.length === 0) {
    return { screensFound: 0, viewsGenerated: 0, modelsGenerated: 0, controllersGenerated: 0, adaptersGenerated: 0, overridesSkipped: 0, mocksGenerated: 0 }
  }

  // Stage 2: Collect facts (parallel, shared ts-morph Project)
  console.log(chalk.dim('Stage 2: Collecting screen facts...'))
  const screenInputs = screens.map((s) => ({
    filePath: s.filePath,
    route: s.route,
    exportName: s.exportName,
  }))
  const allFacts = await collectAllFacts(screenInputs)
  console.log(chalk.dim(`  Collected facts for ${allFacts.length} screen(s)`))

  // Stage 3: LLM understanding (one batch call + template fallback)
  console.log(chalk.dim('Stage 3: Analyzing screens...'))
  const allAnalyses = await understandScreens(allFacts, config.llm)
  console.log(chalk.dim(`  Analyzed ${allAnalyses.length} screen(s)`))

  // Stage 4: Generate files
  console.log(chalk.dim('Stage 4: Generating files...'))
  let viewsGenerated = 0
  let modelsGenerated = 0
  let controllersGenerated = 0
  let adaptersGenerated = 0
  let overridesSkipped = 0

  const analysisMap = new Map(allAnalyses.map((a) => [a.route, a]))

  for (const screen of screens) {
    const safeName = routeToFolderName(screen.route)
    const screenOutDir = join(screensDir, safeName)
    const overrideScreenDir = join(overridesDir, safeName)
    await mkdir(screenOutDir, { recursive: true })

    console.log(chalk.dim(`  Processing: ${screen.route} (${screen.pattern})`))

    const analysis = analysisMap.get(screen.route)

    // View (keep existing ViewTree approach)
    let viewTree: ViewTree | null = null
    try {
      viewTree = analyzeViewTree(screen)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(chalk.yellow(`    View analysis failed: ${message}`))
    }

    if (viewTree) {
      await writeFile(join(screenOutDir, 'view.ts'), generateViewFileContent(viewTree), 'utf-8')
    } else {
      await writeFile(join(screenOutDir, 'view.ts'), buildPlaceholderView(screen), 'utf-8')
    }
    viewsGenerated++

    // Model (from LLM analysis or template fallback)
    const hasModelOverride = existsSync(join(overrideScreenDir, 'model.ts'))
    if (!hasModelOverride && analysis) {
      const model = analysisToModel(analysis)
      const modelMeta = {
        route: screen.route,
        pattern: screen.pattern,
        filePath: relative(cwd, screen.filePath).split('\\').join('/'),
      }
      await writeFile(join(screenOutDir, 'model.ts'), generateModelFileContent(model, modelMeta), 'utf-8')
      modelsGenerated++
    } else if (hasModelOverride) {
      console.log(chalk.dim(`    Override exists: overrides/${safeName}/model.ts`))
      overridesSkipped++
    }

    // Controller (from LLM analysis or template fallback)
    const hasControllerOverride = existsSync(join(overrideScreenDir, 'controller.ts'))
    if (!hasControllerOverride && analysis) {
      const controller = analysisToController(analysis)
      await writeFile(join(screenOutDir, 'controller.ts'), generateControllerFileContent(controller), 'utf-8')
      controllersGenerated++
    } else if (hasControllerOverride) {
      console.log(chalk.dim(`    Override exists: overrides/${safeName}/controller.ts`))
      overridesSkipped++
    }

    // Adapter (always regenerated)
    await writeFile(join(screenOutDir, 'adapter.tsx'), buildAdapterContent(screen, screenOutDir), 'utf-8')
    adaptersGenerated++
  }

  // Mock modules (simplified, direct region keys)
  console.log(chalk.dim('\nGenerating mock modules...'))
  const { mockFiles, aliasManifest } = generateMockModules(allFacts, allAnalyses)

  for (const [importPath, code] of mockFiles) {
    // Use the alias manifest path (which generateMockModules built) for consistency
    const mockRelPath = aliasManifest[importPath]
    const mockFileName = mockRelPath?.replace(/^\.\/mocks\//, '').replace(/\.ts$/, '') ?? importPath
    await writeFile(join(mocksDir, `${mockFileName}.ts`), code, 'utf-8')
    console.log(chalk.dim(`  Mock: ${importPath} → mocks/${mockFileName}.ts`))
  }

  await writeFile(join(previewDir, 'alias-manifest.json'), JSON.stringify(aliasManifest, null, 2), 'utf-8')
  console.log(chalk.dim(`  ${mockFiles.size} mock module(s) generated`))

  return {
    screensFound: screens.length,
    viewsGenerated,
    modelsGenerated,
    controllersGenerated,
    adaptersGenerated,
    overridesSkipped,
    mocksGenerated: mockFiles.size,
  }
}

// ---------------------------------------------------------------------------
// Adapter generation
// ---------------------------------------------------------------------------

function buildAdapterContent(
  screen: DiscoveredScreen,
  screenOutDir: string,
): string {
  const relativeToScreen = toRelativeImport(screenOutDir, screen.filePath)
  const screenImport = screen.exportName
    ? `import { ${screen.exportName} as Screen } from '${relativeToScreen}'`
    : `import Screen from '${relativeToScreen}'`

  return `// Auto-generated by @preview-tool/cli — do not edit manually
import React from 'react'
${screenImport}
import { meta, regions } from './model'
import { flows, componentStates, journeys } from './controller'
import { view } from './view'
import { RegionDataProvider } from '@preview-tool/runtime'
import type { RegionDataMap } from '@preview-tool/runtime'

function Adapter({
  regionData,
  flags,
}: {
  regionData?: RegionDataMap
  flags?: Record<string, boolean>
}) {
  return (
    <RegionDataProvider regions={regions} regionData={regionData ?? {}}>
      <Screen />
    </RegionDataProvider>
  )
}

export default Adapter
export { meta, regions, flows, componentStates, journeys, view }
`
}

function toRelativeImport(fromDir: string, toFile: string): string {
  let rel = relative(fromDir, toFile).split('\\').join('/')
  rel = rel.replace(/\.(tsx?)$/, '')
  if (!rel.startsWith('.')) {
    rel = './' + rel
  }
  return rel
}

// ---------------------------------------------------------------------------
// Placeholder view for when ViewTree analysis fails
// ---------------------------------------------------------------------------

function buildPlaceholderView(screen: DiscoveredScreen): string {
  const screenName = screen.exportName ?? deriveScreenName(screen.route)

  const viewTree = {
    screenName,
    filePath: screen.filePath,
    exportType: screen.exportName ? 'named' : 'default',
    ...(screen.exportName ? { exportName: screen.exportName } : {}),
    dataProps: [],
    tree: [],
  }

  return generateViewFileContent(viewTree as ViewTree)
}

function deriveScreenName(route: string): string {
  return route
    .replace(/^\//, '')
    .split('/')
    .map((s) =>
      s
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('')
    )
    .join('')
    || 'Screen'
}

// ---------------------------------------------------------------------------
// Route → folder name
// ---------------------------------------------------------------------------

/**
 * Converts a route like "/booking/time-slots" to a safe folder name "booking--time-slots"
 */
function routeToFolderName(route: string): string {
  return route
    .replace(/^\//, '')
    .replace(/\//g, '--')
    .replace(/[^a-zA-Z0-9\-_]/g, '_') || 'root'
}

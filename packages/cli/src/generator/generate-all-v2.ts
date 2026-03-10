import { join, relative } from 'node:path'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { ModelOutput, ComponentRegion, DiscoveredScreen } from '../analyzer/types.js'
import type { MockModuleV2, RegionV2, ScreenAnalysisV2 } from '../llm/schemas/screen-analysis-v2.js'
import { PREVIEW_DIR } from '../lib/config.js'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Recursively replaces `'__fn__'` string placeholders with `'() => {}'`.
 * Returns a new object — never mutates the input.
 */
export function replaceFnPlaceholders(obj: unknown): unknown {
  if (obj === '__fn__') return '() => {}'
  if (Array.isArray(obj)) return obj.map(replaceFnPlaceholders)
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = replaceFnPlaceholders(value)
    }
    return result
  }
  return obj
}

/**
 * Serializes a JavaScript value to a TypeScript code string.
 * The key challenge: `() => {}` values must be emitted as raw code (unquoted),
 * while everything else uses JSON-style quoting.
 */
function serializeValue(value: unknown, indent: number = 0): string {
  const pad = '  '.repeat(indent)
  const innerPad = '  '.repeat(indent + 1)

  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (value === '() => {}') return '() => {}'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((item) => `${innerPad}${serializeValue(item, indent + 1)}`)
    return `[\n${items.join(',\n')}\n${pad}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const lines = entries.map(
      ([key, val]) => `${innerPad}${safeKey(key)}: ${serializeValue(val, indent + 1)}`
    )
    return `{\n${lines.join(',\n')}\n${pad}}`
  }

  return String(value)
}

/** Wraps a key in quotes only if it is not a valid JS identifier. */
function safeKey(key: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
}

// ---------------------------------------------------------------------------
// buildMockModuleCode
// ---------------------------------------------------------------------------

/**
 * Generates a TypeScript mock module for a single V2 MockModule.
 *
 * The generated file:
 * - Imports `useRegionDataForHook` from `@preview-tool/runtime`
 * - Exports a named function matching the hook name
 * - Contains a `states` object with each state's mock data (`__fn__` replaced)
 * - Returns the active state from region data
 */
export function buildMockModuleCode(mock: MockModuleV2): string {
  if (!VALID_IDENTIFIER.test(mock.hookName)) {
    throw new Error(`Invalid hookName from LLM: "${mock.hookName}" — must be a valid JS identifier`)
  }

  const replaced = replaceFnPlaceholders(mock.stateMap) as Record<string, Record<string, unknown>>

  const lines: string[] = [
    `// Auto-generated mock by @preview-tool/cli (V2) — role: ${mock.role}`,
    "import { useRegionDataForHook } from '@preview-tool/runtime'",
    '',
    `const states = ${serializeValue(replaced, 0)}`,
    '',
    `export function ${mock.hookName}(..._args: any[]) {`,
    `  const regionData = useRegionDataForHook('${mock.hookName}')`,
    '  if (regionData) return regionData',
    `  return states[${JSON.stringify(mock.defaultState)}]`,
    '}',
    '',
  ]

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// buildModelFromV2
// ---------------------------------------------------------------------------

/**
 * Converts V2 regions (from LLM analysis) into the `ModelOutput` format
 * expected by the existing model file generator.
 *
 * Each V2 region becomes a `ComponentRegion` with:
 * - `label` from the region
 * - `component` / `componentPath` from the source
 * - flattened `states` (just mockData per state key)
 * - `defaultState` set to the first state key
 */
export function buildModelFromV2(regions: ReadonlyArray<RegionV2>): ModelOutput {
  const output: Record<string, ComponentRegion> = {}

  for (const region of regions) {
    const stateKeys = Object.keys(region.states)
    const defaultState = stateKeys[0] ?? 'default'

    const flatStates: Record<string, unknown> = {}
    for (const [stateKey, stateValue] of Object.entries(region.states)) {
      flatStates[stateKey] = stateValue.mockData
    }

    output[region.key] = {
      label: region.label,
      component: region.source.name,
      componentPath: region.source.importPath ?? '',
      states: flatStates,
      defaultState,
    }
  }

  return { regions: output }
}

// ---------------------------------------------------------------------------
// buildAdapterFromV2
// ---------------------------------------------------------------------------

/**
 * Generates a React adapter component that wraps the real screen component
 * with a `RegionDataProvider` from the runtime.
 *
 * The adapter is a thin wrapper:
 * ```tsx
 * import { RegionDataProvider } from '@preview-tool/runtime'
 * import { ComponentName } from 'importPath'
 * export default function ComponentNameAdapter() {
 *   return <RegionDataProvider><ComponentName /></RegionDataProvider>
 * }
 * ```
 */
export function buildAdapterFromV2(componentName: string, importPath: string): string {
  const lines: string[] = [
    '// Auto-generated adapter by @preview-tool/cli (V2) — do not edit manually',
    "import { RegionDataProvider } from '@preview-tool/runtime'",
    `import { ${componentName} } from '${importPath}'`,
    '',
    `export default function ${componentName}Adapter() {`,
    '  return (',
    '    <RegionDataProvider>',
    `      <${componentName} />`,
    '    </RegionDataProvider>',
    '  )',
    '}',
    '',
  ]

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Helpers for safe file names
// ---------------------------------------------------------------------------

function toSafeFileName(importPath: string): string {
  const safe = importPath
    .replace(/^@\//, '')
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/^-+/, '')
    .replace(/-+/g, '-')
  return safe || 'root'
}

const VALID_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/

// ---------------------------------------------------------------------------
// V1-compatible file generators
// ---------------------------------------------------------------------------

/**
 * Converts a route like "/booking/time-slots" to a safe folder name "booking--time-slots".
 * Matches the V1 convention used by main.tsx's import.meta.glob.
 */
function routeToFolderName(route: string): string {
  return route
    .replace(/^\//, '')
    .replace(/\//g, '--')
    .replace(/[^a-zA-Z0-9\-_]/g, '_') || 'root'
}

/** Generates a V1-compatible model.ts with meta + regions exports. */
function buildModelFile(
  screen: DiscoveredScreen,
  cwd: string,
  regions: Record<string, ComponentRegion>,
): string {
  const filePath = relative(cwd, join(cwd, screen.filePath)).split('\\').join('/')
  return `// Auto-generated by @preview-tool/cli (V2) — do not edit manually

export const meta = {
  route: ${JSON.stringify(screen.route)},
  pattern: ${JSON.stringify(screen.pattern)},
  filePath: ${JSON.stringify(filePath)},
} as const

export const regions = ${JSON.stringify(regions, null, 2)} as const
`
}

/** Generates a V1-compatible controller.ts with flows, componentStates, journeys. */
function buildControllerFile(flows: ScreenAnalysisV2['flows']): string {
  const flowActions = flows.map((f) => ({
    trigger: f.trigger,
    action: f.action,
    ...(f.from ? { from: f.from } : {}),
    to: f.to,
  }))

  return `// Auto-generated by @preview-tool/cli (V2) — do not edit manually

export const flows = ${JSON.stringify(flowActions, null, 2)} as const

export const componentStates = {} as const

export const journeys = [] as const
`
}

/** Generates a minimal V1-compatible view.ts stub. */
function buildViewFile(screen: DiscoveredScreen): string {
  const screenName = screen.exportName ?? deriveScreenName(screen.route)

  return `// Auto-generated by @preview-tool/cli (V2) — do not edit manually

export const view = {
  screenName: ${JSON.stringify(screenName)},
  filePath: ${JSON.stringify(screen.filePath)},
  exportType: ${JSON.stringify(screen.exportName ? 'named' : 'default')},
  dataProps: [],
  tree: [],
} as const
`
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

/** Generates a V1-compatible adapter.tsx that main.tsx can load. */
function buildV1Adapter(screen: DiscoveredScreen, screenOutDir: string): string {
  const relToScreen = toRelativeImport(screenOutDir, join('..', '..', screen.filePath))
  const screenImport = screen.exportName
    ? `import { ${screen.exportName} as Screen } from '${relToScreen}'`
    : `import Screen from '${relToScreen}'`

  return `// Auto-generated by @preview-tool/cli (V2) — do not edit manually
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
// generateAllV2 — full pipeline (side-effectful, not unit-tested)
// ---------------------------------------------------------------------------

/**
 * The V2 generation pipeline. Orchestrates:
 * 1. Clean stale screens directory
 * 2. LLM screen discovery
 * 3. LLM screen analysis (per screen)
 * 4. Mock module code generation
 * 5. Per-screen file generation (adapter, model, controller, view)
 *
 * Writes V1-compatible files into `<cwd>/.preview/screens/` so main.tsx can load them.
 * Writes mock modules into `<cwd>/.preview/mocks/`.
 */
export async function generateAllV2(
  cwd: string,
): Promise<{ screens: DiscoveredScreen[]; analyses: ScreenAnalysisV2[] }> {
  // Lazy imports to keep pure functions testable without these deps
  const { discoverScreensWithLLM } = await import('../analyzer/discover-llm.js')
  const { analyzeAllScreens } = await import('../analyzer/analyze-screen-llm.js')

  const previewDir = join(cwd, PREVIEW_DIR)
  const screensDir = join(previewDir, 'screens')
  const mocksDir = join(previewDir, 'mocks')

  // Step 0: Clean stale screens directory to prevent leftover V1 artifacts
  if (existsSync(screensDir)) {
    await rm(screensDir, { recursive: true })
  }
  await mkdir(screensDir, { recursive: true })
  await mkdir(mocksDir, { recursive: true })

  // Step 1: Discover screens via LLM
  const screens = await discoverScreensWithLLM(cwd)

  // Step 2: Analyze each screen via LLM
  const analysisMap = await analyzeAllScreens(cwd, screens)

  // Pair each screen with its analysis, skipping screens that failed analysis
  const analyzedScreens: DiscoveredScreen[] = []
  const analyses: ScreenAnalysisV2[] = []
  for (const s of screens) {
    const analysis = analysisMap.get(s.route)
    if (analysis) {
      analyzedScreens.push(s)
      analyses.push(analysis)
    }
  }

  // Step 3: Generate mock modules
  const aliasManifest: Record<string, string> = {}
  for (const analysis of analyses) {
    for (const mock of analysis.mockModules) {
      const code = buildMockModuleCode(mock)
      const safeName = toSafeFileName(mock.importPath)
      const mockPath = join(mocksDir, `${safeName}.ts`)
      await writeFile(mockPath, code, 'utf-8')
      aliasManifest[mock.importPath] = `./mocks/${safeName}.ts`
    }
  }

  // Write alias manifest
  await writeFile(
    join(previewDir, 'alias-manifest.json'),
    JSON.stringify(aliasManifest, null, 2) + '\n',
    'utf-8',
  )

  // Step 4: Generate V1-compatible files per screen
  for (let i = 0; i < analyzedScreens.length; i++) {
    const screen = analyzedScreens[i]
    const analysis = analyses[i]
    const safeName = routeToFolderName(screen.route)
    const screenOutDir = join(screensDir, safeName)
    await mkdir(screenOutDir, { recursive: true })

    const model = buildModelFromV2(analysis.regions)
    await writeFile(join(screenOutDir, 'model.ts'), buildModelFile(screen, cwd, model.regions), 'utf-8')
    await writeFile(join(screenOutDir, 'controller.ts'), buildControllerFile(analysis.flows), 'utf-8')
    await writeFile(join(screenOutDir, 'view.ts'), buildViewFile(screen), 'utf-8')
    await writeFile(join(screenOutDir, 'adapter.tsx'), buildV1Adapter(screen, screenOutDir), 'utf-8')
  }

  return { screens: analyzedScreens, analyses }
}

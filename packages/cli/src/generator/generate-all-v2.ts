import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
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
  return importPath
    .replace(/^@\//, '')
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/^-+/, '')
    .replace(/-+/g, '-')
}

// ---------------------------------------------------------------------------
// generateAllV2 — full pipeline (side-effectful, not unit-tested)
// ---------------------------------------------------------------------------

/**
 * The V2 generation pipeline. Orchestrates:
 * 1. LLM screen discovery
 * 2. LLM screen analysis (per screen)
 * 3. Mock module code generation
 * 4. Model file generation
 * 5. Adapter file generation
 *
 * Writes all generated files into `<cwd>/.preview/generated/`.
 */
export async function generateAllV2(
  cwd: string,
): Promise<{ screens: DiscoveredScreen[]; analyses: ScreenAnalysisV2[] }> {
  // Lazy imports to keep pure functions testable without these deps
  const { discoverScreensWithLLM } = await import('../analyzer/discover-llm.js')
  const { analyzeAllScreens } = await import('../analyzer/analyze-screen-llm.js')

  const outDir = join(cwd, PREVIEW_DIR, 'generated')
  await mkdir(outDir, { recursive: true })
  await mkdir(join(outDir, 'mocks'), { recursive: true })
  await mkdir(join(outDir, 'adapters'), { recursive: true })

  // Step 1: Discover screens via LLM
  const screens = await discoverScreensWithLLM(cwd)

  // Step 2: Analyze each screen via LLM
  const analysisMap = await analyzeAllScreens(cwd, screens)
  const analyses = screens.map((s) => analysisMap.get(s.route)!)

  // Step 3: Generate mock modules
  const aliasManifest: Record<string, string> = {}
  for (const analysis of analyses) {
    for (const mock of analysis.mockModules) {
      const code = buildMockModuleCode(mock)
      const safeName = toSafeFileName(mock.importPath)
      const mockPath = join(outDir, 'mocks', `${safeName}.ts`)
      await writeFile(mockPath, code, 'utf-8')
      aliasManifest[mock.importPath] = `./mocks/${safeName}.ts`
    }
  }

  // Write alias manifest
  const manifestCode = `// Auto-generated by @preview-tool/cli (V2)\nexport default ${JSON.stringify(aliasManifest, null, 2)} as const\n`
  await writeFile(join(outDir, 'alias-manifest.ts'), manifestCode, 'utf-8')

  // Step 4: Generate model files per screen
  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i]
    const analysis = analyses[i]
    if (!analysis) continue

    const model = buildModelFromV2(analysis.regions)
    const safeName = toSafeFileName(screen.route || screen.filePath)
    const modelCode = `// Auto-generated model by @preview-tool/cli (V2)\nexport default ${JSON.stringify(model, null, 2)} as const\n`
    await writeFile(join(outDir, `model-${safeName}.ts`), modelCode, 'utf-8')
  }

  // Step 5: Generate adapter files per screen
  for (const screen of screens) {
    const componentName = screen.exportName ?? 'DefaultExport'
    const adapterCode = buildAdapterFromV2(componentName, screen.filePath)
    const safeName = toSafeFileName(screen.route || screen.filePath)
    await writeFile(join(outDir, 'adapters', `${safeName}.tsx`), adapterCode, 'utf-8')
  }

  return { screens, analyses }
}

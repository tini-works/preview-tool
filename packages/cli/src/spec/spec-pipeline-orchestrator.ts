import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { Project, type SourceFile } from 'ts-morph'
import { extractHookFacts } from '../analyzer/collect-facts.js'
import { findTsConfig } from '../analyzer/collect-facts.js'
import { classifyHook } from '../lib/hook-classifier.js'
import { REACT_IMPORT_PATHS, REACT_BUILTIN_HOOKS } from '../lib/hook-binding.js'
import { PROVIDER_PACKAGES } from '../lib/hook-classifier.js'
import type { HookFact } from '../analyzer/types.js'
import type { SpecManifestScreen, SpecDataDep } from './types.js'
import type { RegionsMap, RegionDef } from './spec-to-model.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MergedHookDep {
  hook: string
  module: string
  provides: string[]
  /** Origin: 'spec' if from spec data_deps, 'ast' if discovered via AST */
  origin: 'spec' | 'ast'
  mappingType?: string
}

export interface SpecPipelineResult {
  enrichedScreens: EnrichedScreen[]
  mockFiles: Map<string, string>
  aliasManifest: Record<string, string>
}

export interface EnrichedScreen extends SpecManifestScreen {
  mergedDeps: MergedHookDep[]
  enrichedRegions: RegionsMap
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function camelToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

function hookToRegionKey(hookName: string): string {
  return camelToKebab(hookName.replace(/^use/, ''))
}

/**
 * Converts an import path to a safe filename for the mock module.
 * Reused from generate-mock-from-analysis.ts pattern.
 */
export function toSafeFileName(importPath: string): string {
  return importPath
    .replace(/^@\//, '')
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/^-+/, '')
    .replace(/-+/g, '-')
}

const NOOP = '(() => {}) as any'

function isLikelySetter(field: string): boolean {
  return /^(set|toggle|reset|clear|handle|on|open|close|dismiss|show|hide)[A-Z]/.test(field) ||
    /^(login|logout|register|submit|fetch|refresh|reload|retry|cancel|confirm|approve|reject|delete|remove|save|send|start|stop|pause|resume|init)$/.test(field)
}

// ---------------------------------------------------------------------------
// AST hook discovery
// ---------------------------------------------------------------------------

function resolveSourceFilePath(screen: SpecManifestScreen, cwd: string, specsDir?: string): string | null {
  if (!screen.sourceFile) return null

  const fromCwd = resolve(cwd, screen.sourceFile)
  if (existsSync(fromCwd)) return fromCwd

  if (specsDir) {
    const fromSpecsRoot = resolve(specsDir, '..', screen.sourceFile)
    if (existsSync(fromSpecsRoot)) return fromSpecsRoot
  }

  return null
}

function discoverHooksFromSource(sourceFile: SourceFile): HookFact[] {
  return extractHookFacts(sourceFile)
}

// ---------------------------------------------------------------------------
// Merge spec data_deps with AST-discovered hooks
// ---------------------------------------------------------------------------

function mergeHookDeps(
  specDeps: SpecDataDep[],
  astHooks: HookFact[],
): MergedHookDep[] {
  const result: MergedHookDep[] = []
  const seen = new Set<string>()

  // Spec deps take priority
  for (const dep of specDeps) {
    const key = `${dep.module}::${dep.hook}`
    seen.add(key)
    result.push({
      hook: dep.hook,
      module: dep.module,
      provides: dep.provides,
      origin: 'spec',
    })
  }

  // AST-discovered hooks fill in gaps
  for (const hook of astHooks) {
    if (REACT_IMPORT_PATHS.has(hook.importPath)) continue
    if (REACT_BUILTIN_HOOKS.has(hook.name)) continue
    if (classifyHook(hook.name, hook.importPath) !== 'data') continue

    const key = `${hook.importPath}::${hook.name}`
    if (seen.has(key)) continue
    seen.add(key)

    result.push({
      hook: hook.name,
      module: hook.importPath,
      provides: hook.destructuredFields ?? [],
      origin: 'ast',
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Region generation: one region per hook
// ---------------------------------------------------------------------------

/**
 * Distributes screen-level stateData across hook regions based on which
 * hook provides which fields. Fields not claimed by any hook go to the
 * first region.
 */
function distributeStateData(
  stateData: Record<string, Record<string, unknown>>,
  hookProvides: string[],
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {}

  for (const [stateName, data] of Object.entries(stateData)) {
    const filtered: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      if (hookProvides.length === 0 || hookProvides.includes(key)) {
        filtered[key] = value
      }
    }
    if (Object.keys(filtered).length > 0) {
      result[stateName] = filtered
    }
  }

  // If no state data matched, create at least empty entries for each state
  if (Object.keys(result).length === 0) {
    for (const stateName of Object.keys(stateData)) {
      result[stateName] = {}
    }
  }

  return result
}

export function specToPerHookRegions(
  screen: SpecManifestScreen,
  allHookDeps: MergedHookDep[],
): RegionsMap {
  const regions: RegionsMap = {}

  for (const dep of allHookDeps) {
    const regionKey = hookToRegionKey(dep.hook)
    const region: RegionDef = {
      label: dep.hook,
      defaultState: screen.defaultState ?? screen.states[0] ?? 'default',
      states: distributeStateData(screen.stateData, dep.provides),
      hookMapping: {
        type: dep.mappingType ?? 'custom-hook',
        hookName: dep.hook,
        identifier: dep.hook,
        importPath: dep.module,
      },
    }
    regions[regionKey] = region
  }

  return regions
}

// ---------------------------------------------------------------------------
// Mock file generation (physical .ts files)
// ---------------------------------------------------------------------------

/**
 * Detect if an import path is likely a barrel file (re-exports other modules).
 * Barrel files like `~/hooks/index.js` just re-export from individual files.
 * Using `export * from '__real:...'` on barrels pulls in the entire module tree
 * (including non-mocked hooks with dangerous transitive imports like WebSocket).
 * For barrels, we skip the `__real:` re-export since all useful exports are hooks
 * that we're mocking anyway.
 */
function isLikelyBarrel(importPath: string): boolean {
  return /\/index(?:\.[jt]sx?)?$/.test(importPath) || importPath.endsWith('/index')
}

function generateMockFileForImportPath(
  hooks: MergedHookDep[],
  importPath: string,
): string {
  const skipRealReexport = isLikelyBarrel(importPath)
  const lines: string[] = [
    `// Auto-generated spec-driven mock for ${importPath}`,
  ]

  if (!skipRealReexport) {
    lines.push(`export * from '__real:${importPath}'`)
  } else {
    lines.push(`// Barrel file — skipping __real: re-export to prevent transitive import crashes`)
  }

  lines.push(
    '',
    "import { useRegionDataForHook } from '@preview-tool/runtime'",
    '',
  )

  // NOOP stub for setter/action fields
  lines.push(
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    'const NOOP = (() => {}) as any',
    '',
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    'function resolveStoreState(stateData: Record<string, any>, fnFields?: string[], dataFields?: string[]) {',
    '  const result: Record<string, any> = { ...stateData }',
    '  if (fnFields) { for (const f of fnFields) { if (!(f in result)) result[f] = NOOP } }',
    '  if (dataFields) { for (const f of dataFields) { if (!(f in result)) result[f] = null } }',
    '  return result',
    '}',
    '',
  )

  for (const dep of hooks) {
    const regionKey = hookToRegionKey(dep.hook)
    const dataFields = dep.provides.filter((f) => !isLikelySetter(f))
    const fnFields = dep.provides.filter((f) => isLikelySetter(f))
    const fnList = fnFields.map((f) => `'${f}'`).join(', ')
    const dataList = dataFields.map((f) => `'${f}'`).join(', ')

    lines.push(
      `// eslint-disable-next-line @typescript-eslint/no-explicit-any`,
      `export function ${dep.hook}(..._args: any[]) {`,
      `  const data = useRegionDataForHook('${regionKey}')`,
      `  const state = data ? resolveStoreState(data as Record<string, any>, [${fnList}], [${dataList}]) : resolveStoreState({}, [${fnList}], [${dataList}])`,
      `  // Support Zustand selector pattern: useStore((s) => s.field)`,
      `  if (typeof _args[0] === 'function') { try { return _args[0](state) } catch { return state } }`,
      `  return state`,
      `}`,
      '',
    )
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Context hook detection and shim generation (Layer 3)
// ---------------------------------------------------------------------------

/**
 * Detects app-specific context hooks that need shims.
 * Excludes:
 * - React built-in hooks
 * - Provider hooks from known packages (react-router-dom, etc.)
 * - Hooks already mocked as data hooks
 */
export function detectContextHooks(
  allHooks: HookFact[],
  dataHookKeys: Set<string>,
): HookFact[] {
  return allHooks.filter((h) => {
    // Skip React built-ins
    if (REACT_IMPORT_PATHS.has(h.importPath)) return false
    if (REACT_BUILTIN_HOOKS.has(h.name)) return false
    // Skip hooks already mocked as data hooks
    const key = `${h.importPath}::${h.name}`
    if (dataHookKeys.has(key)) return false
    // Skip hooks from known provider packages (wrapper.tsx handles these)
    if (PROVIDER_PACKAGES.has(h.importPath)) return false
    // Only keep hooks classified as 'provider' from local/app-specific sources
    // These are the context hooks that need shims
    const category = classifyHook(h.name, h.importPath)
    return category === 'provider'
  })
}

export function generateContextShim(hook: HookFact, importPath: string): string {
  const fields = hook.destructuredFields ?? []
  const fieldEntries = fields.map((f) => {
    if (isLikelySetter(f)) {
      return `    ${f}: ${NOOP},`
    }
    return `    ${f}: null as any,`
  }).join('\n')

  const skipRealReexport = isLikelyBarrel(importPath)
  const lines = [
    `// Auto-generated context shim for ${importPath}`,
  ]
  if (!skipRealReexport) {
    lines.push(`export * from '__real:${importPath}'`)
  } else {
    lines.push(`// Barrel file — skipping __real: re-export to prevent transitive import crashes`)
  }
  lines.push(
    '',
    `export function ${hook.name}(..._args: any[]) {`,
    `  return {`,
  )
  if (fieldEntries) {
    lines.push(fieldEntries)
  }
  lines.push(
    `  }`,
    `}`,
  )

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runSpecPipeline(
  screens: SpecManifestScreen[],
  cwd: string,
  specsDir?: string,
): Promise<SpecPipelineResult> {
  const mockFiles = new Map<string, string>()
  const aliasManifest: Record<string, string> = {}
  const enrichedScreens: EnrichedScreen[] = []

  // Collect source file paths for screens that have them
  const screensWithSource: Array<{ screen: SpecManifestScreen; absPath: string }> = []
  for (const screen of screens) {
    const absPath = resolveSourceFilePath(screen, cwd, specsDir)
    if (absPath) {
      screensWithSource.push({ screen, absPath })
    }
  }

  // Create ts-morph project for AST analysis
  let project: Project | null = null
  const sourceFileMap = new Map<string, SourceFile>()

  if (screensWithSource.length > 0) {
    const tsConfigPath = findTsConfig(screensWithSource[0].absPath)
    project = new Project({
      useInMemoryFileSystem: false,
      tsConfigFilePath: tsConfigPath ?? undefined,
      skipAddingFilesFromTsConfig: true,
      ...(tsConfigPath ? {} : { compilerOptions: { strict: true, jsx: 4 } }),
    })

    for (const { absPath } of screensWithSource) {
      try {
        project.addSourceFileAtPath(absPath)
        const sf = project.getSourceFile(absPath)
        if (sf) sourceFileMap.set(absPath, sf)
      } catch {
        // Source file not parseable — skip AST analysis for this screen
      }
    }
  }

  // Track all data hook keys to exclude from context hook detection
  const allDataHookKeys = new Set<string>()
  // Track all AST hooks for context detection
  const allAstHooks: HookFact[] = []

  // Process each screen
  for (const screen of screens) {
    const absPath = resolveSourceFilePath(screen, cwd, specsDir)
    const sf = absPath ? sourceFileMap.get(absPath) : undefined

    // Discover hooks from AST
    const astHooks = sf ? discoverHooksFromSource(sf) : []
    allAstHooks.push(...astHooks)

    // Merge spec deps with AST hooks
    const mergedDeps = mergeHookDeps(screen.dataDeps, astHooks)

    // Track data hook keys
    for (const dep of mergedDeps) {
      allDataHookKeys.add(`${dep.module}::${dep.hook}`)
    }

    // Generate per-hook regions
    const enrichedRegions = specToPerHookRegions(screen, mergedDeps)

    enrichedScreens.push({
      ...screen,
      mergedDeps,
      enrichedRegions,
    })

    // Group hooks by import path for mock file generation
    const hooksByImport = new Map<string, MergedHookDep[]>()
    for (const dep of mergedDeps) {
      const existing = hooksByImport.get(dep.module) ?? []
      // Deduplicate by hook name
      if (!existing.some((h) => h.hook === dep.hook)) {
        existing.push(dep)
      }
      hooksByImport.set(dep.module, existing)
    }

    for (const [importPath, hooks] of hooksByImport) {
      if (!mockFiles.has(importPath)) {
        mockFiles.set(importPath, generateMockFileForImportPath(hooks, importPath))
      }
    }
  }

  // Detect and generate context hook shims
  const contextHooks = detectContextHooks(allAstHooks, allDataHookKeys)
  // Group context hooks by import path
  const contextByImport = new Map<string, HookFact[]>()
  for (const h of contextHooks) {
    const existing = contextByImport.get(h.importPath) ?? []
    if (!existing.some((e) => e.name === h.name)) {
      existing.push(h)
    }
    contextByImport.set(h.importPath, existing)
  }

  for (const [importPath, hooks] of contextByImport) {
    if (mockFiles.has(importPath)) continue
    // Generate combined shim for all hooks from this import path
    const parts = hooks.map((h) => generateContextShim(h, importPath))
    // Only keep one header (first shim has it)
    const combined = parts[0]
    if (parts.length > 1) {
      // Append additional hook functions (skip the header/re-export of subsequent shims)
      const additional = parts.slice(1).map((p) => {
        const hookFnStart = p.indexOf('\nexport function ')
        return hookFnStart >= 0 ? p.slice(hookFnStart) : ''
      })
      mockFiles.set(importPath, combined + additional.join(''))
    } else {
      mockFiles.set(importPath, combined)
    }
  }

  // Build alias manifest
  for (const importPath of mockFiles.keys()) {
    const safeName = toSafeFileName(importPath)
    aliasManifest[importPath] = `./mocks/${safeName}.ts`
  }

  return { enrichedScreens, mockFiles, aliasManifest }
}

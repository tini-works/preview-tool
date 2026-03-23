import { resolve, join, dirname, relative } from 'node:path'
import { existsSync } from 'node:fs'
import { Project, SyntaxKind, type SourceFile } from 'ts-morph'
import { extractHookFacts, extractLocalStateFacts } from '../analyzer/collect-facts.js'
import { findTsConfig } from '../analyzer/collect-facts.js'
import { extractHookReturnType } from '../analyzer/extract-types.js'
import { REACT_IMPORT_PATHS, REACT_BUILTIN_HOOKS } from '../lib/hook-binding.js'
import { generateUniversalMock } from '../generator/universal-mock.js'

// ---------------------------------------------------------------------------
// Passthrough packages: hooks from these packages are NOT mocked.
// They are provided by real library providers in wrapper.tsx.
// ---------------------------------------------------------------------------

const PASSTHROUGH_PACKAGES = new Set([
  'react-router-dom',
  'react-hook-form',
  'react-i18next',
  '@tanstack/react-router',
  'next/router',
  'next/navigation',
])
import { distributeByState } from './state-distributor.js'
import { TypeCache, hashContent } from './type-cache.js'
import type { HookFact, TypeShapeInfo, LocalStateFact } from '../analyzer/types.js'
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
  /** Resolved return type from TypeChecker (when available) */
  resolvedType?: TypeShapeInfo
}

export interface SpecPipelineResult {
  enrichedScreens: EnrichedScreen[]
  mockFiles: Map<string, string>
  aliasManifest: Record<string, string>
  screenSourcePaths: string[]
  /** Map of screen source path → ordered useState variable names (for preview override) */
  screenStateVars: Record<string, string[]>
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

/**
 * Normalize relative import paths (./foo, ../bar) to ~/... paths
 * so they work as Vite alias keys regardless of which file imports them.
 */
function normalizeHookImportPaths(hooks: HookFact[], sourceAbsPath: string, cwd: string): HookFact[] {
  const srcDir = join(cwd, 'src')
  const fileDir = dirname(sourceAbsPath)

  return hooks.map((h) => {
    if (!h.importPath.startsWith('./') && !h.importPath.startsWith('../')) return h
    // Resolve relative to the importing file's directory
    const abs = resolve(fileDir, h.importPath)
    // Convert to ~/ path relative to src/
    if (abs.startsWith(srcDir)) {
      const rel = relative(srcDir, abs)
      return { ...h, importPath: `~/${rel}` }
    }
    return h
  })
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
    if (PASSTHROUGH_PACKAGES.has(hook.importPath)) continue

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

  // Check if any state has non-empty mockData from the spec
  const hasSpecMockData = Object.values(screen.stateData).some(
    (data) => Object.keys(data).length > 0
  )

  for (const dep of allHookDeps) {
    const regionKey = hookToRegionKey(dep.hook)

    let states: Record<string, Record<string, unknown>>

    if (hasSpecMockData) {
      // Primary: use spec mockData directly
      states = distributeStateData(screen.stateData, dep.provides)
    } else if (dep.resolvedType && dep.resolvedType.confidence !== 'none') {
      // Fallback: use type-aware state distribution
      states = distributeByState(screen.states, dep.resolvedType)
    } else {
      // Last resort: distribute from stateData (may be empty)
      states = distributeStateData(screen.stateData, dep.provides)
    }

    // Auto-fill missing fields: if the hook provides fields that aren't in the
    // spec mockData, fill them from the resolved type shape or sensible defaults.
    // This prevents blank screens when flow state (doctor, timeSlot, etc.) is
    // set by a previous screen and not declared in this screen's spec.
    const providedFields = dep.provides
    const typeShape = dep.resolvedType?.shape ?? {}
    for (const [, stateData] of Object.entries(states)) {
      for (const field of providedFields) {
        if (!(field in stateData)) {
          // Fill from resolved type shape if available
          if (field in typeShape) {
            stateData[field] = typeShape[field]
          }
          // Otherwise: functions get NOOP marker, data stays absent (undefined from proxy)
        }
      }
    }

    const region: RegionDef = {
      label: dep.hook,
      defaultState: screen.defaultState ?? screen.states[0] ?? 'default',
      states,
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
// Screen-level region merge
// ---------------------------------------------------------------------------

/**
 * Merge multiple per-hook regions into a single screen-level region.
 *
 * Instead of showing separate "useBookingStore" and "local-state" regions
 * in the sidebar, the user sees ONE region with combined states. Each state
 * (loading, populated, error, etc.) merges data from ALL hooks + local state.
 *
 * The screen's spec title is used as the region label.
 */
function mergeIntoScreenRegion(
  screen: SpecManifestScreen,
  perHookRegions: RegionsMap,
): RegionsMap {
  const regionEntries = Object.entries(perHookRegions)
  if (regionEntries.length === 0) return {}
  if (regionEntries.length === 1) {
    // Only one region — use it directly but with a better label
    const [key, region] = regionEntries[0]
    return { [key]: { ...region, label: screen.title } }
  }

  // Collect all state names across all regions
  const allStateNames = new Set<string>()
  let defaultState = 'default'
  for (const [, region] of regionEntries) {
    for (const stateName of Object.keys(region.states)) {
      allStateNames.add(stateName)
    }
    if (region.defaultState) defaultState = region.defaultState
  }

  // For each state, merge data from all regions
  const mergedStates: Record<string, Record<string, unknown>> = {}
  for (const stateName of allStateNames) {
    let merged: Record<string, unknown> = {}
    for (const [, region] of regionEntries) {
      const stateData = region.states[stateName] ?? region.states[region.defaultState] ?? {}
      merged = { ...merged, ...stateData }
    }
    mergedStates[stateName] = merged
  }

  // Find list region properties (isList, mockItems, defaultCount)
  let isList: boolean | undefined
  let mockItems: unknown[] | undefined
  let defaultCount: number | undefined
  for (const [, region] of regionEntries) {
    if (region.isList) {
      isList = true
      mockItems = region.mockItems
      defaultCount = region.defaultCount
      break
    }
  }

  // Create ONE merged region for the sidebar display.
  // Use the first hook's region key as the primary key.
  // Additional hook keys are stored as aliases so mock hooks
  // can still look up data via useRegionDataForHook('auth-store').
  const primaryKey = regionEntries[0][0]
  const aliasKeys = regionEntries.slice(1).map(([key]) => key)

  const mergedRegion: RegionDef = {
    label: screen.title,
    defaultState,
    states: mergedStates,
    ...(isList ? { isList, mockItems, defaultCount } : {}),
    // Store alias keys so runtime can duplicate data for all hooks
    regionAliases: aliasKeys.length > 0 ? aliasKeys : undefined,
  }

  return { [primaryKey]: mergedRegion }
}

// ---------------------------------------------------------------------------
// Local-state region generation (heuristic)
// ---------------------------------------------------------------------------

const BOOLEAN_PREFIXES = /^(is|has|show|are|was|should|can|will|did)/

/** Strip common boolean prefixes to get the semantic stem. */
export function extractBooleanStem(varName: string): string | null {
  const match = varName.match(BOOLEAN_PREFIXES)
  if (!match) return null
  const rest = varName.slice(match[0].length)
  if (!rest) return null
  return rest[0].toLowerCase() + rest.slice(1)
}

/** Convert an AST initial-value string to a runtime JS value. */
export function parseInitialValue(raw: string): unknown {
  if (raw === 'false') return false
  if (raw === 'true') return true
  if (raw === 'null') return null
  if (raw === 'undefined') return undefined
  if (raw === "''") return ''
  if (raw === '""') return ''
  if (raw === '``') return ''
  const quotedMatch = raw.match(/^(['"`])(.*)\1$/)
  if (quotedMatch) return quotedMatch[2]
  if (raw === '[]') return []
  if (raw === '{}') return ({})
  if (raw === '0') return 0
  const num = Number(raw)
  if (!Number.isNaN(num)) return num
  return raw // keep as-is for complex expressions
}

/** Does `stateName` match a boolean variable stem? */
function stateMatchesBooleanVar(stateName: string, stem: string): boolean {
  const lower = stateName.toLowerCase()
  const stemLower = stem.toLowerCase()
  return lower === stemLower || lower.endsWith(stemLower) || lower.startsWith(stemLower)
}

/** Should a boolean variable inherit `true` in a given state? */
function shouldInheritBoolean(
  stateName: string,
  varStem: string,
  descriptions: Record<string, string>,
  stateNames: string[],
): boolean {
  // Check description text for references to the variable's stem
  const desc = descriptions[stateName]
  if (desc) {
    const descLower = desc.toLowerCase()
    if (descLower.includes(varStem.toLowerCase())) return true
  }
  // Ordering heuristic: if the stem's own state precedes this state, inherit
  const stemStateIdx = stateNames.findIndex((s) => stateMatchesBooleanVar(s, varStem))
  const currentIdx = stateNames.indexOf(stateName)
  if (stemStateIdx >= 0 && currentIdx > stemStateIdx) return true
  return false
}

/**
 * Generate a `local-state` region from discovered useState variables.
 * Merges explicit spec mockData with heuristic values (spec data wins).
 * Returns null if no useState variables are found.
 */
export function generateLocalStateRegion(
  stateNames: string[],
  descriptions: Record<string, string>,
  localStateFacts: LocalStateFact[],
  defaultState: string | null,
  stateData?: Record<string, Record<string, unknown>>,
): RegionDef | null {
  // useReducer facts excluded: reducer-body state extraction is handled by derive-state-machine.ts
  // Only process useState facts (skip useRef)
  const useStateFacts = localStateFacts.filter((f) => f.hook === 'useState')
  if (useStateFacts.length === 0) return null

  // Build base values from initial values
  const baseValues: Record<string, unknown> = {}
  for (const fact of useStateFacts) {
    baseValues[fact.name] = parseInitialValue(fact.initialValue)
  }

  const states: Record<string, Record<string, unknown>> = {}

  for (const stateName of stateNames) {
    const stateValues = { ...baseValues }
    const isDefault = stateName === defaultState

    if (!isDefault) {
      for (const fact of useStateFacts) {
        const stem = extractBooleanStem(fact.name)

        // Rule 1: Boolean match — state name matches variable stem
        if (stem && fact.valueType === 'boolean' && stateMatchesBooleanVar(stateName, stem)) {
          stateValues[fact.name] = true
        }

        // Rule 2: Error match — state is "error" and variable is "error"
        if (stateName.toLowerCase() === 'error' && fact.name === 'error') {
          const desc = descriptions[stateName]
          stateValues[fact.name] = desc || 'An error occurred. Please try again.'
        }

        // Rule 3: Inheritance — boolean inherits true from earlier state
        if (stem && fact.valueType === 'boolean' && !stateMatchesBooleanVar(stateName, stem)) {
          if (shouldInheritBoolean(stateName, stem, descriptions, stateNames)) {
            stateValues[fact.name] = true
          }
        }
      }
    }

    // Merge explicit spec mockData on top of heuristic values (spec wins)
    const specMock = stateData?.[stateName]
    if (specMock && typeof specMock === 'object') {
      for (const [key, value] of Object.entries(specMock)) {
        stateValues[key] = value
      }
    }

    states[stateName] = stateValues
  }

  return {
    label: 'Local State',
    defaultState: defaultState ?? stateNames[0] ?? 'default',
    states,
  }
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
  barrelReExports?: Array<{ names: string[]; fullModulePath: string }>,
  hooksWithGetState?: Set<string>,
): string {
  const isBarrel = isLikelyBarrel(importPath)
  const lines: string[] = [
    `// Auto-generated spec-driven mock for ${importPath}`,
  ]

  if (!isBarrel) {
    lines.push(`export * from '__real:${importPath}'`)
  } else {
    // For barrel files, re-export non-mocked names from their individual sub-modules.
    // Vite aliases resolve each sub-module to its own mock (or the real module).
    const mockedNames = new Set(hooks.map((h) => h.hook))
    if (barrelReExports && barrelReExports.length > 0) {
      for (const group of barrelReExports) {
        const unmocked = group.names.filter((n) => !mockedNames.has(n))
        if (unmocked.length > 0) {
          lines.push(`export { ${unmocked.join(', ')} } from '${group.fullModulePath}'`)
        }
      }
    }
  }

  lines.push(
    '',
    "import { useRegionDataForHook } from '@preview-tool/runtime'",
    '',
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    'const NOOP = (() => {}) as any',
    '',
  )

  for (const dep of hooks) {
    const regionKey = hookToRegionKey(dep.hook)

    // Use generateUniversalMock for the Proxy-based hook body
    const mockOutput = generateUniversalMock({
      hookName: dep.hook,
      regionKey,
      importPath,
      isBarrel,
      hasStaticGetState: hooksWithGetState?.has(dep.hook) ?? false,
      returnStyle: 'object',
    })

    // Extract only the hook function from the universal mock output
    // (skip the file-level header, re-export, imports, and NOOP — already emitted above)
    const fnStart = mockOutput.indexOf(`export function ${dep.hook}`)
    if (fnStart >= 0) {
      // Find the closing brace of the function
      const fnBody = mockOutput.slice(fnStart)
      lines.push(fnBody.trimEnd())
      lines.push('')
    }
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
    // Skip hooks from passthrough packages (wrapper.tsx handles these)
    if (PASSTHROUGH_PACKAGES.has(h.importPath)) return false
    // Remaining hooks from local/app-specific sources that aren't data hooks
    // are context hooks that need NOOP shims
    return true
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
// Module path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a module import path (~/foo, @/foo) to an absolute file path.
 * Tries common extensions and index files.
 */
function resolveModulePath(importPath: string, cwd: string): string | null {
  let rel = importPath
  if (rel.startsWith('~/')) rel = 'src/' + rel.slice(2)
  else if (rel.startsWith('@/')) rel = 'src/' + rel.slice(2)
  else return null // Only resolve alias imports

  // Strip .js/.jsx/.ts/.tsx extension
  rel = rel.replace(/\.[jt]sx?$/, '')

  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    const full = resolve(cwd, rel + ext)
    if (existsSync(full)) return full
  }
  for (const ext of ['.ts', '.tsx']) {
    const full = resolve(cwd, rel, 'index' + ext)
    if (existsSync(full)) return full
  }
  return null
}

/**
 * Convert a relative import path in a barrel file to a full aliased path.
 * E.g. `./use-employees.js` relative to `~/hooks/index.js` → `~/hooks/use-employees.js`
 */
function resolveRelativeExport(relativePath: string, barrelImportPath: string): string {
  if (!relativePath.startsWith('.')) return relativePath
  const barrelDir = barrelImportPath.replace(/\/[^/]+$/, '')
  return barrelDir + '/' + relativePath.replace(/^\.\//, '')
}

/**
 * Parse a barrel source file to discover all its named re-exports.
 * Returns export groups: which names come from which sub-module.
 */
function getBarrelReExports(
  project: Project,
  barrelAbsPath: string,
  barrelImportPath: string,
): Array<{ names: string[]; fullModulePath: string }> {
  let sf = project.getSourceFile(barrelAbsPath)
  if (!sf) {
    try {
      project.addSourceFileAtPath(barrelAbsPath)
      sf = project.getSourceFile(barrelAbsPath)
    } catch {
      return []
    }
  }
  if (!sf) return []

  const result: Array<{ names: string[]; fullModulePath: string }> = []

  for (const exportDecl of sf.getExportDeclarations()) {
    const moduleSpec = exportDecl.getModuleSpecifierValue()
    if (!moduleSpec) continue

    const names = exportDecl.getNamedExports().map((n) => n.getName())
    if (names.length > 0) {
      result.push({
        names,
        fullModulePath: resolveRelativeExport(moduleSpec, barrelImportPath),
      })
    }
  }

  return result
}

/**
 * Get all named exports from a source file (export const, export function,
 * export { ... } from, named re-exports).
 */
function getAllExportNames(project: Project, absPath: string): string[] {
  let sf = project.getSourceFile(absPath)
  if (!sf) {
    try {
      project.addSourceFileAtPath(absPath)
      sf = project.getSourceFile(absPath)
    } catch {
      return []
    }
  }
  if (!sf) return []

  const names: string[] = []

  // Named re-exports: export { foo, bar } from '...'
  for (const exportDecl of sf.getExportDeclarations()) {
    for (const named of exportDecl.getNamedExports()) {
      names.push(named.getName())
    }
  }

  // Direct exports: export const foo = ..., export function bar() {}
  for (const stmt of sf.getStatements()) {
    if (stmt.isKind(SyntaxKind.VariableStatement)) {
      const varStmt = stmt.asKindOrThrow(SyntaxKind.VariableStatement)
      if (varStmt.hasExportKeyword()) {
        for (const decl of varStmt.getDeclarationList().getDeclarations()) {
          names.push(decl.getName())
        }
      }
    }
    if (stmt.isKind(SyntaxKind.FunctionDeclaration)) {
      const fnDecl = stmt.asKindOrThrow(SyntaxKind.FunctionDeclaration)
      if (fnDecl.hasExportKeyword()) {
        const name = fnDecl.getName()
        if (name) names.push(name)
      }
    }
  }

  return names
}

// ---------------------------------------------------------------------------
// Server function import detection and stubbing (Layer 4)
// ---------------------------------------------------------------------------

/**
 * Returns true if the import path looks like a server-functions or actions module.
 * These typically crash at module eval time (e.g. `createServerFn` from @tanstack/react-start).
 */
export function isServerFunctionImport(path: string): boolean {
  return /server[-_]?functions?/i.test(path) || /\/actions\/?/i.test(path)
}

/**
 * Scan a source file's import declarations for server function imports.
 * Returns the module specifiers that need stubs (excluding already-mocked paths).
 */
export function discoverServerFunctionImports(
  sf: SourceFile,
  alreadyMocked: Set<string>,
): Array<{ modulePath: string; namedExports: string[] }> {
  const results: Array<{ modulePath: string; namedExports: string[] }> = []

  for (const decl of sf.getImportDeclarations()) {
    const moduleSpec = decl.getModuleSpecifierValue()
    if (!isServerFunctionImport(moduleSpec)) continue
    if (alreadyMocked.has(moduleSpec)) continue

    const namedExports: string[] = []
    for (const named of decl.getNamedImports()) {
      namedExports.push(named.getName())
    }
    const defaultImport = decl.getDefaultImport()
    if (defaultImport) {
      namedExports.push(defaultImport.getText())
    }

    if (namedExports.length > 0) {
      results.push({ modulePath: moduleSpec, namedExports })
    }
  }

  return results
}

/**
 * Generate a safe no-op stub for a server function module.
 * Does NOT re-export from `__real:` because that would re-import the crashy module.
 */
export function generateServerFunctionStub(importPath: string, exportNames: string[]): string {
  const lines = [
    `// Auto-generated server function stub for ${importPath}`,
    `// Prevents module-eval crashes (e.g. createServerFn accessing isServer)`,
    '',
  ]

  for (const name of exportNames) {
    lines.push(
      `// eslint-disable-next-line @typescript-eslint/no-explicit-any`,
      `export function ${name}(..._args: any[]) {`,
      `  return Promise.resolve(undefined)`,
      `}`,
      '',
    )
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// API client detection and stubbing
// ---------------------------------------------------------------------------

const API_CLIENT_PATH_PATTERNS = [
  /\/lib\/api$/,
  /\/lib\/http[-_]?client$/,
  /\/services\/api$/,
  /\/utils\/http$/,
  /\/api[-_]?client$/,
]

const API_CLIENT_EXPORT_NAMES = new Set([
  'api', 'apiClient', 'httpClient', 'http', 'client',
  'Api', 'ApiClient', 'HttpClient',
  'adminApi', 'AdminApi',
])

export function isApiClientImport(
  importPath: string,
  importedNames: string[],
): boolean {
  for (const pattern of API_CLIENT_PATH_PATTERNS) {
    if (pattern.test(importPath)) return true
  }
  if (/[/\-_](api|http)/i.test(importPath)) {
    for (const name of importedNames) {
      if (API_CLIENT_EXPORT_NAMES.has(name)) return true
    }
  }
  return false
}

export function discoverApiClientImports(
  sf: SourceFile,
  alreadyMocked: Set<string>,
): Array<{ modulePath: string; importedNames: string[] }> {
  const results: Array<{ modulePath: string; importedNames: string[] }> = []

  for (const decl of sf.getImportDeclarations()) {
    const moduleSpec = decl.getModuleSpecifierValue()
    if (alreadyMocked.has(moduleSpec)) continue

    const importedNames: string[] = []
    for (const named of decl.getNamedImports()) {
      importedNames.push(named.getName())
    }
    const defaultImport = decl.getDefaultImport()
    if (defaultImport) {
      importedNames.push(defaultImport.getText())
    }

    if (importedNames.length > 0 && isApiClientImport(moduleSpec, importedNames)) {
      results.push({ modulePath: moduleSpec, importedNames })
    }
  }

  return results
}

export function generateApiClientStub(
  importPath: string,
  importedNames: string[],
): string {
  const lines = [
    `// Auto-generated API client stub for ${importPath}`,
    `// All methods return { success: true, data: null } — mock hooks provide real data.`,
    `// Direct fetch calls are caught by the global fetch interceptor in main.tsx.`,
    '',
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    'const noopResponse: any = { success: true, data: null, error: undefined }',
    '',
    'const stub = {',
    '  get: () => Promise.resolve(noopResponse),',
    '  post: () => Promise.resolve(noopResponse),',
    '  put: () => Promise.resolve(noopResponse),',
    '  patch: () => Promise.resolve(noopResponse),',
    '  delete: () => Promise.resolve(noopResponse),',
    '  request: () => Promise.resolve(noopResponse),',
    '}',
    '',
  ]

  for (const name of importedNames) {
    lines.push(`export const ${name} = stub`)
  }

  lines.push('')
  lines.push('export default stub')
  lines.push('')

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

  // Type extraction cache for fast startup
  const typeCache = new TypeCache(join(cwd, '.preview', '.cache'))

  // Global collections — filled during per-screen loop, used for mock generation after
  const hooksWithGetState = new Set<string>()
  const allHooksByImport = new Map<string, MergedHookDep[]>()
  const screenStateVars: Record<string, string[]> = {}

  // Process each screen
  for (const screen of screens) {
    const absPath = resolveSourceFilePath(screen, cwd, specsDir)
    const sf = absPath ? sourceFileMap.get(absPath) : undefined

    // Discover hooks from AST (normalize relative imports to ~/ paths)
    const rawAstHooks = sf ? discoverHooksFromSource(sf) : []
    const astHooks = absPath ? normalizeHookImportPaths(rawAstHooks, absPath, cwd) : rawAstHooks
    allAstHooks.push(...astHooks)

    // Resolve hook return types via TypeChecker (with caching)
    let resolvedTypes = new Map<string, TypeShapeInfo>()
    if (sf && project) {
      const sourceContent = sf.getFullText()
      const sourceHash = hashContent(sourceContent)
      const cached = await typeCache.get(screen.id, sourceHash)

      if (cached) {
        resolvedTypes = new Map(Object.entries(cached))
      } else {
        const typeChecker = project.getTypeChecker()
        const callExprs = sf.getDescendantsOfKind(SyntaxKind.CallExpression)
        for (const call of callExprs) {
          const callText = call.getExpression().getText()
          if (!callText.startsWith('use')) continue
          try {
            const resolved = extractHookReturnType(call, typeChecker)
            if (resolved && resolved.confidence !== 'none') {
              resolvedTypes.set(callText, resolved)
            }
          } catch {
            // Type extraction failed for this hook — skip
          }
        }

        // Cache the results
        if (resolvedTypes.size > 0) {
          const hookMap: Record<string, TypeShapeInfo> = {}
          for (const [name, type] of resolvedTypes) {
            hookMap[name] = type
          }
          await typeCache.set(screen.id, sourceHash, hookMap)
        }
      }
    }

    // Merge spec deps with AST hooks
    const mergedDeps = mergeHookDeps(screen.dataDeps, astHooks)

    // Enrich merged deps with resolved types
    const enrichedDeps = mergedDeps.map((dep) => {
      const resolved = resolvedTypes.get(dep.hook)
      if (!resolved) return dep
      return {
        ...dep,
        resolvedType: resolved,
        // Auto-populate provides from resolved type if empty
        provides:
          dep.provides.length > 0
            ? dep.provides
            : [...resolved.properties, ...resolved.methods],
      }
    })

    // Track data hook keys
    for (const dep of enrichedDeps) {
      allDataHookKeys.add(`${dep.module}::${dep.hook}`)
    }

    // Generate per-hook regions and local-state region
    const hookRegions = specToPerHookRegions(screen, enrichedDeps)
    const localStateFacts = sf ? extractLocalStateFacts(sf) : []

    // Collect useState variable names (in call order) for the preview override
    if (absPath && localStateFacts.length > 0) {
      // useReducer facts excluded: reducer-body state extraction is handled by derive-state-machine.ts
      screenStateVars[absPath] = localStateFacts
        .filter((f) => f.hook === 'useState')
        .map((f) => f.name)
    }

    const localStateRegion = generateLocalStateRegion(
      screen.states,
      screen.stateDescriptions ?? {},
      localStateFacts,
      screen.defaultState,
      screen.stateData,
    )

    // Merge ALL regions into a single screen-level region.
    // The user sees one set of states (loading/populated/error/empty),
    // not separate regions per data source.
    const allRegions = localStateRegion
      ? { ...hookRegions, 'local-state': localStateRegion }
      : hookRegions
    const enrichedRegions = mergeIntoScreenRegion(screen, allRegions)

    enrichedScreens.push({
      ...screen,
      mergedDeps: enrichedDeps,
      enrichedRegions,
    })

    // Detect hooks that use .getState() (Zustand pattern) in this screen
    if (sf) {
      const sourceText = sf.getFullText()
      for (const dep of enrichedDeps) {
        if (sourceText.includes(`${dep.hook}.getState`)) {
          hooksWithGetState.add(dep.hook)
        }
      }
    }

    // Collect hooks by import path (deferred — mock files generated after all screens)
    for (const dep of enrichedDeps) {
      const existing = allHooksByImport.get(dep.module) ?? []
      if (!existing.some((h) => h.hook === dep.hook)) {
        existing.push(dep)
      }
      allHooksByImport.set(dep.module, existing)
    }
  }

  // Generate mock files — deferred to after all screens so .getState() detection is complete
  for (const [importPath, hooks] of allHooksByImport) {
    if (!mockFiles.has(importPath)) {
      let barrelReExports: Array<{ names: string[]; fullModulePath: string }> | undefined
      if (isLikelyBarrel(importPath) && project) {
        const barrelAbsPath = resolveModulePath(importPath, cwd)
        if (barrelAbsPath) {
          barrelReExports = getBarrelReExports(project, barrelAbsPath, importPath)
        }
      }
      mockFiles.set(importPath, generateMockFileForImportPath(hooks, importPath, barrelReExports, hooksWithGetState))
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

  // Detect framework-specific module-scope shims (e.g. TanStack Router's createFileRoute)
  // These run at import time and crash without the full framework context
  for (const { absPath } of screensWithSource) {
    const sf = sourceFileMap.get(absPath)
    if (!sf) continue
    for (const decl of sf.getImportDeclarations()) {
      const mod = decl.getModuleSpecifierValue()
      if (mod === '@tanstack/react-router' && !mockFiles.has(mod)) {
        const names = decl.getNamedImports().map((n) => n.getName())
        if (names.includes('createFileRoute')) {
          mockFiles.set(mod, [
            `// Auto-generated shim for @tanstack/react-router`,
            `export * from '__real:@tanstack/react-router'`,
            ``,
            `// Stub createFileRoute — runs at module scope in route files`,
            `// Real createFileRoute requires router context; this returns a safe object`,
            `// that preserves the component reference at .options.component`,
            `export function createFileRoute(_path: string) {`,
            `  return (opts: any) => ({ options: opts, path: _path })`,
            `}`,
          ].join('\n'))
          break
        }
      }
    }
    if (mockFiles.has('@tanstack/react-router')) break
  }

  // Detect and stub server function imports (Layer 4)
  // These crash at module eval time (e.g. createServerFn accessing isServer)
  // Collect ALL named imports per server function module from screens AND hook files
  const serverFnExports = new Map<string, Set<string>>()

  // Scan screen source files
  for (const screen of screens) {
    const absPath = resolveSourceFilePath(screen, cwd, specsDir)
    const sf = absPath ? sourceFileMap.get(absPath) : undefined
    if (!sf) continue

    const serverImports = discoverServerFunctionImports(sf, new Set())
    for (const { modulePath, namedExports } of serverImports) {
      const existing = serverFnExports.get(modulePath) ?? new Set<string>()
      for (const name of namedExports) existing.add(name)
      serverFnExports.set(modulePath, existing)
    }
  }

  // Also scan hook source files (e.g. use-rooms.ts imports getRooms from server-functions)
  // Hook mocks with __real: re-export load the real hook module which may import server functions
  // Include both directly-mocked hook modules AND barrel sub-module paths
  if (project) {
    const hookImportPaths = new Set<string>()
    for (const [importPath] of mockFiles) {
      if (!isLikelyBarrel(importPath) && !isServerFunctionImport(importPath)) {
        hookImportPaths.add(importPath)
      }
    }
    // Also add barrel sub-module paths (barrel re-exports load these via Vite aliases)
    for (const [importPath] of mockFiles) {
      if (!isLikelyBarrel(importPath)) continue
      const barrelAbsPath = resolveModulePath(importPath, cwd)
      if (!barrelAbsPath) continue
      const reExports = getBarrelReExports(project, barrelAbsPath, importPath)
      for (const group of reExports) {
        hookImportPaths.add(group.fullModulePath)
      }
    }
    for (const hookImportPath of hookImportPaths) {
      const hookAbsPath = resolveModulePath(hookImportPath, cwd)
      if (!hookAbsPath) continue
      let hookSf = sourceFileMap.get(hookAbsPath)
      if (!hookSf) {
        try {
          project.addSourceFileAtPath(hookAbsPath)
          hookSf = project.getSourceFile(hookAbsPath)
          if (hookSf) sourceFileMap.set(hookAbsPath, hookSf)
        } catch { continue }
      }
      if (!hookSf) continue

      const serverImports = discoverServerFunctionImports(hookSf, new Set())
      for (const { modulePath, namedExports } of serverImports) {
        const existing = serverFnExports.get(modulePath) ?? new Set<string>()
        for (const name of namedExports) existing.add(name)
        serverFnExports.set(modulePath, existing)
      }
    }

    // Also resolve ALL exports from server function source files (defense-in-depth)
    for (const [modulePath, collectedNames] of serverFnExports) {
      const sfAbsPath = resolveModulePath(modulePath, cwd)
      if (!sfAbsPath) continue
      const allNames = getAllExportNames(project, sfAbsPath)
      for (const name of allNames) collectedNames.add(name)
    }
  }

  // Generate server function stubs
  for (const [modulePath, exportNames] of serverFnExports) {
    if (mockFiles.has(modulePath)) continue
    mockFiles.set(modulePath, generateServerFunctionStub(modulePath, [...exportNames]))
  }

  // API client detection (from component source + spec declaration)
  const apiClientModules = new Map<string, string[]>()

  for (const { screen, absPath } of screensWithSource) {
    if (screen.apiClient) {
      const mod = screen.apiClient.module
      if (!apiClientModules.has(mod)) {
        apiClientModules.set(mod, [screen.apiClient.export ?? 'api'])
      }
    }

    const sf = sourceFileMap.get(absPath)
    if (sf) {
      const apiImports = discoverApiClientImports(sf, new Set(mockFiles.keys()))
      for (const { modulePath, importedNames } of apiImports) {
        if (apiClientModules.has(modulePath)) {
          const existing = apiClientModules.get(modulePath)!
          for (const n of importedNames) {
            if (!existing.includes(n)) existing.push(n)
          }
        } else {
          apiClientModules.set(modulePath, [...importedNames])
        }
      }
    }
  }

  for (const [modulePath, importedNames] of apiClientModules) {
    if (mockFiles.has(modulePath)) continue
    mockFiles.set(modulePath, generateApiClientStub(modulePath, importedNames))
  }

  // Build alias manifest
  for (const importPath of mockFiles.keys()) {
    const safeName = toSafeFileName(importPath)
    aliasManifest[importPath] = `./mocks/${safeName}.ts`
  }

  const screenSourcePaths = screensWithSource.map(({ absPath }) => absPath)

  return { enrichedScreens, mockFiles, aliasManifest, screenSourcePaths, screenStateVars }
}

import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'
import { Project, SyntaxKind, type SourceFile } from 'ts-morph'
import { extractHookFacts } from '../analyzer/collect-facts.js'
import { findTsConfig } from '../analyzer/collect-facts.js'
import { extractHookReturnType } from '../analyzer/extract-types.js'
import { classifyHook } from '../lib/hook-classifier.js'
import { REACT_IMPORT_PATHS, REACT_BUILTIN_HOOKS } from '../lib/hook-binding.js'
import { PROVIDER_PACKAGES } from '../lib/hook-classifier.js'
import { distributeByState } from './state-distributor.js'
import { TypeCache, hashContent } from './type-cache.js'
import type { HookFact, TypeShapeInfo } from '../analyzer/types.js'
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

    let states: Record<string, Record<string, unknown>>

    if (dep.resolvedType && dep.resolvedType.confidence !== 'none') {
      // Use type-aware state distribution
      states = distributeByState(screen.states, dep.resolvedType)
    } else {
      // Fallback: existing behavior (distribute from stateData)
      states = distributeStateData(screen.stateData, dep.provides)
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

    // Use resolved type info when available for richer field lists
    const dataFields = dep.resolvedType
      ? dep.resolvedType.properties.filter((f) => !isLikelySetter(f))
      : dep.provides.filter((f) => !isLikelySetter(f))
    const fnFields = dep.resolvedType
      ? [
          ...dep.resolvedType.methods,
          ...dep.provides.filter(isLikelySetter),
        ]
      : dep.provides.filter(isLikelySetter)
    // Deduplicate fn fields
    const uniqueFnFields = [...new Set(fnFields)]

    const fnList = uniqueFnFields.map((f) => `'${f}'`).join(', ')
    const dataList = dataFields.map((f) => `'${f}'`).join(', ')

    // Build default shape from resolved type (provides non-null defaults)
    const defaultShape = dep.resolvedType?.shape ?? {}
    const defaultShapeJson = JSON.stringify(defaultShape)

    lines.push(
      `// eslint-disable-next-line @typescript-eslint/no-explicit-any`,
      `export function ${dep.hook}(..._args: any[]) {`,
      `  const data = useRegionDataForHook('${regionKey}')`,
      `  const defaults = ${defaultShapeJson}`,
      `  const merged = data ? { ...defaults, ...(data as Record<string, any>) } : defaults`,
      `  const state = resolveStoreState(merged, [${fnList}], [${dataList}])`,
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

  // Process each screen
  for (const screen of screens) {
    const absPath = resolveSourceFilePath(screen, cwd, specsDir)
    const sf = absPath ? sourceFileMap.get(absPath) : undefined

    // Discover hooks from AST
    const astHooks = sf ? discoverHooksFromSource(sf) : []
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

    // Generate per-hook regions
    const enrichedRegions = specToPerHookRegions(screen, enrichedDeps)

    enrichedScreens.push({
      ...screen,
      mergedDeps: enrichedDeps,
      enrichedRegions,
    })

    // Group hooks by import path for mock file generation
    const hooksByImport = new Map<string, MergedHookDep[]>()
    for (const dep of enrichedDeps) {
      const existing = hooksByImport.get(dep.module) ?? []
      // Deduplicate by hook name
      if (!existing.some((h) => h.hook === dep.hook)) {
        existing.push(dep)
      }
      hooksByImport.set(dep.module, existing)
    }

    for (const [importPath, hooks] of hooksByImport) {
      if (!mockFiles.has(importPath)) {
        // For barrel files, resolve the barrel source and get re-exports
        let barrelReExports: Array<{ names: string[]; fullModulePath: string }> | undefined
        if (isLikelyBarrel(importPath) && project) {
          const barrelAbsPath = resolveModulePath(importPath, cwd)
          if (barrelAbsPath) {
            barrelReExports = getBarrelReExports(project, barrelAbsPath, importPath)
          }
        }
        mockFiles.set(importPath, generateMockFileForImportPath(hooks, importPath, barrelReExports))
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

  // Generate stubs
  for (const [modulePath, exportNames] of serverFnExports) {
    if (mockFiles.has(modulePath)) continue
    mockFiles.set(modulePath, generateServerFunctionStub(modulePath, [...exportNames]))
  }

  // Build alias manifest
  for (const importPath of mockFiles.keys()) {
    const safeName = toSafeFileName(importPath)
    aliasManifest[importPath] = `./mocks/${safeName}.ts`
  }

  return { enrichedScreens, mockFiles, aliasManifest }
}

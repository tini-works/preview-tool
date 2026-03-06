import type { ScreenFacts } from '../analyzer/types.js'
import type { ScreenAnalysisOutput } from '../llm/schemas/screen-analysis.js'
import type { HookMappingType } from '../analyzer/types.js'
import { parseHookBinding, REACT_IMPORT_PATHS } from '../lib/hook-binding.js'
import { classifyHook } from '../lib/hook-classifier.js'
import { inferHookMappingType } from './generate-from-analysis.js'

export interface MockGenerationResult {
  /** importPath -> generated mock code */
  mockFiles: Map<string, string>
  /** importPath -> relative mock file path */
  aliasManifest: Record<string, string>
}

/**
 * Converts an import path to a safe filename for the mock module.
 * e.g. '@tanstack/react-query' -> 'tanstack-react-query'
 *      '@/stores/auth' -> 'stores-auth'
 */
function toSafeFileName(importPath: string): string {
  return importPath
    .replace(/^@\//, '')
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/^-+/, '')
    .replace(/-+/g, '-')
}

/**
 * Returns true if the import path is an npm package (not a relative/alias import).
 * npm packages need re-exports so non-hook exports (e.g. MemoryRouter, Link) are preserved.
 */
function isNpmPackage(importPath: string): boolean {
  return !importPath.startsWith('.') && !importPath.startsWith('@/') && !importPath.startsWith('~/')
}

/**
 * Converts a camelCase name to a kebab-case URL parameter name.
 * e.g. 'registrationSuccess' -> 'registration-success'
 */
function camelToParam(name: string): string {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
}

function camelToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * Extract the actual URL param name and value from a derived var expression.
 * Handles patterns like:
 *   searchParams.get('registered') === 'true'  → { paramName: 'registered', paramValue: 'true' }
 *   searchParams.get('tab')                    → { paramName: 'tab', paramValue: 'true' }
 *   searchParams.has('debug')                  → { paramName: 'debug', paramValue: 'true' }
 */
function extractSearchParamInfo(expression: string): { paramName: string; paramValue: string } | null {
  const getMatch = expression.match(/\.get\(\s*['"]([^'"]+)['"]\s*\)/)
  if (getMatch) {
    const paramName = getMatch[1]
    const valueMatch = expression.match(/===?\s*['"]([^'"]+)['"]/)
    return { paramName, paramValue: valueMatch ? valueMatch[1] : 'true' }
  }

  const hasMatch = expression.match(/\.has\(\s*['"]([^'"]+)['"]\s*\)/)
  if (hasMatch) {
    return { paramName: hasMatch[1], paramValue: 'true' }
  }

  return null
}

interface HookInfo {
  name: string
  mappingType?: HookMappingType
  destructuredFields?: string[]
}

/**
 * Generates a single mock module file for a set of hooks from the same import path.
 *
 * For npm packages: re-exports all original exports via `__real:` prefix, then overrides hooks.
 * For local imports: only exports the mocked hooks.
 *
 * Type-aware: store hooks return state directly, query hooks use data/isLoading wrapper.
 */
function generateMockFile(
  hooks: HookInfo[],
  hookToRegion: Map<string, string>,
  importPath: string,
): string {
  const uniqueNames = [...new Set(hooks.map((h) => h.name))]
  const hookMap = new Map(hooks.map((h) => [h.name, h]))
  const hasRegionMappings = uniqueNames.some((name) => hookToRegion.has(`${importPath}::${name}`))
  const hasStoreHooks = hooks.some((h) => h.mappingType === 'store')
  const hasQueryHooks = hooks.some((h) => h.mappingType !== 'store')
  const isNpm = isNpmPackage(importPath)

  const lines: string[] = [
    '// Auto-generated mock by @preview-tool/cli — do not edit manually',
  ]

  // For npm packages, re-export everything from the real module first.
  // The `__real:` prefix is resolved by Vite to the actual node_modules path,
  // avoiding circular alias resolution.
  if (isNpm) {
    lines.push(`export * from '__real:${importPath}'`)
  }

  if (hasRegionMappings) {
    lines.push("import { useRegionDataForHook } from '@preview-tool/runtime'")
  }

  // No-op function stub for store action fields
  if (hasStoreHooks) {
    lines.push(
      '',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      'const NOOP = (() => {}) as any',
    )
  }

  // Query-style resolver (data/isLoading/isError wrapper)
  if (hasQueryHooks) {
    lines.push(
      '',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      'function resolveFromState(stateData: Record<string, any>) {',
      "  if (stateData._loading) return { data: undefined, isLoading: true, isError: false, isReady: false }",
      "  if (stateData._error) return { data: undefined, isLoading: false, isError: true, isReady: false, error: stateData.message }",
      '  return { data: stateData.data ?? stateData, isLoading: false, isError: false, isReady: true }',
      '}',
      '',
      'const DEFAULT_STATE = { data: undefined, isLoading: true, isError: false, isReady: false }',
    )
  }

  // Store-style resolver (returns state directly, fills no-op stubs for missing fields)
  if (hasStoreHooks) {
    lines.push(
      '',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      'function resolveStoreState(stateData: Record<string, any>, fields?: string[]) {',
      '  if (!fields) return stateData',
      '  const result: Record<string, any> = { ...stateData }',
      '  for (const f of fields) {',
      '    if (!(f in result)) result[f] = NOOP',
      '  }',
      '  return result',
      '}',
    )
  }

  lines.push('')

  for (const hookName of uniqueNames) {
    const regionKey = hookToRegion.get(`${importPath}::${hookName}`)
    const info = hookMap.get(hookName)
    const isStore = info?.mappingType === 'store'

    if (regionKey) {
      if (isStore && info?.destructuredFields && info.destructuredFields.length > 0) {
        // Store hook with known destructured fields — return state directly with no-op stubs
        const fieldsList = info.destructuredFields.map((f) => `'${f}'`).join(', ')
        lines.push(
          `// Mock replacement for ${hookName} — store, mapped to region '${regionKey}'`,
          '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
          `export function ${hookName}(..._args: any[]) {`,
          `  const data = useRegionDataForHook('${regionKey}')`,
          '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
          `  if (data) return resolveStoreState(data as Record<string, any>, [${fieldsList}])`,
          `  return resolveStoreState({}, [${fieldsList}])`,
          '}',
          '',
        )
      } else if (isStore) {
        // Store hook without field info — return state directly, no stubs
        lines.push(
          `// Mock replacement for ${hookName} — store, mapped to region '${regionKey}'`,
          '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
          `export function ${hookName}(..._args: any[]) {`,
          `  const data = useRegionDataForHook('${regionKey}')`,
          '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
          '  if (data) return resolveStoreState(data as Record<string, any>)',
          '  return {}',
          '}',
          '',
        )
      } else {
        // Query/custom hook — use data/isLoading wrapper
        lines.push(
          `// Mock replacement for ${hookName} — mapped to region '${regionKey}'`,
          '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
          `export function ${hookName}(..._args: any[]) {`,
          `  const data = useRegionDataForHook('${regionKey}')`,
          '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
          '  if (data) return resolveFromState(data as Record<string, any>)',
          '  return DEFAULT_STATE',
          '}',
          '',
        )
      }
    } else {
      // No region mapping
      const defaultReturn = isStore ? '{}' : 'DEFAULT_STATE'
      lines.push(
        `// Mock replacement for ${hookName} — no region mapping`,
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
        `export function ${hookName}(..._args: any[]) {`,
        `  return ${defaultReturn}`,
        '}',
        '',
      )
    }
  }

  return lines.join('\n')
}

/**
 * Generates mock modules with direct region key mapping.
 *
 * This is the core simplification over the old regex-based approach:
 * each mock hook knows its exact region key from the LLM analysis,
 * calling `useRegionDataForHook('region-key')` with a single argument.
 *
 * Steps:
 * 1. Build hookToRegion map from analysis regions + facts
 * 2. Build hookToType map for type-aware mock generation
 * 3. Collect destructured fields per hook for no-op stub generation
 * 4. Group hooks by importPath (deduplicated by name)
 * 5. Generate a mock file for each import group
 * 6. Build alias manifest
 */
export function generateMockModules(
  allFacts: ScreenFacts[],
  allAnalyses: ScreenAnalysisOutput[],
): MockGenerationResult {
  // Step 1: Build hookToRegion map
  // Key: "importPath::hookName", Value: regionKey
  const hookToRegion = new Map<string, string>()

  // Collect all hooks across all facts for name -> importPath lookup
  const hookNameToImportPaths = new Map<string, Set<string>>()
  for (const facts of allFacts) {
    for (const hook of facts.hooks) {
      const existing = hookNameToImportPaths.get(hook.name) ?? new Set<string>()
      existing.add(hook.importPath)
      hookNameToImportPaths.set(hook.name, existing)
    }
  }

  // Map each region's hookBindings to the corresponding import path
  for (const analysis of allAnalyses) {
    for (const region of analysis.regions) {
      for (const binding of region.hookBindings) {
        const parsed = parseHookBinding(binding)
        if (!parsed) {
          continue
        }
        const importPaths = hookNameToImportPaths.get(parsed.hookName)
        if (importPaths) {
          for (const importPath of importPaths) {
            hookToRegion.set(`${importPath}::${parsed.hookName}`, region.key)
          }
        }
      }
    }
  }

  // Step 2: Build hookMappingType lookup
  const hookToType = new Map<string, HookMappingType>()
  for (const analysis of allAnalyses) {
    for (const region of analysis.regions) {
      for (const binding of region.hookBindings) {
        const parsed = parseHookBinding(binding)
        if (!parsed) continue
        hookToType.set(parsed.hookName, inferHookMappingType(parsed.hookName))
      }
    }
  }

  // Step 3: Collect destructured fields per hook (union across all screens)
  const hookDestructuredFields = new Map<string, Set<string>>()
  for (const facts of allFacts) {
    for (const hook of facts.hooks) {
      if (!hook.destructuredFields) continue
      const existing = hookDestructuredFields.get(hook.name) ?? new Set<string>()
      for (const field of hook.destructuredFields) {
        existing.add(field)
      }
      hookDestructuredFields.set(hook.name, existing)
    }
  }

  // Step 4: Group hooks by importPath (deduplicated by name), skipping React built-ins
  const hooksByImport = new Map<string, HookInfo[]>()
  for (const facts of allFacts) {
    for (const hook of facts.hooks) {
      if (REACT_IMPORT_PATHS.has(hook.importPath)) continue
      if (classifyHook(hook.name, hook.importPath) === 'provider') continue
      const existing = hooksByImport.get(hook.importPath) ?? []
      // Deduplicate by name
      if (!existing.some((h) => h.name === hook.name)) {
        const fields = hookDestructuredFields.get(hook.name)
        existing.push({
          name: hook.name,
          mappingType: hookToType.get(hook.name),
          ...(fields ? { destructuredFields: [...fields] } : {}),
        })
      }
      hooksByImport.set(hook.importPath, existing)
    }
  }

  // Step 5: Generate mock files
  const mockFiles = new Map<string, string>()
  for (const [importPath, hooks] of hooksByImport) {
    const code = generateMockFile(hooks, hookToRegion, importPath)
    mockFiles.set(importPath, code)
  }

  // Step 6: Build alias manifest
  const aliasManifest: Record<string, string> = {}
  for (const importPath of mockFiles.keys()) {
    const safeName = toSafeFileName(importPath)
    aliasManifest[importPath] = `./mocks/${safeName}.ts`
  }

  // Step 7: Generate react-router-dom mock for useSearchParams-derived regions
  // Collect all derivedVars across all facts for expression-based param extraction
  const allDerivedVars = allFacts.flatMap((f) => f.derivedVars ?? [])

  const searchParamsRegions: Array<{ regionKey: string; stateDataKeys: string[] }> = []
  for (const analysis of allAnalyses) {
    for (const region of analysis.regions) {
      if ((region as any).sourceHook === 'useSearchParams') {
        const stateDataKeys = Object.values(region.states)
          .flatMap((s) => Object.keys(s.mockData))
          .filter((k, i, arr) => arr.indexOf(k) === i)
        searchParamsRegions.push({ regionKey: region.key, stateDataKeys })
      }
    }
  }

  if (searchParamsRegions.length > 0 && !mockFiles.has('react-router-dom')) {
    const lines: string[] = [
      '// Auto-generated mock by @preview-tool/cli — do not edit manually',
      "export * from '__real:react-router-dom'",
      "import { useRegionDataForHook } from '@preview-tool/runtime'",
      '',
      'export function useSearchParams() {',
      '  const params = new URLSearchParams()',
    ]

    for (const { regionKey, stateDataKeys } of searchParamsRegions) {
      const varName = regionKey.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) + 'Data'
      lines.push(`  const ${varName} = useRegionDataForHook('${regionKey}')`)
      for (const dataKey of stateDataKeys) {
        // Try to extract actual URL param name from the DerivedVarFact expression
        // e.g. searchParams.get('registered') === 'true' → paramName: 'registered'
        const derivedVar = allDerivedVars.find((dv) => camelToKebab(dv.name) === regionKey)
        const paramInfo = derivedVar ? extractSearchParamInfo(derivedVar.expression) : null
        const paramName = paramInfo?.paramName ?? camelToParam(dataKey)
        const paramValue = paramInfo?.paramValue ?? 'true'
        lines.push(`  if (${varName}?.${dataKey}) params.set('${paramName}', '${paramValue}')`)
      }
    }

    lines.push(
      '  return [params, () => {}] as const',
      '}',
    )

    mockFiles.set('react-router-dom', lines.join('\n'))
    aliasManifest['react-router-dom'] = './mocks/react-router-dom.ts'
  }

  return { mockFiles, aliasManifest }
}

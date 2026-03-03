import type { ScreenFacts } from '../analyzer/types.js'
import type { ScreenAnalysisOutput } from '../llm/schemas/screen-analysis.js'

export interface MockGenerationResult {
  /** importPath -> generated mock code */
  mockFiles: Map<string, string>
  /** importPath -> relative mock file path */
  aliasManifest: Record<string, string>
}

/** Import paths that should never be mocked — they are provided by React itself */
const SKIP_IMPORT_PATHS = new Set(['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'])

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
 * Parses a hookBinding string in the format "hookName:identifier".
 */
function parseHookBinding(binding: string): { hookName: string; identifier: string } | undefined {
  const colonIndex = binding.indexOf(':')
  if (colonIndex === -1) {
    return undefined
  }
  const hookName = binding.slice(0, colonIndex).trim()
  const identifier = binding.slice(colonIndex + 1).trim()
  if (!hookName || !identifier) {
    return undefined
  }
  return { hookName, identifier }
}

/**
 * Generates a single mock module file for a set of hooks from the same import path.
 *
 * Hooks with region mappings call useRegionDataForHook('region-key') directly.
 * Unmapped hooks return DEFAULT_STATE.
 */
function generateMockFile(
  hooks: Array<{ name: string }>,
  hookToRegion: Map<string, string>,
  importPath: string,
): string {
  const uniqueNames = [...new Set(hooks.map((h) => h.name))]
  const hasRegionMappings = uniqueNames.some((name) => hookToRegion.has(`${importPath}::${name}`))

  const lines: string[] = [
    '// Auto-generated mock by @preview-tool/cli — do not edit manually',
  ]

  if (hasRegionMappings) {
    lines.push("import { useRegionDataForHook } from '@preview-tool/runtime'")
  }

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
    '',
  )

  for (const hookName of uniqueNames) {
    const regionKey = hookToRegion.get(`${importPath}::${hookName}`)

    if (regionKey) {
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
    } else {
      lines.push(
        `// Mock replacement for ${hookName} — no region mapping`,
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
        `export function ${hookName}(..._args: any[]) {`,
        '  return DEFAULT_STATE',
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
 * 2. Group hooks by importPath (deduplicated by name)
 * 3. Generate a mock file for each import group
 * 4. Build alias manifest
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

  // Step 2: Group hooks by importPath (deduplicated by name), skipping React built-ins
  const hooksByImport = new Map<string, Array<{ name: string }>>()
  for (const facts of allFacts) {
    for (const hook of facts.hooks) {
      if (SKIP_IMPORT_PATHS.has(hook.importPath)) continue
      const existing = hooksByImport.get(hook.importPath) ?? []
      // Deduplicate by name
      if (!existing.some((h) => h.name === hook.name)) {
        existing.push({ name: hook.name })
      }
      hooksByImport.set(hook.importPath, existing)
    }
  }

  // Step 3: Generate mock files
  const mockFiles = new Map<string, string>()
  for (const [importPath, hooks] of hooksByImport) {
    const code = generateMockFile(hooks, hookToRegion, importPath)
    mockFiles.set(importPath, code)
  }

  // Step 4: Build alias manifest
  const aliasManifest: Record<string, string> = {}
  for (const importPath of mockFiles.keys()) {
    const safeName = toSafeFileName(importPath)
    aliasManifest[importPath] = `./mocks/${safeName}.ts`
  }

  return { mockFiles, aliasManifest }
}

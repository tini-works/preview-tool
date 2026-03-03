import type { HookAnalysis, ImportAnalysis, HookAnalysisResult, HookMappingType } from './types.js'

/** Import paths known to be data-fetching hooks */
const DATA_HOOK_PATTERNS: Record<string, 'data-loading-error'> = {
  'useAppLiveQuery': 'data-loading-error',
  'useLiveQuery': 'data-loading-error',
  'useQuery': 'data-loading-error',
  'useSWR': 'data-loading-error',
  'useFetch': 'data-loading-error',
}

/** Import path substrings that indicate mocking is needed */
const MOCK_IMPORT_PATTERNS: Array<{ pattern: RegExp; reason: ImportAnalysis['reason'] }> = [
  { pattern: /devtool.*store|dev-tool.*store/i, reason: 'devtool-store' },
  { pattern: /stores?\/auth/i, reason: 'auth-store' },
  { pattern: /lib\/api|services\/api|api\/client/i, reason: 'api-client' },
  { pattern: /lib\/collections|collections/i, reason: 'collection' },
  { pattern: /lib\/query-client|query-client/i, reason: 'query-client' },
  { pattern: /@tanstack\/react-db/i, reason: 'db-library' },
  { pattern: /devtool\/mocks|devtools?\/mock/i, reason: 'mock-data' },
]

/** Determine the hookMappingType for a given hook name */
function getHookMappingType(hookName: string): HookMappingType {
  if (hookName === 'useAppLiveQuery' || hookName === 'useLiveQuery') return 'custom-hook'
  if (hookName === 'useQuery' || hookName === 'useSWR' || hookName === 'useFetch') return 'query-hook'
  return 'unknown'
}

/**
 * Analyze a React component's source code to detect data-fetching hooks
 * and imports that need mocking for the preview tool.
 */
export function analyzeHooks(source: string, _filePath: string): HookAnalysisResult {
  const hooks: HookAnalysis[] = []
  const imports: ImportAnalysis[] = []

  // Step 1: Parse all import statements
  const importRe = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g
  const importMap = new Map<string, { originalName: string; importPath: string }>()

  let importMatch: RegExpExecArray | null
  while ((importMatch = importRe.exec(source)) !== null) {
    const specifiers = importMatch[1]
    const importPath = importMatch[2]

    for (const spec of specifiers.split(',')) {
      const trimmed = spec.trim()
      // Skip type-only imports (e.g., 'type AuthState')
      if (/^type\s+/.test(trimmed)) continue
      const aliasMatch = /(\w+)\s+as\s+(\w+)/.exec(trimmed)
      if (aliasMatch) {
        importMap.set(aliasMatch[2], { originalName: aliasMatch[1], importPath })
      } else if (trimmed) {
        importMap.set(trimmed, { originalName: trimmed, importPath })
      }
    }

    // Check if this import path needs mocking
    for (const { pattern, reason } of MOCK_IMPORT_PATTERNS) {
      if (pattern.test(importPath)) {
        const namedExports = specifiers
          .split(',')
          .map((s) => {
            const t = s.trim()
            // Skip type-only imports
            if (/^type\s+/.test(t)) return ''
            const a = /(\w+)\s+as\s+(\w+)/.exec(t)
            return a ? a[1] : t
          })
          .filter(Boolean)

        // Merge into existing entry or add new one (immutable)
        const existingIdx = imports.findIndex((i) => i.path === importPath)
        if (existingIdx !== -1) {
          const prev = imports[existingIdx]
          const merged = [...new Set([...prev.namedExports, ...namedExports])]
          imports[existingIdx] = { ...prev, namedExports: merged }
        } else {
          imports.push({
            path: importPath,
            namedExports,
            needsMocking: true,
            reason,
          })
        }
        break
      }
    }
  }

  // Step 1b: Parse default imports (e.g., `import useSWR from 'swr'`)
  const defaultImportRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g
  let defaultMatch: RegExpExecArray | null
  while ((defaultMatch = defaultImportRe.exec(source)) !== null) {
    const localName = defaultMatch[1]
    const importPath = defaultMatch[2]

    // Only add if not already in the map (named imports take priority)
    if (!importMap.has(localName)) {
      importMap.set(localName, { originalName: localName, importPath })
    }

    // Check if this default import path needs mocking
    for (const { pattern, reason } of MOCK_IMPORT_PATTERNS) {
      if (pattern.test(importPath)) {
        const existingIdx = imports.findIndex((i) => i.path === importPath)
        if (existingIdx !== -1) {
          const prev = imports[existingIdx]
          if (!prev.namedExports.includes('default')) {
            imports[existingIdx] = { ...prev, namedExports: [...prev.namedExports, 'default'] }
          }
        } else {
          imports.push({
            path: importPath,
            namedExports: ['default'],
            needsMocking: true,
            reason,
          })
        }
        break
      }
    }
  }

  // Step 2: Find data-fetching hook calls
  for (const [localName, info] of importMap) {
    const returnShape = DATA_HOOK_PATTERNS[info.originalName]
    if (!returnShape) continue

    // Strategy 1: Positional string literal — useHook(query, 'section-id')
    const callRe = new RegExp(
      localName + String.raw`\s*\([\s\S]*?['"]([a-z][a-z0-9-]*)['"]\s*\)`,
      'g',
    )
    let callMatch: RegExpExecArray | null
    const foundSections = new Set<string>()

    while ((callMatch = callRe.exec(source)) !== null) {
      const sectionId = callMatch[1]
      if (foundSections.has(sectionId)) continue
      foundSections.add(sectionId)

      hooks.push({
        hookName: info.originalName,
        importPath: info.importPath,
        sectionId,
        returnShape,
        hookMappingType: getHookMappingType(info.originalName),
      })
    }

    // Strategy 2: queryKey array — useQuery({ queryKey: ['section-id', ...] })
    if (foundSections.size === 0) {
      const queryKeyRe = new RegExp(
        localName + String.raw`\s*\(\s*\{[\s\S]*?queryKey\s*:\s*\[\s*['"]([a-z][a-z0-9-]*)['"]\s*[\],]`,
        'g',
      )
      let qkMatch: RegExpExecArray | null
      while ((qkMatch = queryKeyRe.exec(source)) !== null) {
        const sectionId = qkMatch[1]
        if (foundSections.has(sectionId)) continue
        foundSections.add(sectionId)

        hooks.push({
          hookName: info.originalName,
          importPath: info.importPath,
          sectionId,
          returnShape,
          hookMappingType: getHookMappingType(info.originalName),
        })
      }
    }

    // Strategy 3: Object sectionId property — useHook({ sectionId: 'my-section' })
    if (foundSections.size === 0) {
      const objSectionIdRe = new RegExp(
        localName + String.raw`\s*\(\s*\{[\s\S]*?sectionId\s*:\s*['"]([a-z][a-z0-9-]*)['"]\s*[\},]`,
        'g',
      )
      let osMatch: RegExpExecArray | null
      while ((osMatch = objSectionIdRe.exec(source)) !== null) {
        const sectionId = osMatch[1]
        if (foundSections.has(sectionId)) continue
        foundSections.add(sectionId)

        hooks.push({
          hookName: info.originalName,
          importPath: info.importPath,
          sectionId,
          returnShape,
          hookMappingType: getHookMappingType(info.originalName),
        })
      }
    }

    // If hook was imported but no section ID detected, still record it
    if (foundSections.size === 0) {
      const simpleCallRe = new RegExp(localName + String.raw`\s*\(`)
      if (simpleCallRe.test(source)) {
        hooks.push({
          hookName: info.originalName,
          importPath: info.importPath,
          returnShape,
          hookMappingType: getHookMappingType(info.originalName),
        })
      }
    }


    // Add the hook's import to mock list if not already there
    if (!imports.some((i) => i.path === info.importPath)) {
      imports.push({
        path: info.importPath,
        namedExports: [info.originalName],
        needsMocking: true,
        reason: 'data-hook',
      })
    }
  }

  return { hooks, imports }
}

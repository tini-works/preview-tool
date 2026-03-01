# Module Aliasing Preview — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the preview-tool CLI generate mock hooks via Vite module aliasing so external React app screens have their data states controlled from the preview inspector — without modifying the external app's production code.

**Architecture:** The CLI's AST analysis is extended to detect hook imports and their signatures. For each detected data-fetching hook, a mock stub is generated in `.preview/mocks/` that reads from the preview-tool runtime's `regionStates`. Vite aliases redirect the hook imports to these mocks at build time. The model.ts format is enhanced to include actual mock data per state. The wrapper.tsx is simplified (no state bridge needed).

**Tech Stack:** TypeScript, ts-morph (AST), Vite resolve.alias, Zustand (runtime store), Vitest (tests)

---

## Task 1: Add HookAnalysis type and analyze-hooks module

**Files:**
- Modify: `packages/cli/src/analyzer/types.ts`
- Create: `packages/cli/src/analyzer/analyze-hooks.ts`
- Create: `packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts`

**Step 1: Add HookAnalysis and ImportAnalysis types to types.ts**

Add after line 119 in `packages/cli/src/analyzer/types.ts`:

```typescript
// === Hook Analysis (for module aliasing) ===

export interface HookAnalysis {
  /** Hook function name as used in the component (e.g., 'useAppLiveQuery') */
  hookName: string
  /** Full import path (e.g., '@/hooks/use-app-live-query') */
  importPath: string
  /** Section/region ID if detectable from call arguments (e.g., 'service-grid') */
  sectionId?: string
  /** React Query key if detectable (e.g., ['services']) */
  queryKey?: string
  /** Return shape: what the hook returns (e.g., 'data-loading-error') */
  returnShape: 'data-loading-error' | 'state-setter' | 'unknown'
}

export interface ImportAnalysis {
  /** Import path (e.g., '@/stores/auth') */
  path: string
  /** Named exports used (e.g., ['useAuthStore']) */
  namedExports: string[]
  /** Whether this import needs mocking */
  needsMocking: boolean
  /** Why it needs mocking */
  reason: 'data-hook' | 'auth-store' | 'devtool-store' | 'api-client' | 'collection'
}

export interface HookAnalysisResult {
  hooks: HookAnalysis[]
  imports: ImportAnalysis[]
}
```

**Step 2: Write failing test for analyze-hooks**

Create `packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { analyzeHooks } from '../analyze-hooks.js'

describe('analyzeHooks', () => {
  it('detects useAppLiveQuery with section ID', () => {
    const source = `
import { useAppLiveQuery } from '@/hooks/use-app-live-query'

export default function HomePage() {
  const { data, isLoading } = useAppLiveQuery(
    (q) => q.from({ service: servicesCollection }),
    'service-grid'
  )
  return <div>{data}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/home.tsx')
    expect(result.hooks).toHaveLength(1)
    expect(result.hooks[0]).toMatchObject({
      hookName: 'useAppLiveQuery',
      importPath: '@/hooks/use-app-live-query',
      sectionId: 'service-grid',
      returnShape: 'data-loading-error',
    })
  })

  it('detects useQuery from @tanstack/react-query', () => {
    const source = `
import { useQuery } from '@tanstack/react-query'

export default function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => fetch('/api/services').then(r => r.json()),
  })
  return <div>{data}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks).toHaveLength(1)
    expect(result.hooks[0]).toMatchObject({
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      returnShape: 'data-loading-error',
    })
  })

  it('detects devtool store imports that need mocking', () => {
    const source = `
import { useDevToolStore } from '@/devtool/devtool-store'

export default function LoginPage() {
  const mockState = useDevToolStore((s) => s.sectionStates['login-form'])
  return <div />
}
`
    const result = analyzeHooks(source, 'src/pages/login.tsx')
    expect(result.imports).toContainEqual(
      expect.objectContaining({
        path: '@/devtool/devtool-store',
        needsMocking: true,
        reason: 'devtool-store',
      })
    )
  })

  it('detects auth store imports', () => {
    const source = `
import { useAuthStore } from '@/stores/auth'

export default function Page() {
  const user = useAuthStore((s) => s.user)
  return <div>{user?.name}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.imports).toContainEqual(
      expect.objectContaining({
        path: '@/stores/auth',
        needsMocking: true,
        reason: 'auth-store',
      })
    )
  })

  it('detects multiple hooks in one file', () => {
    const source = `
import { useAppLiveQuery } from '@/hooks/use-app-live-query'
import { useDevToolStore } from '@/devtool/devtool-store'

export default function BookingPage() {
  const { data: service } = useAppLiveQuery(q => q.from(services), 'service-detail')
  const timeSlotsState = useDevToolStore(s => s.sectionStates['time-slots'])
  const { data: slots } = useAppLiveQuery(q => q.from(availability), 'time-slots')
  return <div />
}
`
    const result = analyzeHooks(source, 'src/pages/booking.tsx')
    expect(result.hooks).toHaveLength(2)
    expect(result.hooks.map(h => h.sectionId)).toContain('service-detail')
    expect(result.hooks.map(h => h.sectionId)).toContain('time-slots')
  })

  it('detects aliased imports', () => {
    const source = `
import { useAppLiveQuery as useLiveQuery } from '@/hooks/use-app-live-query'

export default function Page() {
  const { data } = useLiveQuery(q => q, 'my-section')
  return <div />
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks).toHaveLength(1)
    expect(result.hooks[0].importPath).toBe('@/hooks/use-app-live-query')
    expect(result.hooks[0].sectionId).toBe('my-section')
  })

  it('returns empty results for screens with no data hooks', () => {
    const source = `
import React from 'react'

export default function StaticPage() {
  return <div>Hello</div>
}
`
    const result = analyzeHooks(source, 'src/pages/static.tsx')
    expect(result.hooks).toHaveLength(0)
    expect(result.imports).toHaveLength(0)
  })
})
```

**Step 3: Run test to verify it fails**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts`
Expected: FAIL — `analyze-hooks.js` module not found

**Step 4: Implement analyze-hooks.ts**

Create `packages/cli/src/analyzer/analyze-hooks.ts`:

```typescript
import type { HookAnalysis, ImportAnalysis, HookAnalysisResult } from './types.js'

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
]

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
            const a = /(\w+)\s+as\s+(\w+)/.exec(t)
            return a ? a[1] : t
          })
          .filter(Boolean)

        // Don't add duplicates
        if (!imports.some((i) => i.path === importPath)) {
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

  // Step 2: Find data-fetching hook calls
  for (const [localName, info] of importMap) {
    const returnShape = DATA_HOOK_PATTERNS[info.originalName]
    if (!returnShape) continue

    // Find all calls to this hook
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
      })
    }

    // If hook was imported but no section ID detected, still record it
    if (foundSections.size === 0) {
      // Check if it's called at all
      const simpleCallRe = new RegExp(localName + String.raw`\s*\(`)
      if (simpleCallRe.test(source)) {
        hooks.push({
          hookName: info.originalName,
          importPath: info.importPath,
          returnShape,
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
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts`
Expected: All 7 tests PASS

**Step 6: Commit**

```bash
git add packages/cli/src/analyzer/types.ts packages/cli/src/analyzer/analyze-hooks.ts packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts
git commit -m "feat(cli): add hook analysis for module aliasing preview"
```

---

## Task 2: Generate mock hook stubs

**Files:**
- Create: `packages/cli/src/generator/generate-mock-hooks.ts`
- Create: `packages/cli/src/generator/__tests__/generate-mock-hooks.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/generator/__tests__/generate-mock-hooks.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateMockHook } from '../generate-mock-hooks.js'
import type { HookAnalysis } from '../../analyzer/types.js'

describe('generateMockHook', () => {
  it('generates mock for useAppLiveQuery', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useAppLiveQuery',
        importPath: '@/hooks/use-app-live-query',
        sectionId: 'service-grid',
        returnShape: 'data-loading-error',
      },
    ]

    const code = generateMockHook(hooks, '@/hooks/use-app-live-query')
    expect(code).toContain('useDevToolsStore')
    expect(code).toContain('export function useAppLiveQuery')
    expect(code).toContain('regionStates')
    expect(code).toContain('_loading')
    expect(code).toContain('_error')
  })

  it('generates mock for useQuery from react-query', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        returnShape: 'data-loading-error',
      },
    ]

    const code = generateMockHook(hooks, '@tanstack/react-query')
    expect(code).toContain('export function useQuery')
    expect(code).toContain('regionStates')
  })

  it('includes registerModels export', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useAppLiveQuery',
        importPath: '@/hooks/use-app-live-query',
        sectionId: 'service-grid',
        returnShape: 'data-loading-error',
      },
    ]

    const code = generateMockHook(hooks, '@/hooks/use-app-live-query')
    expect(code).toContain('export function registerModels')
  })

  it('preserves original function signature for useAppLiveQuery', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useAppLiveQuery',
        importPath: '@/hooks/use-app-live-query',
        sectionId: 'service-grid',
        returnShape: 'data-loading-error',
      },
    ]

    const code = generateMockHook(hooks, '@/hooks/use-app-live-query')
    // Must accept same params as the original
    expect(code).toContain('depsOrSectionId')
    expect(code).toContain('sectionId')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/generator/__tests__/generate-mock-hooks.test.ts`
Expected: FAIL — module not found

**Step 3: Implement generate-mock-hooks.ts**

Create `packages/cli/src/generator/generate-mock-hooks.ts`:

```typescript
import type { HookAnalysis } from '../analyzer/types.js'

/**
 * Generates a mock hook module that reads from @preview-tool/runtime's
 * regionStates instead of fetching real data.
 *
 * Each generated mock:
 * - Exports the same function name as the original hook
 * - Reads regionState from useDevToolsStore
 * - Looks up mock data from the model registry
 * - Returns { data, isLoading, isError } based on the active state
 */
export function generateMockHook(
  hooks: HookAnalysis[],
  importPath: string,
): string {
  const hookNames = [...new Set(hooks.map((h) => h.hookName))]
  const isAppLiveQuery = hookNames.some((n) =>
    n === 'useAppLiveQuery' || n === 'useLiveQuery'
  )
  const isReactQuery = importPath === '@tanstack/react-query'
  const isSWR = importPath === 'swr'

  const lines: string[] = [
    '// Auto-generated mock by @preview-tool/cli — do not edit manually',
    "import { useDevToolsStore } from '@preview-tool/runtime'",
    '',
    '// Model registry: sectionId → { stateName → stateData }',
    'let modelRegistry: Record<string, Record<string, unknown>> = {}',
    '',
    'export function registerModels(models: Record<string, Record<string, unknown>>) {',
    '  modelRegistry = { ...models }',
    '}',
    '',
    'function resolveState(sectionId: string | undefined) {',
    "  const regionState = useDevToolsStore((s) => sectionId ? (s.regionStates[sectionId] ?? 'populated') : 'populated')",
    '  const listCount = useDevToolsStore((s) => sectionId ? s.regionListCounts[sectionId] : undefined)',
    '  const stateData = sectionId ? (modelRegistry[sectionId]?.[regionState] ?? {}) : {}',
    '',
    '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
    '  const raw = stateData as Record<string, any>',
    "  if (raw._loading) return { data: undefined, isLoading: true, isError: false, isReady: false }",
    "  if (raw._error) return { data: undefined, isLoading: false, isError: true, isReady: false }",
    '',
    '  let data = raw.data',
    '  if (Array.isArray(data) && listCount !== undefined) {',
    '    data = data.slice(0, listCount)',
    '  }',
    '  return { data, isLoading: false, isError: false, isReady: true }',
    '}',
    '',
  ]

  if (isAppLiveQuery) {
    for (const hookName of hookNames) {
      lines.push(
        `// Mock replacement for ${hookName}`,
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
        `export function ${hookName}(`,
        '  _queryFn: any,',
        '  depsOrSectionId?: Array<unknown> | string,',
        '  sectionId?: string,',
        ') {',
        '  const resolvedId = typeof depsOrSectionId === \'string\' ? depsOrSectionId : sectionId',
        '  return resolveState(resolvedId)',
        '}',
        '',
      )
    }
  } else if (isReactQuery) {
    lines.push(
      '// Mock replacement for useQuery',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      'export function useQuery(options: any) {',
      '  const queryKey = Array.isArray(options?.queryKey) ? options.queryKey.join(\'-\') : undefined',
      '  return resolveState(queryKey)',
      '}',
      '',
      '// Pass-through for non-data hooks',
      'export function useMutation() { return { mutate: () => {}, mutateAsync: async () => {}, isPending: false } }',
      'export function useQueryClient() { return { invalidateQueries: () => {}, setQueryData: () => {} } }',
      'export function QueryClientProvider({ children }: { children: React.ReactNode }) { return children }',
      'export class QueryClient { constructor() {} }',
      '',
    )
  } else if (isSWR) {
    lines.push(
      '// Mock replacement for useSWR',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      'export default function useSWR(key: any) {',
      '  const sectionId = typeof key === \'string\' ? key : Array.isArray(key) ? key.join(\'-\') : undefined',
      '  const state = resolveState(sectionId)',
      '  return { ...state, error: state.isError ? new Error(\'Mock error\') : undefined, isValidating: false }',
      '}',
      '',
    )
  }

  // Re-export anything else the original module might export as no-ops
  lines.push('// Re-export types as empty to prevent import errors')
  lines.push('export type { }')

  return lines.join('\n')
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/generator/__tests__/generate-mock-hooks.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add packages/cli/src/generator/generate-mock-hooks.ts packages/cli/src/generator/__tests__/generate-mock-hooks.test.ts
git commit -m "feat(cli): add mock hook code generation for module aliasing"
```

---

## Task 3: Generate mock auth and devtool stores

**Files:**
- Create: `packages/cli/src/generator/generate-mock-stores.ts`
- Create: `packages/cli/src/generator/__tests__/generate-mock-stores.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/generator/__tests__/generate-mock-stores.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateMockAuthStore, generateMockDevToolStore } from '../generate-mock-stores.js'

describe('generateMockAuthStore', () => {
  it('generates a Zustand store with configurable mock user', () => {
    const code = generateMockAuthStore()
    expect(code).toContain('useAuthStore')
    expect(code).toContain('ADMIN')
    expect(code).toContain('CUSTOMER')
    expect(code).toContain('mock-token')
    expect(code).toContain('login')
    expect(code).toContain('logout')
    expect(code).toContain('initialize')
  })

  it('exports create for stores that re-export it', () => {
    const code = generateMockAuthStore()
    expect(code).toContain('export')
    expect(code).toContain('useAuthStore')
  })
})

describe('generateMockDevToolStore', () => {
  it('generates a no-op devtool store', () => {
    const code = generateMockDevToolStore()
    expect(code).toContain('useDevToolStore')
    expect(code).toContain('isTestMode')
    expect(code).toContain('setSectionState')
    expect(code).toContain('sectionStates')
  })
})
```

**Step 2: Run test — expect FAIL**

**Step 3: Implement generate-mock-stores.ts**

Create `packages/cli/src/generator/generate-mock-stores.ts`:

```typescript
/**
 * Generates a mock auth store that provides a pre-authenticated user.
 * This allows admin-protected screens to render without real authentication.
 */
export function generateMockAuthStore(): string {
  return `// Auto-generated mock by @preview-tool/cli — do not edit manually
import { create } from 'zustand'

const mockUsers = {
  customer: { id: 'mock-cust-1', email: 'alice@example.com', name: 'Alice Meyer', role: 'CUSTOMER' as const, createdAt: new Date().toISOString() },
  admin: { id: 'mock-admin-1', email: 'bob@example.com', name: 'Bob Admin', role: 'ADMIN' as const, createdAt: new Date().toISOString() },
}

// Default to admin so all screens (including admin pages) are accessible
export const useAuthStore = create(() => ({
  user: mockUsers.admin,
  token: 'mock-token-preview',
  isLoading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  fetchMe: async () => {},
  initialize: async () => {},
}))

export default useAuthStore
`
}

/**
 * Generates a no-op devtool store that satisfies imports without side effects.
 * The preview-tool's own inspector replaces the external app's devtool entirely.
 */
export function generateMockDevToolStore(): string {
  return `// Auto-generated mock by @preview-tool/cli — do not edit manually
import { create } from 'zustand'

export type MockState = 'loading' | 'error' | 'empty' | 'populated'

export const useDevToolStore = create(() => ({
  isTestMode: true,
  sectionStates: {} as Record<string, MockState>,
  isDrawerOpen: false,
  isCommentMode: false,
  setTestMode: () => {},
  setSectionState: () => {},
  setAllSections: () => {},
  setDrawerOpen: () => {},
  setCommentMode: () => {},
  reset: () => {},
}))

export default useDevToolStore

// Re-export types the original module might export
export const VALID_MOCK_STATES = ['loading', 'error', 'empty', 'populated']
export const allSections: unknown[] = []
export function findSectionById() { return undefined }
export function buildDefaultSectionStates() { return {} }
`
}
```

**Step 4: Run test — expect PASS**

**Step 5: Commit**

```bash
git add packages/cli/src/generator/generate-mock-stores.ts packages/cli/src/generator/__tests__/generate-mock-stores.test.ts
git commit -m "feat(cli): add mock auth and devtool store generation"
```

---

## Task 4: Integrate hook analysis into the generator pipeline

**Files:**
- Modify: `packages/cli/src/generator/index.ts` (lines 82-168)

**Step 1: Import new modules at top of generator/index.ts**

Add after line 11:

```typescript
import { analyzeHooks } from '../analyzer/analyze-hooks.js'
import { generateMockHook } from './generate-mock-hooks.js'
import { generateMockAuthStore, generateMockDevToolStore } from './generate-mock-stores.js'
import type { HookAnalysisResult, ImportAnalysis } from '../analyzer/types.js'
```

**Step 2: Add mock generation to the generateAll function**

After the screen processing loop (after line 158), add a new section that:
1. Collects all unique import paths that need mocking across all screens
2. Groups hooks by import path
3. Generates one mock file per import path
4. Generates auth/devtool store mocks if detected

Add before the `return` statement at line 160:

```typescript
  // Step 5: Generate mock modules for all detected hooks
  console.log(chalk.dim('\nGenerating mock modules...'))
  const mocksDir = join(previewDir, 'mocks')
  await mkdir(mocksDir, { recursive: true })

  // Collect all hook analyses across screens
  const allHookResults: HookAnalysisResult[] = []
  for (const screen of screens) {
    try {
      const source = await readFile(screen.filePath, 'utf-8')
      const hookResult = analyzeHooks(source, screen.filePath)
      allHookResults.push(hookResult)
    } catch {
      // Skip screens that can't be read
    }
  }

  // Group hooks by import path
  const hooksByImport = new Map<string, HookAnalysis[]>()
  const importsToMock = new Map<string, ImportAnalysis>()

  for (const result of allHookResults) {
    for (const hook of result.hooks) {
      const existing = hooksByImport.get(hook.importPath) ?? []
      existing.push(hook)
      hooksByImport.set(hook.importPath, existing)
    }
    for (const imp of result.imports) {
      if (imp.needsMocking && !importsToMock.has(imp.path)) {
        importsToMock.set(imp.path, imp)
      }
    }
  }

  // Generate mock hook files
  for (const [importPath, hooks] of hooksByImport) {
    const safeName = importPath
      .replace(/^@\//, '')
      .replace(/\//g, '--')
      .replace(/[^a-zA-Z0-9\-_]/g, '_')
    const mockCode = generateMockHook(hooks, importPath)
    await writeFile(join(mocksDir, `${safeName}.ts`), mockCode, 'utf-8')
    console.log(chalk.dim(`  Mock: ${importPath} → mocks/${safeName}.ts`))
  }

  // Generate mock stores
  const authImport = [...importsToMock.values()].find((i) => i.reason === 'auth-store')
  if (authImport) {
    await writeFile(join(mocksDir, 'auth-store.ts'), generateMockAuthStore(), 'utf-8')
    console.log(chalk.dim('  Mock: auth store'))
  }

  const devtoolImport = [...importsToMock.values()].find((i) => i.reason === 'devtool-store')
  if (devtoolImport) {
    await writeFile(join(mocksDir, 'devtool-store.ts'), generateMockDevToolStore(), 'utf-8')
    console.log(chalk.dim('  Mock: devtool store'))
  }
```

Also update the `GenerateResult` interface (line 27-34) to include mock counts:

```typescript
export interface GenerateResult {
  screensFound: number
  viewsGenerated: number
  modelsGenerated: number
  controllersGenerated: number
  adaptersGenerated: number
  overridesSkipped: number
  mocksGenerated: number
}
```

And update the return statement to include `mocksGenerated: hooksByImport.size + (authImport ? 1 : 0) + (devtoolImport ? 1 : 0)`.

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/cli build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/cli/src/generator/index.ts
git commit -m "feat(cli): integrate hook analysis into generator pipeline"
```

---

## Task 5: Add Vite alias generation for mock hooks

**Files:**
- Modify: `packages/cli/src/server/create-vite-config.ts` (lines 80-89)
- Modify: `packages/cli/src/generator/index.ts` — export collected alias data

**Step 1: Create alias manifest file during generation**

In `packages/cli/src/generator/index.ts`, after generating mock files, write an alias manifest:

```typescript
  // Write alias manifest for Vite config
  const aliasManifest: Record<string, string> = {}

  for (const [importPath, hooks] of hooksByImport) {
    const safeName = importPath
      .replace(/^@\//, '')
      .replace(/\//g, '--')
      .replace(/[^a-zA-Z0-9\-_]/g, '_')
    aliasManifest[importPath] = `./mocks/${safeName}.ts`
  }

  if (authImport) {
    aliasManifest[authImport.path] = './mocks/auth-store.ts'
  }
  if (devtoolImport) {
    aliasManifest[devtoolImport.path] = './mocks/devtool-store.ts'
  }

  await writeFile(
    join(previewDir, 'alias-manifest.json'),
    JSON.stringify(aliasManifest, null, 2),
    'utf-8'
  )
```

**Step 2: Read alias manifest in create-vite-config.ts**

Modify `packages/cli/src/server/create-vite-config.ts`. After line 68 (after `reactDomPath`), add:

```typescript
  // Load alias manifest for mock hook redirection
  const aliasManifestPath = join(previewDir, 'alias-manifest.json')
  let mockAliases: Record<string, string> = {}
  try {
    const { readFileSync } = await import('node:fs')
    if (readFileSync) {
      const raw = readFileSync(aliasManifestPath, 'utf-8')
      const manifest = JSON.parse(raw) as Record<string, string>
      // Resolve paths relative to preview dir
      for (const [importPath, mockPath] of Object.entries(manifest)) {
        mockAliases[importPath] = join(previewDir, mockPath)
      }
    }
  } catch {
    // No alias manifest — no mock hooks
  }
```

Then update the `alias` object (lines 81-89) to include mock aliases **before** the general `@/` alias (order matters — specific aliases must come first):

```typescript
    resolve: {
      alias: {
        // Mock hook aliases (must come before general @ alias)
        ...mockAliases,
        // React deduplication
        'react': reactPath,
        'react-dom': reactDomPath,
        // Runtime and host aliases
        '@preview-tool/runtime': join(runtimeRoot, 'src', 'index.ts'),
        '@host': join(cwd, 'src'),
        '@preview': previewDir,
        '@/': join(cwd, 'src') + '/',
        '@': join(cwd, 'src'),
      },
      dedupe: ['react', 'react-dom'],
    },
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/cli build`

**Step 4: Commit**

```bash
git add packages/cli/src/server/create-vite-config.ts packages/cli/src/generator/index.ts
git commit -m "feat(cli): add Vite alias generation for mock hooks"
```

---

## Task 6: Enhance model.ts to include mock data

**Files:**
- Modify: `packages/cli/src/generator/index.ts` (buildHeuristicModel, lines 290-377)
- Modify: `packages/cli/src/llm/prompts/generate-mc.ts`

**Step 1: Enhance heuristic model to embed mock data**

In `packages/cli/src/generator/index.ts`, modify the `buildHeuristicModel` function. The key change is that states should contain actual mock data instead of empty `{}`.

Replace the devtool config priority 1 section (lines 298-316) with:

```typescript
  // Priority 1: Use devtool config + existing mock data (most reliable)
  if (devToolConfig) {
    const pageDef = devToolConfig.pages.find((p) => p.route === screen.route)
    if (pageDef && pageDef.sections.length > 0) {
      // Try to import mock data from the app's mock directory
      const mockData = await tryLoadAppMocks(screen.filePath)

      for (const section of pageDef.sections) {
        const stateEntries: Record<string, Record<string, unknown>> = {}
        const collectionData = section.collection ? (mockData[section.collection] ?? []) : []

        for (const state of section.states) {
          if (state === 'loading') {
            stateEntries[state] = { _loading: true }
          } else if (state === 'error') {
            stateEntries[state] = { _error: true, message: `Failed to load ${section.label}` }
          } else if (state === 'empty') {
            stateEntries[state] = { data: [] }
          } else {
            // 'populated' — use real mock data if available
            stateEntries[state] = { data: collectionData }
          }
        }

        regions[section.id] = {
          label: section.label,
          component: 'Screen',
          componentPath: '',
          states: stateEntries,
          defaultState: section.states[0] ?? 'populated',
          ...(section.collection && collectionData.length > 0
            ? { isList: true, mockItems: collectionData, defaultCount: Math.min(3, collectionData.length) }
            : {}),
        }
      }
      return { regions }
    }
  }
```

Add a helper function to load existing mock data from the app:

```typescript
/**
 * Attempt to load mock data from the app's devtool/mocks directory.
 * Returns a map of collection name → mock data array.
 */
async function tryLoadAppMocks(screenFilePath: string): Promise<Record<string, unknown[]>> {
  const result: Record<string, unknown[]> = {}
  try {
    // Walk up from screen file to find src/devtool/mocks/ or similar
    const srcDir = screenFilePath.split('/src/')[0] + '/src'
    const mockDirs = [
      join(srcDir, 'devtool', 'mocks'),
      join(srcDir, '__mocks__'),
      join(srcDir, 'mocks'),
    ]

    for (const mockDir of mockDirs) {
      if (!existsSync(mockDir)) continue

      const files = await import('glob').then((m) => m.glob('*.{ts,tsx,js}', { cwd: mockDir }))
      for (const file of files) {
        const name = file.replace(/\.(ts|tsx|js)$/, '')
        try {
          const content = await readFile(join(mockDir, file), 'utf-8')
          // Extract exported arrays via regex (simple heuristic)
          const arrayMatch = /export\s+const\s+mock\w+\s*[=:][^[]*(\[[\s\S]*?\n\])/g
          let match: RegExpExecArray | null
          while ((match = arrayMatch.exec(content)) !== null) {
            try {
              // Count array items by counting opening braces at depth 1
              const arrayContent = match[1]
              const itemCount = (arrayContent.match(/\{\s*id:/g) ?? []).length
              if (itemCount > 0) {
                // We can't eval the TS, but we know the collection name
                result[name] = Array.from({ length: itemCount }, (_, i) => ({
                  id: `mock-${name}-${i + 1}`,
                  _placeholder: true,
                }))
              }
            } catch {
              // Skip unparseable mock data
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
      break // Use first found mock directory
    }
  } catch {
    // No mock data found — that's fine
  }
  return result
}
```

Also update Priority 2 (regex section IDs, lines 318-336) to include mock data in states:

```typescript
  // Priority 2: Extract section IDs from source code (regex fallback)
  const sectionIds = await extractSectionIds(screen.filePath)
  if (sectionIds.length > 0) {
    for (const sectionId of sectionIds) {
      regions[sectionId] = {
        label: formatLabel(sectionId),
        component: 'Screen',
        componentPath: '',
        states: {
          populated: { data: [{ id: 'mock-1' }, { id: 'mock-2' }, { id: 'mock-3' }] },
          loading: { _loading: true },
          empty: { data: [] },
          error: { _error: true, message: `Failed to load ${formatLabel(sectionId)}` },
        },
        defaultState: 'populated',
      }
    }
    return { regions }
  }
```

**Step 2: Update LLM prompt to request mock data in states**

Modify `packages/cli/src/llm/prompts/generate-mc.ts`, update the rules section (lines 75-87) to emphasize mock data in states:

Replace lines 75-87 with:

```
Rules:
- Create one region per meaningful UI component (tables, lists, forms, stat cards, etc.)
- Skip trivial elements (individual buttons, icons, labels) unless they have distinct states
- For list regions: mockItems must have at least 10 items, defaultCount = 3
- For triggers: use { selector: "button", text: "..." } format — NO data attributes
- Return ONLY the JSON object, no markdown wrapping

CRITICAL — State data format:
- Each state MUST contain actual mock data that the component would receive, wrapped in a "data" key
- "populated" state: { "data": [realistic items array] } or { "data": { realistic object } }
- "loading" state: { "_loading": true }
- "empty" state: { "data": [] }
- "error" state: { "_error": true, "message": "descriptive error message" }
- Mock data must be realistic and domain-appropriate with proper field types

Section ID Detection (for apps with DevToolStore integration):
- Look for patterns like \`useAppLiveQuery(query, 'sectionId')\` or \`useDevToolStore(s => s.sectionStates['sectionId'])\` in the source code
- If section IDs are found, use them as region keys (e.g., 'service-grid', 'login-form', 'time-slots') instead of generic names`
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/cli build`

**Step 4: Commit**

```bash
git add packages/cli/src/generator/index.ts packages/cli/src/llm/prompts/generate-mc.ts
git commit -m "feat(cli): enhance model.ts with mock data and update LLM prompt"
```

---

## Task 7: Update main.tsx template to register models with mock hooks

**Files:**
- Modify: `packages/cli/src/server/generate-entry.ts` (generateMainTsx, lines 107-177)

**Step 1: Update generateMainTsx to include model registration**

The generated `main.tsx` needs to:
1. Import mock hooks' `registerModels` functions
2. Pass region mock data from model.ts files to the mock hooks at boot time

Replace the `generateMainTsx` function (lines 107-177) with:

```typescript
function generateMainTsx(): string {
  return `// Auto-generated by @preview-tool/cli — do not edit manually
import React from 'react'
import { createRoot } from 'react-dom/client'
import { PreviewShell } from '@preview-tool/runtime'
import type { ScreenEntry } from '@preview-tool/runtime'
import { Wrapper } from './wrapper'
import './preview.css'

// Auto-discover from per-screen folders
const screenModules = import.meta.glob('./screens/*/adapter.ts')
const modelModules = import.meta.glob('./screens/*/model.ts', { eager: true }) as Record<
  string,
  { meta: { route: string }; regions: Record<string, unknown> }
>

// Auto-discover user overrides
const overrideModelModules = import.meta.glob('./overrides/*/model.ts', { eager: true }) as Record<
  string,
  { regions?: Record<string, unknown> }
>

// Auto-discover mock hook modules with registerModels
const mockModules = import.meta.glob('./mocks/*.ts', { eager: true }) as Record<
  string,
  { registerModels?: (models: Record<string, Record<string, unknown>>) => void }
>

/**
 * Merge override regions into the base model data.
 */
function mergeOverrides(
  base: { regions: Record<string, unknown> },
  override: { regions?: Record<string, unknown> } | undefined
): { regions: Record<string, unknown> } {
  if (!override) return base
  return {
    regions: { ...base.regions, ...(override.regions ?? {}) },
  }
}

// Build screen entries
const entries: ScreenEntry[] = []
const allRegions: Record<string, Record<string, unknown>> = {}

for (const [adapterPath, importFn] of Object.entries(screenModules)) {
  const parts = adapterPath.split('/')
  const folderName = parts[parts.length - 2] ?? ''
  const modelPath = \`./screens/\${folderName}/model.ts\`
  const overrideModelPath = \`./overrides/\${folderName}/model.ts\`

  const model = modelModules[modelPath]
  if (!model) continue

  const override = overrideModelModules[overrideModelPath]
  const merged = mergeOverrides(model, override)

  entries.push({
    route: model.meta.route,
    module: importFn as () => Promise<{ default: React.ComponentType<{ data: unknown; flags?: Record<string, boolean> }> }>,
    regions: merged.regions as ScreenEntry['regions'],
  })

  // Collect all region states for mock hook registration
  const regions = merged.regions as Record<string, { states?: Record<string, unknown> }>
  for (const [regionId, region] of Object.entries(regions)) {
    if (region.states) {
      allRegions[regionId] = region.states as Record<string, unknown>
    }
  }
}

// Register all region data with mock hooks so they can serve the right mock data
for (const mod of Object.values(mockModules)) {
  if (typeof mod.registerModels === 'function') {
    mod.registerModels(allRegions)
  }
}

// Render
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <Wrapper>
        <PreviewShell screens={entries} />
      </Wrapper>
    </React.StrictMode>
  )
}
`
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/cli build`

**Step 3: Commit**

```bash
git add packages/cli/src/server/generate-entry.ts
git commit -m "feat(cli): update main.tsx template to register models with mock hooks"
```

---

## Task 8: Simplify wrapper.tsx generation (remove state bridge)

**Files:**
- Modify: `packages/cli/src/resolver/generate-wrapper.ts` (lines 44-103)
- Modify: `packages/cli/src/commands/preview.ts` (lines 79, 81-92)

**Step 1: Remove devToolStorePath parameter from generateWrapperCode**

In `packages/cli/src/resolver/generate-wrapper.ts`, simplify `generateWrapperCode`:

- Remove the `devToolStorePath` parameter (line 46)
- Remove bridge hook logic (lines 49, 56-59, 67-68)
- Remove the `buildBridgeHook` function (lines 105-152)

The simplified function signature:

```typescript
export function generateWrapperCode(providers: string[]): string {
```

**Step 2: Update preview.ts to not pass devToolStorePath**

In `packages/cli/src/commands/preview.ts`:
- Line 79: Change `generateWrapperCode(framework.providers, framework.devToolStorePath)` to `generateWrapperCode(framework.providers)`
- Lines 81-92: Remove the entire `else if (framework.devToolStorePath)` block that updates the wrapper with bridge code
- Line 88: Same change for the second call

**Step 3: Update generate-wrapper.test.ts**

Remove tests related to the bridge hook. Update remaining tests to not pass `devToolStorePath`.

**Step 4: Verify TypeScript compiles and tests pass**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/cli build`
Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/resolver/__tests__/generate-wrapper.test.ts`

**Step 5: Commit**

```bash
git add packages/cli/src/resolver/generate-wrapper.ts packages/cli/src/commands/preview.ts packages/cli/src/resolver/__tests__/generate-wrapper.test.ts
git commit -m "refactor(cli): remove state bridge from wrapper, use module aliasing instead"
```

---

## Task 9: Integration test with booking app

**Files:**
- Modify: `packages/cli/src/__tests__/integration/booking-app.test.ts`

**Step 1: Add integration test for mock generation**

Add new test cases to the existing booking app integration test:

```typescript
describe('mock hook generation', () => {
  it('generates mock for useAppLiveQuery', async () => {
    const result = await generateAll(BOOKING_CWD, config, framework.devToolConfig)

    const mocksDir = join(BOOKING_CWD, '.preview', 'mocks')
    expect(existsSync(mocksDir)).toBe(true)

    // Should have generated a mock for the data hook
    const mockFiles = readdirSync(mocksDir)
    expect(mockFiles.length).toBeGreaterThan(0)

    // Check mock contains useDevToolsStore import
    const hookMock = readFileSync(join(mocksDir, mockFiles[0]), 'utf-8')
    expect(hookMock).toContain('useDevToolsStore')
    expect(hookMock).toContain('registerModels')
  })

  it('generates alias manifest', async () => {
    await generateAll(BOOKING_CWD, config, framework.devToolConfig)

    const manifestPath = join(BOOKING_CWD, '.preview', 'alias-manifest.json')
    expect(existsSync(manifestPath)).toBe(true)

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    expect(Object.keys(manifest).length).toBeGreaterThan(0)
  })

  it('model.ts states contain mock data', async () => {
    await generateAll(BOOKING_CWD, config, framework.devToolConfig)

    const modelPath = join(BOOKING_CWD, '.preview', 'screens', 'root', 'model.ts')
    if (existsSync(modelPath)) {
      const content = readFileSync(modelPath, 'utf-8')
      // States should no longer be empty {}
      expect(content).toContain('_loading')
      expect(content).toContain('_error')
    }
  })
})
```

**Step 2: Run integration test**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/__tests__/integration/booking-app.test.ts`
Expected: Tests pass (or skip if booking app not present)

**Step 3: Commit**

```bash
git add packages/cli/src/__tests__/integration/booking-app.test.ts
git commit -m "test(cli): add integration tests for mock hook generation"
```

---

## Task 10: Manual end-to-end verification

**Step 1: Build the CLI**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/cli build
```

**Step 2: Clean previous .preview/ and regenerate**

```bash
rm -rf ~/Desktop/booking/client/.preview
cd /Users/loclam/Desktop/preview-tool && node packages/cli/dist/index.js preview ~/Desktop/booking/client --no-llm
```

**Step 3: Verify generated files**

Check that:
- `.preview/mocks/` directory exists with mock hook files
- `.preview/alias-manifest.json` exists with correct mappings
- `.preview/screens/*/model.ts` states contain `_loading`, `_error`, `data` fields
- `.preview/wrapper.tsx` has NO `useStateBridge` (simplified)
- `.preview/main.tsx` has `registerModels` calls

**Step 4: Open browser and test state switching**

1. Navigate to a screen (e.g., Home / service-grid)
2. Click "loading" in the inspector → center panel should show loading state
3. Click "error" → center panel should show error state
4. Click "empty" → center panel should show empty state
5. Click "populated" → center panel should show populated data

**Step 5: Document any issues found**

If state switching still doesn't work, debug:
1. Check browser console for import errors
2. Verify Vite aliases are resolving correctly (check network tab)
3. Confirm mock hook is receiving regionState changes

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(cli): complete module aliasing preview implementation"
```

---

## Summary

| Task | Description | Files | Est. Complexity |
|------|-------------|-------|----------------|
| 1 | Hook analysis types + module | 3 new files | Medium |
| 2 | Mock hook code generation | 2 new files | Medium |
| 3 | Mock auth/devtool stores | 2 new files | Low |
| 4 | Integrate into generator pipeline | 1 modified | Medium |
| 5 | Vite alias generation | 2 modified | Medium |
| 6 | Model.ts with mock data | 2 modified | Medium |
| 7 | main.tsx model registration | 1 modified | Low |
| 8 | Remove state bridge | 3 modified | Low |
| 9 | Integration tests | 1 modified | Low |
| 10 | Manual E2E verification | 0 files | Manual |

**Dependencies:** Tasks 1-3 are independent and can run in parallel. Task 4 depends on 1-3. Task 5 depends on 4. Tasks 6-7 depend on 4. Task 8 is independent. Task 9 depends on 4-7. Task 10 depends on all.

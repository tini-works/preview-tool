# Region State Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make inspector panel state changes actually affect rendered screens by wiring region states to mock hooks via a per-screen adapter and React context.

**Architecture:** Three coordinated changes: (1) Add `hookMapping` to region types so each region knows which hook feeds it, (2) Generate adapter wrappers per screen that provide a `RegionDataContext`, (3) Mock hooks read from that context to resolve the correct region data. See `docs/plans/2026-03-02-region-state-adapter-design.md` for full design.

**Tech Stack:** TypeScript, React (context API), Zustand, Zod, ts-morph (AST analysis)

---

## Phase 1: Runtime — Types & Context Foundation

### Task 1: Add HookMapping and RegionData types

**Files:**
- Modify: `packages/runtime/src/types.ts`

**Step 1: Add HookMapping interface after RegionDefinition**

Add these types to `packages/runtime/src/types.ts` after the `RegionDefinition` interface (after line 18):

```typescript
export interface HookMapping {
  type: 'query-hook' | 'custom-hook' | 'store' | 'context' | 'prop' | 'local-state' | 'unknown'
  hookName: string
  identifier: string
  importPath: string
}

export interface RegionDataEntry {
  activeState: string
  stateData: Record<string, unknown>
}

export type RegionDataMap = Record<string, RegionDataEntry>
```

**Step 2: Add hookMapping to RegionDefinition**

Add `hookMapping?: HookMapping` to the existing `RegionDefinition` interface.

**Step 3: Update ScreenModule component type**

Change the `ScreenModule` interface's `default` type from:
```typescript
default: ComponentType<{ data: unknown; flags?: Record<string, boolean> }>
```
to:
```typescript
default: ComponentType<{ regionData?: RegionDataMap; flags?: Record<string, boolean> }>
```

**Step 4: Verify build**

Run: `cd packages/runtime && npx tsc --noEmit`
Expected: May have errors in ScreenRenderer — that's fine, we fix it in Task 3.

**Step 5: Commit**

```bash
git add packages/runtime/src/types.ts
git commit -m "feat(runtime): add HookMapping and RegionData types"
```

---

### Task 2: Create RegionDataContext

**Files:**
- Create: `packages/runtime/src/RegionDataContext.tsx`

**Step 1: Create the context, provider, and hook**

Create `packages/runtime/src/RegionDataContext.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react'
import type { RegionsMap, RegionDataMap, HookMapping } from './types.ts'

interface RegionDataContextValue {
  regions: RegionsMap
  regionData: RegionDataMap
}

const RegionDataContext = createContext<RegionDataContextValue | null>(null)

interface RegionDataProviderProps {
  regions: RegionsMap
  regionData: RegionDataMap
  children: ReactNode
}

export function RegionDataProvider({ regions, regionData, children }: RegionDataProviderProps) {
  return (
    <RegionDataContext.Provider value={{ regions, regionData }}>
      {children}
    </RegionDataContext.Provider>
  )
}

/**
 * Resolve region data for a mock hook call.
 *
 * Mock hooks call this with their hook type and identifier (e.g., queryKey).
 * It searches all regions for a matching hookMapping and returns the
 * current state data for that region.
 *
 * @param hookType - The type of hook: 'query-hook', 'custom-hook', 'store', etc.
 * @param identifier - Hook-specific identifier: queryKey array, sectionId string, etc.
 * @returns The resolved state data or null if no matching region found.
 */
export function useRegionDataForHook(hookType: string, identifier: unknown): Record<string, unknown> | null {
  const ctx = useContext(RegionDataContext)
  if (!ctx) return null

  const { regions, regionData } = ctx

  for (const [regionKey, region] of Object.entries(regions)) {
    const mapping = region.hookMapping as HookMapping | undefined
    if (!mapping) continue

    if (matchesHook(mapping, hookType, identifier)) {
      return (regionData[regionKey]?.stateData as Record<string, unknown>) ?? null
    }
  }

  // Fallback: try matching by region key directly (for hooks that pass sectionId = regionKey)
  if (typeof identifier === 'string' && regionData[identifier]) {
    return (regionData[identifier].stateData as Record<string, unknown>) ?? null
  }

  return null
}

function matchesHook(mapping: HookMapping, hookType: string, identifier: unknown): boolean {
  // query-hook: match by queryKey prefix
  if (hookType === 'query-hook' && mapping.type === 'query-hook') {
    if (Array.isArray(identifier)) {
      const first = String(identifier[0] ?? '')
      return first === mapping.identifier || first.startsWith(mapping.identifier)
    }
    if (typeof identifier === 'string') {
      return identifier === mapping.identifier || identifier.startsWith(mapping.identifier)
    }
  }

  // custom-hook: match by sectionId
  if (hookType === 'custom-hook' && mapping.type === 'custom-hook') {
    return identifier === mapping.identifier
  }

  // store: match by store/selector identifier
  if (hookType === 'store' && mapping.type === 'store') {
    return identifier === mapping.identifier
  }

  // context: match by context name
  if (hookType === 'context' && mapping.type === 'context') {
    return identifier === mapping.identifier
  }

  // unknown: always match if types align
  if (mapping.type === 'unknown') {
    return typeof identifier === 'string' && identifier === mapping.identifier
  }

  return false
}
```

**Step 2: Verify build**

Run: `cd packages/runtime && npx tsc --noEmit`
Expected: PASS (new file, no dependents yet)

**Step 3: Commit**

```bash
git add packages/runtime/src/RegionDataContext.tsx
git commit -m "feat(runtime): create RegionDataContext with provider and hook resolver"
```

---

### Task 3: Update ScreenRenderer to pass regionData

**Files:**
- Modify: `packages/runtime/src/ScreenRenderer.tsx`

**Step 1: Add computeRegionData function**

Add this function after the existing `assembleRegionData` function (keep `assembleRegionData` for backward compat):

```typescript
import type { ScreenModule, RegionsMap, FlagDefinition, RegionDataMap } from './types.ts'

export function computeRegionData(
  regions: RegionsMap,
  regionStates: Record<string, string>,
  regionListCounts: Record<string, number>
): RegionDataMap {
  const result: RegionDataMap = {}

  for (const [key, region] of Object.entries(regions)) {
    const activeState = regionStates[key] ?? region.defaultState
    let stateData = { ...(region.states[activeState] ?? region.states[region.defaultState] ?? {}) }

    if (region.isList && region.mockItems) {
      const listField = Object.keys(stateData).find((k) => Array.isArray(stateData[k]))
      if (listField) {
        const count = regionListCounts[key] ?? region.defaultCount ?? region.mockItems.length
        stateData = { ...stateData, [listField]: region.mockItems.slice(0, count) }
      }
    }

    result[key] = { activeState, stateData }
  }

  return result
}
```

**Step 2: Update ScreenRenderer component to pass regionData**

Change the render section from:
```typescript
const data = regions
  ? assembleRegionData(regions, regionStates, regionListCounts)
  : {}

return (
  <NetworkSimulationLayer key={route}>
    <div style={{ zoom: fontScale }} className="h-full">
      <ScreenErrorBoundary key={route}>
        <FlowProvider>
          <Component data={data} flags={resolvedFlags} />
        </FlowProvider>
      </ScreenErrorBoundary>
    </div>
  </NetworkSimulationLayer>
)
```

to:
```typescript
const regionData = regions
  ? computeRegionData(regions, regionStates, regionListCounts)
  : {}

return (
  <NetworkSimulationLayer key={route}>
    <div style={{ zoom: fontScale }} className="h-full">
      <ScreenErrorBoundary key={route}>
        <FlowProvider>
          <Component regionData={regionData} flags={resolvedFlags} />
        </FlowProvider>
      </ScreenErrorBoundary>
    </div>
  </NetworkSimulationLayer>
)
```

**Step 3: Update LoadedScreen type**

Change:
```typescript
Component: ComponentType<{ data: unknown; flags?: Record<string, boolean> }>
```
to:
```typescript
Component: ComponentType<{ regionData?: RegionDataMap; flags?: Record<string, boolean> }>
```

**Step 4: Verify build**

Run: `cd packages/runtime && npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/ScreenRenderer.tsx
git commit -m "feat(runtime): pass per-region data instead of flat merge to screen components"
```

---

### Task 4: Export new types and context from runtime index

**Files:**
- Modify: `packages/runtime/src/index.ts`

**Step 1: Add exports**

Add these lines to `packages/runtime/src/index.ts`:

```typescript
export { RegionDataProvider, useRegionDataForHook } from './RegionDataContext.tsx'
export { computeRegionData } from './ScreenRenderer.tsx'
export type { HookMapping, RegionDataEntry, RegionDataMap } from './types.ts'
```

**Step 2: Verify build**

Run: `cd packages/runtime && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/runtime/src/index.ts
git commit -m "feat(runtime): export RegionDataProvider, useRegionDataForHook, and new types"
```

---

## Phase 2: CLI — Analyzer Enhancement

### Task 5: Add hookMapping to HookAnalysis type

**Files:**
- Modify: `packages/cli/src/analyzer/types.ts`

**Step 1: Add HookMappingType union**

Add after line 119 (after `// === Hook Analysis` section header):

```typescript
export type HookMappingType = 'query-hook' | 'custom-hook' | 'store' | 'context' | 'prop' | 'local-state' | 'unknown'
```

**Step 2: Add hookMappingType to HookAnalysis**

Add to the `HookAnalysis` interface:
```typescript
/** Mapping type for the region data context */
hookMappingType?: HookMappingType
```

**Step 3: Add hookMapping to ComponentRegion**

Add to the `ComponentRegion` interface (line 64-73):
```typescript
hookMapping?: {
  type: HookMappingType
  hookName: string
  identifier: string
  importPath: string
}
```

And also add `hookMapping` to the base `AnalyzedRegion` interface.

**Step 4: Verify build**

Run: `cd packages/cli && npx tsc --noEmit`
Expected: PASS (additive changes only)

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/types.ts
git commit -m "feat(cli): add hookMapping types to HookAnalysis and ComponentRegion"
```

---

### Task 6: Enhance analyze-hooks to detect hookMapping info

**Files:**
- Modify: `packages/cli/src/analyzer/analyze-hooks.ts`
- Test: `packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts`

**Step 1: Write failing tests**

Add to `analyze-hooks.test.ts`:

```typescript
it('detects hookMappingType for useQuery as query-hook', () => {
  const source = `
import { useQuery } from '@tanstack/react-query'

export default function Page() {
  const { data } = useQuery({
    queryKey: ['services'],
    queryFn: () => fetch('/api/services'),
  })
  return <div>{data}</div>
}
`
  const result = analyzeHooks(source, 'src/pages/page.tsx')
  expect(result.hooks[0].hookMappingType).toBe('query-hook')
})

it('detects hookMappingType for useAppLiveQuery as custom-hook', () => {
  const source = `
import { useAppLiveQuery } from '@/hooks/use-app-live-query'

export default function Page() {
  const { data } = useAppLiveQuery(q => q.from(services), 'service-grid')
  return <div>{data}</div>
}
`
  const result = analyzeHooks(source, 'src/pages/page.tsx')
  expect(result.hooks[0].hookMappingType).toBe('custom-hook')
})

it('detects hookMappingType for useSWR as query-hook', () => {
  const source = `
import useSWR from 'swr'

export default function Page() {
  const { data } = useSWR('/api/users')
  return <div>{data}</div>
}
`
  const result = analyzeHooks(source, 'src/pages/page.tsx')
  expect(result.hooks[0].hookMappingType).toBe('query-hook')
})
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/analyze-hooks.test.ts`
Expected: FAIL — `hookMappingType` is undefined

**Step 3: Update analyze-hooks.ts to detect hookMappingType**

In the `analyzeHooks` function, where hooks are pushed, add `hookMappingType`:

For `useAppLiveQuery`/`useLiveQuery` hooks: set `hookMappingType: 'custom-hook'`
For `useQuery` hooks: set `hookMappingType: 'query-hook'`
For `useSWR` hooks: set `hookMappingType: 'query-hook'`
For `useFetch` hooks: set `hookMappingType: 'query-hook'`

In the code where hooks are pushed (inside the `for` loop around line 72-85 of analyze-hooks.ts), add the mapping type:

```typescript
const hookMappingType = getHookMappingType(info.originalName)

hooks.push({
  hookName: info.originalName,
  importPath: info.importPath,
  sectionId,
  returnShape,
  hookMappingType,
})
```

Add helper function:
```typescript
function getHookMappingType(hookName: string): HookMappingType {
  if (hookName === 'useAppLiveQuery' || hookName === 'useLiveQuery') return 'custom-hook'
  if (hookName === 'useQuery' || hookName === 'useSWR' || hookName === 'useFetch') return 'query-hook'
  return 'unknown'
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/analyze-hooks.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/analyze-hooks.ts packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts
git commit -m "feat(cli): detect hookMappingType in hook analysis"
```

---

## Phase 3: CLI — Model Generation with hookMapping

### Task 7: Update ModelOutputSchema to include hookMapping

**Files:**
- Modify: `packages/cli/src/llm/schemas/model.ts`

**Step 1: Add HookMappingSchema**

```typescript
const HookMappingSchema = z.object({
  type: z.enum(['query-hook', 'custom-hook', 'store', 'context', 'prop', 'local-state', 'unknown']),
  hookName: z.string(),
  identifier: z.string(),
  importPath: z.string(),
}).optional()
```

**Step 2: Add to ComponentRegionSchema**

Add `hookMapping: HookMappingSchema` to the `ComponentRegionSchema` z.object.

**Step 3: Verify build**

Run: `cd packages/cli && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/llm/schemas/model.ts
git commit -m "feat(cli): add hookMapping to model schema"
```

---

### Task 8: Update heuristic model builder to include hookMapping

**Files:**
- Modify: `packages/cli/src/generator/index.ts`

**Step 1: Update buildHeuristicModel to include hookMapping from hook analysis**

The `buildHeuristicModel` function currently builds regions from sectionIds, viewTree dataProps, or legacy analysis. We need to enrich regions with hookMapping data.

First, change the function signature to accept hook results:

```typescript
async function buildHeuristicModel(
  screen: DiscoveredScreen,
  viewTree: ViewTree | null,
  devToolConfig?: DevToolConfig | null,
  hookResults?: HookAnalysisResult,
): Promise<ModelOutput> {
```

Then, after building regions (before `return { regions }`), enrich them with hookMapping:

```typescript
// Enrich regions with hookMapping from hook analysis
if (hookResults) {
  for (const hook of hookResults.hooks) {
    // If hook has a sectionId that matches a region key, add hookMapping
    if (hook.sectionId && regions[hook.sectionId]) {
      regions[hook.sectionId] = {
        ...regions[hook.sectionId],
        hookMapping: {
          type: hook.hookMappingType ?? 'unknown',
          hookName: hook.hookName,
          identifier: hook.sectionId,
          importPath: hook.importPath,
        },
      }
    }
  }
}
```

**Step 2: Pass hook results to buildHeuristicModel from the main loop**

In the `generateAll` function, where `buildHeuristicModel` is called, pass the hook results. The hook analysis already happens in Phase 5 (mock module generation), so move hook analysis earlier, or reuse it:

In the Phase 3 per-screen loop, look up the screen's hook result:

```typescript
// Find hook analysis for this screen
const screenHookResult = allHookResults.find((_, idx) => screens[idx]?.filePath === screen.filePath)

const model = llmResult.model ?? await buildHeuristicModel(screen, viewTree, devToolConfig, screenHookResult)
```

Note: This requires moving hook analysis (currently in Step 5) to before Phase 3. Restructure: collect hook results per screen in Phase 1 alongside viewTree analysis, store them in `screenData`.

Add to screenData type:
```typescript
hookResult: HookAnalysisResult | null
```

In Phase 1 loop:
```typescript
let hookResult: HookAnalysisResult | null = null
try {
  const source = await readFile(screen.filePath, 'utf-8')
  hookResult = analyzeHooks(source, screen.filePath)
} catch {
  // Skip
}
screenData.push({ screen, safeName, screenOutDir, overrideScreenDir, viewTree, hookResult })
```

Then remove the duplicate hook analysis in Step 5 (use `screenData` instead).

**Step 3: Verify build**

Run: `cd packages/cli && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/generator/index.ts
git commit -m "feat(cli): enrich heuristic model regions with hookMapping from analysis"
```

---

## Phase 4: CLI — Adapter Wrapper Generation

### Task 9: Generate adapter as a real React wrapper component

**Files:**
- Modify: `packages/cli/src/generator/index.ts` (the `buildAdapterContent` function)

**Step 1: Update buildAdapterContent**

Replace the existing `buildAdapterContent` function with a version that generates a real wrapper component:

```typescript
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
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/cli/src/generator/index.ts
git commit -m "feat(cli): generate adapter as React wrapper with RegionDataProvider"
```

---

### Task 10: Update main.tsx entry point

**Files:**
- Modify: `packages/cli/src/server/generate-entry.ts`

**Step 1: Update generateMainTsx**

The generated main.tsx needs two changes:
1. Update the `ScreenEntry` module type to expect `regionData` instead of `data`
2. Keep `registerModels` for backward compat but it's no longer the primary mechanism

Update the `module` type cast in the `entries.push` call from:
```typescript
module: importFn as () => Promise<{ default: React.ComponentType<{ data: unknown; flags?: Record<string, boolean> }> }>,
```
to:
```typescript
module: importFn as () => Promise<{ default: React.ComponentType<{ regionData?: Record<string, { activeState: string; stateData: unknown }>; flags?: Record<string, boolean> }> }>,
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/cli/src/server/generate-entry.ts
git commit -m "feat(cli): update main.tsx entry to use regionData prop type"
```

---

## Phase 5: CLI — Mock Hook Enhancement

### Task 11: Update mock hook generation to use useRegionDataForHook

**Files:**
- Modify: `packages/cli/src/generator/generate-mock-hooks.ts`
- Test: `packages/cli/src/generator/__tests__/generate-mock-hooks.test.ts`

**Step 1: Write failing tests**

Add to `generate-mock-hooks.test.ts`:

```typescript
it('generates mock that imports useRegionDataForHook from runtime', () => {
  const hooks: HookAnalysis[] = [
    {
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      returnShape: 'data-loading-error',
      hookMappingType: 'query-hook',
    },
  ]

  const code = generateMockHook(hooks, '@tanstack/react-query')
  expect(code).toContain('useRegionDataForHook')
  expect(code).toContain("from '@preview-tool/runtime'")
})

it('generates useQuery mock that calls useRegionDataForHook with query-hook type', () => {
  const hooks: HookAnalysis[] = [
    {
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      returnShape: 'data-loading-error',
      hookMappingType: 'query-hook',
    },
  ]

  const code = generateMockHook(hooks, '@tanstack/react-query')
  expect(code).toContain("useRegionDataForHook('query-hook'")
})

it('generates useAppLiveQuery mock that calls useRegionDataForHook with custom-hook type', () => {
  const hooks: HookAnalysis[] = [
    {
      hookName: 'useAppLiveQuery',
      importPath: '@/hooks/use-app-live-query',
      sectionId: 'service-grid',
      returnShape: 'data-loading-error',
      hookMappingType: 'custom-hook',
    },
  ]

  const code = generateMockHook(hooks, '@/hooks/use-app-live-query')
  expect(code).toContain("useRegionDataForHook('custom-hook'")
})
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-mock-hooks.test.ts`
Expected: FAIL

**Step 3: Rewrite generateMockHook to use useRegionDataForHook**

Replace the content of `generate-mock-hooks.ts`:

```typescript
import type { HookAnalysis } from '../analyzer/types.js'

/**
 * Generates a mock hook module that reads from @preview-tool/runtime's
 * RegionDataContext via useRegionDataForHook.
 *
 * Each generated mock:
 * - Exports the same function name as the original hook
 * - Calls useRegionDataForHook to resolve region data
 * - Falls back to modelRegistry for backward compatibility
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
    "import { useDevToolsStore, useRegionDataForHook } from '@preview-tool/runtime'",
    '',
    '// Model registry (backward compat): sectionId → { stateName → stateData }',
    'let modelRegistry: Record<string, Record<string, unknown>> = {}',
    '',
    'export function registerModels(models: Record<string, Record<string, unknown>>) {',
    '  modelRegistry = { ...models }',
    '}',
    '',
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    'function resolveFromState(stateData: Record<string, any>) {',
    "  if (stateData._loading) return { data: undefined, isLoading: true, isError: false, isReady: false }",
    "  if (stateData._error) return { data: undefined, isLoading: false, isError: true, isReady: false, error: stateData.message }",
    '  return { data: stateData.data ?? stateData, isLoading: false, isError: false, isReady: true }',
    '}',
    '',
    'function resolveFallback(sectionId: string | undefined) {',
    "  const regionState = useDevToolsStore((s) => sectionId ? (s.regionStates[sectionId] ?? 'populated') : 'populated')",
    '  const listCount = useDevToolsStore((s) => sectionId ? s.regionListCounts[sectionId] : undefined)',
    '  const stateData = sectionId ? (modelRegistry[sectionId]?.[regionState] ?? {}) : {}',
    '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
    '  const result = resolveFromState(stateData as Record<string, any>)',
    '  if (Array.isArray(result.data) && listCount !== undefined) {',
    '    return { ...result, data: result.data.slice(0, listCount) }',
    '  }',
    '  return result',
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
        '',
        '  // Primary: resolve via RegionDataContext + hookMapping',
        "  const contextData = useRegionDataForHook('custom-hook', resolvedId)",
        '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
        '  if (contextData) return resolveFromState(contextData as Record<string, any>)',
        '',
        '  // Fallback: resolve via modelRegistry',
        '  return resolveFallback(resolvedId)',
        '}',
        '',
      )
    }
  } else if (isReactQuery) {
    lines.push(
      '// Mock replacement for useQuery',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      'export function useQuery(options: any) {',
      '  const queryKey = Array.isArray(options?.queryKey) ? options.queryKey : []',
      '',
      '  // Primary: resolve via RegionDataContext + hookMapping',
      "  const contextData = useRegionDataForHook('query-hook', queryKey)",
      '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
      '  if (contextData) return resolveFromState(contextData as Record<string, any>)',
      '',
      '  // Fallback: resolve via modelRegistry using joined key',
      "  const sectionId = queryKey.length > 0 ? queryKey.join('-') : undefined",
      '  return resolveFallback(sectionId)',
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
      '  const keyStr = typeof key === \'string\' ? key : Array.isArray(key) ? key.join(\'-\') : undefined',
      '  const keyArr = typeof key === \'string\' ? [key] : Array.isArray(key) ? key : []',
      '',
      '  // Primary: resolve via RegionDataContext + hookMapping',
      "  const contextData = useRegionDataForHook('query-hook', keyArr)",
      '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
      '  if (contextData) { const s = resolveFromState(contextData as Record<string, any>); return { ...s, error: s.isError ? new Error(\'Mock error\') : undefined, isValidating: false } }',
      '',
      '  // Fallback: resolve via modelRegistry',
      '  const state = resolveFallback(keyStr)',
      '  return { ...state, error: state.isError ? new Error(\'Mock error\') : undefined, isValidating: false }',
      '}',
      '',
    )
  }

  // Catch-all for generic hooks (not useAppLiveQuery, not react-query, not SWR)
  if (!isAppLiveQuery && !isReactQuery && !isSWR) {
    for (const hookName of hookNames) {
      lines.push(
        `// Mock replacement for ${hookName}`,
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
        `export function ${hookName}(...args: any[]) {`,
        '  // Try to find a string identifier in arguments',
        '  const sectionId = args.find((a): a is string => typeof a === \'string\')',
        '',
        '  // Primary: resolve via RegionDataContext',
        "  const contextData = useRegionDataForHook('unknown', sectionId)",
        '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
        '  if (contextData) return resolveFromState(contextData as Record<string, any>)',
        '',
        '  // Fallback: resolve via modelRegistry',
        '  return resolveFallback(sectionId)',
        '}',
        '',
      )
    }
  }

  lines.push('// Re-export types as empty to prevent import errors')
  lines.push('export type { }')

  return lines.join('\n')
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-mock-hooks.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/generator/generate-mock-hooks.ts packages/cli/src/generator/__tests__/generate-mock-hooks.test.ts
git commit -m "feat(cli): mock hooks use useRegionDataForHook with modelRegistry fallback"
```

---

## Phase 6: Integration Testing

### Task 12: Build and verify end-to-end

**Files:**
- No new files

**Step 1: Build the full project**

Run: `pnpm build`
Expected: PASS — CLI and runtime compile without errors

**Step 2: Run all unit tests**

Run: `cd packages/cli && npx vitest run`
Expected: PASS

**Step 3: Run integration test against sample-app**

Run: `pnpm test`
Expected: PASS — generates preview files with new adapter format

**Step 4: Verify generated adapter is a wrapper component**

After running `pnpm test`, inspect a generated adapter file:

Run: Check that `.preview/screens/*/adapter.ts` contains `RegionDataProvider` and `function Adapter`

**Step 5: Commit any fixes**

If any tests needed adjustments, commit fixes.

---

### Task 13: Regenerate booking app preview and verify

**Files:**
- No source changes (just running the tool)

**Step 1: Regenerate the booking app's preview**

Run: `cd /Users/loclam/Desktop/booking/client && npx preview generate`
Expected: Generates new adapter wrappers with RegionDataProvider

**Step 2: Start preview dev server**

Run: `cd /Users/loclam/Desktop/booking/client && npx preview dev`
Expected: Dev server starts without errors

**Step 3: Manual verification**

1. Open the preview in browser
2. Select the "register" screen
3. In the inspector panel, change "register-form" region from "populated" to "loading"
4. Verify the screen changes to show loading state
5. Change to "error" — verify error UI appears
6. Select "booking" screen — verify "time-slots" region state changes work

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: wire inspector region states to screen rendering via adapter context"
```

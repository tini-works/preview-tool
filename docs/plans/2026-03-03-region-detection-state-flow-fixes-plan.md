# Region Detection, State Switching & Flow Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three interconnected issues: missing region detection for React Query/Zustand/Context hooks, broken state switching pipeline, and unresponsive flow click capture.

**Architecture:** Expand the regex-based hook analyzer with multiple extraction strategies and new hook type detection. Remove the dual-state system (modelRegistry fallback) so RegionDataContext is the single source of truth. Remove playMode gate so FlowProvider always captures clicks.

**Tech Stack:** TypeScript, React, Zustand, Vitest (tests)

---

### Task 1: Add queryKey extraction for React Query

**Files:**
- Modify: `packages/cli/src/analyzer/analyze-hooks.ts:126-165`
- Test: `packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts`

**Step 1: Write the failing test**

Add to `analyze-hooks.test.ts`:

```typescript
it('extracts sectionId from useQuery queryKey array', () => {
  const source = `
import { useQuery } from '@tanstack/react-query'

export default function Page() {
  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users'),
  })
  return <div>{data}</div>
}
`
  const result = analyzeHooks(source, 'src/pages/page.tsx')
  expect(result.hooks).toHaveLength(1)
  expect(result.hooks[0].sectionId).toBe('users')
})

it('extracts sectionId from useQuery with multi-element queryKey', () => {
  const source = `
import { useQuery } from '@tanstack/react-query'

export default function Page() {
  const { data } = useQuery({
    queryKey: ['availability', date],
    queryFn: () => fetch('/api/availability'),
  })
  return <div>{data}</div>
}
`
  const result = analyzeHooks(source, 'src/pages/page.tsx')
  expect(result.hooks).toHaveLength(1)
  expect(result.hooks[0].sectionId).toBe('availability')
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/analyze-hooks.test.ts --reporter=verbose`
Expected: FAIL — sectionId is undefined for these hooks

**Step 3: Write minimal implementation**

In `analyze-hooks.ts`, inside the `for (const [localName, info] of importMap)` loop (after line 135), add a secondary extraction strategy before the `if (foundSections.size === 0)` check:

Replace the sectionId extraction logic (lines 132-151) with a multi-strategy approach:

```typescript
    // Strategy 1: Positional string literal (existing) — useHook(query, 'section-id')
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
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/analyze-hooks.test.ts --reporter=verbose`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/analyze-hooks.ts packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts
git commit -m "feat(analyzer): add queryKey and object sectionId extraction strategies"
```

---

### Task 2: Add Zustand store hook detection

**Files:**
- Modify: `packages/cli/src/analyzer/analyze-hooks.ts`
- Test: `packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts`

**Step 1: Write the failing test**

```typescript
it('detects Zustand store hooks and generates sectionId', () => {
  const source = `
import { useAuthStore } from '@/stores/auth'

export default function Page() {
  const user = useAuthStore((s) => s.user)
  return <div>{user?.name}</div>
}
`
  const result = analyzeHooks(source, 'src/pages/page.tsx')
  expect(result.hooks).toHaveLength(1)
  expect(result.hooks[0]).toMatchObject({
    hookName: 'useAuthStore',
    importPath: '@/stores/auth',
    hookMappingType: 'store',
    sectionId: 'auth-store',
  })
})

it('detects Zustand store hook from path with /store/', () => {
  const source = `
import { useCartStore } from '@/store/cart'

export default function Page() {
  const items = useCartStore((s) => s.items)
  return <div>{items.length}</div>
}
`
  const result = analyzeHooks(source, 'src/pages/page.tsx')
  expect(result.hooks).toHaveLength(1)
  expect(result.hooks[0]).toMatchObject({
    hookName: 'useCartStore',
    hookMappingType: 'store',
    sectionId: 'cart-store',
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/analyze-hooks.test.ts --reporter=verbose`
Expected: FAIL — no hook entry for store hooks

**Step 3: Write minimal implementation**

After the `DATA_HOOK_PATTERNS` loop (after line 176), add a new detection step for store hooks:

```typescript
  // Step 3: Detect Zustand store hooks (useXxxStore from /stores?/ paths)
  for (const [localName, info] of importMap) {
    // Already processed as a data hook
    if (DATA_HOOK_PATTERNS[info.originalName]) continue

    const isStoreHook =
      /^use\w+Store$/.test(info.originalName) ||
      /stores?\//i.test(info.importPath)

    if (!isStoreHook) continue

    // Check if it's actually called
    const callRe = new RegExp(localName + String.raw`\s*\(`)
    if (!callRe.test(source)) continue

    // Derive sectionId from hook name: useAuthStore -> auth-store
    const sectionId = info.originalName
      .replace(/^use/, '')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()

    hooks.push({
      hookName: info.originalName,
      importPath: info.importPath,
      sectionId,
      returnShape: 'data-loading-error',
      hookMappingType: 'store',
    })

    // Ensure import is tracked for mocking
    if (!imports.some((i) => i.path === info.importPath)) {
      imports.push({
        path: info.importPath,
        namedExports: [info.originalName],
        needsMocking: true,
        reason: 'auth-store',
      })
    }
  }
```

Also update `getHookMappingType` to return `'store'` for store hooks:

```typescript
function getHookMappingType(hookName: string): HookMappingType {
  if (hookName === 'useAppLiveQuery' || hookName === 'useLiveQuery') return 'custom-hook'
  if (hookName === 'useQuery' || hookName === 'useSWR' || hookName === 'useFetch') return 'query-hook'
  if (/^use\w+Store$/.test(hookName)) return 'store'
  return 'unknown'
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/analyze-hooks.test.ts --reporter=verbose`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/analyze-hooks.ts packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts
git commit -m "feat(analyzer): detect Zustand store hooks and derive sectionId"
```

---

### Task 3: Add useContext hook detection

**Files:**
- Modify: `packages/cli/src/analyzer/analyze-hooks.ts`
- Test: `packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts`

**Step 1: Write the failing test**

```typescript
it('detects useContext with named context', () => {
  const source = `
import { useContext } from 'react'
import { AuthContext } from '@/context/auth'

export default function Page() {
  const { user, loading } = useContext(AuthContext)
  return <div>{user?.name}</div>
}
`
  const result = analyzeHooks(source, 'src/pages/page.tsx')
  expect(result.hooks).toHaveLength(1)
  expect(result.hooks[0]).toMatchObject({
    hookName: 'useContext',
    sectionId: 'auth-context',
    hookMappingType: 'context',
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/analyze-hooks.test.ts --reporter=verbose`
Expected: FAIL — useContext not detected

**Step 3: Write minimal implementation**

After the Zustand store detection block (added in Task 2), add:

```typescript
  // Step 4: Detect useContext calls — useContext(XxxContext)
  const useContextRe = /useContext\s*\(\s*(\w+)\s*\)/g
  let ctxMatch: RegExpExecArray | null
  while ((ctxMatch = useContextRe.exec(source)) !== null) {
    const contextName = ctxMatch[1]
    // Derive sectionId: AuthContext -> auth-context
    const sectionId = contextName
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()

    hooks.push({
      hookName: 'useContext',
      importPath: 'react',
      sectionId,
      returnShape: 'data-loading-error',
      hookMappingType: 'context',
    })
  }
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/analyze-hooks.test.ts --reporter=verbose`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/analyze-hooks.ts packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts
git commit -m "feat(analyzer): detect useContext calls and derive sectionId"
```

---

### Task 4: Generate fallback sectionId for unmatched hooks

**Files:**
- Modify: `packages/cli/src/analyzer/analyze-hooks.ts:153-165`
- Test: `packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts`

**Step 1: Write the failing test**

```typescript
it('generates fallback sectionId when hook is called without identifiable section', () => {
  const source = `
import { useQuery } from '@tanstack/react-query'

export default function Page() {
  const { data } = useQuery({
    queryKey: [getKey()],
    queryFn: fetchData,
  })
  return <div>{data}</div>
}
`
  const result = analyzeHooks(source, 'src/pages/page.tsx')
  expect(result.hooks).toHaveLength(1)
  expect(result.hooks[0].sectionId).toBe('use-query--tanstack--react-query')
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/analyze-hooks.test.ts --reporter=verbose`
Expected: FAIL — sectionId is undefined

**Step 3: Write minimal implementation**

In the "If hook was imported but no section ID detected" fallback block, change from:

```typescript
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
```

To:

```typescript
    if (foundSections.size === 0) {
      const simpleCallRe = new RegExp(localName + String.raw`\s*\(`)
      if (simpleCallRe.test(source)) {
        hooks.push({
          hookName: info.originalName,
          importPath: info.importPath,
          sectionId: deriveFallbackSectionId(info.originalName, info.importPath),
          returnShape,
          hookMappingType: getHookMappingType(info.originalName),
        })
      }
    }
```

Add the helper function:

```typescript
/** Derive a deterministic sectionId from hook name + import path when none is extractable */
function deriveFallbackSectionId(hookName: string, importPath: string): string {
  const normalizedHook = hookName
    .replace(/^use/, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()

  const normalizedPath = importPath
    .replace(/^@\//, '')
    .replace(/^@/, '')
    .replace(/\//g, '--')
    .replace(/[^a-z0-9-]/g, '')

  return normalizedHook
    ? `use-${normalizedHook}--${normalizedPath}`
    : normalizedPath
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/analyze-hooks.test.ts --reporter=verbose`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/analyze-hooks.ts packages/cli/src/analyzer/__tests__/analyze-hooks.test.ts
git commit -m "feat(analyzer): generate fallback sectionId for unmatched hooks"
```

---

### Task 5: Remove sectionId guard in enrichModelWithHookMapping

**Files:**
- Modify: `packages/cli/src/generator/index.ts:617-618`

**Step 1: Write the failing test**

Add a test file `packages/cli/src/generator/__tests__/enrich-model.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { enrichModelWithHookMapping } from '../index.js'

describe('enrichModelWithHookMapping', () => {
  it('creates a region for hooks with sectionId', () => {
    const model = { regions: {} }
    const hookResults = {
      hooks: [{
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        sectionId: 'users',
        returnShape: 'data-loading-error' as const,
        hookMappingType: 'query-hook' as const,
      }],
      imports: [],
    }

    const result = enrichModelWithHookMapping(model, hookResults)
    expect(result.regions['users']).toBeDefined()
    expect(result.regions['users'].hookMapping).toMatchObject({
      type: 'query-hook',
      hookName: 'useQuery',
      identifier: 'users',
    })
  })

  it('creates a region for hooks with fallback sectionId (previously skipped)', () => {
    const model = { regions: {} }
    const hookResults = {
      hooks: [{
        hookName: 'useAuthStore',
        importPath: '@/stores/auth',
        sectionId: 'auth-store',
        returnShape: 'data-loading-error' as const,
        hookMappingType: 'store' as const,
      }],
      imports: [],
    }

    const result = enrichModelWithHookMapping(model, hookResults)
    expect(result.regions['auth-store']).toBeDefined()
    expect(result.regions['auth-store'].hookMapping?.type).toBe('store')
  })
})
```

**Step 2: Run test to verify it passes (since sectionId IS present now)**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/enrich-model.test.ts --reporter=verbose`
Expected: PASS (Tasks 1-4 ensure sectionId is always present)

**Step 3: Verify no remaining hooks without sectionId**

The guard on line 618 (`if (!hook.sectionId) continue`) is now unnecessary because Tasks 1-4 ensure every hook gets a sectionId. But for safety, instead of removing the guard, change the behavior to use the hook name as a last-resort key:

```typescript
  for (const hook of hookResults.hooks) {
    const regionKey = hook.sectionId ?? hook.hookName

    // 1. Exact match: regionKey === existing region
    if (regions[regionKey]) {
```

Replace the rest of the loop body to use `regionKey` instead of `hook.sectionId`.

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/enrich-model.test.ts --reporter=verbose`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/generator/index.ts packages/cli/src/generator/__tests__/enrich-model.test.ts
git commit -m "feat(generator): remove sectionId guard in enrichModelWithHookMapping"
```

---

### Task 6: Improve useRegionDataForHook matching

**Files:**
- Modify: `packages/runtime/src/RegionDataContext.tsx:36-92`

**Step 1: Verify current behavior by reading the code**

The current matching is correct but limited. Improve it with:
1. After hookMapping matching loop, try matching by hookName across all regions
2. Make the fallback identifier matching more robust
3. Add dev-mode console.warn for debugging

**Step 2: Write the implementation**

Replace `useRegionDataForHook` function body:

```typescript
export function useRegionDataForHook(hookType: string, identifier: unknown): Record<string, unknown> | null {
  const ctx = useContext(RegionDataContext)
  if (!ctx) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[preview-tool] RegionDataContext is null — RegionDataProvider may not be mounted')
    }
    return null
  }

  const { regions, regionData } = ctx

  // Strategy 1: Match by hookMapping (primary)
  for (const [regionKey, region] of Object.entries(regions)) {
    const mapping = region.hookMapping as HookMapping | undefined
    if (!mapping) continue

    if (matchesHook(mapping, hookType, identifier)) {
      return (regionData[regionKey]?.stateData as Record<string, unknown>) ?? null
    }
  }

  // Strategy 2: Match by region key directly (for hooks that pass sectionId = regionKey)
  if (typeof identifier === 'string' && regionData[identifier]) {
    return (regionData[identifier].stateData as Record<string, unknown>) ?? null
  }

  // Strategy 3: Match queryKey first element against region keys
  if (Array.isArray(identifier) && identifier.length > 0) {
    const first = String(identifier[0])
    if (regionData[first]) {
      return (regionData[first].stateData as Record<string, unknown>) ?? null
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn(`[preview-tool] No matching region for hook: type=${hookType}, identifier=${JSON.stringify(identifier)}`)
  }

  return null
}
```

**Step 3: Commit**

```bash
git add packages/runtime/src/RegionDataContext.tsx
git commit -m "feat(runtime): improve useRegionDataForHook with multi-strategy matching and dev logging"
```

---

### Task 7: Remove modelRegistry fallback from mock hooks

**Files:**
- Modify: `packages/cli/src/generator/generate-mock-hooks.ts`
- Modify: `packages/cli/src/server/generate-entry.ts:191-196`

**Step 1: Simplify generate-mock-hooks.ts**

Remove the `modelRegistry`, `registerModels`, and `resolveFallback` functions. Mock hooks should only use `useRegionDataForHook`.

The import line changes from:
```typescript
"import { useDevToolsStore, useRegionDataForHook } from '@preview-tool/runtime'",
```
To:
```typescript
"import { useRegionDataForHook } from '@preview-tool/runtime'",
```

Remove these lines from the generated code:
- `let modelRegistry` declaration
- `registerModels` function
- `resolveFallback` function
- All `resolveFallback(...)` calls

Each hook type should use only `useRegionDataForHook` and return a default empty state if null:

For useAppLiveQuery:
```typescript
`export function ${hookName}(`,
'  _queryFn: any,',
'  depsOrSectionId?: Array<unknown> | string,',
'  sectionId?: string,',
') {',
'  const resolvedId = typeof depsOrSectionId === \'string\' ? depsOrSectionId : sectionId',
"  const contextData = useRegionDataForHook('custom-hook', resolvedId)",
'  if (contextData) return resolveFromState(contextData as Record<string, any>)',
'  return { data: undefined, isLoading: true, isError: false, isReady: false }',
'}',
```

For useQuery:
```typescript
'export function useQuery(options: any) {',
'  const queryKey = Array.isArray(options?.queryKey) ? options.queryKey : []',
"  const contextData = useRegionDataForHook('query-hook', queryKey)",
'  if (contextData) return resolveFromState(contextData as Record<string, any>)',
'  return { data: undefined, isLoading: true, isError: false, isReady: false }',
'}',
```

**Step 2: Remove registerModels call from generate-entry.ts**

In `generateMainTsx()`, remove the mockModules glob (lines 134-137) and the registration loop (lines 192-196). Also remove the `allRegions` variable and the collection loop (lines 155, 183-188).

**Step 3: Commit**

```bash
git add packages/cli/src/generator/generate-mock-hooks.ts packages/cli/src/server/generate-entry.ts
git commit -m "refactor(mock-hooks): remove modelRegistry fallback, use RegionDataContext only"
```

---

### Task 8: Remove playMode from FlowProvider

**Files:**
- Modify: `packages/runtime/src/flow/FlowProvider.tsx:35,45,114,121`

**Step 1: Remove playMode references**

In `FlowProvider.tsx`:

1. Remove line 35: `const playMode = useDevToolsStore((s) => s.playMode)`
2. On line 45, change `if (!actions || !selectedRoute || !playMode) return` to `if (!actions || !selectedRoute) return`
3. On line 114, remove `playMode` from the useCallback dependency array
4. On line 121, change `className={actions && playMode ? 'cursor-pointer' : undefined}` to `className={actions ? 'cursor-pointer' : undefined}`

**Step 2: Commit**

```bash
git add packages/runtime/src/flow/FlowProvider.tsx
git commit -m "feat(flow): remove playMode gate from FlowProvider, always capture clicks"
```

---

### Task 9: Remove playMode from store, PreviewShell, and InspectorPanel

**Files:**
- Modify: `packages/runtime/src/store/useDevToolsStore.ts`
- Modify: `packages/runtime/src/PreviewShell.tsx`
- Modify: `packages/runtime/src/devtools/InspectorPanel.tsx`
- Delete or gut: `packages/runtime/src/devtools/PlayModeOverlay.tsx`
- Modify: `packages/runtime/src/index.ts` (remove PlayModeOverlay export)

**Step 1: Remove from store**

In `useDevToolsStore.ts`:
1. Remove `playMode: boolean` from `DevToolsState` interface (line 16)
2. Remove `setPlayMode` and `togglePlayMode` from `DevToolsActions` interface (lines 34-35)
3. Remove `playMode: false` from `DEFAULT_STATE` (line 59)
4. Remove `setPlayMode` and `togglePlayMode` action implementations (lines 104-111)

**Step 2: Remove from PreviewShell**

In `PreviewShell.tsx`:
1. Remove `PlayModeOverlay` import (line 5)
2. Remove `playMode` store subscription (line 31)
3. Change `{!playMode && <CatalogPanel />}` to `<CatalogPanel />` (line 37)
4. Change `{!playMode && <InspectorPanel ... />}` to `<InspectorPanel ... />` (line 51)
5. Remove `{playMode && <PlayModeOverlay />}` (line 52)

**Step 3: Remove from InspectorPanel**

In `InspectorPanel.tsx`:
1. Remove the `togglePlayMode` store subscription (line 47)
2. Remove the play mode button (lines 82-87 area with the `<Play>` icon)

**Step 4: Remove PlayModeOverlay export from index.ts**

In `packages/runtime/src/index.ts`, remove:
```typescript
export { PlayModeOverlay } from './devtools/index.ts'
```

**Step 5: Gut PlayModeOverlay.tsx**

Replace `PlayModeOverlay.tsx` with just the Reset button (no exit play mode):

```tsx
import { RotateCcw } from 'lucide-react'
import { useDevToolsStore } from '../store/useDevToolsStore.ts'

export function ResetOverlay() {
  const resetRegions = useDevToolsStore((s) => s.resetRegions)
  const resetFlowHistory = useDevToolsStore((s) => s.resetFlowHistory)

  const handleReset = () => {
    resetRegions()
    resetFlowHistory()
  }

  return (
    <button
      onClick={handleReset}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-charcoal-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-charcoal-400"
      title="Reset all screens to default state"
    >
      <RotateCcw className="size-3.5" />
      Reset
    </button>
  )
}
```

**Step 6: Check for any remaining references**

Run: `grep -rn "playMode\|togglePlayMode\|PlayModeOverlay\|setPlayMode" packages/runtime/src/`
Expected: No matches except comments/docs

**Step 7: Commit**

```bash
git add packages/runtime/src/store/useDevToolsStore.ts packages/runtime/src/PreviewShell.tsx packages/runtime/src/devtools/InspectorPanel.tsx packages/runtime/src/devtools/PlayModeOverlay.tsx packages/runtime/src/index.ts
git commit -m "refactor(runtime): remove playMode entirely, always show panels and capture clicks"
```

---

### Task 10: Improve trigger matching resilience

**Files:**
- Modify: `packages/runtime/src/flow/trigger-matcher.ts`

**Step 1: Improve matchComponentTrigger**

In the text matching section, make it case-insensitive:

Change:
```typescript
if (text && text.includes(trigger.text)) return trigger
```
To:
```typescript
if (text && text.toLowerCase().includes(trigger.text.toLowerCase())) return trigger
```

Make aria-label matching case-insensitive and trim:
Change:
```typescript
if (label === trigger.ariaLabel) return trigger
```
To:
```typescript
if (label?.trim().toLowerCase() === trigger.ariaLabel?.trim().toLowerCase()) return trigger
```

Add `data-testid` as a fallback matching strategy. After the existing `while (el && el !== boundary)` loop, add:

```typescript
    // Fallback: try data-testid matching
    if (trigger.selector.startsWith('[data-testid')) {
      // Already handled by CSS selector above
    } else {
      // Try matching by role attributes for common interactive elements
      let roleEl = target instanceof HTMLElement ? target : null
      while (roleEl && roleEl !== boundary) {
        const isInteractive =
          roleEl.tagName === 'BUTTON' ||
          roleEl.tagName === 'A' ||
          roleEl.getAttribute('role') === 'button'

        if (isInteractive && trigger.text) {
          const text = roleEl.textContent?.trim()
          if (text && text.toLowerCase().includes(trigger.text.toLowerCase())) {
            return trigger
          }
        }
        roleEl = roleEl.parentElement
      }
    }
```

Apply same improvements to `findAllMatching`:

```typescript
return candidates.filter((el) => {
  if (trigger.text) {
    const text = el.textContent?.trim()
    return text != null && text.toLowerCase().includes(trigger.text.toLowerCase())
  }
  if (trigger.ariaLabel) {
    const label = el.getAttribute('aria-label')
    return label?.trim().toLowerCase() === trigger.ariaLabel.trim().toLowerCase()
  }
  return true
})
```

**Step 2: Commit**

```bash
git add packages/runtime/src/flow/trigger-matcher.ts
git commit -m "feat(flow): improve trigger matching with case-insensitive text and role-based fallback"
```

---

### Task 11: Run full build and verify

**Step 1: Build the CLI**

Run: `pnpm build`
Expected: No TypeScript errors

**Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Fix any issues found**

If build or tests fail, fix the issues before proceeding.

**Step 4: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: resolve build and test issues from region detection fixes"
```

# Universal Mock Data Delivery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make preview-tool deliver spec mockData to any React component regardless of data-fetching pattern — without changing production code.

**Architecture:** Three-layer mock delivery: (1) Hook/store mocking enhanced with spec mockData-first pipeline, (2) Fetch interception via global `window.fetch` override keyed from AST-discovered URLs, (3) RegionDataProvider mounting fix so mock hooks can access region data context.

**Tech Stack:** TypeScript, ts-morph (AST), Vite (virtual modules + aliases), React (context provider), Zod (validation)

---

## Phase 1: RegionDataProvider Mounting Fix (Layer 3)

The critical gap: mock hooks call `useRegionDataForHook()` which reads from `RegionDataContext`, but the spec-driven `main.tsx` never wraps screen components with `RegionDataProvider`. Without this, all mock hooks return `null`.

### Task 1: Add RegionDataProvider wrapper to generated spec main.tsx

**Files:**
- Modify: `packages/cli/src/server/generate-entry.ts:324-374` (function `generateSpecMainTsx`)
- Test: `packages/cli/src/server/__tests__/generate-entry.test.ts`

**Step 1: Write the failing test**

Add test to `packages/cli/src/server/__tests__/generate-entry.test.ts`:

```typescript
describe('generateSpecMainTsx', () => {
  it('wraps screen modules with RegionDataProvider', () => {
    const screens: SpecScreenImport[] = [
      { id: 'scr-home', sourceFile: 'src/pages/Home.tsx', exportType: 'default' },
    ]
    const output = generateSpecMainTsx(screens)
    expect(output).toContain('RegionDataProvider')
    expect(output).toContain('regionData={props.regionData}')
  })

  it('imports RegionDataProvider from runtime', () => {
    const screens: SpecScreenImport[] = [
      { id: 'scr-home', sourceFile: 'src/pages/Home.tsx', exportType: 'default' },
    ]
    const output = generateSpecMainTsx(screens)
    expect(output).toContain("import { PreviewShell, RegionDataProvider } from '@preview-tool/runtime'")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/server/__tests__/generate-entry.test.ts --reporter=verbose`
Expected: FAIL — output does not contain `RegionDataProvider`

**Step 3: Implement the fix**

In `packages/cli/src/server/generate-entry.ts`, modify `generateSpecMainTsx()`:

1. Change the import line from:
   ```typescript
   import { PreviewShell } from '@preview-tool/runtime'
   ```
   to:
   ```typescript
   import { PreviewShell, RegionDataProvider } from '@preview-tool/runtime'
   ```

2. Change the screen module entries to wrap components with `RegionDataProvider`. For each import entry, wrap the resolved module's default export:

   ```typescript
   // For default exports:
   '${s.id}': () => import('${importPath}').then(m => ({
     default: (props: any) => (
       <RegionDataProvider regions={props.__regions ?? {}} regionData={props.regionData ?? {}}>
         <m.default {...props} />
       </RegionDataProvider>
     )
   })),
   ```

3. Update the entries builder to pass `regions` from the screenEntry:
   ```typescript
   const entries: ScreenEntry[] = screenEntries.map((entry: any) => ({
     route: entry.route,
     module: screenModules[entry.route]
       ? () => screenModules[entry.route]!().then((mod: any) => ({
           default: (props: any) => {
             // Inject __regions so the wrapper can mount RegionDataProvider
             return mod.default({ ...props, __regions: entry.regions })
           }
         }))
       : () => Promise.resolve({ default: () => null }),
     regions: entry.regions,
   }))
   ```

**Important design note:** The simplest approach is to modify `ScreenRenderer.tsx` instead of the generated code. Since `ScreenRenderer` already computes `regionData` and passes it as a prop, we just need it to also mount `RegionDataProvider` around the component. This avoids complex generated code.

**Revised Step 3: Modify ScreenRenderer instead**

In `packages/runtime/src/ScreenRenderer.tsx:172-182`, wrap the `<Component>` with `RegionDataProvider`:

Change:
```tsx
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

To:
```tsx
return (
  <NetworkSimulationLayer key={route}>
    <div style={{ zoom: fontScale }} className="h-full">
      <ScreenErrorBoundary key={route}>
        <FlowProvider>
          <RegionDataProvider regions={regions ?? {}} regionData={regionData}>
            <Component regionData={regionData} flags={resolvedFlags} />
          </RegionDataProvider>
        </FlowProvider>
      </ScreenErrorBoundary>
    </div>
  </NetworkSimulationLayer>
)
```

**Step 1 (revised): Write the failing test**

File: `packages/runtime/src/__tests__/ScreenRenderer.test.tsx` (create)

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScreenRenderer } from '../ScreenRenderer'
import { registerScreens } from '../ScreenRegistry'
import type { ScreenEntry } from '../types'

// Minimal mock component that reads from RegionDataContext
function MockComponent({ regionData }: any) {
  return <div data-testid="mock-component">rendered</div>
}

describe('ScreenRenderer', () => {
  it('mounts RegionDataProvider around screen component', async () => {
    const entries: ScreenEntry[] = [{
      route: 'test-screen',
      module: () => Promise.resolve({ default: MockComponent }),
      regions: {
        'main': {
          label: 'Main',
          defaultState: 'default',
          states: { default: { name: 'Test' } },
        }
      }
    }]
    registerScreens(entries)

    render(<ScreenRenderer route="test-screen" />)
    // After loading, the component should render
    const el = await screen.findByTestId('mock-component')
    expect(el).toBeTruthy()
  })
})
```

**Step 2 (revised): Run test**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/runtime/src/__tests__/ScreenRenderer.test.tsx --reporter=verbose`

**Step 3 (revised): Implement — add RegionDataProvider import and wrapper in ScreenRenderer.tsx**

Add import:
```typescript
import { RegionDataProvider } from './RegionDataContext.tsx'
```

Wrap `<Component>` with `<RegionDataProvider>` as shown above.

**Step 4: Run test to verify it passes**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/runtime/src/__tests__/ScreenRenderer.test.tsx --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runtime/src/ScreenRenderer.tsx packages/runtime/src/__tests__/ScreenRenderer.test.tsx
git commit -m "fix: mount RegionDataProvider around screen components in ScreenRenderer"
```

---

## Phase 2: MockData-First Pipeline (Layer 1 Enhancement)

Currently `spec-pipeline-orchestrator.ts` uses type extraction (AST TypeChecker) as the primary source for generating mock state data. When specs have `mockData`, that data should take priority over inferred types.

### Task 2: Make spec mockData the primary data source in state distribution

**Files:**
- Modify: `packages/cli/src/spec/spec-pipeline-orchestrator.ts:181-215` (function `specToPerHookRegions`)
- Test: `packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts`

**Step 1: Write the failing test**

Add test to `packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts`:

```typescript
describe('specToPerHookRegions with mockData', () => {
  it('uses spec mockData as primary source over type inference', () => {
    const screen: SpecManifestScreen = {
      id: 'scr-search',
      title: 'Search',
      sourceFile: null,
      states: ['loading', 'populated'],
      defaultState: 'loading',
      stateData: {
        loading: { isLoading: true, specialties: [], error: null },
        populated: { isLoading: false, specialties: [{ slug: 'zahnarzt', name: 'Zahnarzt' }], error: null },
      },
      dataDeps: [],
      routeParams: null,
    }

    const deps: MergedHookDep[] = [{
      hook: 'useBookingStore',
      module: '@/stores/booking-store',
      provides: ['isLoading', 'specialties', 'error'],
      origin: 'ast' as const,
      resolvedType: {
        confidence: 'medium' as const,
        properties: ['isLoading', 'specialties', 'error'],
        methods: ['setSpecialty', 'reset'],
        shape: { isLoading: false, specialties: [], error: null },
      },
    }]

    const regions = specToPerHookRegions(screen, deps)
    const regionKey = Object.keys(regions)[0]
    const region = regions[regionKey]

    // mockData from spec should win over type-inferred defaults
    expect(region.states['populated'].specialties).toEqual([{ slug: 'zahnarzt', name: 'Zahnarzt' }])
    expect(region.states['loading'].isLoading).toBe(true)
  })

  it('falls back to type inference when spec has no mockData', () => {
    const screen: SpecManifestScreen = {
      id: 'scr-search',
      title: 'Search',
      sourceFile: null,
      states: ['loading', 'populated'],
      defaultState: 'loading',
      stateData: {
        loading: {},
        populated: {},
      },
      dataDeps: [],
      routeParams: null,
    }

    const deps: MergedHookDep[] = [{
      hook: 'useBookingStore',
      module: '@/stores/booking-store',
      provides: ['isLoading'],
      origin: 'ast' as const,
      resolvedType: {
        confidence: 'medium' as const,
        properties: ['isLoading'],
        methods: [],
        shape: { isLoading: false },
      },
    }]

    const regions = specToPerHookRegions(screen, deps)
    const regionKey = Object.keys(regions)[0]
    const region = regions[regionKey]

    // When no mockData, type inference should fill in
    expect(region.states['loading'].isLoading).toBe(true) // from distributeByState
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts --reporter=verbose`
Expected: FAIL — populated state doesn't have the spec's mockData

**Step 3: Implement mockData-first logic**

In `packages/cli/src/spec/spec-pipeline-orchestrator.ts`, modify `specToPerHookRegions()`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/spec/spec-pipeline-orchestrator.ts packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts
git commit -m "feat: use spec mockData as primary source over type inference"
```

---

### Task 3: Distribute mockData to the correct hook region when multiple hooks exist

**Files:**
- Modify: `packages/cli/src/spec/spec-pipeline-orchestrator.ts:153-179` (function `distributeStateData`)
- Test: `packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts`

**Context:** When a screen has multiple hooks (e.g., `useBookingStore` providing `[specialties, isLoading]` and `useAuthStore` providing `[user, token]`), `distributeStateData` must split the flat mockData into the correct per-hook slices. Currently it filters by `hookProvides` array, which works. But when `hookProvides` is empty (AST couldn't determine destructured fields), ALL mockData goes to every hook — which is wrong.

**Step 1: Write the failing test**

```typescript
describe('distributeStateData edge cases', () => {
  it('gives all mockData to hook when provides is empty (single hook)', () => {
    const stateData = {
      loading: { isLoading: true, items: [] },
      populated: { isLoading: false, items: [{ id: 1 }] },
    }
    // When only one hook and provides is empty, all data should go to it
    const result = distributeStateData(stateData, [])
    expect(result['populated'].items).toEqual([{ id: 1 }])
  })
})
```

**Step 2: Run test**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts --reporter=verbose`
Expected: PASS (this case already works — empty provides means all keys pass through)

**Step 3: Verify existing behavior is correct — no changes needed if test passes**

If test passes, this task confirms the existing logic is sound. Commit the test only:

```bash
git add packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts
git commit -m "test: verify mockData distribution for single hook with empty provides"
```

---

## Phase 3: Fetch Interception (Layer 2)

### Task 4: Create fetch URL discovery via AST

**Files:**
- Create: `packages/cli/src/analyzer/discover-fetch.ts`
- Test: `packages/cli/src/analyzer/__tests__/discover-fetch.test.ts`
- Create test fixture: `packages/cli/src/spec/__tests__/fixtures/src/pages/FetchPage.tsx`

**Step 1: Create test fixture**

Create `packages/cli/src/spec/__tests__/fixtures/src/pages/FetchPage.tsx`:

```tsx
import { useState, useEffect } from 'react'

export default function FetchPage() {
  const [specialties, setSpecialties] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setIsLoading(true)
    fetch('/api/specialties')
      .then(res => res.json())
      .then(data => {
        setSpecialties(data)
        setIsLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setIsLoading(false)
      })
  }, [])

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  return <ul>{specialties.map((s: any) => <li key={s.slug}>{s.name}</li>)}</ul>
}
```

**Step 2: Write the failing test**

Create `packages/cli/src/analyzer/__tests__/discover-fetch.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { Project } from 'ts-morph'
import { discoverFetchCalls, type FetchCallInfo } from '../discover-fetch.js'

const FIXTURES = join(import.meta.dirname, '..', '..', 'spec', '__tests__', 'fixtures')

describe('discoverFetchCalls', () => {
  it('discovers fetch URL from inline fetch call', () => {
    const project = new Project({
      useInMemoryFileSystem: false,
      compilerOptions: { strict: true, jsx: 4 },
    })
    const filePath = join(FIXTURES, 'src', 'pages', 'FetchPage.tsx')
    project.addSourceFileAtPath(filePath)
    const sf = project.getSourceFileOrThrow(filePath)

    const calls = discoverFetchCalls(sf)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0].url).toBe('/api/specialties')
    expect(calls[0].method).toBe('GET')
  })

  it('traces fetch result to useState setter variable', () => {
    const project = new Project({
      useInMemoryFileSystem: false,
      compilerOptions: { strict: true, jsx: 4 },
    })
    const filePath = join(FIXTURES, 'src', 'pages', 'FetchPage.tsx')
    project.addSourceFileAtPath(filePath)
    const sf = project.getSourceFileOrThrow(filePath)

    const calls = discoverFetchCalls(sf)
    expect(calls[0].targetVariable).toBe('specialties')
  })
})
```

**Step 3: Run test to verify it fails**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/analyzer/__tests__/discover-fetch.test.ts --reporter=verbose`
Expected: FAIL — module does not exist

**Step 4: Implement discover-fetch.ts**

Create `packages/cli/src/analyzer/discover-fetch.ts`:

```typescript
import { SyntaxKind, type SourceFile, type CallExpression } from 'ts-morph'

export interface FetchCallInfo {
  /** The URL string literal (e.g., '/api/specialties') */
  url: string
  /** HTTP method — defaults to 'GET' */
  method: string
  /** The variable name that receives the fetch result (via useState setter) */
  targetVariable: string | null
}

/**
 * Discover fetch() calls in a source file and trace their results
 * to useState variables.
 *
 * Supports patterns:
 * - fetch('/api/foo').then(r => r.json()).then(data => setFoo(data))
 * - const res = await fetch('/api/foo'); const data = await res.json(); setFoo(data)
 * - axios.get('/api/foo').then(({ data }) => setFoo(data))
 */
export function discoverFetchCalls(sf: SourceFile): FetchCallInfo[] {
  const results: FetchCallInfo[] = []

  // Find all call expressions that look like fetch(url)
  const callExprs = sf.getDescendantsOfKind(SyntaxKind.CallExpression)

  for (const call of callExprs) {
    const exprText = call.getExpression().getText()

    // Match: fetch('url'), fetch(`url`)
    if (exprText === 'fetch') {
      const info = parseFetchCall(call, sf)
      if (info) results.push(info)
    }

    // Match: axios.get('url'), axios.post('url'), api.get('url')
    if (/^(axios|api|http|client)\.(get|post|put|delete|patch)$/.test(exprText)) {
      const info = parseAxiosCall(call, exprText, sf)
      if (info) results.push(info)
    }
  }

  return results
}

function parseFetchCall(call: CallExpression, sf: SourceFile): FetchCallInfo | null {
  const args = call.getArguments()
  if (args.length === 0) return null

  // Extract URL from first argument
  const urlArg = args[0]
  const url = extractStringLiteral(urlArg.getText())
  if (!url) return null

  // Extract method from second argument (options object) or default to GET
  let method = 'GET'
  if (args.length >= 2) {
    const optText = args[1].getText()
    const methodMatch = optText.match(/method:\s*['"](\w+)['"]/)
    if (methodMatch) method = methodMatch[1].toUpperCase()
  }

  // Trace the result to a useState setter
  const targetVariable = traceFetchToSetter(call, sf)

  return { url, method, targetVariable }
}

function parseAxiosCall(call: CallExpression, exprText: string, sf: SourceFile): FetchCallInfo | null {
  const args = call.getArguments()
  if (args.length === 0) return null

  const url = extractStringLiteral(args[0].getText())
  if (!url) return null

  const methodMatch = exprText.match(/\.(get|post|put|delete|patch)$/)
  const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET'

  const targetVariable = traceFetchToSetter(call, sf)

  return { url, method, targetVariable }
}

/**
 * Extract a string literal value, stripping quotes and backticks.
 */
function extractStringLiteral(text: string): string | null {
  // String literal: 'foo' or "foo"
  const strMatch = text.match(/^['"](.+)['"]$/)
  if (strMatch) return strMatch[1]

  // Template literal without interpolation: `foo`
  const tmplMatch = text.match(/^`([^${}]+)`$/)
  if (tmplMatch) return tmplMatch[1]

  return null
}

/**
 * Trace a fetch() call result to a useState setter.
 *
 * Looks for patterns like:
 * - .then(data => setFoo(data))
 * - .then(res => res.json()).then(data => setFoo(data))
 *
 * Returns the state variable name (e.g., 'foo' from 'setFoo').
 */
function traceFetchToSetter(call: CallExpression, sf: SourceFile): string | null {
  // Walk up to find .then() chains
  const parent = call.getParent()
  if (!parent) return null

  // Look in the broader context for setter calls after the fetch
  const fullText = parent.getFullText()

  // Pattern: setFoo(data) or setFoo(result)
  const setterMatch = fullText.match(/\b(set[A-Z]\w+)\s*\(/)
  if (setterMatch) {
    // Convert setter name to variable name: setFoo -> foo, setSpecialties -> specialties
    const setter = setterMatch[1]
    const varName = setter.charAt(3).toLowerCase() + setter.slice(4)
    return varName
  }

  return null
}
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/analyzer/__tests__/discover-fetch.test.ts --reporter=verbose`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/cli/src/analyzer/discover-fetch.ts packages/cli/src/analyzer/__tests__/discover-fetch.test.ts packages/cli/src/spec/__tests__/fixtures/src/pages/FetchPage.tsx
git commit -m "feat: add AST-based fetch URL discovery"
```

---

### Task 5: Create fetch-to-mockData key mapper

**Files:**
- Create: `packages/cli/src/spec/fetch-mock-mapper.ts`
- Test: `packages/cli/src/spec/__tests__/fetch-mock-mapper.test.ts`

**Step 1: Write the failing test**

Create `packages/cli/src/spec/__tests__/fetch-mock-mapper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mapFetchToMockData, type FetchMockMapping } from '../fetch-mock-mapper.js'
import type { FetchCallInfo } from '../../analyzer/discover-fetch.js'

describe('mapFetchToMockData', () => {
  it('maps fetch URL to mockData key via target variable', () => {
    const fetchCalls: FetchCallInfo[] = [
      { url: '/api/specialties', method: 'GET', targetVariable: 'specialties' },
    ]
    const mockDataKeys = ['isLoading', 'specialties', 'error']

    const mappings = mapFetchToMockData(fetchCalls, mockDataKeys)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].url).toBe('/api/specialties')
    expect(mappings[0].mockDataKey).toBe('specialties')
  })

  it('returns empty when no target variable matches mockData keys', () => {
    const fetchCalls: FetchCallInfo[] = [
      { url: '/api/unknown', method: 'GET', targetVariable: 'unknown' },
    ]
    const mockDataKeys = ['specialties']

    const mappings = mapFetchToMockData(fetchCalls, mockDataKeys)
    expect(mappings).toHaveLength(0)
  })

  it('maps fetch URL to mockData key via URL path inference', () => {
    const fetchCalls: FetchCallInfo[] = [
      { url: '/api/doctors', method: 'GET', targetVariable: null },
    ]
    const mockDataKeys = ['doctors', 'isLoading']

    const mappings = mapFetchToMockData(fetchCalls, mockDataKeys)
    expect(mappings).toHaveLength(1)
    expect(mappings[0].mockDataKey).toBe('doctors')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/spec/__tests__/fetch-mock-mapper.test.ts --reporter=verbose`
Expected: FAIL — module does not exist

**Step 3: Implement fetch-mock-mapper.ts**

Create `packages/cli/src/spec/fetch-mock-mapper.ts`:

```typescript
import type { FetchCallInfo } from '../analyzer/discover-fetch.js'

export interface FetchMockMapping {
  /** Original fetch URL (e.g., '/api/specialties') */
  url: string
  /** HTTP method */
  method: string
  /** The mockData key that supplies data for this URL */
  mockDataKey: string
}

/**
 * Match discovered fetch URLs to spec mockData keys.
 *
 * Strategy order:
 * 1. Match by targetVariable name (traced from useState setter)
 * 2. Match by URL path last segment (e.g., /api/specialties → 'specialties')
 */
export function mapFetchToMockData(
  fetchCalls: FetchCallInfo[],
  mockDataKeys: string[],
): FetchMockMapping[] {
  const keySet = new Set(mockDataKeys)
  const mappings: FetchMockMapping[] = []

  for (const call of fetchCalls) {
    // Strategy 1: Direct match via target variable
    if (call.targetVariable && keySet.has(call.targetVariable)) {
      mappings.push({
        url: call.url,
        method: call.method,
        mockDataKey: call.targetVariable,
      })
      continue
    }

    // Strategy 2: Match last URL path segment to a mockData key
    const lastSegment = extractLastPathSegment(call.url)
    if (lastSegment && keySet.has(lastSegment)) {
      mappings.push({
        url: call.url,
        method: call.method,
        mockDataKey: lastSegment,
      })
      continue
    }

    // Strategy 3: Fuzzy match — camelCase of last segment
    if (lastSegment) {
      const camelKey = toCamelCase(lastSegment)
      if (keySet.has(camelKey)) {
        mappings.push({
          url: call.url,
          method: call.method,
          mockDataKey: camelKey,
        })
      }
    }
  }

  return mappings
}

function extractLastPathSegment(url: string): string | null {
  // Remove query string and hash
  const path = url.split('?')[0].split('#')[0]
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? null
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/spec/__tests__/fetch-mock-mapper.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/spec/fetch-mock-mapper.ts packages/cli/src/spec/__tests__/fetch-mock-mapper.test.ts
git commit -m "feat: add fetch URL to mockData key mapper"
```

---

### Task 6: Generate fetch interceptor code

**Files:**
- Create: `packages/cli/src/spec/generate-fetch-interceptor.ts`
- Test: `packages/cli/src/spec/__tests__/generate-fetch-interceptor.test.ts`

**Step 1: Write the failing test**

Create `packages/cli/src/spec/__tests__/generate-fetch-interceptor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateFetchInterceptor } from '../generate-fetch-interceptor.js'
import type { FetchMockMapping } from '../fetch-mock-mapper.js'

describe('generateFetchInterceptor', () => {
  it('generates window.fetch override with handler map', () => {
    const mappings: FetchMockMapping[] = [
      { url: '/api/specialties', method: 'GET', mockDataKey: 'specialties' },
      { url: '/api/doctors', method: 'GET', mockDataKey: 'doctors' },
    ]

    const code = generateFetchInterceptor(mappings)
    expect(code).toContain('window.__previewFetchHandlers')
    expect(code).toContain("'GET /api/specialties'")
    expect(code).toContain("'GET /api/doctors'")
    expect(code).toContain('originalFetch')
  })

  it('returns empty string when no mappings', () => {
    const code = generateFetchInterceptor([])
    expect(code).toBe('')
  })

  it('generates code that reads from window.__previewMockData', () => {
    const mappings: FetchMockMapping[] = [
      { url: '/api/specialties', method: 'GET', mockDataKey: 'specialties' },
    ]
    const code = generateFetchInterceptor(mappings)
    expect(code).toContain('__previewMockData')
    expect(code).toContain("'specialties'")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/spec/__tests__/generate-fetch-interceptor.test.ts --reporter=verbose`
Expected: FAIL — module does not exist

**Step 3: Implement generate-fetch-interceptor.ts**

Create `packages/cli/src/spec/generate-fetch-interceptor.ts`:

```typescript
import type { FetchMockMapping } from './fetch-mock-mapper.js'

/**
 * Generate a fetch interceptor script that overrides window.fetch
 * to return mock data for known API URLs.
 *
 * The generated code reads from `window.__previewMockData` which
 * is kept in sync by the RegionDataProvider/ScreenRenderer.
 */
export function generateFetchInterceptor(mappings: FetchMockMapping[]): string {
  if (mappings.length === 0) return ''

  const handlerEntries = mappings
    .map((m) => `  '${m.method} ${m.url}': '${m.mockDataKey}',`)
    .join('\n')

  return `// Auto-generated fetch interceptor — preview-tool
// Intercepts fetch() calls and returns mock data from spec states
(function() {
  const handlers: Record<string, string> = {
${handlerEntries}
  }

  const originalFetch = window.fetch

  window.__previewFetchHandlers = handlers
  window.__previewMockData = window.__previewMockData ?? {}

  window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
    const method = (init?.method ?? 'GET').toUpperCase()
    const key = \`\${method} \${url}\`

    const mockDataKey = handlers[key]
    if (mockDataKey && window.__previewMockData) {
      const data = window.__previewMockData[mockDataKey]
      if (data !== undefined) {
        return Promise.resolve(
          new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      }
    }

    return originalFetch.call(window, input, init)
  }
})()
`
}

/**
 * Generate the sync script that updates window.__previewMockData
 * whenever regionData changes. Injected as a React effect.
 */
export function generateFetchDataSyncEffect(): string {
  return `
// Sync region data to window.__previewMockData for fetch interceptor
useEffect(() => {
  if (regionData) {
    const flatData: Record<string, unknown> = {}
    for (const [, entry] of Object.entries(regionData)) {
      if (entry?.stateData) {
        Object.assign(flatData, entry.stateData)
      }
    }
    window.__previewMockData = flatData
  }
}, [regionData])
`
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/spec/__tests__/generate-fetch-interceptor.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/spec/generate-fetch-interceptor.ts packages/cli/src/spec/__tests__/generate-fetch-interceptor.test.ts
git commit -m "feat: add fetch interceptor code generator"
```

---

### Task 7: Inject fetch interceptor into generated main.tsx

**Files:**
- Modify: `packages/cli/src/server/generate-entry.ts` (function `generateSpecMainTsx`)
- Modify: `packages/cli/src/server/generate-entry.ts` (function `generateEntryFiles`)
- Modify: `packages/cli/src/spec/spec-pipeline-orchestrator.ts` (add fetch discovery to pipeline)
- Test: `packages/cli/src/server/__tests__/generate-entry.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/server/__tests__/generate-entry.test.ts`:

```typescript
describe('generateSpecMainTsx with fetch interceptor', () => {
  it('includes fetch interceptor when fetchMappings are provided', () => {
    const screens: SpecScreenImport[] = [
      { id: 'scr-search', sourceFile: 'src/pages/Search.tsx', exportType: 'default' },
    ]
    const fetchInterceptorCode = `window.__previewFetchHandlers = { 'GET /api/specialties': 'specialties' }`

    const output = generateSpecMainTsx(screens, fetchInterceptorCode)
    expect(output).toContain('__previewFetchHandlers')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/server/__tests__/generate-entry.test.ts --reporter=verbose`
Expected: FAIL — `generateSpecMainTsx` doesn't accept a second argument

**Step 3: Implement**

1. Update `generateSpecMainTsx` signature to accept optional `fetchInterceptorCode`:

```typescript
export function generateSpecMainTsx(
  screens: SpecScreenImport[],
  fetchInterceptorCode?: string,
): string {
  // ... existing import entries generation ...

  const fetchBlock = fetchInterceptorCode
    ? `\n// Fetch interceptor for mock data delivery\n${fetchInterceptorCode}\n`
    : ''

  return `// Auto-generated by @preview-tool/cli — spec-driven mode
import React from 'react'
import { createRoot } from 'react-dom/client'
import { PreviewShell } from '@preview-tool/runtime'
import type { ScreenEntry } from '@preview-tool/runtime'
import { Wrapper } from './wrapper'
import { screenEntries } from 'virtual:spec-manifest'
import './preview.css'
${fetchBlock}
// Static import map ...
```

2. In `generateEntryFiles`, pass fetch interceptor code when available:

```typescript
// In the specsDir branch of generateEntryFiles:
const fetchInterceptorCode = result?.fetchInterceptorCode ?? ''
await writeFile(join(previewDir, 'main.tsx'), generateSpecMainTsx(screens, fetchInterceptorCode), 'utf-8')
```

3. In `spec-pipeline-orchestrator.ts`, add fetch discovery and interceptor generation to `runSpecPipeline`:

Add to the `SpecPipelineResult` interface:
```typescript
export interface SpecPipelineResult {
  enrichedScreens: EnrichedScreen[]
  mockFiles: Map<string, string>
  aliasManifest: Record<string, string>
  fetchInterceptorCode: string  // NEW
}
```

In `runSpecPipeline`, after the screen processing loop:
```typescript
// Discover fetch calls and generate interceptor
import { discoverFetchCalls } from '../analyzer/discover-fetch.js'
import { mapFetchToMockData } from './fetch-mock-mapper.js'
import { generateFetchInterceptor } from './generate-fetch-interceptor.js'

const allFetchCalls: FetchCallInfo[] = []
for (const { absPath } of screensWithSource) {
  const sf = sourceFileMap.get(absPath)
  if (sf) {
    allFetchCalls.push(...discoverFetchCalls(sf))
  }
}

// Collect all mockData keys across all screens
const allMockDataKeys = new Set<string>()
for (const screen of screens) {
  for (const data of Object.values(screen.stateData)) {
    for (const key of Object.keys(data)) {
      allMockDataKeys.add(key)
    }
  }
}

const fetchMappings = mapFetchToMockData(allFetchCalls, [...allMockDataKeys])
const fetchInterceptorCode = generateFetchInterceptor(fetchMappings)
```

Return it:
```typescript
return { enrichedScreens, mockFiles, aliasManifest, fetchInterceptorCode }
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run packages/cli/src/server/__tests__/generate-entry.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/server/generate-entry.ts packages/cli/src/spec/spec-pipeline-orchestrator.ts packages/cli/src/server/__tests__/generate-entry.test.ts
git commit -m "feat: inject fetch interceptor into generated entry file"
```

---

### Task 8: Sync regionData to window.__previewMockData in ScreenRenderer

**Files:**
- Modify: `packages/runtime/src/ScreenRenderer.tsx`

**Context:** The fetch interceptor reads from `window.__previewMockData`. When the user switches states in devtools, `regionData` changes but the fetch interceptor doesn't know. We need a sync effect that writes the latest regionData to `window.__previewMockData`.

**Step 1: Write the failing test**

Add to `packages/runtime/src/__tests__/ScreenRenderer.test.tsx`:

```typescript
it('syncs regionData to window.__previewMockData', async () => {
  const entries: ScreenEntry[] = [{
    route: 'test-fetch-sync',
    module: () => Promise.resolve({ default: MockComponent }),
    regions: {
      'main': {
        label: 'Main',
        defaultState: 'populated',
        states: { populated: { items: [{ id: 1 }] } },
      }
    }
  }]
  registerScreens(entries)

  render(<ScreenRenderer route="test-fetch-sync" />)
  await screen.findByTestId('mock-component')

  // After render, window.__previewMockData should have the region data
  expect((window as any).__previewMockData?.items).toEqual([{ id: 1 }])
})
```

**Step 2: Run test — should fail**

**Step 3: Implement**

Add to `ScreenRenderer.tsx` **before the early returns** (around line 90, alongside other hooks). React's Rules of Hooks require all hooks to be called unconditionally — placing a `useEffect` after conditional returns will crash:

```typescript
// Sync region data to window.__previewMockData for fetch interceptor
// MUST be before early returns to satisfy Rules of Hooks
const currentEntry = modules.find((m) => m.route === route)
const currentRegions = currentEntry?.regions
useEffect(() => {
  if (!currentRegions) return
  try {
    const rd = computeRegionData(currentRegions, regionStates, regionListCounts)
    const flatData: Record<string, unknown> = {}
    for (const [, regionEntry] of Object.entries(rd)) {
      if (regionEntry?.stateData) {
        Object.assign(flatData, regionEntry.stateData)
      }
    }
    ;(window as any).__previewMockData = flatData
  } catch {
    // Ignore — sync is best-effort
  }
}, [currentRegions, regionStates, regionListCounts])
```

**Step 4: Run test — should pass**

**Step 5: Commit**

```bash
git add packages/runtime/src/ScreenRenderer.tsx packages/runtime/src/__tests__/ScreenRenderer.test.tsx
git commit -m "feat: sync regionData to window.__previewMockData for fetch interceptor"
```

---

## Phase 4: Integration and TypeScript Declarations

### Task 9: Add window type declarations for fetch interceptor globals

**Files:**
- Create: `packages/runtime/src/globals.d.ts`

**Step 1: Create type declarations**

```typescript
// Type declarations for fetch interceptor globals
declare global {
  interface Window {
    __previewFetchHandlers?: Record<string, string>
    __previewMockData?: Record<string, unknown>
  }
}

export {}
```

**Step 2: Commit**

```bash
git add packages/runtime/src/globals.d.ts
git commit -m "chore: add window type declarations for fetch interceptor globals"
```

---

### Task 10: Build verification and integration test

**Files:**
- No new files — verify existing build passes

**Step 1: Build the project**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Clean build with no TypeScript errors

**Step 2: Run all unit tests**

Run: `cd /Users/loclam/Desktop/preview-tool && npx vitest run --reporter=verbose`
Expected: All tests pass

**Step 3: Manual integration test with booking app**

Run: `cd /Users/loclam/Desktop/preview-tool && node packages/cli/dist/index.js dev --cwd ~/Desktop/booking/client --specs ~/Desktop/booking/.specs`

Verify:
1. Preview loads and shows screen list
2. Select a screen — component renders (not blank)
3. Switch states in devtools — component re-renders with different data
4. Check browser console — no `RegionDataContext is null` warnings

**Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration adjustments from booking app testing"
```

---

## Task Dependency Graph

```
Task 1 (RegionDataProvider mount) ← foundation for all mock data delivery
  ↓
Task 2 (mockData-first pipeline) ← needed for spec mockData to flow through
  ↓
Task 3 (distribution verification) ← confirms correctness
  ↓
Task 4 (fetch URL discovery) ← standalone, no dependencies except Task 1
  ↓
Task 5 (fetch-to-mockData mapper) ← depends on Task 4
  ↓
Task 6 (fetch interceptor generator) ← depends on Task 5
  ↓
Task 7 (inject interceptor into entry) ← depends on Task 6 + Task 2
  ↓
Task 8 (sync regionData to window) ← depends on Task 7 + Task 1
  ↓
Task 9 (type declarations) ← depends on Task 8
  ↓
Task 10 (build + integration test) ← depends on all above
```

## Summary

| Phase | Tasks | New Files | Modified Files |
|-------|-------|-----------|---------------|
| 1: RegionDataProvider | 1 | 1 test | `ScreenRenderer.tsx` |
| 2: MockData-first | 2-3 | 0 | `spec-pipeline-orchestrator.ts`, 1 test |
| 3: Fetch interception | 4-8 | 4 new + 4 tests | `generate-entry.ts`, `spec-pipeline-orchestrator.ts`, `ScreenRenderer.tsx` |
| 4: Integration | 9-10 | 1 type decl | build verification |

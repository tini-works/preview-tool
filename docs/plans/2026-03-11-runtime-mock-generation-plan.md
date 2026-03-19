# Runtime Mock Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up existing type extraction (extract-types.ts) into the spec pipeline so hooks return real mock data instead of `{}`, using state name heuristics to vary data per state.

**Architecture:** The spec-pipeline-orchestrator already creates a ts-morph Project and discovers hooks. We add a type resolution step after hook discovery, then a state distributor that uses resolved types + state names to generate appropriate mock data per state (loading → empty arrays, populated → filled arrays, etc.).

**Tech Stack:** ts-morph (already installed v25.0.0), existing extractHookReturnType/serializeType/inferLeafValue

**Design Doc:** `docs/plans/2026-03-11-runtime-mock-generation-design.md`

---

## Overview

The existing code has all the pieces but they aren't connected:

```
EXISTS: extractHookReturnType() → TypeShapeInfo { shape, methods, properties }
EXISTS: inferLeafValue() → sensible defaults from field names
EXISTS: runSpecPipeline() → creates Project, discovers hooks
MISSING: runSpecPipeline() does NOT call extractHookReturnType()
MISSING: distributeStateData() has no type info, returns {}
MISSING: No state-aware distribution (loading vs populated vs error)
```

**The fix is 3 tasks:**
1. Wire type extraction into the pipeline (resolve hook return types)
2. Build state distributor (generate different mock data per state name)
3. Feed resolved types + distributed data into mock generation

---

## Task 1: Implement state-distributor

**Files:**
- Create: `packages/cli/src/spec/state-distributor.ts`
- Test: `packages/cli/src/spec/__tests__/state-distributor.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/cli/src/spec/__tests__/state-distributor.test.ts
import { describe, it, expect } from 'vitest'
import { distributeByState, classifyField } from '../state-distributor.js'
import type { TypeShapeInfo } from '../../analyzer/types.js'

describe('classifyField', () => {
  it('classifies isLoading as loading-indicator', () => {
    expect(classifyField('isLoading', 'boolean')).toBe('loading-indicator')
  })

  it('classifies isFetching as loading-indicator', () => {
    expect(classifyField('isFetching', 'boolean')).toBe('loading-indicator')
  })

  it('classifies error as error-indicator', () => {
    expect(classifyField('error', 'string')).toBe('error-indicator')
  })

  it('classifies rooms (array) as data-array', () => {
    expect(classifyField('rooms', 'array')).toBe('data-array')
  })

  it('classifies user (nullable object) as data-nullable', () => {
    expect(classifyField('user', 'object-nullable')).toBe('data-nullable')
  })

  it('classifies name (string) as data-value', () => {
    expect(classifyField('name', 'string')).toBe('data-value')
  })

  it('classifies setSelected as setter', () => {
    expect(classifyField('setSelected', 'function')).toBe('setter')
  })
})

describe('distributeByState', () => {
  const resolvedType: TypeShapeInfo = {
    shape: {
      rooms: [{ id: '1', name: 'Sample Name', capacity: 0 }],
      isLoading: false,
      error: 'sample',
    },
    confidence: 'full',
    methods: ['refetch'],
    properties: ['rooms', 'isLoading', 'error'],
  }

  const fieldKinds: Record<string, string> = {
    rooms: 'array',
    isLoading: 'boolean',
    error: 'string-nullable',
  }

  it('generates loading state with empty arrays and isLoading true', () => {
    const result = distributeByState(['loading'], resolvedType, fieldKinds)
    expect(result.loading.isLoading).toBe(true)
    expect(result.loading.rooms).toEqual([])
    expect(result.loading.error).toBeNull()
  })

  it('generates populated state with filled arrays and isLoading false', () => {
    const result = distributeByState(['populated'], resolvedType, fieldKinds)
    expect(result.populated.isLoading).toBe(false)
    expect(result.populated.rooms).toHaveLength(2)
    expect(result.populated.rooms[0]).toHaveProperty('id')
    expect(result.populated.rooms[0]).toHaveProperty('name')
    expect(result.populated.error).toBeNull()
  })

  it('generates empty state with empty arrays', () => {
    const result = distributeByState(['empty'], resolvedType, fieldKinds)
    expect(result.empty.isLoading).toBe(false)
    expect(result.empty.rooms).toEqual([])
    expect(result.empty.error).toBeNull()
  })

  it('generates error state with error message', () => {
    const result = distributeByState(['error'], resolvedType, fieldKinds)
    expect(result.error.isLoading).toBe(false)
    expect(result.error.rooms).toEqual([])
    expect(result.error.error).toBe('Something went wrong')
  })

  it('handles unknown state names with populated defaults', () => {
    const result = distributeByState(['custom-state'], resolvedType, fieldKinds)
    expect(result['custom-state'].isLoading).toBe(false)
    expect(result['custom-state'].rooms).toHaveLength(1)
  })

  it('handles multiple states at once', () => {
    const result = distributeByState(
      ['loading', 'populated', 'empty', 'error'],
      resolvedType,
      fieldKinds,
    )
    expect(Object.keys(result)).toHaveLength(4)
    expect(result.loading.isLoading).toBe(true)
    expect(result.populated.rooms.length).toBeGreaterThan(0)
    expect(result.empty.rooms).toEqual([])
    expect(result.error.error).toBeTruthy()
  })

  it('includes NOOP for method fields', () => {
    const result = distributeByState(['default'], resolvedType, fieldKinds)
    expect(typeof result.default.refetch).toBe('string')
    expect(result.default.refetch).toBe('NOOP')
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/state-distributor.test.ts
```

Expected: FAIL — module not found

**Step 3: Implement state-distributor**

```typescript
// packages/cli/src/spec/state-distributor.ts
import type { TypeShapeInfo } from '../analyzer/types.js'
import { inferLeafValue } from '../analyzer/infer-shape.js'

type FieldCategory =
  | 'loading-indicator'
  | 'error-indicator'
  | 'data-array'
  | 'data-nullable'
  | 'data-value'
  | 'setter'

type StateCategory =
  | 'loading'
  | 'populated'
  | 'empty'
  | 'error'
  | 'submitting'
  | 'default'

const LOADING_PATTERNS = /^(loading|fetching|pending|initializing)$/i
const POPULATED_PATTERNS = /^(default|populated|results|ready|success|free|active|filled|idle)$/i
const EMPTY_PATTERNS = /^(empty|no.?results|no.?data|none|blank)$/i
const ERROR_PATTERNS = /^(error|failed|offline|disconnected|rejected|timeout)$/i
const SUBMITTING_PATTERNS = /^(submitting|saving|updating|processing|sending)$/i

function categorizeStateName(stateName: string): StateCategory {
  if (LOADING_PATTERNS.test(stateName)) return 'loading'
  if (POPULATED_PATTERNS.test(stateName)) return 'populated'
  if (EMPTY_PATTERNS.test(stateName)) return 'empty'
  if (ERROR_PATTERNS.test(stateName)) return 'error'
  if (SUBMITTING_PATTERNS.test(stateName)) return 'submitting'
  return 'default'
}

const LOADING_FIELD_PATTERNS = /^(is_?loading|is_?fetching|is_?pending|loading|fetching|pending)$/i
const ERROR_FIELD_PATTERNS = /^(error|error_?message|err)$/i
const SETTER_PATTERNS = /^(set[A-Z]|toggle[A-Z]|reset[A-Z]|on[A-Z])/

export function classifyField(
  fieldName: string,
  typeKind: string,
): FieldCategory {
  if (SETTER_PATTERNS.test(fieldName) || typeKind === 'function') return 'setter'
  if (LOADING_FIELD_PATTERNS.test(fieldName) && typeKind === 'boolean') return 'loading-indicator'
  if (ERROR_FIELD_PATTERNS.test(fieldName)) return 'error-indicator'
  if (typeKind === 'array') return 'data-array'
  if (typeKind.endsWith('-nullable') || typeKind === 'object-nullable') return 'data-nullable'
  return 'data-value'
}

function populateArray(
  templateItem: unknown,
  count: number,
): unknown[] {
  if (!templateItem || typeof templateItem !== 'object') {
    return Array.from({ length: count }, (_, i) => `Item ${i + 1}`)
  }
  return Array.from({ length: count }, (_, i) => {
    const item = { ...(templateItem as Record<string, unknown>) }
    // Make IDs unique
    if ('id' in item) {
      item.id = typeof item.id === 'number' ? i + 1 : `mock-id-${i + 1}`
    }
    if ('name' in item && typeof item.name === 'string') {
      item.name = `${item.name} ${i + 1}`
    }
    return item
  })
}

function getFieldValueForState(
  fieldName: string,
  category: FieldCategory,
  stateCategory: StateCategory,
  shapeValue: unknown,
): unknown {
  switch (category) {
    case 'setter':
      return 'NOOP'

    case 'loading-indicator':
      return stateCategory === 'loading' || stateCategory === 'submitting'

    case 'error-indicator':
      return stateCategory === 'error' ? 'Something went wrong' : null

    case 'data-array': {
      const templateItem = Array.isArray(shapeValue) ? shapeValue[0] : undefined
      switch (stateCategory) {
        case 'loading':
        case 'empty':
        case 'error':
          return []
        case 'populated':
          return populateArray(templateItem, 2)
        case 'submitting':
          return populateArray(templateItem, 1)
        default:
          return populateArray(templateItem, 1)
      }
    }

    case 'data-nullable':
      switch (stateCategory) {
        case 'loading':
        case 'empty':
        case 'error':
          return null
        default:
          return shapeValue ?? inferLeafValue(fieldName)
      }

    case 'data-value':
      return shapeValue ?? inferLeafValue(fieldName)
  }
}

function inferFieldKind(
  fieldName: string,
  shapeValue: unknown,
  methods: string[],
): string {
  if (methods.includes(fieldName)) return 'function'
  if (Array.isArray(shapeValue)) return 'array'
  if (shapeValue === null) return 'object-nullable'
  if (typeof shapeValue === 'boolean') return 'boolean'
  if (typeof shapeValue === 'string') return 'string'
  if (typeof shapeValue === 'number') return 'number'
  if (typeof shapeValue === 'object') return 'object'
  return 'unknown'
}

export function distributeByState(
  stateNames: string[],
  resolvedType: TypeShapeInfo,
  fieldKinds?: Record<string, string>,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {}

  // Build field list from shape + methods
  const allFields = new Set<string>([
    ...Object.keys(resolvedType.shape),
    ...resolvedType.methods,
  ])

  for (const stateName of stateNames) {
    const stateCategory = categorizeStateName(stateName)
    const stateData: Record<string, unknown> = {}

    for (const field of allFields) {
      const shapeValue = resolvedType.shape[field] ?? null
      const kind = fieldKinds?.[field]
        ?? inferFieldKind(field, shapeValue, resolvedType.methods)
      const category = classifyField(field, kind)
      stateData[field] = getFieldValueForState(
        field,
        category,
        stateCategory,
        shapeValue,
      )
    }

    result[stateName] = stateData
  }

  return result
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/state-distributor.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
cd /Users/loclam/Desktop/preview-tool
git add packages/cli/src/spec/state-distributor.ts packages/cli/src/spec/__tests__/state-distributor.test.ts
git commit -m "feat: add state-distributor for type-aware mock data per state"
```

---

## Task 2: Wire type extraction into spec-pipeline-orchestrator

**Files:**
- Modify: `packages/cli/src/spec/spec-pipeline-orchestrator.ts`
- Test: `packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts`

**Context:** The pipeline already creates a ts-morph Project (lines 363-385) and discovers hooks (line 398). We need to add a step between hook discovery and region generation that resolves each hook's return type.

**Step 1: Read current file**

```bash
cd /Users/loclam/Desktop/preview-tool && head -20 packages/cli/src/spec/spec-pipeline-orchestrator.ts
```

Understand the import structure and existing flow.

**Step 2: Add imports for type extraction**

At the top of `spec-pipeline-orchestrator.ts`, add:

```typescript
import { extractHookReturnType } from '../analyzer/extract-types.js'
import { distributeByState } from './state-distributor.js'
import type { TypeShapeInfo } from '../analyzer/types.js'
```

**Step 3: Extend MergedHookDep with resolved type**

Add `resolvedType` to the `MergedHookDep` interface:

```typescript
export interface MergedHookDep {
  hook: string
  module: string
  provides: string[]
  origin: 'spec' | 'ast'
  mappingType?: string
  resolvedType?: TypeShapeInfo  // NEW: from TypeChecker
}
```

**Step 4: Add type resolution step in runSpecPipeline()**

After the hook discovery line (`const astHooks = sf ? discoverHooksFromSource(sf) : []`), add type resolution:

```typescript
// NEW: Resolve hook return types via TypeChecker
const typeChecker = project.getTypeChecker()
const resolvedTypes = new Map<string, TypeShapeInfo>()

if (sf) {
  // Find all CallExpression nodes that are hook calls
  const callExprs = sf.getDescendantsOfKind(
    (await import('ts-morph')).SyntaxKind.CallExpression
  )
  for (const call of callExprs) {
    const callText = call.getExpression().getText()
    if (!callText.startsWith('use')) continue

    const resolved = extractHookReturnType(call, typeChecker)
    if (resolved && resolved.confidence !== 'none') {
      resolvedTypes.set(callText, resolved)
    }
  }
}
```

Then attach resolved types to merged deps:

```typescript
// After mergeHookDeps():
const mergedDeps = mergeHookDeps(screen.dataDeps, astHooks)
// NEW: Attach resolved types
const enrichedDeps = mergedDeps.map((dep) => {
  const resolved = resolvedTypes.get(dep.hook)
  if (!resolved) return dep
  return {
    ...dep,
    resolvedType: resolved,
    // Auto-populate provides from resolved type if empty
    provides: dep.provides.length > 0
      ? dep.provides
      : [...resolved.properties],
  }
})
```

**Step 5: Update specToPerHookRegions to use resolved types + state distribution**

Modify `specToPerHookRegions()` to call `distributeByState()` when a hook has a resolved type:

```typescript
export function specToPerHookRegions(
  screen: SpecManifestScreen,
  allHookDeps: MergedHookDep[],
): RegionsMap {
  const regions: RegionsMap = {}

  for (const dep of allHookDeps) {
    const regionKey = hookToRegionKey(dep.hook)

    let states: Record<string, Record<string, unknown>>

    if (dep.resolvedType && dep.resolvedType.confidence !== 'none') {
      // NEW: Use type-aware state distribution
      states = distributeByState(
        screen.states,
        dep.resolvedType,
      )
    } else {
      // Fallback: existing behavior (distribute from stateData)
      states = distributeStateData(screen.stateData, dep.provides)
    }

    regions[regionKey] = {
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
  }

  return regions
}
```

**Step 6: Update generateMockFileForImportPath to use resolved type shapes**

In the mock code generation, use `resolvedType.shape` for default values and `resolvedType.methods` for NOOP stubs:

```typescript
// In generateMockFileForImportPath, where building field lists:
const dataFields = dep.resolvedType
  ? dep.resolvedType.properties.filter((f) => !isLikelySetter(f))
  : dep.provides.filter((f) => !isLikelySetter(f))

const fnFields = dep.resolvedType
  ? [...dep.resolvedType.methods, ...dep.provides.filter(isLikelySetter)]
  : dep.provides.filter(isLikelySetter)

// In the default shape section, use resolvedType.shape for defaults:
const defaultShape = dep.resolvedType?.shape ?? {}
```

**Step 7: Run existing pipeline tests**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts
```

Expected: All existing tests still PASS (backward compatible — resolvedType is optional)

**Step 8: Add integration test for type-resolved pipeline**

Add to the existing test file:

```typescript
describe('runSpecPipeline with type resolution', () => {
  it('populates regions with type-extracted mock data', async () => {
    // This test requires a fixture with actual TypeScript source
    // that imports hooks with typed return values.
    // Use the existing test fixtures in __tests__/fixtures/
    // Expected: enrichedRegions have non-empty stateData
  })
})
```

**Step 9: Commit**

```bash
cd /Users/loclam/Desktop/preview-tool
git add packages/cli/src/spec/spec-pipeline-orchestrator.ts packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts
git commit -m "feat: wire type extraction into spec pipeline for auto mock data"
```

---

## Task 3: Add type-aware mock code generation

**Files:**
- Modify: `packages/cli/src/spec/spec-pipeline-orchestrator.ts` (generateMockFileForImportPath function)

**Context:** The generated mock hooks currently return `{}` for data fields. With resolved types, they should return proper default shapes.

**Step 1: Read generateMockFileForImportPath (lines 217-274)**

Understand current mock code template.

**Step 2: Enhance mock code to include default shapes from resolved types**

When building the mock function body, if `resolvedType.shape` is available, serialize it as the default state object:

```typescript
// In the function that builds mock code per hook:
function buildHookMockBody(dep: MergedHookDep, regionKey: string): string {
  const dataFields = dep.resolvedType
    ? dep.resolvedType.properties.filter((f) => !isLikelySetter(f))
    : dep.provides.filter((f) => !isLikelySetter(f))

  const fnFields = dep.resolvedType
    ? [...dep.resolvedType.methods, ...dep.provides.filter(isLikelySetter)]
    : dep.provides.filter(isLikelySetter)

  // Build default values from resolved type shape
  const defaultValues = dep.resolvedType?.shape ?? {}

  const fieldAssignments = dataFields
    .map((f) => {
      const defaultVal = defaultValues[f]
      const serialized = defaultVal !== undefined
        ? JSON.stringify(defaultVal)
        : 'null'
      return `    ${f}: data?.${f} ?? ${serialized},`
    })
    .join('\n')

  const setterAssignments = fnFields
    .map((f) => `    ${f}: ${NOOP},`)
    .join('\n')

  return [
    `export function ${dep.hook}(...args) {`,
    `  const data = useRegionDataForHook('${regionKey}')`,
    `  const state = {`,
    fieldAssignments,
    setterAssignments,
    `  }`,
    `  if (typeof args[0] === 'function') {`,
    `    try { return args[0](state) } catch { return state }`,
    `  }`,
    `  return state`,
    `}`,
  ].join('\n')
}
```

**Step 3: Test mock output includes default values**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts
```

**Step 4: Commit**

```bash
cd /Users/loclam/Desktop/preview-tool
git add packages/cli/src/spec/spec-pipeline-orchestrator.ts
git commit -m "feat: enhance mock code with type-resolved default values"
```

---

## Task 4: Add caching for resolved types

**Files:**
- Create: `packages/cli/src/spec/type-cache.ts`
- Test: `packages/cli/src/spec/__tests__/type-cache.test.ts`
- Modify: `packages/cli/src/spec/spec-pipeline-orchestrator.ts`

**Step 1: Write failing tests**

```typescript
// packages/cli/src/spec/__tests__/type-cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { TypeCache } from '../type-cache.js'

const CACHE_DIR = join('/tmp', 'preview-type-cache-test')

describe('TypeCache', () => {
  let cache: TypeCache

  beforeEach(async () => {
    await mkdir(CACHE_DIR, { recursive: true })
    cache = new TypeCache(CACHE_DIR)
  })

  afterEach(async () => {
    await rm(CACHE_DIR, { recursive: true, force: true })
  })

  it('returns null for uncached screen', async () => {
    const result = await cache.get('scr-home', 'abc123')
    expect(result).toBeNull()
  })

  it('stores and retrieves cached data', async () => {
    const data = { 'useRooms': { shape: { rooms: [] }, confidence: 'full' as const, methods: [], properties: ['rooms'] } }
    await cache.set('scr-home', 'abc123', data)
    const result = await cache.get('scr-home', 'abc123')
    expect(result).toEqual(data)
  })

  it('returns null when source hash differs (stale cache)', async () => {
    const data = { 'useRooms': { shape: { rooms: [] }, confidence: 'full' as const, methods: [], properties: ['rooms'] } }
    await cache.set('scr-home', 'abc123', data)
    const result = await cache.get('scr-home', 'different-hash')
    expect(result).toBeNull()
  })
})
```

**Step 2: Implement TypeCache**

```typescript
// packages/cli/src/spec/type-cache.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { TypeShapeInfo } from '../analyzer/types.js'

interface CacheEntry {
  sourceHash: string
  hooks: Record<string, TypeShapeInfo>
}

interface CacheFile {
  version: 1
  screens: Record<string, CacheEntry>
}

export class TypeCache {
  private readonly cachePath: string

  constructor(cacheDir: string) {
    this.cachePath = join(cacheDir, 'type-cache.json')
  }

  async get(
    screenId: string,
    sourceHash: string,
  ): Promise<Record<string, TypeShapeInfo> | null> {
    try {
      const raw = await readFile(this.cachePath, 'utf-8')
      const cache: CacheFile = JSON.parse(raw)
      const entry = cache.screens[screenId]
      if (!entry || entry.sourceHash !== sourceHash) return null
      return entry.hooks
    } catch {
      return null
    }
  }

  async set(
    screenId: string,
    sourceHash: string,
    hooks: Record<string, TypeShapeInfo>,
  ): Promise<void> {
    let cache: CacheFile
    try {
      const raw = await readFile(this.cachePath, 'utf-8')
      cache = JSON.parse(raw)
    } catch {
      cache = { version: 1, screens: {} }
    }

    cache.screens[screenId] = { sourceHash, hooks }

    const dir = join(this.cachePath, '..')
    await mkdir(dir, { recursive: true })
    await writeFile(this.cachePath, JSON.stringify(cache, null, 2), 'utf-8')
  }
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}
```

**Step 3: Run tests**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/type-cache.test.ts
```

**Step 4: Wire cache into runSpecPipeline**

In `spec-pipeline-orchestrator.ts`, before type extraction:

```typescript
import { TypeCache, hashContent } from './type-cache.js'

// In runSpecPipeline():
const cache = new TypeCache(join(cwd, '.preview', '.cache'))

// For each screen:
const sourceContent = sf.getFullText()
const sourceHash = hashContent(sourceContent)
const cached = await cache.get(screen.id, sourceHash)

if (cached) {
  // Use cached types
  resolvedTypes = new Map(Object.entries(cached))
} else {
  // Extract types (existing code)
  // ... extractHookReturnType calls ...
  // Cache the results
  const hookMap: Record<string, TypeShapeInfo> = {}
  for (const [name, type] of resolvedTypes) {
    hookMap[name] = type
  }
  await cache.set(screen.id, sourceHash, hookMap)
}
```

**Step 5: Commit**

```bash
cd /Users/loclam/Desktop/preview-tool
git add packages/cli/src/spec/type-cache.ts packages/cli/src/spec/__tests__/type-cache.test.ts packages/cli/src/spec/spec-pipeline-orchestrator.ts
git commit -m "feat: add type extraction caching for fast startup"
```

---

## Task 5: Integration test with real project fixture

**Files:**
- Create: `packages/cli/src/spec/__tests__/fixtures/typed-app/` (test fixture)
- Modify: `packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts`

**Step 1: Create a minimal typed React app fixture**

```tsx
// packages/cli/src/spec/__tests__/fixtures/typed-app/src/hooks/useRooms.ts
export interface Room {
  id: string
  name: string
  capacity: number
}

export interface UseRoomsReturn {
  rooms: Room[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useRooms(): UseRoomsReturn {
  throw new Error('not implemented')
}
```

```tsx
// packages/cli/src/spec/__tests__/fixtures/typed-app/src/pages/HomePage.tsx
import { useRooms } from '../hooks/useRooms'

export default function HomePage() {
  const { rooms, isLoading, error, refetch } = useRooms()
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  if (rooms.length === 0) return <div>No rooms</div>
  return (
    <div>
      {rooms.map((r) => (
        <div key={r.id}>{r.name} ({r.capacity})</div>
      ))}
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

```yaml
# packages/cli/src/spec/__tests__/fixtures/typed-app/.specs/screens/scr-home.md
---
id: scr-home
type: screen
title: Home
states:
  - name: loading
  - name: populated
  - name: empty
  - name: error
---
```

```yaml
# packages/cli/src/spec/__tests__/fixtures/typed-app/.specs/code-map.yaml
scr-home:
  - src/pages/HomePage.tsx
```

```json
// packages/cli/src/spec/__tests__/fixtures/typed-app/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "jsx": "react-jsx",
    "strict": true,
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"]
}
```

**Step 2: Write integration test**

```typescript
describe('integration: type-extracted mock data', () => {
  it('generates non-empty mock data from TypeScript types', async () => {
    const fixtureDir = join(__dirname, 'fixtures', 'typed-app')
    const manifest = await loadSpecs(join(fixtureDir, '.specs'))
    const result = await runSpecPipeline(manifest.screens, fixtureDir, join(fixtureDir, '.specs'))

    const home = result.enrichedScreens.find((s) => s.id === 'scr-home')
    expect(home).toBeDefined()

    // Should have a region for useRooms
    const roomsRegion = home!.enrichedRegions['rooms']
    expect(roomsRegion).toBeDefined()

    // Loading state should have empty array + isLoading true
    expect(roomsRegion.states.loading.isLoading).toBe(true)
    expect(roomsRegion.states.loading.rooms).toEqual([])

    // Populated state should have items
    expect(roomsRegion.states.populated.isLoading).toBe(false)
    expect(roomsRegion.states.populated.rooms.length).toBeGreaterThan(0)
    expect(roomsRegion.states.populated.rooms[0]).toHaveProperty('id')
    expect(roomsRegion.states.populated.rooms[0]).toHaveProperty('name')
    expect(roomsRegion.states.populated.rooms[0]).toHaveProperty('capacity')

    // Error state should have error message
    expect(roomsRegion.states.error.error).toBeTruthy()
    expect(roomsRegion.states.error.rooms).toEqual([])

    // refetch should be a NOOP
    expect(roomsRegion.states.populated.refetch).toBe('NOOP')
  })
})
```

**Step 3: Run integration test**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts
```

**Step 4: Fix any failures and iterate**

**Step 5: Commit**

```bash
cd /Users/loclam/Desktop/preview-tool
git add packages/cli/src/spec/__tests__/
git commit -m "test: add integration test for type-extracted mock data"
```

---

## Task 6: Manual testing with booking project

**Step 1: Run preview on booking**

```bash
cd /Users/loclam/Desktop/booking && npx preview dev --specs .specs
```

**Step 2: Verify in browser**

- [ ] Open `localhost:6100`
- [ ] Click a screen in the catalog
- [ ] Component renders with auto-generated mock data (not empty)
- [ ] Switch to "loading" state → loading indicator shows
- [ ] Switch to "error" state → error message shows
- [ ] Switch to "populated" state → data renders

**Step 3: Check console for any errors**

Look for:
- TypeChecker resolution failures
- Missing import paths
- Undefined mock values

**Step 4: Fix any issues found**

**Step 5: Commit fixes if any**

---

## Task 7: Manual testing with roomio project

Same as Task 6 but with:

```bash
cd /Users/loclam/Desktop/roomio && npx preview dev --specs .specs
```

Verify room kiosk screen renders with realistic state data for free/starting-soon/in-progress/etc.

---

## Summary

| Task | Component | What it does |
|------|-----------|-------------|
| **1** | `state-distributor.ts` | Maps state names to mock data shapes (loading → empty, populated → filled) |
| **2** | `spec-pipeline-orchestrator.ts` | Wires `extractHookReturnType()` into pipeline after hook discovery |
| **3** | Mock code generation | Uses resolved type shapes for default values in generated hooks |
| **4** | `type-cache.ts` | Caches resolved types for fast startup |
| **5** | Integration test | Validates end-to-end with typed fixture |
| **6-7** | Manual testing | Validate with booking + roomio |

**Core insight:** Tasks 1-2 are the real work. The type extraction code already exists — we're wiring it in and adding state-aware distribution. Tasks 3-4 are polish. Tasks 5-7 are validation.

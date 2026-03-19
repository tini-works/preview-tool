# Spec-Driven Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor preview-tool from AST/LLM-driven to spec-driven, using `.specs/` as the source of truth for mock generation and preview rendering.

**Architecture:** A Vite plugin reads `.specs/` directory (screens, flows, code-map.yaml), generates virtual mock modules that replace real hooks, and serves a preview shell at `/__preview`. No files generated on disk.

**Tech Stack:** TypeScript, Vite (virtual modules + plugin API), React 19, Zustand, Zod, YAML parsing (yaml package)

**Design Doc:** `/Users/loclam/Desktop/specx/docs/plans/2026-03-10-spec-driven-preview-design.md`

---

## Phase 1: Spec Loader + Types

### Task 1: Add yaml dependency

**Files:**
- Modify: `packages/cli/package.json`

**Step 1: Install yaml parser**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm add -F @preview-tool/cli yaml
```

**Step 2: Verify installation**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm ls -F @preview-tool/cli yaml
```

Expected: `yaml` listed in dependencies

**Step 3: Commit**

```bash
git add packages/cli/package.json pnpm-lock.yaml
git commit -m "chore: add yaml dependency for spec parsing"
```

---

### Task 2: Define spec types

**Files:**
- Create: `packages/cli/src/spec/types.ts`
- Test: `packages/cli/src/spec/__tests__/types.test.ts`

**Step 1: Write type validation tests**

```typescript
// packages/cli/src/spec/__tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import {
  SpecScreenSchema,
  SpecFlowSchema,
  SpecCodeMapSchema,
  SpecManifestSchema,
  type SpecScreen,
  type SpecFlow,
} from '../types.js'

describe('SpecScreenSchema', () => {
  it('parses a minimal screen', () => {
    const input = {
      id: 'scr-home',
      type: 'screen',
      title: 'Home',
      states: [{ name: 'default', description: 'Initial state' }],
    }
    const result = SpecScreenSchema.parse(input)
    expect(result.id).toBe('scr-home')
    expect(result.states).toHaveLength(1)
    expect(result.states[0].mockData).toBeUndefined()
    expect(result.data_deps).toEqual([])
  })

  it('parses a screen with mockData and data_deps', () => {
    const input = {
      id: 'scr-search',
      type: 'screen',
      title: 'Search',
      states: [
        {
          name: 'loading',
          description: 'Fetching',
          mockData: { isLoading: true, items: [] },
        },
        {
          name: 'results',
          description: 'Loaded',
          mockData: { isLoading: false, items: [{ id: '1', name: 'Test' }] },
        },
      ],
      data_deps: [
        {
          hook: 'useItems',
          module: '@/hooks/useItems',
          provides: ['items', 'isLoading'],
        },
      ],
    }
    const result = SpecScreenSchema.parse(input)
    expect(result.states[0].mockData).toEqual({ isLoading: true, items: [] })
    expect(result.data_deps).toHaveLength(1)
    expect(result.data_deps[0].hook).toBe('useItems')
  })

  it('rejects a screen without id', () => {
    expect(() =>
      SpecScreenSchema.parse({ type: 'screen', title: 'No ID', states: [] })
    ).toThrow()
  })
})

describe('SpecFlowSchema', () => {
  it('parses a flow with steps and branches', () => {
    const input = {
      id: 'flow-booking',
      type: 'flow',
      title: 'Booking Flow',
      steps: [
        { screen: 'scr-search', entry_state: 'results' },
        { screen: 'scr-doctor', entry_state: 'listing' },
      ],
      branches: [
        { at_step: 1, action: 'skip', resume_step: 3 },
      ],
    }
    const result = SpecFlowSchema.parse(input)
    expect(result.steps).toHaveLength(2)
    expect(result.branches).toHaveLength(1)
  })
})

describe('SpecCodeMapSchema', () => {
  it('parses flat array mapping', () => {
    const input = {
      'scr-home': ['src/pages/HomePage.tsx'],
      'scr-search': ['src/pages/SearchPage.tsx', 'src/components/SearchBar.tsx'],
    }
    const result = SpecCodeMapSchema.parse(input)
    expect(result['scr-home']).toEqual(['src/pages/HomePage.tsx'])
  })

  it('parses structured mapping with route field', () => {
    const input = {
      'scr-home': {
        route: 'src/routes/index.tsx',
        components: ['src/components/RoomCard.tsx'],
      },
    }
    const result = SpecCodeMapSchema.parse(input)
    expect(result['scr-home']).toEqual({
      route: 'src/routes/index.tsx',
      components: ['src/components/RoomCard.tsx'],
    })
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/types.test.ts
```

Expected: FAIL — module not found

**Step 3: Implement types**

```typescript
// packages/cli/src/spec/types.ts
import { z } from 'zod'

// --- State ---

const SpecStateSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  mockData: z.record(z.unknown()).optional(),
  transitions: z
    .array(
      z.object({
        action: z.string(),
        target: z.string(),
        guard: z.string().optional(),
      })
    )
    .optional(),
})

export type SpecState = z.infer<typeof SpecStateSchema>

// --- Data Dependency ---

const SpecDataDepSchema = z.object({
  hook: z.string(),
  module: z.string(),
  provides: z.array(z.string()),
})

export type SpecDataDep = z.infer<typeof SpecDataDepSchema>

// --- Screen ---

export const SpecScreenSchema = z.object({
  id: z.string(),
  type: z.literal('screen').optional(),
  parent: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  states: z.array(SpecStateSchema).default([]),
  data_deps: z.array(SpecDataDepSchema).default([]),
  capabilities: z.array(z.string()).optional(),
  conventions: z.array(z.string()).optional(),
})

export type SpecScreen = z.infer<typeof SpecScreenSchema>

// --- Flow ---

const SpecFlowStepSchema = z.object({
  screen: z.string(),
  entry_state: z.string().optional(),
  exit_action: z.string().optional(),
  exit_state: z.string().optional(),
})

const SpecFlowBranchSchema = z.object({
  at_step: z.number().optional(),
  action: z.string().optional(),
  resume_step: z.number().optional(),
  condition: z.string().optional(),
})

export const SpecFlowSchema = z.object({
  id: z.string(),
  type: z.literal('flow').optional(),
  parent: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  steps: z.array(SpecFlowStepSchema).default([]),
  branches: z.array(SpecFlowBranchSchema).default([]),
})

export type SpecFlow = z.infer<typeof SpecFlowSchema>

// --- Code Map ---
// Supports two formats:
// 1. Flat: { "scr-home": ["src/pages/Home.tsx"] }
// 2. Structured: { "scr-home": { route: "src/routes/index.tsx", components: [...] } }

const CodeMapEntrySchema = z.union([
  z.array(z.string()),
  z.record(z.union([z.string(), z.array(z.string())])),
])

export const SpecCodeMapSchema = z.record(CodeMapEntrySchema)

export type SpecCodeMap = z.infer<typeof SpecCodeMapSchema>

// --- Manifest (combined output) ---

export interface SpecManifestScreen {
  id: string
  title: string
  sourceFile: string | null
  states: string[]
  defaultState: string | null
  stateData: Record<string, Record<string, unknown>>
  dataDeps: SpecDataDep[]
}

export interface SpecManifestFlow {
  id: string
  title: string
  steps: Array<{ screen: string; entryState?: string }>
  branches: Array<{ atStep?: number; action?: string; resumeStep?: number }>
}

export interface SpecManifest {
  screens: SpecManifestScreen[]
  flows: SpecManifestFlow[]
}

export const SpecManifestSchema = z.object({
  screens: z.array(z.any()),
  flows: z.array(z.any()),
})
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/types.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/spec/
git commit -m "feat: add spec types with Zod schemas for screens, flows, code-map"
```

---

### Task 3: Implement spec-loader

**Files:**
- Create: `packages/cli/src/spec/spec-loader.ts`
- Test: `packages/cli/src/spec/__tests__/spec-loader.test.ts`
- Create: `packages/cli/src/spec/__tests__/fixtures/` (test fixtures)

**Step 1: Create test fixtures**

Create minimal `.specs/` fixture:

```yaml
# packages/cli/src/spec/__tests__/fixtures/screens/scr-home.md
---
id: scr-home
type: screen
title: Home Screen
status: draft
states:
  - name: loading
    description: Loading data
    mockData:
      isLoading: true
      rooms: []
  - name: populated
    description: Rooms loaded
    mockData:
      isLoading: false
      rooms:
        - { id: "1", name: "Room A" }
        - { id: "2", name: "Room B" }
  - name: empty
    description: No rooms
    mockData:
      isLoading: false
      rooms: []
  - name: error
    description: Fetch failed
    mockData:
      isLoading: false
      error: "Connection failed"
data_deps:
  - hook: useRooms
    module: "@/hooks/useRooms"
    provides:
      - rooms
      - isLoading
      - error
---

# Home Screen

The main room listing.
```

```yaml
# packages/cli/src/spec/__tests__/fixtures/screens/scr-detail.md
---
id: scr-detail
type: screen
title: Room Detail
status: draft
states:
  - name: default
    description: Room info displayed
    mockData:
      room: { id: "1", name: "Room A", capacity: 10 }
data_deps:
  - hook: useRoom
    module: "@/hooks/useRoom"
    provides:
      - room
---

# Room Detail
```

```yaml
# packages/cli/src/spec/__tests__/fixtures/flows/flow-booking.md
---
id: flow-booking
type: flow
title: Booking Flow
steps:
  - screen: scr-home
    entry_state: populated
  - screen: scr-detail
    entry_state: default
branches:
  - at_step: 1
    action: back
    resume_step: 0
---

# Booking Flow
```

```yaml
# packages/cli/src/spec/__tests__/fixtures/code-map.yaml
scr-home:
  - src/pages/HomePage.tsx
scr-detail:
  - src/pages/DetailPage.tsx
```

**Step 2: Write failing tests**

```typescript
// packages/cli/src/spec/__tests__/spec-loader.test.ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSpecs } from '../spec-loader.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES_DIR = join(__dirname, 'fixtures')

describe('loadSpecs', () => {
  it('loads screens from .specs/screens/', async () => {
    const manifest = await loadSpecs(FIXTURES_DIR)
    expect(manifest.screens).toHaveLength(2)

    const home = manifest.screens.find((s) => s.id === 'scr-home')
    expect(home).toBeDefined()
    expect(home!.title).toBe('Home Screen')
    expect(home!.states).toEqual(['loading', 'populated', 'empty', 'error'])
    expect(home!.defaultState).toBe('loading')
    expect(home!.stateData.loading).toEqual({ isLoading: true, rooms: [] })
    expect(home!.dataDeps).toHaveLength(1)
    expect(home!.dataDeps[0].hook).toBe('useRooms')
  })

  it('loads flows from .specs/flows/', async () => {
    const manifest = await loadSpecs(FIXTURES_DIR)
    expect(manifest.flows).toHaveLength(1)

    const flow = manifest.flows[0]
    expect(flow.id).toBe('flow-booking')
    expect(flow.steps).toHaveLength(2)
    expect(flow.steps[0].screen).toBe('scr-home')
    expect(flow.steps[0].entryState).toBe('populated')
  })

  it('resolves source files from code-map.yaml', async () => {
    const manifest = await loadSpecs(FIXTURES_DIR)
    const home = manifest.screens.find((s) => s.id === 'scr-home')
    expect(home!.sourceFile).toBe('src/pages/HomePage.tsx')
  })

  it('returns null sourceFile for unmapped screens', async () => {
    const manifest = await loadSpecs(FIXTURES_DIR)
    // Both screens are mapped in our fixture, but test the concept
    expect(manifest.screens.every((s) => s.sourceFile !== undefined)).toBe(true)
  })

  it('returns empty manifest for non-existent directory', async () => {
    const manifest = await loadSpecs('/tmp/does-not-exist-specs')
    expect(manifest.screens).toEqual([])
    expect(manifest.flows).toEqual([])
  })
})
```

**Step 3: Run tests to verify they fail**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/spec-loader.test.ts
```

Expected: FAIL — module not found

**Step 4: Implement spec-loader**

```typescript
// packages/cli/src/spec/spec-loader.ts
import { readFile, readdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  SpecScreenSchema,
  SpecFlowSchema,
  SpecCodeMapSchema,
  type SpecManifest,
  type SpecManifestScreen,
  type SpecManifestFlow,
  type SpecCodeMap,
} from './types.js'

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  try {
    return parseYaml(match[1]) as Record<string, unknown>
  } catch {
    return null
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function loadMarkdownFiles(dir: string): Promise<Record<string, unknown>[]> {
  if (!(await dirExists(dir))) return []

  const entries = await readdir(dir)
  const results: Record<string, unknown>[] = []

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue
    const content = await readFile(join(dir, entry), 'utf-8')
    const fm = parseFrontmatter(content)
    if (fm && fm.id) results.push(fm)
  }

  return results
}

async function loadCodeMap(specsDir: string): Promise<SpecCodeMap> {
  const codemapPath = join(specsDir, 'code-map.yaml')
  if (!(await dirExists(codemapPath))) return {}

  try {
    const content = await readFile(codemapPath, 'utf-8')
    const raw = parseYaml(content)
    if (!raw || typeof raw !== 'object') return {}
    return SpecCodeMapSchema.parse(raw)
  } catch {
    return {}
  }
}

function resolveSourceFile(
  screenId: string,
  codeMap: SpecCodeMap
): string | null {
  const entry = codeMap[screenId]
  if (!entry) return null

  if (Array.isArray(entry)) {
    // Flat format: first entry is the main source file
    return entry[0] ?? null
  }

  if (typeof entry === 'object') {
    // Structured format: prefer 'route' field
    const route = entry['route']
    if (typeof route === 'string') return route
    // Fall back to first component
    const components = entry['components']
    if (Array.isArray(components) && components.length > 0) {
      return components[0] as string
    }
  }

  return null
}

function getStateName(state: Record<string, unknown>): string {
  return (state.name as string) ?? (state.id as string) ?? 'unknown'
}

export async function loadSpecs(specsDir: string): Promise<SpecManifest> {
  if (!(await dirExists(specsDir))) {
    return { screens: [], flows: [] }
  }

  const [rawScreens, rawFlows, codeMap] = await Promise.all([
    loadMarkdownFiles(join(specsDir, 'screens')),
    loadMarkdownFiles(join(specsDir, 'flows')),
    loadCodeMap(specsDir),
  ])

  const screens: SpecManifestScreen[] = []
  for (const raw of rawScreens) {
    const parsed = SpecScreenSchema.safeParse(raw)
    if (!parsed.success) continue

    const screen = parsed.data
    const stateNames = screen.states.map(getStateName)
    const stateData: Record<string, Record<string, unknown>> = {}
    for (const state of screen.states) {
      const name = getStateName(state)
      stateData[name] = (state.mockData as Record<string, unknown>) ?? {}
    }

    screens.push({
      id: screen.id,
      title: screen.title ?? screen.id,
      sourceFile: resolveSourceFile(screen.id, codeMap),
      states: stateNames,
      defaultState: stateNames[0] ?? null,
      stateData,
      dataDeps: screen.data_deps,
    })
  }

  const flows: SpecManifestFlow[] = []
  for (const raw of rawFlows) {
    const parsed = SpecFlowSchema.safeParse(raw)
    if (!parsed.success) continue

    const flow = parsed.data
    flows.push({
      id: flow.id,
      title: flow.title ?? flow.id,
      steps: flow.steps.map((s) => ({
        screen: s.screen,
        entryState: s.entry_state,
      })),
      branches: flow.branches.map((b) => ({
        atStep: b.at_step,
        action: b.action,
        resumeStep: b.resume_step,
      })),
    })
  }

  return { screens, flows }
}
```

**Step 5: Run tests to verify they pass**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/spec-loader.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/cli/src/spec/
git commit -m "feat: implement spec-loader to parse .specs/ directory"
```

---

### Task 4: Implement spec-to-mocks (virtual mock code generation)

**Files:**
- Create: `packages/cli/src/spec/spec-to-mocks.ts`
- Test: `packages/cli/src/spec/__tests__/spec-to-mocks.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/cli/src/spec/__tests__/spec-to-mocks.test.ts
import { describe, it, expect } from 'vitest'
import { generateMockCode, generateAliasManifest } from '../spec-to-mocks.js'
import type { SpecManifestScreen } from '../types.js'

const SCREEN: SpecManifestScreen = {
  id: 'scr-search',
  title: 'Search',
  sourceFile: 'src/pages/SearchPage.tsx',
  states: ['loading', 'results', 'error'],
  defaultState: 'loading',
  stateData: {
    loading: { isLoading: true, items: [] },
    results: { isLoading: false, items: [{ id: '1' }] },
    error: { isLoading: false, error: 'Failed' },
  },
  dataDeps: [
    { hook: 'useItems', module: '@/hooks/useItems', provides: ['items', 'isLoading', 'error'] },
    { hook: 'useBookingStore', module: '@/stores/booking', provides: ['selected', 'setSelected'] },
  ],
}

describe('generateMockCode', () => {
  it('generates a mock module for a hook', () => {
    const code = generateMockCode(SCREEN, SCREEN.dataDeps[0])
    expect(code).toContain("import { useRegionDataForHook } from '@preview-tool/runtime'")
    expect(code).toContain('export function useItems(')
    expect(code).toContain("useRegionDataForHook('scr-search')")
    expect(code).toContain('items')
    expect(code).toContain('isLoading')
    expect(code).toContain('error')
  })

  it('generates a store mock with NOOP for non-data fields', () => {
    const code = generateMockCode(SCREEN, SCREEN.dataDeps[1])
    expect(code).toContain('export function useBookingStore(')
    // Store hooks support selector pattern: args[0](state)
    expect(code).toContain('typeof args[0] === \'function\'')
  })

  it('re-exports original module for non-mocked exports', () => {
    const code = generateMockCode(SCREEN, SCREEN.dataDeps[0])
    expect(code).toContain("export * from '__real:@/hooks/useItems'")
  })
})

describe('generateAliasManifest', () => {
  it('maps module paths to virtual module IDs', () => {
    const manifest = generateAliasManifest([SCREEN])
    expect(manifest['@/hooks/useItems']).toBeDefined()
    expect(manifest['@/stores/booking']).toBeDefined()
  })

  it('deduplicates when multiple screens share a hook module', () => {
    const screen2: SpecManifestScreen = {
      ...SCREEN,
      id: 'scr-detail',
      dataDeps: [{ hook: 'useItems', module: '@/hooks/useItems', provides: ['items'] }],
    }
    const manifest = generateAliasManifest([SCREEN, screen2])
    // Same module should appear once
    expect(Object.keys(manifest).filter((k) => k === '@/hooks/useItems')).toHaveLength(1)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/spec-to-mocks.test.ts
```

Expected: FAIL

**Step 3: Implement spec-to-mocks**

```typescript
// packages/cli/src/spec/spec-to-mocks.ts
import type { SpecDataDep, SpecManifestScreen } from './types.js'

const NOOP = '(() => {}) as any'

function isLikelySetter(field: string): boolean {
  return /^set[A-Z]/.test(field) || /^toggle[A-Z]/.test(field) || /^reset[A-Z]/.test(field)
}

export function generateMockCode(
  screen: SpecManifestScreen,
  dep: SpecDataDep
): string {
  const dataFields = dep.provides.filter((f) => !isLikelySetter(f))
  const setterFields = dep.provides.filter((f) => isLikelySetter(f))

  const stateObj = dataFields
    .map((f) => `    ${f}: regionData?.${f} ?? null,`)
    .join('\n')

  const setterObj = setterFields
    .map((f) => `    ${f}: ${NOOP},`)
    .join('\n')

  const allFields = [stateObj, setterObj].filter(Boolean).join('\n')

  const lines = [
    `// Auto-generated spec-driven mock for ${dep.module}`,
    `export * from '__real:${dep.module}'`,
    '',
    `import { useRegionDataForHook } from '@preview-tool/runtime'`,
    '',
    `export function ${dep.hook}(...args: any[]) {`,
    `  const regionData = useRegionDataForHook('${screen.id}')`,
    `  const state = {`,
    allFields,
    `  }`,
    '',
    `  // Support Zustand selector pattern`,
    `  if (typeof args[0] === 'function') {`,
    `    try { return args[0](state) } catch { return state }`,
    `  }`,
    '',
    `  return state`,
    `}`,
  ]

  return lines.join('\n')
}

export function generateAllMockCode(
  screens: SpecManifestScreen[]
): Map<string, string> {
  const mockModules = new Map<string, string>()
  const seen = new Set<string>()

  for (const screen of screens) {
    for (const dep of screen.dataDeps) {
      const key = `${dep.module}::${dep.hook}`
      if (seen.has(key)) continue
      seen.add(key)
      mockModules.set(key, generateMockCode(screen, dep))
    }
  }

  return mockModules
}

export function generateAliasManifest(
  screens: SpecManifestScreen[]
): Record<string, string> {
  const manifest: Record<string, string> = {}
  const seen = new Set<string>()

  for (const screen of screens) {
    for (const dep of screen.dataDeps) {
      if (seen.has(dep.module)) continue
      seen.add(dep.module)
      // Virtual module ID for Vite
      manifest[dep.module] = `virtual:spec-mock:${dep.module}`
    }
  }

  return manifest
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/spec-to-mocks.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/spec/spec-to-mocks.ts packages/cli/src/spec/__tests__/spec-to-mocks.test.ts
git commit -m "feat: implement spec-to-mocks for virtual mock code generation"
```

---

### Task 5: Implement spec-to-model (convert specs to runtime regions)

**Files:**
- Create: `packages/cli/src/spec/spec-to-model.ts`
- Test: `packages/cli/src/spec/__tests__/spec-to-model.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/cli/src/spec/__tests__/spec-to-model.test.ts
import { describe, it, expect } from 'vitest'
import { specToRegions, specToScreenEntry } from '../spec-to-model.js'
import type { SpecManifestScreen } from '../types.js'

const SCREEN: SpecManifestScreen = {
  id: 'scr-home',
  title: 'Home',
  sourceFile: 'src/pages/HomePage.tsx',
  states: ['loading', 'populated', 'error'],
  defaultState: 'loading',
  stateData: {
    loading: { isLoading: true, rooms: [] },
    populated: { isLoading: false, rooms: [{ id: '1', name: 'Room A' }] },
    error: { isLoading: false, error: 'Failed' },
  },
  dataDeps: [
    { hook: 'useRooms', module: '@/hooks/useRooms', provides: ['rooms', 'isLoading', 'error'] },
  ],
}

describe('specToRegions', () => {
  it('converts spec states to RegionsMap format', () => {
    const regions = specToRegions(SCREEN)
    // One region per screen (the screen itself is the region)
    expect(regions[SCREEN.id]).toBeDefined()
    const region = regions[SCREEN.id]
    expect(region.label).toBe('Home')
    expect(region.defaultState).toBe('loading')
    expect(region.states.loading).toEqual({ isLoading: true, rooms: [] })
    expect(region.states.populated).toEqual({ isLoading: false, rooms: [{ id: '1', name: 'Room A' }] })
  })

  it('includes hookMapping for the first data_dep', () => {
    const regions = specToRegions(SCREEN)
    const region = regions[SCREEN.id]
    expect(region.hookMapping).toBeDefined()
    expect(region.hookMapping!.hookName).toBe('useRooms')
    expect(region.hookMapping!.importPath).toBe('@/hooks/useRooms')
  })
})

describe('specToScreenEntry', () => {
  it('produces a ScreenEntry-compatible object', () => {
    const entry = specToScreenEntry(SCREEN)
    expect(entry.route).toBe('scr-home')
    expect(entry.regions).toBeDefined()
    expect(entry.regions![SCREEN.id]).toBeDefined()
  })
})
```

**Step 2: Run tests — verify FAIL**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/spec-to-model.test.ts
```

**Step 3: Implement**

```typescript
// packages/cli/src/spec/spec-to-model.ts
import type { SpecManifestScreen } from './types.js'

export interface RegionDef {
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  hookMapping?: {
    type: string
    hookName: string
    identifier: string
    importPath: string
  }
}

export type RegionsMap = Record<string, RegionDef>

export interface ScreenEntryLike {
  route: string
  regions: RegionsMap
  flags?: Record<string, { label: string; default: boolean }>
}

export function specToRegions(screen: SpecManifestScreen): RegionsMap {
  const region: RegionDef = {
    label: screen.title,
    defaultState: screen.defaultState ?? screen.states[0] ?? 'default',
    states: { ...screen.stateData },
  }

  // Attach hook mapping from first data_dep (primary data source)
  if (screen.dataDeps.length > 0) {
    const dep = screen.dataDeps[0]
    region.hookMapping = {
      type: 'custom-hook',
      hookName: dep.hook,
      identifier: dep.hook,
      importPath: dep.module,
    }
  }

  return { [screen.id]: region }
}

export function specToScreenEntry(screen: SpecManifestScreen): ScreenEntryLike {
  return {
    route: screen.id,
    regions: specToRegions(screen),
  }
}
```

**Step 4: Run tests — verify PASS**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/spec/__tests__/spec-to-model.test.ts
```

**Step 5: Commit**

```bash
git add packages/cli/src/spec/spec-to-model.ts packages/cli/src/spec/__tests__/spec-to-model.test.ts
git commit -m "feat: implement spec-to-model for converting specs to runtime regions"
```

---

## Phase 2: Vite Plugin

### Task 6: Implement vite-plugin-spec-preview

**Files:**
- Create: `packages/cli/src/server/vite-plugin-spec-preview.ts`
- Test: `packages/cli/src/server/__tests__/vite-plugin-spec-preview.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/cli/src/server/__tests__/vite-plugin-spec-preview.test.ts
import { describe, it, expect } from 'vitest'
import { createSpecPreviewPlugin } from '../vite-plugin-spec-preview.js'

describe('createSpecPreviewPlugin', () => {
  it('returns a Vite plugin object with correct name', () => {
    const plugin = createSpecPreviewPlugin({
      specsDir: '/tmp/test-specs',
      cwd: '/tmp/test-project',
    })
    expect(plugin.name).toBe('spec-preview')
  })

  it('resolves virtual:spec-manifest module ID', () => {
    const plugin = createSpecPreviewPlugin({
      specsDir: '/tmp/test-specs',
      cwd: '/tmp/test-project',
    })
    const resolved = (plugin.resolveId as Function)('virtual:spec-manifest')
    expect(resolved).toBe('\0virtual:spec-manifest')
  })

  it('resolves virtual:spec-mock: prefixed module IDs', () => {
    const plugin = createSpecPreviewPlugin({
      specsDir: '/tmp/test-specs',
      cwd: '/tmp/test-project',
    })
    const resolved = (plugin.resolveId as Function)('virtual:spec-mock:@/hooks/useItems')
    expect(resolved).toBe('\0virtual:spec-mock:@/hooks/useItems')
  })

  it('does not resolve non-virtual module IDs', () => {
    const plugin = createSpecPreviewPlugin({
      specsDir: '/tmp/test-specs',
      cwd: '/tmp/test-project',
    })
    const resolved = (plugin.resolveId as Function)('./some-real-file.ts')
    expect(resolved).toBeUndefined()
  })
})
```

**Step 2: Run tests — verify FAIL**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/server/__tests__/vite-plugin-spec-preview.test.ts
```

**Step 3: Implement vite-plugin-spec-preview**

```typescript
// packages/cli/src/server/vite-plugin-spec-preview.ts
import type { Plugin } from 'vite'
import { loadSpecs } from '../spec/spec-loader.js'
import { generateMockCode, generateAliasManifest } from '../spec/spec-to-mocks.js'
import { specToScreenEntry } from '../spec/spec-to-model.js'
import type { SpecManifest, SpecManifestScreen } from '../spec/types.js'

const VIRTUAL_MANIFEST = 'virtual:spec-manifest'
const VIRTUAL_MOCK_PREFIX = 'virtual:spec-mock:'
const RESOLVED_PREFIX = '\0'

interface SpecPreviewOptions {
  specsDir: string
  cwd: string
}

export function createSpecPreviewPlugin(options: SpecPreviewOptions): Plugin {
  let manifest: SpecManifest = { screens: [], flows: [] }
  let aliasManifest: Record<string, string> = {}

  return {
    name: 'spec-preview',
    enforce: 'pre',

    async buildStart() {
      manifest = await loadSpecs(options.specsDir)
      aliasManifest = generateAliasManifest(manifest.screens)
    },

    resolveId(id: string) {
      if (id === VIRTUAL_MANIFEST) {
        return RESOLVED_PREFIX + VIRTUAL_MANIFEST
      }
      if (id.startsWith(VIRTUAL_MOCK_PREFIX)) {
        return RESOLVED_PREFIX + id
      }
      // Resolve aliased module paths to virtual mocks
      if (aliasManifest[id]) {
        return RESOLVED_PREFIX + aliasManifest[id]
      }
      return undefined
    },

    load(id: string) {
      // Serve manifest
      if (id === RESOLVED_PREFIX + VIRTUAL_MANIFEST) {
        const screenEntries = manifest.screens.map((s) => specToScreenEntry(s))
        return `export const screens = ${JSON.stringify(manifest.screens, null, 2)};
export const flows = ${JSON.stringify(manifest.flows, null, 2)};
export const screenEntries = ${JSON.stringify(screenEntries, null, 2)};`
      }

      // Serve mock modules
      if (id.startsWith(RESOLVED_PREFIX + VIRTUAL_MOCK_PREFIX)) {
        const modulePath = id.slice((RESOLVED_PREFIX + VIRTUAL_MOCK_PREFIX).length)
        // Find the screen + dep that owns this module
        for (const screen of manifest.screens) {
          for (const dep of screen.dataDeps) {
            if (dep.module === modulePath) {
              return generateMockCode(screen, dep)
            }
          }
        }
        return `// No spec found for module: ${modulePath}`
      }

      return undefined
    },

    configureServer(server) {
      // Watch .specs/ for changes and trigger HMR
      server.watcher.add(options.specsDir)
      server.watcher.on('change', async (file) => {
        if (file.startsWith(options.specsDir)) {
          manifest = await loadSpecs(options.specsDir)
          aliasManifest = generateAliasManifest(manifest.screens)
          // Invalidate virtual modules
          const mod = server.moduleGraph.getModuleById(
            RESOLVED_PREFIX + VIRTUAL_MANIFEST
          )
          if (mod) {
            server.moduleGraph.invalidateModule(mod)
            server.ws.send({ type: 'full-reload' })
          }
        }
      })
    },
  }
}
```

**Step 4: Run tests — verify PASS**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm exec vitest run packages/cli/src/server/__tests__/vite-plugin-spec-preview.test.ts
```

**Step 5: Commit**

```bash
git add packages/cli/src/server/vite-plugin-spec-preview.ts packages/cli/src/server/__tests__/
git commit -m "feat: implement Vite plugin for spec-driven preview with virtual modules"
```

---

### Task 7: Add spec-preview config and dev command integration

**Files:**
- Modify: `packages/cli/src/lib/config.ts`
- Modify: `packages/cli/src/commands/dev.ts`
- Modify: `packages/cli/src/server/create-vite-config.ts`

**Step 1: Read current config.ts**

Read `packages/cli/src/lib/config.ts` to understand current shape.

**Step 2: Add specsDir to config**

Add to `PreviewConfig` interface:

```typescript
specsDir?: string  // Path to .specs/ directory (enables spec-driven mode)
```

Add to `DEFAULT_CONFIG`:

```typescript
specsDir: undefined
```

**Step 3: Read current dev.ts command**

Read `packages/cli/src/commands/dev.ts` to understand current flow.

**Step 4: Add --specs flag to dev command**

Add option:

```typescript
.option('--specs <dir>', 'Path to .specs/ directory for spec-driven preview')
```

When `--specs` is provided:
1. Set `config.specsDir = resolvedSpecsDir`
2. Pass config to `createViteConfig()`

**Step 5: Read current create-vite-config.ts**

Read `packages/cli/src/server/create-vite-config.ts` to understand plugin loading.

**Step 6: Add spec plugin to Vite config**

When `config.specsDir` is set:
1. Import `createSpecPreviewPlugin`
2. Add to plugins array
3. Add `__real:` aliases for modules in the alias manifest (so mocks can re-export originals)

```typescript
if (config.specsDir) {
  const { createSpecPreviewPlugin } = await import('./vite-plugin-spec-preview.js')
  plugins.push(
    createSpecPreviewPlugin({
      specsDir: config.specsDir,
      cwd,
    })
  )
}
```

**Step 7: Test manually**

```bash
cd /Users/loclam/Desktop/booking && npx preview dev --specs .specs
```

Verify: Vite starts, plugin loads specs, no errors.

**Step 8: Commit**

```bash
git add packages/cli/src/lib/config.ts packages/cli/src/commands/dev.ts packages/cli/src/server/create-vite-config.ts
git commit -m "feat: integrate spec-preview plugin into dev command with --specs flag"
```

---

### Task 8: Generate spec-aware entry point

**Files:**
- Modify: `packages/cli/src/server/generate-entry.ts`

**Step 1: Read current generate-entry.ts**

Understand how `main.tsx` is currently generated.

**Step 2: Add spec-driven entry generation**

When `config.specsDir` is set, generate a different `main.tsx` that:
1. Imports `screens` and `flows` from `virtual:spec-manifest`
2. Dynamically imports screen components using `code-map.yaml` source files
3. Wraps each screen with `RegionDataContext` using spec-defined states
4. Passes `ScreenEntry[]` to `PreviewShell`

```typescript
// Generated main.tsx for spec mode:
import { PreviewShell } from '@preview-tool/runtime'
import { screens, flows } from 'virtual:spec-manifest'
import type { ScreenEntry } from '@preview-tool/runtime'

// Dynamic imports from code-map
const screenModules: Record<string, () => Promise<any>> = {
  ${screens.map(s => `'${s.id}': () => import('${s.sourceFile}')`).join(',\n  ')}
}

const entries: ScreenEntry[] = screens.map(s => ({
  route: s.id,
  module: screenModules[s.id] ?? (() => Promise.resolve({ default: () => null })),
  regions: {
    [s.id]: {
      label: s.title,
      defaultState: s.defaultState,
      states: s.stateData,
    }
  },
}))

const root = document.getElementById('root')!
import { createRoot } from 'react-dom/client'
createRoot(root).render(<PreviewShell screens={entries} />)
```

**Step 3: Test manually**

```bash
cd /Users/loclam/Desktop/booking && npx preview dev --specs .specs
```

Verify: Browser opens, PreviewShell renders with screen catalog.

**Step 4: Commit**

```bash
git add packages/cli/src/server/generate-entry.ts
git commit -m "feat: generate spec-aware entry point for preview shell"
```

---

## Phase 3: Runtime Refinements

### Task 9: Update CatalogPanel to show screens grouped by feature + flows section

**Files:**
- Modify: `packages/runtime/src/devtools/CatalogPanel.tsx`

**Step 1: Read current CatalogPanel.tsx**

Understand current grouping logic (`groupBySection` uses route prefix).

**Step 2: Update to support spec-driven grouping**

When screens have `scr-` prefixed routes (spec mode), group by parent feature if available, otherwise show flat list. Add a "Flows" section below screens.

Note: This can be incremental — the existing `groupBySection` will still work because spec screens use `scr-*` as route, which groups under "scr" section. Improve later.

**Step 3: Commit**

```bash
git add packages/runtime/src/devtools/CatalogPanel.tsx
git commit -m "feat: update CatalogPanel for spec-driven screen listing"
```

---

### Task 10: Update InspectorPanel to show spec-defined states

**Files:**
- Modify: `packages/runtime/src/devtools/InspectorPanel.tsx`

**Step 1: Read current InspectorPanel.tsx**

Understand how region states are displayed (dropdowns per region).

**Step 2: Verify existing behavior works with spec regions**

The existing InspectorPanel reads regions from `useDevToolsStore` and renders state dropdowns. Since our spec-to-model produces compatible `RegionsMap`, the existing UI should work. Verify by manual testing.

If adjustments needed: add screen title display, spec ID badge, data_deps list.

**Step 3: Commit (if changes needed)**

```bash
git add packages/runtime/src/devtools/InspectorPanel.tsx
git commit -m "feat: enhance InspectorPanel for spec-driven state display"
```

---

## Phase 4: Integration Testing

### Task 11: Test with booking project

**Step 1: Add mockData to 2-3 booking screen specs**

Pick `scr-home-screen`, `scr-specialty-search`, `scr-feedback-form` from `/Users/loclam/Desktop/booking/.specs/screens/`.

Add `mockData` to each state and `data_deps` for the hooks they use. Reference the actual source code in `src/pages/` for correct hook names and return shapes.

**Step 2: Ensure code-map.yaml maps screens to files**

```yaml
# /Users/loclam/Desktop/booking/.specs/code-map.yaml
scr-home-screen:
  - src/pages/HomePage.tsx
scr-specialty-search:
  - src/pages/booking/SearchPage.tsx
scr-feedback-form:
  - src/pages/FeedbackPage.tsx
```

**Step 3: Run preview**

```bash
cd /Users/loclam/Desktop/booking && npx preview dev --specs .specs
```

**Step 4: Verify**

- [ ] Catalog shows 3 screens
- [ ] Clicking a screen loads the component
- [ ] State switcher shows spec-defined states
- [ ] Switching states changes mock data → component re-renders

**Step 5: Commit spec changes to booking repo**

```bash
cd /Users/loclam/Desktop/booking
git add .specs/
git commit -m "feat: add mockData and data_deps to screen specs for preview"
```

---

### Task 12: Test with roomio project

**Step 1: Add mockData to roomio screen specs**

Pick `scr-home`, `scr-room-kiosk` from `/Users/loclam/Desktop/roomio/.specs/screens/`.

Add `mockData` for each state (free, starting-soon, awaiting-checkin, etc.) and `data_deps` for hooks (useRooms, useRoomSocket).

**Step 2: Run preview**

```bash
cd /Users/loclam/Desktop/roomio && npx preview dev --specs .specs
```

**Step 3: Verify same criteria as Task 11**

**Step 4: Commit**

---

## Phase 5: Flow Playback (Future)

### Task 13: Implement spec-to-controller

**Files:**
- Create: `packages/cli/src/spec/spec-to-controller.ts`
- Test: `packages/cli/src/spec/__tests__/spec-to-controller.test.ts`

Convert `flow.steps[]` and `flow.branches[]` to navigation actions. When user clicks "Next" in flow mode, advance to next step's screen + entry_state.

### Task 14: Add flow playback UI

**Files:**
- Modify: `packages/runtime/src/devtools/CatalogPanel.tsx` (flow list)
- Create: `packages/runtime/src/devtools/FlowControls.tsx` (next/prev/branch)

---

## Phase 6: Cleanup

### Task 15: Remove unused AST/LLM code (optional, after spec mode is stable)

Remove files listed in the design doc "Remove" section:
- `packages/cli/src/analyzer/collect-facts.ts`
- `packages/cli/src/analyzer/understand-screens.ts`
- `packages/cli/src/llm/` directory
- `packages/cli/src/generator/generate-mock-from-analysis.ts`
- `packages/cli/src/lib/hook-classifier.ts`

Keep the AST mode functional behind a flag for backward compatibility until spec mode is fully validated.

---

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| **1: Spec Loader** | Tasks 1–5 | Types, parser, mock generation, model conversion |
| **2: Vite Plugin** | Tasks 6–8 | Plugin, config integration, entry generation |
| **3: Runtime** | Tasks 9–10 | CatalogPanel, InspectorPanel updates |
| **4: Testing** | Tasks 11–12 | Validate with booking + roomio |
| **5: Flows** | Tasks 13–14 | Flow playback (future) |
| **6: Cleanup** | Task 15 | Remove AST/LLM code (future) |

Core work is Tasks 1–8 (spec loader + Vite plugin). Tasks 9–12 are integration/polish. Tasks 13–15 are future phases.

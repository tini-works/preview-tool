# Real-App Compatibility: Top 3 Gaps Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make preview-tool work correctly on the majority of real-world React apps by fixing alias resolution, React Query v5 / Zustand state detection, and expanding test fixtures to catch regressions.

**Architecture:** Three independent, self-contained changes: (1) `read-project-aliases.ts` reads `tsconfig.json` paths and replaces the hardcoded `@/ → src/` entries in `create-vite-config.ts`; (2) `derive-state-machine.ts` gains a v5-aware library registry and a Zustand selector layer; (3) two new fixture screens exercise the new paths in the integration tests.

**Tech Stack:** TypeScript (strict), ts-morph, Vitest, Node.js `fs`, pnpm workspace monorepo.

---

## Chunk 1: React Query v5 + Zustand Selector Layer

### Task 1: React Query v5 machine template + version-aware registry

**Context:**
- `DATA_FETCHER_MACHINE` (line 16 of `derive-state-machine.ts`) uses `isLoading`. React Query v5 renamed this to `isPending`.
- `deriveStateMachine(screenName, facts)` currently has no access to `cwd`, so it cannot read the project's `package.json` to detect the version.
- `derive-state-machine.ts` currently has NO `fs` or `path` imports — these must be added.
- Fix: add optional `cwd?` parameter, a `detectQueryVersion()` helper, and a `DATA_FETCHER_MACHINE_V5` template.
- Design: `deriveStateMachine` builds the registry once and passes it to `deriveStates` — avoids a filesystem read per-call and keeps `deriveStates` a pure function.
- Caller audit: grep confirms `deriveStateMachine` is only called in `generator/index.ts` and tests. No other callers.

**Files:**
- Modify: `packages/cli/src/analyzer/derive-state-machine.ts`
- Modify: `packages/cli/src/generator/index.ts` (call site — pass `cwd`)
- Test: `packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts`

---

- [ ] **Step 1: Write failing tests**

Add the following imports and helpers at the top of `packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts` (after existing imports):

```ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeTempCwd(queryVersion: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'preview-test-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    dependencies: { '@tanstack/react-query': queryVersion }
  }))
  return dir
}
```

Add these test suites at the end of the file:

```ts
describe('detectQueryVersion edge cases', () => {
  it('returns 4 when cwd is not provided', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' }],
    }
    const machine = deriveStateMachine('Screen', facts)  // no cwd
    const loading = machine.states.find(s => s.id === 'loading')
    expect(loading?.mockData).toHaveProperty('isLoading', true)
    expect(loading?.mockData).not.toHaveProperty('isPending')
  })

  it('returns 4 when package.json missing @tanstack/react-query', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-test-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: {} }))
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    expect(machine.states.find(s => s.id === 'loading')?.mockData).toHaveProperty('isLoading')
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns 4 when version string is "latest" (non-numeric)', () => {
    const dir = makeTempCwd('latest')
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    expect(machine.states.find(s => s.id === 'loading')?.mockData).toHaveProperty('isLoading')
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns 4 when version is "^4.0.0" (explicit v4)', () => {
    const dir = makeTempCwd('^4.0.0')
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    expect(machine.states.find(s => s.id === 'loading')?.mockData).toHaveProperty('isLoading', true)
    expect(machine.states.find(s => s.id === 'loading')?.mockData).not.toHaveProperty('isPending')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('deriveStateMachine — React Query v5', () => {
  it('uses isPending (not isLoading) when @tanstack/react-query ^5 is installed', () => {
    const dir = makeTempCwd('^5.0.0')
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'result' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    const loading = machine.states.find(s => s.id === 'loading')
    expect(loading?.mockData).toHaveProperty('isPending', true)
    expect(loading?.mockData).not.toHaveProperty('isLoading')
    rmSync(dir, { recursive: true, force: true })
  })

  it('useSuspenseQuery v5 maps to loading/success only (no error — throws to Error Boundary)', () => {
    const dir = makeTempCwd('^5.0.0')
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useSuspenseQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'result' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    // useSuspenseQuery never exposes isLoading or error in component body —
    // loading suspends via Promise throw, error propagates to Error Boundary.
    // The preview machine has exactly 2 states: loading and success.
    expect(machine.states.map((s: StateNode) => s.id)).toEqual(['loading', 'success'])
    expect(machine.states.find(s => s.id === 'loading')?.mockData).toEqual({ data: undefined })
    expect(machine.states.find(s => s.id === 'success')?.mockData).toEqual({ data: [] })
    rmSync(dir, { recursive: true, force: true })
  })

  it('useSuspenseQuery without cwd still gets 2-state machine (no version detection)', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useSuspenseQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'result' }],
    }
    const machine = deriveStateMachine('Screen', facts)  // no cwd
    expect(machine.states.map((s: StateNode) => s.id)).toEqual(['loading', 'success'])
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd /Users/loclam/Desktop/preview-tool
npx vitest run packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts 2>&1 | tail -20
```

Expected: 8 new tests FAIL (no `cwd` param on signature, no v5 template, no `useSuspenseQuery` in registry).
(4 edge case tests + 3 v5 tests + 1 useSuspenseQuery-without-cwd test = 8)

- [ ] **Step 3: Add fs/path imports to derive-state-machine.ts**

At the top of `packages/cli/src/analyzer/derive-state-machine.ts`, after the existing `import type { ... }` block, add:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
```

- [ ] **Step 4: Add DATA_FETCHER_MACHINE_V5 and SUSPENSE_QUERY_MACHINE templates**

In `packages/cli/src/analyzer/derive-state-machine.ts`, after `DATA_FETCHER_MACHINE` (after line 25), add both templates:

```ts
/** React Query v5: isPending replaced isLoading */
const DATA_FETCHER_MACHINE_V5: MachineTemplate = {
  states: [
    { id: 'idle',    label: 'Initial state', mockData: {},                                                                          source: 'library' },
    { id: 'loading', label: 'Fetching data', mockData: { isPending: true,  data: undefined, error: undefined },                    source: 'library' },
    { id: 'success', label: 'Data loaded',   mockData: { isPending: false, data: [],        error: undefined },                    source: 'library' },
    { id: 'error',   label: 'Fetch failed',  mockData: { isPending: false, data: undefined, error: { message: 'Network error' } }, source: 'library' },
  ],
  initial: 'idle',
  source: 'library',
}

/**
 * useSuspenseQuery — no isLoading/error in component body.
 * Loading suspends via Promise throw; errors propagate to Error Boundary.
 * Two preview states: loading (Suspense fallback shown) and success (data available).
 */
const SUSPENSE_QUERY_MACHINE: MachineTemplate = {
  states: [
    { id: 'loading', label: 'Fetching data', mockData: { data: undefined }, source: 'library' },
    { id: 'success', label: 'Data loaded',   mockData: { data: [] },        source: 'library' },
  ],
  initial: 'loading',
  source: 'library',
}
```

- [ ] **Step 5: Add detectQueryVersion and replace LIBRARY_REGISTRY with buildLibraryRegistry**

After `FORM_MACHINE`, replace the `const LIBRARY_REGISTRY = { ... }` block with:

```ts
/**
 * Returns the major version of @tanstack/react-query listed in the project's
 * package.json. Returns 4 if the file is absent, the key is missing, or the
 * version string is non-numeric (e.g. "latest", "workspace:^5").
 */
function detectQueryVersion(cwd: string): number {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8')) as Record<string, unknown>
    const deps = {
      ...(pkg['dependencies'] as Record<string, string> ?? {}),
      ...(pkg['devDependencies'] as Record<string, string> ?? {}),
    }
    const version = deps['@tanstack/react-query'] ?? ''
    const major = parseInt(version.replace(/^[\^~]/, ''), 10)
    return isNaN(major) ? 4 : major
  } catch {
    return 4
  }
}

/**
 * Builds the library fingerprint registry.
 * When cwd is provided the React Query version is detected from package.json;
 * otherwise defaults to v4 field names (isLoading).
 * Called once per deriveStateMachine invocation — not per hook.
 *
 * Note: detectQueryVersion is ONLY called when cwd is truthy (the `cwd &&` guard
 * prevents it from ever receiving undefined and calling path.join(undefined, ...).
 */
function buildLibraryRegistry(cwd?: string): Record<string, MachineTemplate> {
  const queryMachine = cwd && detectQueryVersion(cwd) >= 5
    ? DATA_FETCHER_MACHINE_V5
    : DATA_FETCHER_MACHINE

  return {
    '@tanstack/react-query#useQuery':           queryMachine,
    '@tanstack/react-query#useInfiniteQuery':   queryMachine,
    // useSuspenseQuery uses a dedicated 2-state machine (no error state — throws to Error Boundary)
    '@tanstack/react-query#useSuspenseQuery':   SUSPENSE_QUERY_MACHINE,
    'swr#useSWR':                               DATA_FETCHER_MACHINE,
    '@apollo/client#useQuery':                  DATA_FETCHER_MACHINE,
    '@tanstack/react-query#useMutation':        MUTATION_MACHINE,
    '@apollo/client#useMutation':               MUTATION_MACHINE,
    'react-hook-form#useForm':                  FORM_MACHINE,
    'formik#useFormik':                         FORM_MACHINE,
  }
}
```

- [ ] **Step 6: Update deriveStateMachine and deriveStates signatures**

Two changes in this step.

**6a — Update `deriveStateMachine`** (the exported function):

```ts
export function deriveStateMachine(
  screenName: string,
  facts: ScreenFacts,
  cwd?: string,                          // NEW optional parameter
): ScreenStateMachine {
  try {
    const registry = buildLibraryRegistry(cwd)   // build once, pass down
    const states = deriveStates(facts, registry)
    const transitions = deriveTransitions(facts)
    const initialState = pickDefaultState(states)
    return { screenName, states, transitions, initialState }
  } catch {
    return { screenName, states: [{ ...DEFAULT_STATE }], transitions: [], initialState: 'default' }
  }
}
```

**6b — Update `deriveStates`** signature (internal function, not exported):

Current signature: `function deriveStates(facts: ScreenFacts): StateNode[]`

New signature: `function deriveStates(facts: ScreenFacts, registry: Record<string, MachineTemplate>): StateNode[]`

Inside the function body, replace any reference to the old module-level `LIBRARY_REGISTRY` const with the `registry` parameter:

```ts
function deriveStates(facts: ScreenFacts, registry: Record<string, MachineTemplate>): StateNode[] {
  // Layer 1: library fingerprints
  for (const hook of facts.hooks) {
    const key = `${hook.importPath}#${hook.name}`
    const template = registry[key]          // ← uses parameter, not old const
    if (template) return template.states.map(s => ({ ...s }))
  }
  // Layers 1.5 through 7 remain unchanged in body
}
```

The old `const LIBRARY_REGISTRY = { ... }` was deleted in Step 5; `deriveStates` now receives the registry as a parameter instead of closing over it.

- [ ] **Step 7: Run tests and confirm they pass**

```bash
cd /Users/loclam/Desktop/preview-tool
npx vitest run packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts 2>&1 | tail -10
```

Expected: all tests pass (existing 12 + 8 new = 20 passing).

- [ ] **Step 8: Update call site in generator/index.ts**

In `packages/cli/src/generator/index.ts`, find the scenario block inside the per-screen loop (~line 159). It looks like:

```ts
const machine = deriveStateMachine(scenarioScreenName, scenarioFacts)
```

Change it to:

```ts
const machine = deriveStateMachine(scenarioScreenName, scenarioFacts, cwd)
```

`cwd` is the first parameter of `generateAll(cwd, config, devToolConfig?)` — already in scope at the call site. No import changes needed.

- [ ] **Step 9: Run full test suite**

```bash
cd /Users/loclam/Desktop/preview-tool && npx vitest run 2>&1 | tail -8
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add packages/cli/src/analyzer/derive-state-machine.ts \
        packages/cli/src/generator/index.ts \
        packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts
git commit -m "feat: React Query v5 isPending support + version-aware library registry"
```

---

### Task 2: Zustand selector layer (Layer 1.5)

**Context:**
- `HookFact.selectorPattern` is already set to `true` by `aggregateSelectorHooks()` in `collect-facts.ts` when a hook is called with `(s) => s.field` pattern.
- `derive-state-machine.ts` currently ignores `selectorPattern` — such hooks fall through to the default state.
- Fix: add Layer 1.5 between Layer 1 and Layer 2 in `deriveStates()` that applies heuristics to selector fields.

**Files:**
- Modify: `packages/cli/src/analyzer/derive-state-machine.ts`
- Test: `packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts`

---

- [ ] **Step 1: Write failing tests**

Add to `packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts`:

```ts
describe('deriveStateMachine — Layer 1.5: Zustand selector pattern', () => {
  it('applies heuristics to isLoading selector field', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{
        name: 'useAppStore',
        importPath: '../stores/appStore',
        arguments: ['(s) => s.isLoading'],
        returnVariable: 'isLoading',
        destructuredFields: ['isLoading'],
        selectorPattern: true,
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    const ids = machine.states.map((s: StateNode) => s.id)
    expect(ids).toEqual(['idle', 'loading'])
    expect(machine.states[0].source).toBe('heuristic')
    expect(machine.states[0].mockData).toEqual({ isLoading: false })
    expect(machine.states[1].mockData).toEqual({ isLoading: true })
  })

  it('applies heuristics to isOpen selector field', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{
        name: 'useUIStore',
        importPath: '../stores/uiStore',
        arguments: ['(s) => s.isOpen'],
        returnVariable: 'isOpen',
        destructuredFields: ['isOpen'],
        selectorPattern: true,
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    expect(machine.states.map((s: StateNode) => s.id)).toEqual(['closed', 'open'])
  })

  it('skips Layer 1.5 when selector field has no heuristic match', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{
        name: 'useStore',
        importPath: '../stores/store',
        arguments: ['(s) => s.username'],  // no heuristic pattern
        returnVariable: 'username',
        destructuredFields: ['username'],
        selectorPattern: true,
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    // Falls through to default
    expect(machine.states[0].id).toBe('default')
  })

  it('Layer 1 takes priority over Layer 1.5 (library hook wins)', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [
        // Library hook (Layer 1 match)
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' },
        // Selector hook (Layer 1.5 candidate)
        { name: 'useStore', importPath: '../store', arguments: ['(s) => s.isLoading'], returnVariable: 'isLoading', destructuredFields: ['isLoading'], selectorPattern: true },
      ],
    }
    const machine = deriveStateMachine('Screen', facts)
    // Layer 1 wins — 4 states from useQuery, not 2 from heuristic
    expect(machine.states).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd /Users/loclam/Desktop/preview-tool
npx vitest run packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts 2>&1 | tail -15
```

Expected: 4 new tests FAIL.

- [ ] **Step 3: Add Layer 1.5 to deriveStates**

In `packages/cli/src/analyzer/derive-state-machine.ts`, inside `deriveStates(facts, registry)`, add after the Layer 1 block and before Layer 2:

```ts
  // Layer 1.5: Zustand selector pattern
  // When collect-facts aggregates multiple useStore((s) => s.field) calls,
  // it sets selectorPattern = true and destructuredFields = [field names].
  // Apply heuristics to the first field that matches a known pattern.
  // mockData key = the field name (same key the component reads from the store).
  for (const hook of facts.hooks) {
    if (!hook.selectorPattern || !hook.destructuredFields?.length) continue
    for (const field of hook.destructuredFields) {
      const match = matchHeuristic(field)
      if (match) {
        return match.states.map((id, i): StateNode => ({
          id,
          label: capitalize(id),
          mockData: { [field]: heuristicMockValue(field, id, i) },
          source: 'heuristic',
        }))
      }
    }
  }
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd /Users/loclam/Desktop/preview-tool
npx vitest run packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd /Users/loclam/Desktop/preview-tool && npx vitest run 2>&1 | tail -8
```

Expected: all tests pass.

- [ ] **Step 6: Run full suite**

```bash
cd /Users/loclam/Desktop/preview-tool && npx vitest run 2>&1 | tail -8
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/analyzer/derive-state-machine.ts \
        packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts
git commit -m "feat: Layer 1.5 — apply heuristics to Zustand selector fields"
```

---

## Chunk 2: Alias Resolution from tsconfig.json

### Task 3: Read project tsconfig.json paths into Vite alias array

**Context:**
- `create-vite-config.ts` lines 220–222 hardcode `@/` and `~/` → `src/`. Any project where these resolve differently silently loads wrong files.
- Fix: new `read-project-aliases.ts` reads `tsconfig.json` `compilerOptions.paths` and converts to Vite alias entries. `create-vite-config.ts` calls this and merges the result, falling back to `src/` if no paths are defined.
- The project aliases must be the **last** entries in `aliasArray` so that `__real:`, mock, and React dedup aliases still win. Within the project aliases, more-specific paths (longer `find`) should precede shorter ones so `@/components` doesn't accidentally match before `@/`.

**Files:**
- Create: `packages/cli/src/resolver/read-project-aliases.ts`
- Modify: `packages/cli/src/server/create-vite-config.ts` (lines 219–222)
- Test: `packages/cli/src/resolver/__tests__/read-project-aliases.test.ts`

---

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/resolver/__tests__/read-project-aliases.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readProjectAliases } from '../read-project-aliases.js'

let tmp: string
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'alias-test-')) })
afterEach(() => { rmSync(tmp, { recursive: true, force: true }) })

function writeTsconfig(cwd: string, paths: Record<string, string[]>) {
  writeFileSync(join(cwd, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { paths }
  }))
}

describe('readProjectAliases', () => {
  it('returns empty array when no tsconfig.json', () => {
    expect(readProjectAliases('/does/not/exist')).toEqual([])
  })

  it('returns empty array when tsconfig has no paths', () => {
    writeFileSync(join(tmp, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
    expect(readProjectAliases(tmp)).toEqual([])
  })

  it('converts @/* path to Vite alias', () => {
    writeTsconfig(tmp, { '@/*': ['src/*'] })
    const aliases = readProjectAliases(tmp)
    expect(aliases).toHaveLength(1)
    expect(aliases[0].find).toBe('@/')
    expect(aliases[0].replacement).toBe(join(tmp, 'src') + '/')
  })

  it('converts bare @ alias (no wildcard)', () => {
    writeTsconfig(tmp, { '@': ['src'] })
    const aliases = readProjectAliases(tmp)
    expect(aliases[0].find).toBe('@')
    expect(aliases[0].replacement).toBe(join(tmp, 'src'))
  })

  it('converts multiple aliases', () => {
    writeTsconfig(tmp, {
      '@/*': ['src/*'],
      '~/*': ['src/*'],
      '@components/*': ['src/components/*'],
    })
    const aliases = readProjectAliases(tmp)
    expect(aliases).toHaveLength(3)
    const finds = aliases.map(a => a.find)
    expect(finds).toContain('@/')
    expect(finds).toContain('~/')
    expect(finds).toContain('@components/')
  })

  it('longer aliases sort before shorter ones', () => {
    writeTsconfig(tmp, {
      '@/*': ['src/*'],
      '@components/*': ['src/components/*'],
    })
    const aliases = readProjectAliases(tmp)
    // @components/ must appear before @/ to prevent early match
    const componentsIdx = aliases.findIndex(a => a.find === '@components/')
    const atIdx = aliases.findIndex(a => a.find === '@/')
    expect(componentsIdx).toBeLessThan(atIdx)
  })

  it('handles monorepo path: @company/* → packages/shared/*', () => {
    writeTsconfig(tmp, { '@company/*': ['packages/shared/*'] })
    const aliases = readProjectAliases(tmp)
    expect(aliases[0].replacement).toBe(join(tmp, 'packages/shared') + '/')
  })

  it('returns empty array when tsconfig.json is malformed JSON', () => {
    writeFileSync(join(tmp, 'tsconfig.json'), '{ broken json')
    expect(readProjectAliases(tmp)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd /Users/loclam/Desktop/preview-tool
npx vitest run packages/cli/src/resolver/__tests__/read-project-aliases.test.ts 2>&1 | tail -15
```

Expected: 8 tests FAIL (module not found).

- [ ] **Step 3: Implement read-project-aliases.ts**

Create `packages/cli/src/resolver/read-project-aliases.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface AliasEntry {
  find: string
  replacement: string
}

/**
 * Reads compilerOptions.paths from the project's tsconfig.json and converts
 * each path mapping to a Vite resolve.alias entry.
 *
 * Rules:
 *   "@/*": ["src/*"]      →  { find: "@/",  replacement: "<cwd>/src/" }
 *   "@":   ["src"]        →  { find: "@",   replacement: "<cwd>/src"  }
 *
 * Entries are sorted longest-find-first so "@components/" precedes "@/" and
 * more-specific aliases always win.
 *
 * Returns [] if tsconfig.json is absent, has no paths, or cannot be parsed.
 */
export function readProjectAliases(cwd: string): AliasEntry[] {
  const tsconfigPath = join(cwd, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return []

  let tsconfig: Record<string, unknown>
  try {
    tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8')) as Record<string, unknown>
  } catch {
    return []
  }

  const compilerOptions = tsconfig['compilerOptions'] as Record<string, unknown> | undefined
  const paths = compilerOptions?.['paths'] as Record<string, string[]> | undefined
  if (!paths || typeof paths !== 'object') return []

  const aliases: AliasEntry[] = []

  for (const [alias, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets) || targets.length === 0) continue
    const target = targets[0] as string

    const hasWildcard = alias.endsWith('/*')
    const find = hasWildcard
      ? alias.slice(0, -1)                  // "@/*" → "@/"
      : alias                               // "@"   → "@"
    const resolvedTarget = target.replace(/\/\*$/, '')  // "src/*" → "src"
    const replacement = hasWildcard
      ? join(cwd, resolvedTarget) + '/'
      : join(cwd, resolvedTarget)

    aliases.push({ find, replacement })
  }

  // Longest find first — prevents "@/" from matching before "@components/"
  aliases.sort((a, b) => b.find.length - a.find.length)

  return aliases
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd /Users/loclam/Desktop/preview-tool
npx vitest run packages/cli/src/resolver/__tests__/read-project-aliases.test.ts 2>&1 | tail -10
```

Expected: 8 tests pass.

- [ ] **Step 5: Wire into create-vite-config.ts**

In `packages/cli/src/server/create-vite-config.ts`:

Add import at the top (near other imports):
```ts
import { readProjectAliases } from '../resolver/read-project-aliases.js'
```

Replace lines 219–222 (the hardcoded `~/`, `@/`, `@` entries):

```ts
// Before:
    // 4. General path aliases (must be last — catches anything not matched above)
    { find: '~/', replacement: join(cwd, 'src') + '/' },
    { find: '@/', replacement: join(cwd, 'src') + '/' },
    { find: '@', replacement: join(cwd, 'src') },

// After:
    // 4. Project path aliases from tsconfig.json (longest-find-first, falling back to src/)
    ...buildProjectAliases(cwd),
```

Add the helper function anywhere in the file (e.g., after `writeNodeShims`):

```ts
/**
 * Returns project-specific path aliases from tsconfig.json paths.
 *
 * If the project defines ANY paths in tsconfig.json, ALL of those paths are
 * returned — we trust the project's own configuration and don't mix in
 * defaults. Projects that use ~/ must have it in their tsconfig.
 *
 * Falls back to the conventional @/ + ~/ → src/ mapping ONLY when tsconfig
 * has no paths at all (e.g. a plain CRA project). This preserves backwards
 * compatibility for projects that rely on the old hardcoded defaults.
 */
function buildProjectAliases(cwd: string): Array<{ find: string; replacement: string }> {
  const fromTsconfig = readProjectAliases(cwd)
  if (fromTsconfig.length > 0) return fromTsconfig
  // Fallback: used only when tsconfig has no paths section
  return [
    { find: '~/', replacement: join(cwd, 'src') + '/' },
    { find: '@/', replacement: join(cwd, 'src') + '/' },
    { find: '@',  replacement: join(cwd, 'src') },
  ]
}
```

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/loclam/Desktop/preview-tool && npx vitest run 2>&1 | tail -8
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/resolver/read-project-aliases.ts \
        packages/cli/src/resolver/__tests__/read-project-aliases.test.ts \
        packages/cli/src/server/create-vite-config.ts
git commit -m "feat: read tsconfig.json paths for Vite alias resolution instead of hardcoding @/ → src/"
```

---

## Chunk 3: Expand Test Fixtures

### Task 4: Add React Query and form fixture screens to sample-app

**Context:**
- The sample-app fixture has only 2 screens using plain `useState + useEffect`. It exercises Layer 6 heuristics, but not the library registry (Layer 1).
- Goal: add two screens that import from `@tanstack/react-query` and `react-hook-form` so the integration tests actually verify Layer 1 detection.
- **ts-morph safety:** `collect-facts.ts` reads import paths from AST string literals — it does NOT resolve modules. The `importPath` of `useQuery` will be read as `'@tanstack/react-query'` regardless of whether the package is installed. Ambient declarations let TypeScript compile the `.tsx` files without errors (since `strict: true` requires imports to be resolvable). `skipLibCheck: true` is already set. There is no crash risk.
- **TDD sequence:** write failing assertions in the integration test FIRST, then add the fixture screens.

**Files:**
- Modify: `packages/cli/src/__tests__/integration/scenarios.test.ts` (add targeted assertions)
- Create: `packages/cli/test-fixtures/sample-app/src/@types/tanstack__react-query.d.ts`
- Create: `packages/cli/test-fixtures/sample-app/src/@types/react-hook-form.d.ts`
- Create: `packages/cli/test-fixtures/sample-app/src/screens/products/index.tsx`
- Create: `packages/cli/test-fixtures/sample-app/src/screens/checkout/index.tsx`

---

- [ ] **Step 1: Write failing integration test assertions**

In `packages/cli/src/__tests__/integration/scenarios.test.ts`, add two new `it()` tests inside the `skipIfNoFixture` describe block (after the existing 5 tests):

```ts
  it('generates a scenario file for the products screen (Layer 1: useQuery)', () => {
    // products screen imports useQuery from @tanstack/react-query
    // deriveStateMachine Layer 1 should produce idle/loading/success/error states
    const productsFile = join(SCENARIOS_DIR, 'products.ts')
    expect(existsSync(productsFile)).toBe(true)
    const content = readFileSync(productsFile, 'utf-8')
    expect(content).toContain('"library"')
    expect(content).toContain('"success"')
  })

  it('generates a scenario file for the checkout screen (Layer 1: useForm)', () => {
    // checkout screen imports useForm from react-hook-form
    // deriveStateMachine Layer 1 should produce form states (idle/dirty/submitting/...)
    const checkoutFile = join(SCENARIOS_DIR, 'checkout.ts')
    expect(existsSync(checkoutFile)).toBe(true)
    const content = readFileSync(checkoutFile, 'utf-8')
    expect(content).toContain('"form"')
  })
```

- [ ] **Step 2: Run tests and confirm the new assertions fail**

```bash
cd /Users/loclam/Desktop/preview-tool
npx vitest run packages/cli/src/__tests__/integration/scenarios.test.ts 2>&1 | tail -15
```

Expected: 2 new tests FAIL (products.ts and checkout.ts don't exist yet).

- [ ] **Step 3: Add ambient type declarations**

Create `packages/cli/test-fixtures/sample-app/src/@types/tanstack__react-query.d.ts`:

```ts
// Minimal ambient declaration for test fixture — not the real package types.
// Allows TypeScript to compile screens that import from @tanstack/react-query
// without requiring the package to be installed.
declare module '@tanstack/react-query' {
  export function useQuery(options: Record<string, unknown>): {
    data: unknown
    isLoading: boolean
    isPending: boolean
    error: unknown
  }
  export function useMutation(options: Record<string, unknown>): {
    mutate: (vars: unknown) => void
    isPending: boolean
    error: unknown
  }
  export function useSuspenseQuery(options: Record<string, unknown>): {
    data: unknown
    isPending: boolean
    error: unknown
  }
}
```

Create `packages/cli/test-fixtures/sample-app/src/@types/react-hook-form.d.ts`:

```ts
// Minimal ambient declaration for test fixture — not the real package types.
declare module 'react-hook-form' {
  export function useForm<T = Record<string, unknown>>(): {
    register: (name: string) => Record<string, unknown>
    handleSubmit: (fn: (data: T) => void) => (e: unknown) => void
    formState: { isDirty: boolean; isSubmitting: boolean; errors: Record<string, { message: string }> }
  }
}
```

- [ ] **Step 4: Add products screen (Layer 1 — React Query useQuery)**

Create `packages/cli/test-fixtures/sample-app/src/screens/products/index.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'

interface Product {
  id: string
  name: string
  price: number
}

export default function Products() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: async (): Promise<Product[]> => {
      const res = await fetch('/api/products')
      return res.json()
    },
  })

  if (isLoading) return <div>Loading products...</div>
  if (error) return <div>Failed to load products</div>

  return (
    <ul>
      {(data as Product[] | undefined)?.map(p => (
        <li key={p.id}>{p.name} — ${p.price}</li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 5: Add checkout screen (Layer 1 — react-hook-form useForm)**

Create `packages/cli/test-fixtures/sample-app/src/screens/checkout/index.tsx`:

```tsx
import { useForm } from 'react-hook-form'

interface CheckoutForm {
  name: string
  email: string
  cardNumber: string
}

export default function Checkout() {
  const { register, handleSubmit, formState: { isDirty, isSubmitting, errors } } = useForm<CheckoutForm>()

  const onSubmit = (data: CheckoutForm) => {
    console.log('submit', data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} placeholder="Name" />
      {errors.name && <span>{errors.name.message}</span>}

      <input {...register('email')} placeholder="Email" />
      {errors.email && <span>{errors.email.message}</span>}

      <input {...register('cardNumber')} placeholder="Card number" />

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Processing...' : 'Pay now'}
      </button>

      {isDirty && <p>You have unsaved changes</p>}
    </form>
  )
}
```

- [ ] **Step 6: Run tests and confirm they pass**

```bash
cd /Users/loclam/Desktop/preview-tool && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass (existing 5 + 2 new integration assertions).

- [ ] **Step 7: pnpm build**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm build 2>&1 | tail -5
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/__tests__/integration/scenarios.test.ts \
        packages/cli/test-fixtures/sample-app/src/screens/products \
        packages/cli/test-fixtures/sample-app/src/screens/checkout \
        packages/cli/test-fixtures/sample-app/src/@types
git commit -m "test: add React Query and react-hook-form fixture screens + integration assertions"
```

---

## Final Verification

- [ ] **Run full test suite one last time**

```bash
cd /Users/loclam/Desktop/preview-tool && npx vitest run 2>&1 | tail -8
```

Expected output:
```
 Test Files  XX passed (XX)
      Tests  5XX passed (5XX)
```

- [ ] **Build check**

```bash
cd /Users/loclam/Desktop/preview-tool && pnpm build 2>&1 | tail -5
```

Expected: clean build, no TypeScript errors.

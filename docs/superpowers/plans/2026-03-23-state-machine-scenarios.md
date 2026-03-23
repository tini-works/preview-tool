# State Machine Scenarios Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive a `ScreenStateMachine` per screen via pure static AST analysis and generate `.preview/scenarios/[route].ts` files — one previewable scenario per state.

**Architecture:** A new pure-function analyzer (`derive-state-machine.ts`) composes existing `ScreenFacts` through analysis layers (library fingerprints → useReducer → useState enum → heuristics → conditionals). A new codegen file (`generate-scenarios.ts`) serializes each machine to a TypeScript scenario file. Both are wired into the existing `generator/index.ts` pipeline after V2 mock generation.

**Tech Stack:** TypeScript strict, ts-morph AST, Vitest (tests), existing `ScreenFacts` / `HookFact` / `LocalStateFact` types from `packages/cli/src/analyzer/types.ts`.

---

## Chunk 1: Types + collect-facts.ts fix

### Task 1: Extend `LocalStateFact` and add new types to `types.ts`

**Files:**
- Modify: `packages/cli/src/analyzer/types.ts`
- Modify: `packages/cli/src/analyzer/collect-facts.ts`
- Modify: `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

- [ ] **Step 1: Write the failing test for useReducer hook field**

  Open `packages/cli/src/analyzer/__tests__/collect-facts.test.ts` and add inside the `extractLocalStateFacts` describe block:

  ```typescript
  it('marks useReducer calls with hook: useReducer', () => {
    const sf = createSourceFile(`
      function reducer(state: string, action: { type: string }) {
        switch (action.type) {
          case 'LOAD': return 'loading'
          default: return state
        }
      }
      function Screen() {
        const [status, dispatch] = useReducer(reducer, 'idle')
        return <div>{status}</div>
      }
    `)
    const facts = extractLocalStateFacts(sf)
    const reducerFact = facts.find(f => f.name === 'status')
    expect(reducerFact).toBeDefined()
    expect(reducerFact!.hook).toBe('useReducer')
    expect(reducerFact!.initialValue).toBe("'idle'")
  })
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts 2>&1 | tail -20
  ```

  Expected: FAIL — `expect('useState').toBe('useReducer')`

- [ ] **Step 3: Add new types to `types.ts`**

  In `packages/cli/src/analyzer/types.ts`:

  a) Find `LocalStateFact` interface (around line 234) and change `hook: 'useState' | 'useRef'` to:
  ```typescript
  hook: 'useState' | 'useRef' | 'useReducer'
  ```

  b) Add `reducerSource` and `valueTypeUnion` optional fields inside `LocalStateFact`:
  ```typescript
  /** Raw source text of the reducer function; present when hook === 'useReducer' */
  reducerSource?: string
  /** Literal union values from useState<'a' | 'b' | 'c'>; present when generic type is a string union */
  valueTypeUnion?: string[]
  ```

  c) Append new types at the end of the file:
  ```typescript
  // ── State Machine types ───────────────────────────────────────────────────

  export type StateSource =
    | 'library'
    | 'use-reducer'
    | 'use-state-enum'
    | 'store'
    | 'form'
    | 'heuristic'
    | 'conditional'
    | 'unknown'

  export interface StateNode {
    id: string
    label: string
    mockData: Record<string, unknown>
    source: StateSource
  }

  export interface Transition {
    event: string
    from: string
    to: string
    type: 'internal' | 'navigate'
  }

  export interface ScreenStateMachine {
    screenName: string
    states: StateNode[]
    transitions: Transition[]
    initialState: string
  }

  export interface MachineTemplate {
    states: StateNode[]
    initial: string
    source: StateSource
  }
  ```

- [ ] **Step 4: Fix `collect-facts.ts` — mark useReducer correctly and capture reducerSource**

  In `packages/cli/src/analyzer/collect-facts.ts`, find the `useReducer` branch (~line 275-292):

  Change line ~288:
  ```typescript
  hook: 'useState', // Treat useReducer like useState for region generation
  ```
  To:
  ```typescript
  hook: 'useReducer',
  ```

  Also capture `reducerSource` — the reducer function is the first argument. Add before the `facts.push(...)`:
  ```typescript
  const reducerArg = args[0]
  const reducerSource = reducerArg ? reducerArg.getText() : undefined
  ```

  Add to the pushed fact:
  ```typescript
  ...(reducerSource ? { reducerSource } : {}),
  ```

  Then check the filter at line ~1149 that reads `if (local.hook !== 'useState') continue` — this filter intentionally excludes useReducer facts from one code path. Verify with:
  ```bash
  grep -n "hook.*!==.*useState\|hook.*===.*useState" packages/cli/src/analyzer/collect-facts.ts packages/cli/src/generator/index.ts packages/cli/src/generator/generate-all-v2.ts 2>/dev/null
  ```

  For any `hook === 'useState'` check that should also include useReducer, add `|| local.hook === 'useReducer'`. Leave `hook !== 'useState'` guards that deliberately exclude reducers untouched — they prevent duplicate processing.

- [ ] **Step 5: Run the new test to confirm it passes**

  ```bash
  cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts 2>&1 | tail -20
  ```

  Expected: all tests PASS

- [ ] **Step 6: Run full test suite to confirm no regressions**

  ```bash
  cd packages/cli && npx vitest run 2>&1 | tail -30
  ```

  Expected: all tests PASS

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/loclam/Desktop/preview-tool
  git add packages/cli/src/analyzer/types.ts packages/cli/src/analyzer/collect-facts.ts packages/cli/src/analyzer/__tests__/collect-facts.test.ts
  git commit -m "feat: extend LocalStateFact to distinguish useReducer, add ScreenStateMachine types"
  ```

---

## Chunk 2: `derive-state-machine.ts`

### Task 2: Library fingerprint layer (Layer 1)

**Files:**
- Create: `packages/cli/src/analyzer/derive-state-machine.ts`
- Create: `packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts`

- [ ] **Step 1: Write the failing tests for Layer 1**

  Create `packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { deriveStateMachine } from '../derive-state-machine.js'
  import type { ScreenFacts } from '../types.js'

  // ScreenFacts requires sourceCode — include it in the base fixture
  function emptyFacts(): ScreenFacts {
    return {
      route: '/test',
      filePath: 'test.tsx',
      sourceCode: '',
      hooks: [],
      components: [],
      conditionals: [],
      navigation: [],
      localState: [],
      derivedVars: [],
      functions: [],
      propertyChains: [],
    }
  }

  describe('deriveStateMachine — Layer 1: library fingerprints', () => {
    it('maps useQuery to idle/loading/success/error', () => {
      const facts: ScreenFacts = {
        ...emptyFacts(),
        hooks: [{
          name: 'useQuery',
          importPath: '@tanstack/react-query',
          arguments: [],
          returnVariable: 'result',
        }],
      }
      const machine = deriveStateMachine('HomeScreen', facts)
      const ids = machine.states.map(s => s.id)
      expect(ids).toEqual(['idle', 'loading', 'success', 'error'])
      expect(machine.states[0].source).toBe('library')
      expect(machine.initialState).toBe('success')
    })

    it('maps useMutation to idle/loading/success/error', () => {
      const facts: ScreenFacts = {
        ...emptyFacts(),
        hooks: [{
          name: 'useMutation',
          importPath: '@tanstack/react-query',
          arguments: [],
          returnVariable: 'mutation',
        }],
      }
      const machine = deriveStateMachine('FormScreen', facts)
      const ids = machine.states.map(s => s.id)
      expect(ids).toEqual(['idle', 'loading', 'success', 'error'])
    })

    it('maps useForm to form states', () => {
      const facts: ScreenFacts = {
        ...emptyFacts(),
        hooks: [{
          name: 'useForm',
          importPath: 'react-hook-form',
          arguments: [],
          returnVariable: 'form',
        }],
      }
      const machine = deriveStateMachine('LoginScreen', facts)
      const ids = machine.states.map(s => s.id)
      expect(ids).toContain('submitting')
      expect(machine.states[0].source).toBe('form')
    })

    it('falls back to default for unknown hook', () => {
      const facts: ScreenFacts = {
        ...emptyFacts(),
        hooks: [{
          name: 'useCustomThing',
          importPath: '../hooks/useCustomThing',
          arguments: [],
          returnVariable: 'thing',
        }],
      }
      const machine = deriveStateMachine('Screen', facts)
      expect(machine.states).toHaveLength(1)
      expect(machine.states[0].id).toBe('default')
      expect(machine.states[0].source).toBe('unknown')
    })

    it('never throws on empty facts', () => {
      expect(() => deriveStateMachine('Empty', emptyFacts())).not.toThrow()
      const machine = deriveStateMachine('Empty', emptyFacts())
      expect(machine.states).toHaveLength(1)
      expect(machine.states[0].id).toBe('default')
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd packages/cli && npx vitest run src/analyzer/__tests__/derive-state-machine.test.ts 2>&1 | tail -15
  ```

  Expected: FAIL — `Cannot find module '../derive-state-machine.js'`

- [ ] **Step 3: Create `derive-state-machine.ts` with Layer 1**

  Create `packages/cli/src/analyzer/derive-state-machine.ts`:

  ```typescript
  import type {
    ScreenFacts,
    ScreenStateMachine,
    StateNode,
    MachineTemplate,
    StateSource,
  } from './types.js'

  // ── Constants ─────────────────────────────────────────────────────────────

  const DEFAULT_STATE: StateNode = { id: 'default', label: 'Default', mockData: {}, source: 'unknown' }

  // ── Library fingerprint registry ─────────────────────────────────────────

  const DATA_FETCHER_MACHINE: MachineTemplate = {
    states: [
      { id: 'idle',    label: 'Initial state', mockData: {},                                                                          source: 'library' },
      { id: 'loading', label: 'Fetching data', mockData: { isLoading: true,  data: undefined, error: undefined },                     source: 'library' },
      { id: 'success', label: 'Data loaded',   mockData: { isLoading: false, data: [],        error: undefined },                     source: 'library' },
      { id: 'error',   label: 'Fetch failed',  mockData: { isLoading: false, data: undefined, error: { message: 'Network error' } },  source: 'library' },
    ],
    initial: 'idle',
    source: 'library',
  }

  const MUTATION_MACHINE: MachineTemplate = {
    states: [
      { id: 'idle',    label: 'Ready',      mockData: { isPending: false },                                           source: 'library' },
      { id: 'loading', label: 'Submitting', mockData: { isPending: true },                                            source: 'library' },
      { id: 'success', label: 'Completed',  mockData: { isPending: false, data: {} },                                 source: 'library' },
      { id: 'error',   label: 'Failed',     mockData: { isPending: false, error: { message: 'Submission failed' } },  source: 'library' },
    ],
    initial: 'idle',
    source: 'library',
  }

  const FORM_MACHINE: MachineTemplate = {
    states: [
      { id: 'idle',       label: 'Pristine',   mockData: { isDirty: false, isSubmitting: false, isSubmitted: false },                               source: 'form' },
      { id: 'dirty',      label: 'Editing',    mockData: { isDirty: true,  isSubmitting: false, isSubmitted: false },                               source: 'form' },
      { id: 'submitting', label: 'Submitting', mockData: { isDirty: true,  isSubmitting: true,  isSubmitted: false },                               source: 'form' },
      { id: 'submitted',  label: 'Submitted',  mockData: { isDirty: false, isSubmitting: false, isSubmitted: true  },                               source: 'form' },
      { id: 'error',      label: 'Has errors', mockData: { isDirty: true,  isSubmitting: false, errors: { field: { message: 'Required' } } },  source: 'form' },
    ],
    initial: 'idle',
    source: 'form',
  }

  const LIBRARY_REGISTRY: Record<string, MachineTemplate> = {
    '@tanstack/react-query#useQuery':         DATA_FETCHER_MACHINE,
    '@tanstack/react-query#useInfiniteQuery': DATA_FETCHER_MACHINE,
    'swr#useSWR':                             DATA_FETCHER_MACHINE,
    '@apollo/client#useQuery':                DATA_FETCHER_MACHINE,
    '@tanstack/react-query#useMutation':      MUTATION_MACHINE,
    '@apollo/client#useMutation':             MUTATION_MACHINE,
    'react-hook-form#useForm':                FORM_MACHINE,
    'formik#useFormik':                       FORM_MACHINE,
  }

  // ── Main export ───────────────────────────────────────────────────────────

  export function deriveStateMachine(screenName: string, facts: ScreenFacts): ScreenStateMachine {
    try {
      const states = deriveStates(facts)
      const transitions = deriveTransitions(facts)
      const initialState = pickDefaultState(states)
      return { screenName, states, transitions, initialState }
    } catch {
      return { screenName, states: [DEFAULT_STATE], transitions: [], initialState: 'default' }
    }
  }

  // ── State derivation ──────────────────────────────────────────────────────

  function deriveStates(facts: ScreenFacts): StateNode[] {
    // Layer 1: library fingerprints (highest priority)
    for (const hook of facts.hooks) {
      const key = `${hook.importPath}#${hook.name}`
      const template = LIBRARY_REGISTRY[key]
      if (template) return template.states
    }

    // Layers 2, 3, 6, 7 implemented in later tasks
    return [DEFAULT_STATE]
  }

  function deriveTransitions(facts: ScreenFacts) {
    // NavigationFact has fields: target (route) and trigger (description)
    return facts.navigation.map(nav => ({
      event: nav.trigger,
      from: '*',
      to: nav.target,
      type: 'navigate' as const,
    }))
  }

  function pickDefaultState(states: StateNode[]): string {
    if (states.some(s => s.id === 'success')) return 'success'
    if (states.some(s => s.id === 'done')) return 'done'
    return states[0]?.id ?? 'default'
  }
  ```

- [ ] **Step 4: Run Layer 1 tests to confirm they pass**

  ```bash
  cd packages/cli && npx vitest run src/analyzer/__tests__/derive-state-machine.test.ts 2>&1 | tail -15
  ```

  Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/loclam/Desktop/preview-tool
  git add packages/cli/src/analyzer/derive-state-machine.ts packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts
  git commit -m "feat: derive-state-machine Layer 1 — library fingerprints"
  ```

### Task 3: useState enum + heuristic layers (Layers 3 & 6)

**Files:**
- Modify: `packages/cli/src/analyzer/derive-state-machine.ts`
- Modify: `packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts`

- [ ] **Step 1: Add tests for Layer 3 and Layer 6**

  Append to `derive-state-machine.test.ts`:

  ```typescript
  describe('deriveStateMachine — Layer 3: useState enum', () => {
    it('extracts union literal type as state ids', () => {
      const facts: ScreenFacts = {
        ...emptyFacts(),
        localState: [{
          name: 'status',
          hook: 'useState',
          initialValue: "'idle'",
          valueType: 'string',
          valueTypeUnion: ['idle', 'loading', 'done'],
        }],
      }
      const machine = deriveStateMachine('Screen', facts)
      const ids = machine.states.map(s => s.id)
      expect(ids).toEqual(['idle', 'loading', 'done'])
      expect(machine.states[0].source).toBe('use-state-enum')
      expect(machine.initialState).toBe('done')   // pickDefaultState prefers 'done' over 'idle'
    })
  })

  describe('deriveStateMachine — Layer 6: heuristics', () => {
    it('maps isLoading variable to idle/loading states', () => {
      const facts: ScreenFacts = {
        ...emptyFacts(),
        localState: [{
          name: 'isLoading',
          hook: 'useState',
          initialValue: 'false',
          valueType: 'boolean',
        }],
      }
      const machine = deriveStateMachine('Screen', facts)
      const ids = machine.states.map(s => s.id)
      expect(ids).toContain('idle')
      expect(ids).toContain('loading')
      expect(machine.states[0].source).toBe('heuristic')
    })

    it('maps isOpen variable to closed/open states', () => {
      const facts: ScreenFacts = {
        ...emptyFacts(),
        localState: [{
          name: 'isOpen',
          hook: 'useState',
          initialValue: 'false',
          valueType: 'boolean',
        }],
      }
      const machine = deriveStateMachine('ModalScreen', facts)
      const ids = machine.states.map(s => s.id)
      expect(ids).toEqual(['closed', 'open'])
    })

    it('useReducer without reducerSource does not trigger heuristic (heuristic only matches useState)', () => {
      const facts: ScreenFacts = {
        ...emptyFacts(),
        localState: [{
          name: 'isLoading',
          hook: 'useReducer',
          initialValue: 'false',
          valueType: 'boolean',
          // no reducerSource — falls through all layers
        }],
      }
      const machine = deriveStateMachine('Screen', facts)
      // Layer 6 only processes hook === 'useState', so this falls to default
      expect(machine.states[0].id).toBe('default')
      expect(machine.states[0].source).toBe('unknown')
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm new ones fail**

  ```bash
  cd packages/cli && npx vitest run src/analyzer/__tests__/derive-state-machine.test.ts 2>&1 | tail -20
  ```

  Expected: Layer 1 tests PASS, Layer 3 and Layer 6 tests FAIL

- [ ] **Step 3: Add `valueTypeUnion` extraction to `collect-facts.ts`**

  In `collect-facts.ts`, find the `useState` branch (~line 253-274) where the fact is pushed. After deriving `valueType`, extract the union type literals from the type argument:

  ```typescript
  // Extract union type literals from useState<'a' | 'b' | 'c'>
  const typeArgs = callExpr.getTypeArguments()
  let valueTypeUnion: string[] | undefined
  if (typeArgs.length > 0) {
    const typeArg = typeArgs[0]
    const resolvedType = typeArg.getType()
    if (resolvedType.isUnion()) {
      const literalValues = resolvedType
        .getUnionTypes()
        .map(t => {
          const lit = t.getLiteralValue()
          return typeof lit === 'string' ? lit : undefined
        })
        .filter((v): v is string => v !== undefined)
      if (literalValues.length >= 2) valueTypeUnion = literalValues
    }
  }
  ```

  Add `...(valueTypeUnion ? { valueTypeUnion } : {})` to the pushed fact.

  **Note:** `getLiteralValue()` returns the raw string value (e.g. `'idle'` → `idle`). `valueTypeUnion` stores plain strings without quotes. The test fixtures above use unquoted values (e.g. `['idle', 'loading', 'done']`).

- [ ] **Step 4: Implement Layers 3 and 6 in `derive-state-machine.ts`**

  Replace `deriveStates` with the full implementation:

  ```typescript
  function deriveStates(facts: ScreenFacts): StateNode[] {
    // Layer 1: library fingerprints
    for (const hook of facts.hooks) {
      const key = `${hook.importPath}#${hook.name}`
      const template = LIBRARY_REGISTRY[key]
      if (template) return template.states
    }

    // Layer 2: useReducer switch/case (implemented in Task 4)

    // Layer 3: useState with explicit string union type
    for (const local of facts.localState) {
      if (local.hook !== 'useState') continue
      if (local.valueTypeUnion && local.valueTypeUnion.length >= 2) {
        return local.valueTypeUnion.map(id => ({
          id,
          label: capitalize(id),
          mockData: { [local.name]: id },
          source: 'use-state-enum' as StateSource,
        }))
      }
    }

    // Layer 6: variable name heuristics (only for useState — not useReducer)
    for (const local of facts.localState) {
      if (local.hook !== 'useState') continue
      const match = matchHeuristic(local.name)
      if (match) {
        return match.states.map((id, i) => ({
          id,
          label: capitalize(id),
          mockData: { [local.name]: heuristicMockValue(local.name, i) },
          source: 'heuristic' as StateSource,
        }))
      }
    }

    // Layer 7: JSX conditionals
    if (facts.conditionals.length > 0) {
      const cond = facts.conditionals[0]
      const condName = cond.condition ?? 'condition'
      return [
        { id: 'true-branch',  label: capitalize(condName) + ' true',  mockData: { [condName]: true  }, source: 'conditional' },
        { id: 'false-branch', label: capitalize(condName) + ' false', mockData: { [condName]: false }, source: 'conditional' },
      ]
    }

    return [DEFAULT_STATE]
  }

  // ── Heuristic helpers ─────────────────────────────────────────────────────

  interface HeuristicMatch { states: string[] }

  const HEURISTIC_PATTERNS: Array<{ pattern: RegExp } & HeuristicMatch> = [
    { pattern: /^is(Loading|Fetching|Pending)$/,     states: ['idle', 'loading'] },
    { pattern: /^(error|err)$/,                      states: ['idle', 'error'] },
    { pattern: /^(data|result|items|list)$/,         states: ['loading', 'success'] },
    { pattern: /^(step|currentStep|activeStep)$/,    states: ['step-1', 'step-2'] },
    { pattern: /^is(Open|Visible|Show)/,             states: ['closed', 'open'] },
    { pattern: /^is(Auth|LoggedIn|Authenticated)/,   states: ['unauthenticated', 'authenticated'] },
  ]

  function matchHeuristic(name: string): HeuristicMatch | undefined {
    return HEURISTIC_PATTERNS.find(p => p.pattern.test(name))
  }

  function heuristicMockValue(varName: string, index: number): unknown {
    // Boolean variables: false for index 0, true for index 1
    if (/^is[A-Z]/.test(varName)) return index === 1
    // Return the state id for non-boolean variables
    return undefined
  }

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')
  }
  ```

- [ ] **Step 5: Run all derive-state-machine tests**

  ```bash
  cd packages/cli && npx vitest run src/analyzer/__tests__/derive-state-machine.test.ts 2>&1 | tail -20
  ```

  Expected: all tests PASS

- [ ] **Step 6: Run full test suite**

  ```bash
  cd packages/cli && npx vitest run 2>&1 | tail -15
  ```

  Expected: all tests PASS

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/loclam/Desktop/preview-tool
  git add packages/cli/src/analyzer/derive-state-machine.ts packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts packages/cli/src/analyzer/types.ts packages/cli/src/analyzer/collect-facts.ts
  git commit -m "feat: derive-state-machine Layers 3 + 6 — useState enum and heuristics"
  ```

### Task 4: useReducer layer (Layer 2)

**Files:**
- Modify: `packages/cli/src/analyzer/derive-state-machine.ts`
- Modify: `packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts`

- [ ] **Step 1: Add useReducer tests**

  Append to `derive-state-machine.test.ts`:

  ```typescript
  describe('deriveStateMachine — Layer 2: useReducer', () => {
    it('extracts states from switch/case string literals in reducer source', () => {
      const facts: ScreenFacts = {
        ...emptyFacts(),
        localState: [{
          name: 'status',
          hook: 'useReducer',
          initialValue: "'idle'",
          valueType: 'string',
          reducerSource: `
            function reducer(state, action) {
              switch (action.type) {
                case 'FETCH': return 'loading'
                case 'SUCCESS': return 'success'
                case 'ERROR': return 'error'
                default: return state
              }
            }
          `,
        }],
      }
      const machine = deriveStateMachine('Screen', facts)
      const ids = machine.states.map(s => s.id)
      expect(ids).toContain('FETCH')
      expect(ids).toContain('SUCCESS')
      expect(ids).toContain('ERROR')
      expect(machine.states[0].source).toBe('use-reducer')
    })

    it('falls through to default when reducerSource is absent', () => {
      const facts: ScreenFacts = {
        ...emptyFacts(),
        localState: [{
          name: 'count',
          hook: 'useReducer',
          initialValue: '0',
          valueType: 'number',
          // no reducerSource, no pattern match for heuristic
        }],
      }
      const machine = deriveStateMachine('Screen', facts)
      expect(machine.states[0].id).toBe('default')
      expect(machine.states[0].source).toBe('unknown')
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm new ones fail**

  ```bash
  cd packages/cli && npx vitest run src/analyzer/__tests__/derive-state-machine.test.ts 2>&1 | tail -20
  ```

  Expected: previous tests PASS, new useReducer tests FAIL

- [ ] **Step 3: Implement Layer 2 in `derive-state-machine.ts`**

  Add the `extractReducerStates` helper:

  ```typescript
  function extractReducerStates(reducerSource: string): StateNode[] {
    // Match case 'LABEL': or case "LABEL":
    const casePattern = /case\s+['"]([^'"]+)['"]\s*:/g
    const ids: string[] = []
    let match: RegExpExecArray | null
    while ((match = casePattern.exec(reducerSource)) !== null) {
      ids.push(match[1])
    }
    if (ids.length === 0) return []
    return ids.map(id => ({
      id,
      label: capitalize(id),
      mockData: {},
      source: 'use-reducer' as StateSource,
    }))
  }
  ```

  Insert Layer 2 between Layer 1 and Layer 3 in `deriveStates`:

  ```typescript
  // Layer 2: useReducer — parse switch/case
  for (const local of facts.localState) {
    if (local.hook !== 'useReducer') continue
    if (!local.reducerSource) continue
    const states = extractReducerStates(local.reducerSource)
    if (states.length > 0) return states
  }
  ```

- [ ] **Step 4: Run all derive-state-machine tests**

  ```bash
  cd packages/cli && npx vitest run src/analyzer/__tests__/derive-state-machine.test.ts 2>&1 | tail -20
  ```

  Expected: all tests PASS

- [ ] **Step 5: Run full test suite**

  ```bash
  cd packages/cli && npx vitest run 2>&1 | tail -15
  ```

  Expected: all tests PASS

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/loclam/Desktop/preview-tool
  git add packages/cli/src/analyzer/derive-state-machine.ts packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts
  git commit -m "feat: derive-state-machine Layer 2 — useReducer switch/case tracing"
  ```

---

## Chunk 3: `generate-scenarios.ts` + runtime `Scenario` type

### Task 5: Add `Scenario` to runtime and implement `generate-scenarios.ts`

**Files:**
- Modify: `packages/runtime/src/types.ts`
- Create: `packages/cli/src/generator/generate-scenarios.ts`
- Create: `packages/cli/src/generator/__tests__/generate-scenarios.test.ts`

- [ ] **Step 1: Write the failing tests for `generate-scenarios`**

  Create `packages/cli/src/generator/__tests__/generate-scenarios.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { generateScenarios } from '../generate-scenarios.js'
  import type { ScreenStateMachine } from '../../analyzer/types.js'

  function makeMachine(overrides: Partial<ScreenStateMachine> = {}): ScreenStateMachine {
    return {
      screenName: 'HomeScreen',
      states: [
        { id: 'loading', label: 'Fetching data', mockData: { isLoading: true }, source: 'library' },
        { id: 'success', label: 'Data loaded',   mockData: { isLoading: false, data: [] }, source: 'library' },
        { id: 'error',   label: 'Fetch failed',  mockData: { isLoading: false, error: { message: 'Oops' } }, source: 'library' },
      ],
      transitions: [],
      initialState: 'loading',
      ...overrides,
    }
  }

  describe('generateScenarios', () => {
    it('produces export const scenarios', () => {
      const code = generateScenarios(makeMachine())
      expect(code).toContain('export const scenarios')
    })

    it('produces one scenario object per state', () => {
      const code = generateScenarios(makeMachine())
      const matches = code.match(/\bid:/g)
      expect(matches).toHaveLength(3)
    })

    it('exports defaultScenario = success when success state present', () => {
      const code = generateScenarios(makeMachine())
      expect(code).toContain("export const defaultScenario = 'success'")
    })

    it('exports defaultScenario = initialState when no success or done state', () => {
      const machine = makeMachine({
        states: [{ id: 'step-1', label: 'Step 1', mockData: {}, source: 'use-state-enum' }],
        initialState: 'step-1',
      })
      const code = generateScenarios(machine)
      expect(code).toContain("export const defaultScenario = 'step-1'")
    })

    it('imports Scenario type from @preview-tool/runtime', () => {
      const code = generateScenarios(makeMachine())
      expect(code).toContain("from '@preview-tool/runtime'")
    })

    it('never emits new Error(', () => {
      const machine = makeMachine({
        states: [{ id: 'error', label: 'Error', mockData: { error: { message: 'Oops' } }, source: 'library' }],
        initialState: 'error',
      })
      const code = generateScenarios(machine)
      expect(code).not.toContain('new Error(')
    })

    it('never throws on empty states', () => {
      const machine = makeMachine({ states: [], initialState: 'default' })
      expect(() => generateScenarios(machine)).not.toThrow()
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd packages/cli && npx vitest run src/generator/__tests__/generate-scenarios.test.ts 2>&1 | tail -10
  ```

  Expected: FAIL — module not found

- [ ] **Step 3: Verify `Scenario` is not already in `packages/runtime/src/types.ts`**

  ```bash
  grep -n "Scenario" packages/runtime/src/types.ts
  ```

  If not present, append to `packages/runtime/src/types.ts`:

  ```typescript
  // ── Scenario type (used by generated .preview/scenarios/*.ts) ────────────

  export interface Scenario {
    id: string
    label: string
    mockData: Record<string, unknown>
    source: string
  }
  ```

  Confirm it is re-exported via the existing `export * from './types.ts'` in `packages/runtime/src/index.ts`:

  ```bash
  grep "export \* from" packages/runtime/src/index.ts
  ```

  Expected: `export * from './types.ts'` — no change needed to `index.ts`.

- [ ] **Step 4: Create `generate-scenarios.ts`**

  Create `packages/cli/src/generator/generate-scenarios.ts`:

  ```typescript
  import type { ScreenStateMachine, StateNode } from '../analyzer/types.js'

  /**
   * Serializes a ScreenStateMachine to TypeScript source code for a scenario file.
   * Exports:
   *   - scenarios: Scenario[]   — one entry per state node
   *   - defaultScenario: string — id of the default scenario
   *
   * Never throws — returns a minimal valid file on any error.
   */
  export function generateScenarios(machine: ScreenStateMachine): string {
    try {
      const defaultScenario = pickDefault(machine)
      const scenarioObjects = machine.states.map(state => serializeScenario(state))
      const scenariosArray = `[\n${scenarioObjects.map(s => indent(s, 2)).join(',\n')},\n]`

      return [
        `// Auto-generated by preview-tool — do not edit`,
        ``,
        `import type { Scenario } from '@preview-tool/runtime'`,
        ``,
        `export const scenarios: Scenario[] = ${scenariosArray}`,
        ``,
        `export const defaultScenario = '${defaultScenario}'`,
        ``,
      ].join('\n')
    } catch {
      return fallbackOutput()
    }
  }

  function pickDefault(machine: ScreenStateMachine): string {
    if (machine.states.some(s => s.id === 'success')) return 'success'
    if (machine.states.some(s => s.id === 'done')) return 'done'
    return machine.initialState || machine.states[0]?.id || 'default'
  }

  function serializeScenario(state: StateNode): string {
    const mockDataStr = serializeMockData(state.mockData)
    return [
      `{`,
      `  id: '${state.id}',`,
      `  label: ${JSON.stringify(state.label)},`,
      `  mockData: ${mockDataStr},`,
      `  source: '${state.source}',`,
      `}`,
    ].join('\n')
  }

  function serializeMockData(data: Record<string, unknown>): string {
    if (Object.keys(data).length === 0) return '{}'
    const entries = Object.entries(data)
      .map(([k, v]) => `  ${k}: ${serializeValue(v)}`)
      .join(',\n')
    return `{\n${entries},\n}`
  }

  function serializeValue(value: unknown): string {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (typeof value === 'boolean' || typeof value === 'number') return String(value)
    if (typeof value === 'string') return JSON.stringify(value)
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]'
      return `[${value.map(serializeValue).join(', ')}]`
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${serializeValue(v)}`)
        .join(', ')
      return `{ ${entries} }`
    }
    return JSON.stringify(value)
  }

  function indent(text: string, spaces: number): string {
    const pad = ' '.repeat(spaces)
    return text.split('\n').map(line => (line ? pad + line : line)).join('\n')
  }

  function fallbackOutput(): string {
    return [
      `// Auto-generated by preview-tool — do not edit`,
      ``,
      `import type { Scenario } from '@preview-tool/runtime'`,
      ``,
      `export const scenarios: Scenario[] = [{ id: 'default', label: 'Default', mockData: {}, source: 'unknown' }]`,
      ``,
      `export const defaultScenario = 'default'`,
      ``,
    ].join('\n')
  }
  ```

- [ ] **Step 5: Run generate-scenarios tests**

  ```bash
  cd packages/cli && npx vitest run src/generator/__tests__/generate-scenarios.test.ts 2>&1 | tail -20
  ```

  Expected: all tests PASS

- [ ] **Step 6: Build runtime to verify `Scenario` is exported**

  ```bash
  cd packages/runtime && pnpm build 2>&1 | tail -10
  ```

  Expected: build succeeds with no errors

- [ ] **Step 7: Run full test suite**

  ```bash
  cd packages/cli && npx vitest run 2>&1 | tail -15
  ```

  Expected: all tests PASS

- [ ] **Step 8: Commit**

  ```bash
  cd /Users/loclam/Desktop/preview-tool
  git add packages/runtime/src/types.ts packages/cli/src/generator/generate-scenarios.ts packages/cli/src/generator/__tests__/generate-scenarios.test.ts
  git commit -m "feat: add Scenario type to runtime, implement generate-scenarios codegen"
  ```

---

## Chunk 4: Pipeline integration + integration test

### Task 6: Wire into `generator/index.ts`

**Files:**
- Modify: `packages/cli/src/generator/index.ts`

- [ ] **Step 1: Add imports to `generator/index.ts`**

  At the top of `packages/cli/src/generator/index.ts`, add:

  ```typescript
  import { deriveStateMachine } from '../analyzer/derive-state-machine.js'
  import { generateScenarios } from './generate-scenarios.js'
  ```

- [ ] **Step 2: Create `scenariosDir` alongside existing `mocksDir`**

  Find the block where `mocksDir` is created (around line 50-54):
  ```typescript
  const mocksDir = join(previewDir, 'mocks')
  // ...
  await mkdir(mocksDir, { recursive: true })
  ```

  Add directly after the last `mkdir` call in that group:
  ```typescript
  const scenariosDir = join(previewDir, 'scenarios')
  await mkdir(scenariosDir, { recursive: true })
  ```

- [ ] **Step 3: Add scenario generation inside the per-screen processing loop**

  The per-screen loop in `generator/index.ts` runs from line ~92 to line 149 (`}`). It ends with:
  ```typescript
    // Adapter (always regenerated)
    await writeFile(join(screenOutDir, 'adapter.tsx'), buildAdapterContent(screen, screenOutDir), 'utf-8')
    adaptersGenerated++
  }  // ← end of per-screen loop (line 149)
  ```

  The mock file loop (`for (const [importPath, code] of mockFiles)`) starts at line 155 and is a SEPARATE loop — `screen` is not in scope there.

  Insert the scenario block **inside the per-screen loop, immediately before its closing `}` at line 149** (after `adaptersGenerated++`):

  ```typescript
  // Scenario generation (additive — never blocks mock generation)
  try {
    const scenarioFacts = factsMap.get(screen.route)
    if (scenarioFacts) {
      const scenarioScreenName = screen.exportName ?? deriveScreenName(screen.route)
      const machine = deriveStateMachine(scenarioScreenName, scenarioFacts)
      const scenarioCode = generateScenarios(machine)
      const safeScenarioName = routeToFolderName(screen.route)
      await writeFile(join(scenariosDir, `${safeScenarioName}.ts`), scenarioCode, 'utf-8')
    }
  } catch (err) {
    if (process.env.DEBUG) console.debug(`[scenarios] skipped ${screen.route}:`, err)
  }
  ```

- [ ] **Step 4: Build to check for TypeScript errors**

  ```bash
  cd /Users/loclam/Desktop/preview-tool && pnpm build 2>&1 | tail -20
  ```

  Expected: build succeeds with no errors

- [ ] **Step 5: Run full test suite**

  ```bash
  cd packages/cli && npx vitest run 2>&1 | tail -15
  ```

  Expected: all tests PASS

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/loclam/Desktop/preview-tool
  git add packages/cli/src/generator/index.ts
  git commit -m "feat: wire scenario generation into generator pipeline"
  ```

### Task 7: Integration test against sample-app

**Files:**
- Create: `packages/cli/src/__tests__/integration/scenarios.test.ts`

- [ ] **Step 1: Check sample-app for hook patterns that trigger analysis**

  ```bash
  grep -r "useQuery\|useSWR\|useMutation\|useForm\|useReducer\|isLoading\|useState" packages/cli/test-fixtures/sample-app/src --include="*.tsx" --include="*.ts" -l
  ```

  The sample-app is likely to have `useState` with `isLoading` or similar — that triggers Layer 6 and gives `source: 'heuristic'`. If nothing is found, add to the simplest screen file:

  ```typescript
  const [isLoading, setIsLoading] = React.useState(false)
  ```

  This requires no new packages and triggers the heuristic layer.

- [ ] **Step 2: Check the actual `generateAll` and `discoverScreens` signatures**

  ```bash
  grep -n "export async function generateAll\|export async function discoverScreens" packages/cli/src/generator/index.ts packages/cli/src/analyzer/discover.ts
  ```

  Confirmed signatures (verified from source):
  - `generateAll(cwd: string, config: PreviewConfig, devToolConfig?: DevToolConfig | null): Promise<GenerateResult>`
  - `discoverScreens(cwd: string, screenGlob: string): Promise<DiscoveredScreen[]>`

- [ ] **Step 3: Create the integration test**

  Create `packages/cli/src/__tests__/integration/scenarios.test.ts`:

  ```typescript
  import { describe, it, expect, beforeAll } from 'vitest'
  import { existsSync, readdirSync, readFileSync } from 'node:fs'
  import { join, dirname } from 'node:path'
  import { fileURLToPath } from 'node:url'
  import { generateAll } from '../../generator/index.js'
  import { DEFAULT_CONFIG } from '../../lib/config.js'

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const FIXTURE_DIR = join(__dirname, '../../../test-fixtures/sample-app')
  const PREVIEW_DIR = join(FIXTURE_DIR, '.preview')
  const SCENARIOS_DIR = join(PREVIEW_DIR, 'scenarios')

  const skipIfNoFixture = existsSync(FIXTURE_DIR) ? describe : describe.skip

  skipIfNoFixture('scenario generation integration', () => {
    beforeAll(async () => {
      await generateAll(FIXTURE_DIR, DEFAULT_CONFIG)
    }, 120_000)

    it('creates scenarios directory', () => {
      expect(existsSync(SCENARIOS_DIR)).toBe(true)
    })

    it('creates at least one scenario file', () => {
      const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.ts'))
      expect(files.length).toBeGreaterThan(0)
    })

    it('each file exports scenarios and defaultScenario', () => {
      const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.ts'))
      for (const file of files) {
        const content = readFileSync(join(SCENARIOS_DIR, file), 'utf-8')
        expect(content).toContain('export const scenarios')
        expect(content).toContain('export const defaultScenario')
      }
    })

    it('at least one file has a non-unknown source', () => {
      const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.ts'))
      const hasKnownSource = files.some(file => {
        const content = readFileSync(join(SCENARIOS_DIR, file), 'utf-8')
        return (
          content.includes("source: 'library'") ||
          content.includes("source: 'use-state-enum'") ||
          content.includes("source: 'heuristic'") ||
          content.includes("source: 'use-reducer'")
        )
      })
      expect(hasKnownSource).toBe(true)
    })

    it('no file contains new Error(', () => {
      const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.ts'))
      for (const file of files) {
        const content = readFileSync(join(SCENARIOS_DIR, file), 'utf-8')
        expect(content).not.toContain('new Error(')
      }
    })
  })
  ```

- [ ] **Step 4: Run integration test**

  ```bash
  cd packages/cli && npx vitest run src/__tests__/integration/scenarios.test.ts 2>&1 | tail -30
  ```

  Expected: all tests PASS. If `generateAll` fails due to missing config (e.g. preview.json not in sample-app), check:
  ```bash
  cat packages/cli/test-fixtures/sample-app/.preview/preview.json 2>/dev/null || echo "no config"
  ```
  If missing, `DEFAULT_CONFIG` provides `screenGlob: 'src/**/*.tsx'` which should work for the sample-app.

- [ ] **Step 5: Run full test suite one final time**

  ```bash
  cd packages/cli && npx vitest run 2>&1 | tail -15
  ```

  Expected: all tests PASS

- [ ] **Step 6: Final build check**

  ```bash
  cd /Users/loclam/Desktop/preview-tool && pnpm build 2>&1 | tail -10
  ```

  Expected: build succeeds

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/loclam/Desktop/preview-tool
  git add packages/cli/src/__tests__/integration/scenarios.test.ts
  git commit -m "test: integration test for scenario generation against sample-app"
  ```

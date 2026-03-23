# Design: State Machine Scenarios for Preview Tool

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Add per-screen preview scenarios derived from static state machine analysis

---

## Overview

Analyze React screens using pure AST analysis (no LLM) to derive a `ScreenStateMachine` per screen. Generate `.preview/scenarios/[Screen].ts` files where each state node becomes a previewable scenario in the preview shell devtools.

This is **additive** — V2 mock generation is untouched. Scenarios layer on top.

---

## Architecture

### Pipeline

```
collect-facts.ts (existing, minor change to track useReducer)
  → ScreenFacts (HookFact[], NavigationFact[], LocalStateFact[], ConditionalFact[])
      ↓
derive-state-machine.ts (NEW — pure function, no LLM)
  → ScreenStateMachine { states, transitions, initialState }
      ↓
generate-scenarios.ts (NEW — codegen)
  → .preview/scenarios/[Screen].ts
```

### New Files

| File | Purpose |
|------|---------|
| `packages/cli/src/analyzer/derive-state-machine.ts` | Pure function: `(screenName: string, facts: ScreenFacts) → ScreenStateMachine` |
| `packages/cli/src/generator/generate-scenarios.ts` | Codegen: `(machine: ScreenStateMachine) → string` (TypeScript source) |
| `packages/cli/src/analyzer/__tests__/derive-state-machine.test.ts` | Unit tests for each analysis layer |
| `packages/cli/src/generator/__tests__/generate-scenarios.test.ts` | Unit tests for codegen output |

### Modified Files

| File | Change |
|------|--------|
| `packages/cli/src/generator/index.ts` | Call `deriveStateMachine` + `generateScenarios` after V2 analysis per screen. Create `scenariosDir = join(previewDir, 'scenarios')`. |
| `packages/cli/src/analyzer/types.ts` | Add `ScreenStateMachine`, `StateNode`, `Transition`, `StateSource`, `MachineTemplate` interfaces. Extend `LocalStateFact.hook` to include `'useReducer'`. |
| `packages/cli/src/analyzer/collect-facts.ts` | Change `hook: 'useState'` to `hook: 'useReducer'` for `useReducer` calls (line ~288). Currently treats them identically — they need to be distinguishable for Layer 2. |
| `packages/runtime/src/types.ts` | Add `Scenario` interface. It is already re-exported from `index.ts` via `export * from './types.ts'` — no change to `index.ts` needed. |

---

## Core Types

```typescript
// packages/cli/src/analyzer/types.ts (additions)

type StateSource =
  | 'library'         // known library fingerprint (useQuery, useSWR, etc.)
  | 'use-reducer'     // switch/case parsed from useReducer
  | 'use-state-enum'  // useState<'a'|'b'|'c'>
  | 'store'           // zustand/redux createSlice
  | 'form'            // react-hook-form / formik
  | 'heuristic'       // variable name pattern match
  | 'conditional'     // JSX if/ternary (from existing ConditionalFact[])
  | 'unknown'         // could not determine

interface StateNode {
  id: string                        // 'loading', 'success', 'error'
  label: string                     // 'Fetching data'
  mockData: Record<string, unknown>  // injected into mock hooks
  source: StateSource
}

interface Transition {
  event: string    // 'FETCH', 'handleLogin', 'navigate'
  from: string     // state id
  to: string       // state id (internal) or screen route (navigate)
  type: 'internal' | 'navigate'
}

interface ScreenStateMachine {
  screenName: string   // e.g. 'HomeScreen'
  states: StateNode[]
  transitions: Transition[]
  initialState: string  // id of the default state node
}

interface MachineTemplate {
  states: StateNode[]
  initial: string
  source: StateSource
}
```

```typescript
// packages/runtime/src/types.ts (addition — already re-exported via index.ts)

export interface Scenario {
  id: string
  label: string
  mockData: Record<string, unknown>
  source: string
}
```

```typescript
// packages/cli/src/analyzer/types.ts — extend existing LocalStateFact
// Change: hook field now includes 'useReducer'
export interface LocalStateFact {
  // ... existing fields ...
  hook: 'useState' | 'useRef' | 'useReducer'  // was: 'useState' | 'useRef'
  reducerInitialState?: unknown  // only present when hook === 'useReducer'
}
```

---

## Analysis Layers (in priority order, first match wins per hook)

### Layer 1 — Library Fingerprints (source: `'library'` or `'form'`)

A registry maps `importPath#hookName` → deterministic machine template:

```typescript
const DATA_FETCHER_MACHINE: MachineTemplate = {
  states: [
    { id: 'idle',    label: 'Initial state', mockData: {},                                                        source: 'library' },
    { id: 'loading', label: 'Fetching data', mockData: { isLoading: true, data: undefined, error: undefined },    source: 'library' },
    { id: 'success', label: 'Data loaded',   mockData: { isLoading: false, data: [], error: undefined },          source: 'library' },
    { id: 'error',   label: 'Fetch failed',  mockData: { isLoading: false, data: undefined, error: { message: 'Network error' } }, source: 'library' },
  ],
  initial: 'idle',
  source: 'library',
}

const MUTATION_MACHINE: MachineTemplate = {
  states: [
    { id: 'idle',    label: 'Ready',      mockData: { isPending: false },                                     source: 'library' },
    { id: 'loading', label: 'Submitting', mockData: { isPending: true },                                      source: 'library' },
    { id: 'success', label: 'Completed',  mockData: { isPending: false, data: {} },                           source: 'library' },
    { id: 'error',   label: 'Failed',     mockData: { isPending: false, error: { message: 'Submission failed' } }, source: 'library' },
  ],
  initial: 'idle',
  source: 'library',
}

const FORM_MACHINE: MachineTemplate = {
  states: [
    { id: 'idle',       label: 'Pristine',   mockData: { isDirty: false, isSubmitting: false, isSubmitted: false }, source: 'form' },
    { id: 'dirty',      label: 'Editing',    mockData: { isDirty: true,  isSubmitting: false, isSubmitted: false }, source: 'form' },
    { id: 'submitting', label: 'Submitting', mockData: { isDirty: true,  isSubmitting: true,  isSubmitted: false }, source: 'form' },
    { id: 'submitted',  label: 'Submitted',  mockData: { isDirty: false, isSubmitting: false, isSubmitted: true  }, source: 'form' },
    { id: 'error',      label: 'Has errors', mockData: { isDirty: true,  isSubmitting: false, errors: { field: { message: 'Required' } } }, source: 'form' },
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
```

**Note:** `error` mockData always uses plain objects `{ message: string }` — never `new Error(...)` — for safe serialization.

### Layer 2 — useReducer Tracing (source: `'use-reducer'`)

**Prerequisite:** requires the `collect-facts.ts` change that marks `hook: 'useReducer'` on `LocalStateFact`.

For each `LocalStateFact` with `hook === 'useReducer'`:
- Parse the reducer function (first argument) for `switch(action.type)` cases
- Each `case 'ACTION_NAME'`: extract the returned state object shape → becomes `mockData`
- `reducerInitialState` (second argument, captured at collection time) → becomes `initialState`

**Scope:** Inline reducers and single-hop direct imports (`import { reducer } from './reducer'`) only. Barrel re-exports (e.g. `import { reducer } from './index'`) are not followed — log a `debug`-level warning, fall through to next layer.

### Layer 3 — useState Enum (source: `'use-state-enum'`)

For each `LocalStateFact` with `hook === 'useState'`:
- Check for explicit type annotation `useState<'a' | 'b' | 'c'>` — extract union literal values as state ids
- The default value argument becomes `initialState`
- `mockData` per state: `{ [variableName]: stateId }` (e.g. `{ status: 'loading' }`)

### Layer 4 — Custom Hook Tracing

For `HookFact` entries not matched by Layer 1 and whose import resolves to a non-node_modules file:
1. Read the hook source file
2. Apply Layers 1–3 to its internal `ScreenFacts`
3. **Max depth: 2 hops.** Depth exceeded → emit `source: 'unknown'`, stop recursion
4. File unresolvable → emit `source: 'unknown'`, log `debug` warning, continue

### Layer 5 — Store Shape (source: `'store'`)

- **Zustand:** parse `create<T>(set => ({ ... }))` — extract top-level typed fields; if a field has a string union type, treat its values as state ids; `mockData` = full initial object
- **Redux:** parse `createSlice({ initialState, reducers })` — state shape from `initialState`; action names become transition events; `mockData` = `initialState`

### Layer 6 — Variable Name Heuristics (source: `'heuristic'`)

Applied to `useState` calls not matched by Layer 3 (no explicit type union):

```typescript
const HEURISTIC_PATTERNS = [
  { pattern: /^is(Loading|Fetching|Pending)$/,   states: ['idle', 'loading'],                          initial: 'idle' },
  { pattern: /^(error|err)$/,                    states: ['idle', 'error'],                            initial: 'idle' },
  { pattern: /^(data|result|items|list)$/,        states: ['loading', 'success'],                       initial: 'loading' },
  { pattern: /^(step|currentStep|activeStep)$/,   states: ['step-1', 'step-2'],                         initial: 'step-1' },
  { pattern: /^is(Open|Visible|Show)/,            states: ['closed', 'open'],                           initial: 'closed' },
  { pattern: /^is(Auth|LoggedIn|Authenticated)/,  states: ['unauthenticated', 'authenticated'],         initial: 'unauthenticated' },
]
```

`mockData` per heuristic state: `{ [variableName]: inferredBooleanOrValue }` (e.g. `{ isLoading: true }`).

### Layer 7 — JSX Conditional Fallback (source: `'conditional'`)

Use `facts.conditionals: ConditionalFact[]` (already present in `ScreenFacts`). Each `ConditionalFact` with a trueBranch/falseBranch becomes two state nodes:
- `trueBranch` state: `mockData = { [condition]: true }`
- `falseBranch` state: `mockData = { [condition]: false }`

No call to `derive-states.ts` is needed — `ConditionalFact[]` is already in `ScreenFacts`.

### Graceful Degradation

If all layers produce 0 states → emit a single state:
```typescript
{ id: 'default', label: 'Default', mockData: {}, source: 'unknown' }
```

`deriveStateMachine` **never throws**. All per-layer errors are caught internally.

---

## Integration in `generator/index.ts`

```typescript
// Add after existing mkdir calls (around line 54):
const scenariosDir = join(previewDir, 'scenarios')
await mkdir(scenariosDir, { recursive: true })

// Add after the existing per-screen mock generation loop (around line 162):
// factsMap is keyed by route (already built at line 90)
// screenName is already computed at line 235 via: screen.exportName ?? deriveScreenName(screen.route)
try {
  const facts = factsMap.get(screen.route)
  if (facts) {
    const machine = deriveStateMachine(screenName, facts)
    const scenarioCode = generateScenarios(machine)
    const safeName = routeToFolderName(screen.route)
    await writeFile(join(scenariosDir, `${safeName}.ts`), scenarioCode, 'utf-8')
  }
} catch (err) {
  // scenario generation never blocks mock generation
  console.debug(`[scenarios] skipped ${screenName}: ${err}`)
}
```

---

## Output Format

```typescript
// .preview/scenarios/home.ts
// Auto-generated by preview-tool — do not edit

import type { Scenario } from '@preview-tool/runtime'

export const scenarios: Scenario[] = [
  {
    id: 'idle',
    label: 'Initial state',
    mockData: {},
    source: 'library',
  },
  {
    id: 'loading',
    label: 'Fetching data',
    mockData: { isLoading: true, data: undefined, error: undefined },
    source: 'library',
  },
  {
    id: 'success',
    label: 'Data loaded',
    mockData: { isLoading: false, data: [], error: undefined },
    source: 'library',
  },
  {
    id: 'error',
    label: 'Fetch failed',
    mockData: { isLoading: false, data: undefined, error: { message: 'Network error' } },
    source: 'library',
  },
]

// defaultScenario rule:
//   if 'success' is in the states list → use 'success'
//   else if 'done' is in the states list → use 'done'
//   else → use machine.initialState
export const defaultScenario = 'success'
```

---

## Error Handling

- `deriveStateMachine` never throws — errors caught per-layer, fallback to `unknown` source
- Hook file resolution failures: log `debug` warning, skip hook, continue
- Barrel re-export reducer imports: log `debug` warning, skip Layer 2, continue to Layer 3
- `generateScenarios` never throws
- Scenario generation in `generator/index.ts` is wrapped in try/catch — failure never blocks V2 mock generation

---

## Testing Strategy

### Unit tests for `derive-state-machine.ts`

Each test provides a hand-crafted `ScreenFacts` fixture (no file I/O):

| Test | Input | Expected |
|------|-------|----------|
| Library fingerprint | `HookFact` with `importPath: '@tanstack/react-query'`, `name: 'useQuery'` | 4 states: idle/loading/success/error, `source: 'library'` |
| useReducer tracing | `LocalStateFact` with `hook: 'useReducer'` + inline reducer with 3 switch cases | 3 states matching case names, `source: 'use-reducer'` |
| useState enum | `LocalStateFact` with `hook: 'useState'` and type `'idle' \| 'loading' \| 'done'` | 3 states, `initialState: 'idle'` |
| Heuristic isLoading | `LocalStateFact` with `hook: 'useState'`, variable `isLoading`, no type union | 2 states: idle/loading, `source: 'heuristic'` |
| Unknown hook | `HookFact` with unresolvable import | 1 state: default, `source: 'unknown'` |
| Empty facts | Empty `ScreenFacts` | 1 state: default, `source: 'unknown'` |

### Unit tests for `generate-scenarios.ts`

Fixture: hand-crafted `ScreenStateMachine` objects:

| Test | Assert |
|------|--------|
| Basic generation | Output contains `export const scenarios` |
| State count | One scenario object per state node |
| defaultScenario — has success | `defaultScenario = 'success'` |
| defaultScenario — no success | `defaultScenario = machine.initialState` |
| No `new Error` | Output never contains `new Error(` |
| Import present | Output contains `import type { Scenario } from '@preview-tool/runtime'` |

### Integration test

Run against `packages/cli/test-fixtures/sample-app/`:
- Assert `scenarios/` directory created
- Assert one `.ts` file per discovered screen
- Assert each file contains `export const scenarios` and `export const defaultScenario`
- Assert at least one scenario has `source !== 'unknown'` (verifies analysis ran — contingent on sample-app having at least one recognized hook pattern; if not, add a `useQuery` call to the sample-app fixture)
- Assert no file contains `new Error(`

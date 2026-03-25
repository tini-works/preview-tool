import type {
  ScreenFacts,
  ScreenStateMachine,
  StateNode,
  Transition,
  MachineTemplate,
  StateSource,
} from './types.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_STATE: StateNode = { id: 'default', label: 'Default', mockData: {}, source: 'unknown' }

// ── Library fingerprint registry ─────────────────────────────────────────

const DATA_FETCHER_MACHINE: MachineTemplate = {
  states: [
    { id: 'idle',    label: 'Initial state', mockData: {},                                                                         source: 'library' },
    { id: 'loading', label: 'Fetching data', mockData: { isLoading: true,  data: undefined, error: undefined },                    source: 'library' },
    { id: 'success', label: 'Data loaded',   mockData: { isLoading: false, data: [],        error: undefined },                    source: 'library' },
    { id: 'error',   label: 'Fetch failed',  mockData: { isLoading: false, data: undefined, error: { message: 'Network error' } }, source: 'library' },
  ],
  initial: 'idle',
  source: 'library',
}

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

const MUTATION_MACHINE: MachineTemplate = {
  states: [
    { id: 'idle',    label: 'Ready',      mockData: { isPending: false },                                          source: 'library' },
    { id: 'loading', label: 'Submitting', mockData: { isPending: true },                                           source: 'library' },
    { id: 'success', label: 'Completed',  mockData: { isPending: false, data: {} },                                source: 'library' },
    { id: 'error',   label: 'Failed',     mockData: { isPending: false, error: { message: 'Submission failed' } }, source: 'library' },
  ],
  initial: 'idle',
  source: 'library',
}

const FORM_MACHINE: MachineTemplate = {
  states: [
    { id: 'idle',       label: 'Pristine',   mockData: { isDirty: false, isSubmitting: false, isSubmitted: false },                         source: 'form' },
    { id: 'dirty',      label: 'Editing',    mockData: { isDirty: true,  isSubmitting: false, isSubmitted: false },                         source: 'form' },
    { id: 'submitting', label: 'Submitting', mockData: { isDirty: true,  isSubmitting: true,  isSubmitted: false },                         source: 'form' },
    { id: 'submitted',  label: 'Submitted',  mockData: { isDirty: false, isSubmitting: false, isSubmitted: true  },                         source: 'form' },
    { id: 'error',      label: 'Has errors', mockData: { isDirty: true,  isSubmitting: false, errors: { field: { message: 'Required' } } }, source: 'form' },
  ],
  initial: 'idle',
  source: 'form',
}

/** Layer 1 priority: lower number = higher priority. Unlisted keys default to 3. */
const HOOK_PRIORITY: Record<string, number> = {
  'react-hook-form#useForm': 1,
  'formik#useFormik': 1,
  '@tanstack/react-query#useMutation': 2,
  '@apollo/client#useMutation': 2,
}

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

// ── Heuristic helpers (defined before deriveStates to avoid TDZ) ──────────

interface HeuristicMatch { states: string[] }

const HEURISTIC_PATTERNS: Array<{ pattern: RegExp } & HeuristicMatch> = [
  { pattern: /^is(Loading|Fetching|Pending)$/,   states: ['idle', 'loading'] },
  { pattern: /^(error|err)$/,                    states: ['idle', 'error'] },
  { pattern: /^(data|result|items|list)$/,        states: ['loading', 'success'] },
  { pattern: /^(step|currentStep|activeStep)$/,   states: ['step-1', 'step-2'] },
  { pattern: /^is(Open|Visible|Show)/,            states: ['closed', 'open'] },
  { pattern: /^is(Auth|LoggedIn|Authenticated)/,  states: ['unauthenticated', 'authenticated'] },
]

function matchHeuristic(name: string): HeuristicMatch | undefined {
  return HEURISTIC_PATTERNS.find(p => p.pattern.test(name))
}

function heuristicMockValue(varName: string, stateId: string, index: number): unknown {
  // Boolean variables (is*): false for index 0, true for index 1
  if (/^is[A-Z]/.test(varName)) return index === 1
  // Error variables: null (no error) for index 0, string message for index 1
  if (/^(error|err)$/.test(varName)) return index === 0 ? null : 'Something went wrong'
  // Data/list variables: undefined (loading) for index 0, empty array for index 1
  if (/^(data|result|items|list)$/.test(varName)) return index === 0 ? undefined : []
  // Other non-boolean patterns: return the state id as a string value
  return stateId
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')
}

function extractReducerStates(reducerSource: string): StateNode[] {
  // Match case 'LABEL': or case "LABEL":
  const casePattern = /case\s+['"]([^'"]+)['"]\s*:/g
  const ids: string[] = []
  let match: RegExpExecArray | null
  while ((match = casePattern.exec(reducerSource)) !== null) {
    ids.push(match[1])
  }
  if (ids.length === 0) return []
  return ids.map((id): StateNode => ({
    id,
    label: capitalize(id),
    mockData: {},
    source: 'use-reducer',
  }))
}

// ── Main export ───────────────────────────────────────────────────────────

export function deriveStateMachine(
  screenName: string,
  facts: ScreenFacts,
  cwd?: string,
): ScreenStateMachine {
  try {
    const registry = buildLibraryRegistry(cwd)
    const states = deriveStates(facts, registry)
    const transitions = deriveTransitions(facts)
    const initialState = pickDefaultState(states)
    return { screenName, states, transitions, initialState }
  } catch {
    return { screenName, states: [{ ...DEFAULT_STATE }], transitions: [], initialState: 'default' }
  }
}

// ── State derivation ──────────────────────────────────────────────────────

function deriveStates(facts: ScreenFacts, registry: Record<string, MachineTemplate>): StateNode[] {
  // Layer 1: library fingerprints — priority: form(1) > mutation(2) > data fetcher(3)
  let bestPriority = Infinity
  let bestTemplate: MachineTemplate | null = null
  for (const hook of facts.hooks) {
    const key = `${hook.importPath}#${hook.name}`
    const template = registry[key]
    if (!template) continue
    const priority = HOOK_PRIORITY[key] ?? 3
    if (priority < bestPriority) {
      bestPriority = priority
      bestTemplate = template
    }
  }
  if (bestTemplate) return bestTemplate.states.map(s => ({ ...s }))

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

  // Layer 2: useReducer — parse switch/case action types
  for (const local of facts.localState) {
    if (local.hook !== 'useReducer') continue
    if (!local.reducerSource) continue
    const states = extractReducerStates(local.reducerSource)
    if (states.length > 0) return states
  }

  // Layer 3: useState with explicit string union type
  for (const local of facts.localState) {
    if (local.hook !== 'useState') continue
    if (local.valueTypeUnion && local.valueTypeUnion.length >= 2) {
      return local.valueTypeUnion.map((id): StateNode => ({
        id,
        label: capitalize(id),
        mockData: { [local.name]: id },
        source: 'use-state-enum',
      }))
    }
  }

  // Layer 6: variable name heuristics (only for useState — not useReducer)
  for (const local of facts.localState) {
    if (local.hook !== 'useState') continue
    const match = matchHeuristic(local.name)
    if (match) {
      return match.states.map((id, i): StateNode => ({
        id,
        label: capitalize(id),
        mockData: { [local.name]: heuristicMockValue(local.name, id, i) },
        source: 'heuristic',
      }))
    }
  }

  // Layer 7: JSX conditionals — use first conditional as primary discriminant
  if (facts.conditionals.length > 0) {
    const cond = facts.conditionals[0]
    const condName = cond.condition ?? 'condition'
    return [
      { id: 'true-branch',  label: capitalize(condName) + ' true',  mockData: { [condName]: true  }, source: 'conditional' as StateSource },
      { id: 'false-branch', label: capitalize(condName) + ' false', mockData: { [condName]: false }, source: 'conditional' as StateSource },
    ]
  }

  return [{ ...DEFAULT_STATE }]
}

// ── Transition derivation ─────────────────────────────────────────────────

function deriveTransitions(facts: ScreenFacts): Transition[] {
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

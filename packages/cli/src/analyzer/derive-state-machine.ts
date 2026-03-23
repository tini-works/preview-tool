import type {
  ScreenFacts,
  ScreenStateMachine,
  StateNode,
  Transition,
  MachineTemplate,
  StateSource,
} from './types.js'

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
    return { screenName, states: [{ ...DEFAULT_STATE }], transitions: [], initialState: 'default' }
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
      { id: 'true-branch',  label: capitalize(condName) + ' true',  mockData: { [condName]: true  }, source: 'conditional' as StateSource },
      { id: 'false-branch', label: capitalize(condName) + ' false', mockData: { [condName]: false }, source: 'conditional' as StateSource },
    ]
  }

  return [{ ...DEFAULT_STATE }]
}

// ── Heuristic helpers ─────────────────────────────────────────────────────

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

function heuristicMockValue(varName: string, index: number): unknown {
  // Boolean variables: false for index 0, true for index 1
  if (/^is[A-Z]/.test(varName)) return index === 1
  // Return undefined for non-boolean variables — let component handle it
  return undefined
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')
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

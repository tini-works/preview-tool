import type {
  ScreenFacts,
  ScreenStateMachine,
  StateNode,
  Transition,
  MachineTemplate,
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

  // Layers 2, 3, 6, 7 implemented in later tasks
  return [{ ...DEFAULT_STATE }]
}

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

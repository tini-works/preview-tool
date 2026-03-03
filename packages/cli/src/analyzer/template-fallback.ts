import type { ScreenFacts, HookFact } from './types.js'
import type { ScreenAnalysisOutput, RegionOutput, FlowOutput } from '../llm/schemas/screen-analysis.js'
import { formatLabel } from '../lib/format-label.js'

// ---------------------------------------------------------------------------
// Hook Template interface
// ---------------------------------------------------------------------------

interface RegionState {
  label: string
  mockData: Record<string, unknown>
}

interface HookTemplate {
  /** Match predicate: receives hook name and import path */
  pattern: (hookName: string, importPath: string) => boolean
  /** Region type for the matched hook */
  regionType: 'list' | 'detail' | 'form' | 'status' | 'auth' | 'media' | 'custom'
  /** Factory that produces state entries given a human-readable label */
  states: (label: string) => Record<string, RegionState>
  /** Derive a unique key from the hook name and its arguments */
  deriveKey: (hookName: string, args: string[]) => string
}

// ---------------------------------------------------------------------------
// Key derivation helpers
// ---------------------------------------------------------------------------

/** Try to extract a queryKey from argument text like `{ queryKey: ['users'] }` */
function extractQueryKey(args: string[]): string | undefined {
  for (const arg of args) {
    const match = arg.match(/queryKey:\s*\[\s*['"]([^'"]+)['"]\s*]/)
    if (match) {
      return match[1]
    }
  }
  return undefined
}

/** Try to find the last plain string argument like `'service-grid'` */
function extractLastStringArg(args: string[]): string | undefined {
  for (let i = args.length - 1; i >= 0; i--) {
    const match = args[i].match(/^['"]([^'"]+)['"]$/)
    if (match) {
      return match[1]
    }
  }
  return undefined
}

/** Convert a camelCase hook name (without "use" prefix) to kebab-case key */
function hookNameToKey(hookName: string): string {
  const withoutUse = hookName.replace(/^use/, '')
  if (withoutUse.length === 0) return 'data'
  return withoutUse
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
}

/** Default key derivation for data-fetching hooks */
function deriveDataKey(hookName: string, args: string[]): string {
  const queryKey = extractQueryKey(args)
  if (queryKey) return queryKey

  const stringArg = extractLastStringArg(args)
  if (stringArg) return stringArg

  return 'data'
}

/** Default key derivation for store / context hooks */
function deriveStoreKey(hookName: string, _args: string[]): string {
  return hookNameToKey(hookName)
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

const TEMPLATES: HookTemplate[] = [
  // 1. React Query / SWR / data-fetching hooks
  {
    pattern: (name, _importPath) =>
      /^(useQuery|useSWR|useFetch|useAppLiveQuery|useLiveQuery)$/.test(name),
    regionType: 'list',
    states: (label) => ({
      populated: {
        label: `${label} loaded`,
        mockData: { data: [{ id: '1', name: `Sample ${label}` }], isLoading: false, error: null },
      },
      loading: {
        label: `${label} loading`,
        mockData: { data: null, isLoading: true, error: null },
      },
      empty: {
        label: `${label} empty`,
        mockData: { data: [], isLoading: false, error: null },
      },
      error: {
        label: `${label} error`,
        mockData: { data: null, isLoading: false, error: { message: 'Failed to load' } },
      },
    }),
    deriveKey: deriveDataKey,
  },

  // 2. Auth stores: hook name or import path contains 'auth'
  {
    pattern: (name, importPath) =>
      /auth/i.test(name) || /auth/i.test(importPath),
    regionType: 'auth',
    states: (label) => ({
      authenticated: {
        label: `${label} signed in`,
        mockData: { user: { id: '1', name: 'Jane Doe', email: 'jane@example.com' }, isAuthenticated: true },
      },
      unauthenticated: {
        label: `${label} signed out`,
        mockData: { user: null, isAuthenticated: false },
      },
    }),
    deriveKey: deriveStoreKey,
  },

  // 3. Zustand stores (non-auth): useXxxStore pattern
  {
    pattern: (name, _importPath) =>
      /^use\w+Store$/.test(name),
    regionType: 'status',
    states: (label) => ({
      populated: {
        label: `${label} loaded`,
        mockData: { data: {}, isLoading: false, error: null },
      },
      loading: {
        label: `${label} loading`,
        mockData: { data: null, isLoading: true, error: null },
      },
      error: {
        label: `${label} error`,
        mockData: { data: null, isLoading: false, error: { message: 'Store error' } },
      },
    }),
    deriveKey: deriveStoreKey,
  },

  // 4. useContext
  {
    pattern: (name, _importPath) => name === 'useContext',
    regionType: 'status',
    states: (label) => ({
      active: {
        label: `${label} active`,
        mockData: { value: {}, isActive: true },
      },
      inactive: {
        label: `${label} inactive`,
        mockData: { value: null, isActive: false },
      },
    }),
    deriveKey: (_hookName, args) => {
      // useContext(AuthContext) → 'auth-context', useContext(ThemeCtx) → 'theme-ctx'
      if (args.length > 0 && args[0]) {
        return hookNameToKey(args[0])
      }
      return 'context'
    },
  },
]

// ---------------------------------------------------------------------------
// Navigation → flow conversion
// ---------------------------------------------------------------------------

function navigationToFlows(facts: ScreenFacts): FlowOutput[] {
  return facts.navigation.map((nav) => {
    // Strip surrounding quotes from target: "'/booking'" → "/booking"
    const target = nav.target.replace(/^['"`]|['"`]$/g, '')

    return {
      trigger: {
        selector: 'button',
        text: nav.trigger,
      },
      action: 'navigate' as const,
      target,
    }
  })
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function buildFromTemplates(facts: ScreenFacts): ScreenAnalysisOutput {
  const seenKeys = new Set<string>()
  const regions: RegionOutput[] = []

  for (const hook of facts.hooks) {
    const template = matchTemplate(hook)
    if (!template) continue

    const key = template.deriveKey(hook.name, hook.arguments)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    const label = formatLabel(key)
    const states = template.states(label)
    const stateNames = Object.keys(states)
    const defaultState = stateNames.includes('populated') ? 'populated' : stateNames[0]

    const region: RegionOutput = {
      key,
      label,
      type: template.regionType,
      hookBindings: [`${hook.name}:${key}`],
      states,
      defaultState,
      ...(template.regionType === 'list'
        ? { isList: true, mockItems: [{ id: '1' }, { id: '2' }, { id: '3' }], defaultCount: 3 }
        : {}),
    }

    regions.push(region)
  }

  const flows = navigationToFlows(facts)

  return {
    route: facts.route,
    regions,
    flows,
  }
}

// ---------------------------------------------------------------------------
// Helper: match a hook against the template list
// ---------------------------------------------------------------------------

function matchTemplate(hook: HookFact): HookTemplate | undefined {
  for (const template of TEMPLATES) {
    if (template.pattern(hook.name, hook.importPath)) {
      return template
    }
  }
  return undefined
}

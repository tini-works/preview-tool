import type { ScreenFacts, HookFact, RegionState, FunctionFact, PropertyChainFact, TypeShapeInfo } from './types.js'
import type { ScreenAnalysisOutput, RegionOutput, FlowOutput } from '../llm/schemas/screen-analysis.js'
import { formatLabel } from '../lib/format-label.js'
import { REACT_BUILTIN_HOOKS, REACT_IMPORT_PATHS } from '../lib/hook-binding.js'
import { classifyHook } from '../lib/hook-classifier.js'
import { classifyDestructuredFields, classifyFieldsFromResolvedType, findConditionalsForHook, deriveStatesFromFacts, deriveAllStates, camelToKebab } from './derive-states.js'
import { inferMockShapeForVariable } from './infer-shape.js'

// ---------------------------------------------------------------------------
// Hook Template interface
// ---------------------------------------------------------------------------

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

  // 5. Catch-all: unknown custom hooks (non-React built-ins)
  {
    pattern: (name, importPath) =>
      name.startsWith('use') && !REACT_BUILTIN_HOOKS.has(name) && !REACT_IMPORT_PATHS.has(importPath),
    regionType: 'custom',
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
        mockData: { data: null, isLoading: false, error: { message: 'Failed to load' } },
      },
    }),
    deriveKey: deriveStoreKey,
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
// Function facts → flow conversion
// ---------------------------------------------------------------------------

function buildFunctionFlows(functions: FunctionFact[]): FlowOutput[] {
  const flows: FlowOutput[] = []

  for (const fn of functions) {
    for (const trigger of fn.triggers) {
      // Toggle pattern: inline setter for a boolean
      if (fn.name.startsWith('__inline_') && fn.settersCalled.length === 1) {
        const setterName = fn.settersCalled[0]
        // Convert setter to region key: setShowPassword → show-password
        const varName = setterName.replace(/^set/, '')
        const regionKey = varName.charAt(0).toLowerCase() + varName.slice(1)
        const kebabKey = regionKey.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')

        flows.push({
          trigger: { selector: trigger.element, text: `${trigger.event}:${fn.name}` },
          action: 'setRegionState',
          target: 'active',
          targetRegion: kebabKey,
        })
        continue
      }

      // Named function: general flow
      flows.push({
        trigger: { selector: trigger.element, text: `${trigger.event}:${fn.name}` },
        action: fn.navigationCalls.length > 0 ? 'navigate' : 'setState',
        target: fn.navigationCalls.length > 0
          ? fn.navigationCalls[0].replace(/^navigate\(/, '').replace(/\)$/, '').replace(/['"]/g, '')
          : fn.name,
      })
    }
  }

  return flows
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function buildFromTemplates(facts: ScreenFacts): ScreenAnalysisOutput {
  const seenKeys = new Set<string>()
  const regions: RegionOutput[] = []

  for (const hook of facts.hooks) {
    // Skip provider hooks (useNavigate, useForm, etc.) — but let React built-ins through
    // so that useContext still gets template #4 matching.
    if (!REACT_IMPORT_PATHS.has(hook.importPath) && classifyHook(hook.name, hook.importPath) === 'provider') continue
    const template = matchTemplate(hook)
    if (!template) continue

    const key = template.deriveKey(hook.name, hook.arguments)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    const label = formatLabel(key)

    // Try AST-derived states when destructuredFields + matching conditionals exist
    const matchingConditionals = findConditionalsForHook(hook, facts.conditionals)
    const hasConditionals = hook.destructuredFields && hook.destructuredFields.length > 0 && matchingConditionals.length > 0
    const hasFieldsOnly = !hasConditionals && hook.destructuredFields && hook.destructuredFields.length > 0

    const rawStates = hasConditionals
      ? deriveStatesForHook(hook, matchingConditionals, label)
      : hasFieldsOnly
        ? buildStatesFromFields(hook.destructuredFields!, label, facts.propertyChains, hook.resolvedType)
        : template.states(label)

    // Post-process: replace null data field values with inferred shapes from property chains or resolved types
    const states = augmentStatesWithShapes(rawStates, hook.destructuredFields, facts.propertyChains, hook.resolvedType)

    const stateNames = Object.keys(states)
    const defaultState = stateNames.includes('default')
      ? 'default'
      : stateNames.includes('populated')
        ? 'populated'
        : stateNames[0]

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

  // --- Regions from local state and derived vars ---
  const unifiedRegions = deriveAllStates({
    hooks: facts.hooks,
    localState: facts.localState ?? [],
    derivedVars: facts.derivedVars ?? [],
    conditionals: facts.conditionals,
    propertyChains: facts.propertyChains ?? [],
  })

  for (const [key, derived] of unifiedRegions) {
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    if (derived.source === 'local-state' || derived.source === 'derived-var') {
      const label = formatLabel(key)
      const stateNames = Object.keys(derived.states)
      const defaultState = stateNames.includes('default') ? 'default' : stateNames[0]

      // For derived vars, trace sourceVariable back to its hook
      let sourceHook: string | undefined
      if (derived.source === 'derived-var') {
        const derivedVar = (facts.derivedVars ?? []).find((dv) => camelToKebab(dv.name) === key)
        if (derivedVar?.sourceVariable) {
          const sv = derivedVar.sourceVariable!
          const hook = facts.hooks.find((h) =>
            h.destructuredFields?.includes(sv) ||
            h.returnVariable === sv ||
            h.returnVariable?.replace(/^\[|\]$/g, '') === sv
          )
          if (hook) sourceHook = hook.name
        }
      }

      regions.push({
        key,
        label,
        type: derived.source,
        hookBindings: [],
        states: derived.states,
        defaultState,
        ...(sourceHook ? { sourceHook } : {}),
      })
    }
  }

  const functionFlows = buildFunctionFlows(facts.functions ?? [])
  const navigationFlows = navigationToFlows(facts)
  const flows = [...functionFlows, ...navigationFlows]

  return {
    route: facts.route,
    regions,
    flows,
  }
}

// ---------------------------------------------------------------------------
// Helper: augment state mock data — replace null data fields with inferred shapes
// ---------------------------------------------------------------------------

function augmentStatesWithShapes(
  states: Record<string, RegionState>,
  fields?: string[],
  propertyChains?: PropertyChainFact[],
  resolvedType?: TypeShapeInfo,
): Record<string, RegionState> {
  if (!fields) return states
  const { dataFields } = classifyDestructuredFields(fields)
  if (dataFields.length === 0) return states

  // Build shapes for fields — prefer resolved types over property chain heuristics
  const shapeMap = new Map<string, unknown>()

  // Layer 1: Use resolved type shapes when available with full/partial confidence
  if (resolvedType && resolvedType.confidence !== 'none') {
    for (const field of dataFields) {
      if (field in resolvedType.shape) {
        const value = resolvedType.shape[field]
        if (value !== undefined && value !== null) {
          shapeMap.set(field, value)
        }
      }
    }
  }

  // Layer 2: Fall back to property chain inference for unresolved fields
  if (propertyChains && propertyChains.length > 0) {
    for (const field of dataFields) {
      if (shapeMap.has(field)) continue // already resolved from type info
      const shape = inferMockShapeForVariable(field, propertyChains)
      if (shape !== undefined && JSON.stringify(shape) !== '{}') {
        shapeMap.set(field, shape)
      }
    }
  }

  // For remaining data fields that are null in states but have no shape,
  // infer a sensible default based on naming (string, number, etc.)
  for (const field of dataFields) {
    if (shapeMap.has(field)) continue
    // Skip fields that are already boolean-classified or error-like
    if (/^(is|has|can|should|was|did|will)[A-Z]/.test(field)) continue
    if (/^(error|err)$/i.test(field)) continue
    if (/^(data|items|list|results|records)$/i.test(field)) continue
    // Check if any state has this field as null
    const anyNull = Object.values(states).some(
      (s) => field in s.mockData && s.mockData[field] === null,
    )
    if (anyNull) {
      shapeMap.set(field, inferLeafDefault(field))
    }
  }

  if (shapeMap.size === 0) return states

  // Clone states and replace null values with shapes
  const augmented: Record<string, RegionState> = {}
  for (const [stateName, stateValue] of Object.entries(states)) {
    const newMockData = { ...stateValue.mockData }
    for (const [field, shape] of shapeMap) {
      if (field in newMockData && newMockData[field] === null) {
        newMockData[field] = shape
      }
    }
    augmented[stateName] = { ...stateValue, mockData: newMockData }
  }

  // If no state has populated data fields, add a 'populated' state
  const hasPopulatedState = Object.keys(augmented).some((k) => k === 'populated')
  if (!hasPopulatedState) {
    const populatedData: Record<string, unknown> = {}
    for (const field of dataFields) {
      populatedData[field] = shapeMap.get(field) ?? null
    }
    if ([...shapeMap.values()].some((v) => v !== null)) {
      augmented.populated = {
        label: `${Object.values(states)[0]?.label?.replace(/ \w+$/, '') ?? ''} loaded`.trim(),
        mockData: populatedData,
      }
    }
  }

  return augmented
}

/** Infer a simple default value for a data field based on naming */
function inferLeafDefault(field: string): unknown {
  const lower = field.toLowerCase()
  if (lower.includes('name')) return 'Sample Name'
  if (lower.includes('email')) return 'user@example.com'
  if (lower.includes('id')) return '1'
  if (lower.includes('url') || lower.includes('image') || lower.includes('avatar')) return 'https://example.com/image.png'
  if (lower.includes('date') || lower.includes('time') || lower.endsWith('at')) return '2026-01-01T00:00:00Z'
  if (lower.includes('count') || lower.includes('total') || lower.includes('amount') || lower.includes('price') || lower.includes('step')) return 1
  if (lower.includes('type') || lower.includes('status') || lower.includes('role') || lower.includes('kind')) return 'default'
  return 'sample'
}

// ---------------------------------------------------------------------------
// Helper: derive states from AST data (destructuredFields + conditionals)
// ---------------------------------------------------------------------------

function deriveStatesForHook(
  hook: HookFact,
  matchingConditionals: import('./types.js').ConditionalFact[],
  label: string,
): Record<string, RegionState> {
  const { dataFields, functionFields } = classifyDestructuredFields(hook.destructuredFields!)
  return deriveStatesFromFacts({
    label,
    dataFields,
    functionFields,
    conditionals: matchingConditionals,
  })
}

// ---------------------------------------------------------------------------
// Helper: build states from destructured fields (no conditionals available)
// ---------------------------------------------------------------------------

function buildStatesFromFields(
  fields: string[],
  label: string,
  propertyChains?: PropertyChainFact[],
  resolvedType?: TypeShapeInfo,
): Record<string, RegionState> {
  // Use resolved type for function classification when available
  const { dataFields, functionFields: _functionFields } = resolvedType && resolvedType.confidence !== 'none'
    ? classifyFieldsFromResolvedType(fields, resolvedType)
    : classifyDestructuredFields(fields)

  const populatedData: Record<string, unknown> = {}
  const loadingData: Record<string, unknown> = {}
  const errorData: Record<string, unknown> = {}

  for (const field of dataFields) {
    if (/^(is|has|can|should|was|did|will)[A-Z]/.test(field)) {
      // Boolean fields
      populatedData[field] = false
      loadingData[field] = field.toLowerCase().includes('loading')
      errorData[field] = field.toLowerCase().includes('error')
    } else if (/^(error|err)$/i.test(field)) {
      populatedData[field] = null
      loadingData[field] = null
      errorData[field] = { message: 'Failed to load' }
    } else if (/^(data|items|list|results|records)$/i.test(field)) {
      populatedData[field] = [{ id: '1', name: `Sample ${label}` }]
      loadingData[field] = null
      errorData[field] = null
    } else {
      // Generic data field — prefer resolved type shape, fall back to property chains
      let inferredShape: unknown = undefined
      if (resolvedType && resolvedType.confidence !== 'none' && field in resolvedType.shape) {
        inferredShape = resolvedType.shape[field]
      }
      if (inferredShape === undefined || inferredShape === null) {
        inferredShape = propertyChains && propertyChains.length > 0
          ? inferMockShapeForVariable(field, propertyChains)
          : {}
      }
      populatedData[field] = inferredShape
      loadingData[field] = null
      errorData[field] = null
    }
  }

  return {
    populated: { label: `${label} loaded`, mockData: populatedData },
    loading: { label: `${label} loading`, mockData: loadingData },
    error: { label: `${label} error`, mockData: errorData },
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

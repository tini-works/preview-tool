import type { HookFact, ConditionalFact, RegionState, LocalStateFact, DerivedVarFact, PropertyChainFact, TypeShapeInfo } from './types.js'
import { inferMockShapeForVariable } from './infer-shape.js'

// ---------------------------------------------------------------------------
// 1a. Classify destructured fields into data vs function
// ---------------------------------------------------------------------------

const FUNCTION_PREFIXES = [
  'set', 'clear', 'login', 'logout', 'register',
  'handle', 'on', 'toggle', 'fetch', 'submit', 'reset', 'open', 'close',
]

const EXACT_FUNCTION_NAMES = new Set([
  'login', 'logout', 'register',
  'reset', 'open', 'close', 'submit', 'toggle', 'fetch',
  'clear', 'refresh', 'reload', 'retry', 'cancel', 'dismiss',
  'confirm', 'approve', 'reject', 'delete', 'remove', 'save',
  'send', 'start', 'stop', 'pause', 'resume', 'init',
])

export function classifyDestructuredFields(
  fields: string[],
): { dataFields: string[]; functionFields: string[] } {
  const dataFields: string[] = []
  const functionFields: string[] = []

  for (const field of fields) {
    if (isFunction(field)) {
      functionFields.push(field)
    } else {
      dataFields.push(field)
    }
  }

  return { dataFields, functionFields }
}

function isFunction(field: string): boolean {
  if (EXACT_FUNCTION_NAMES.has(field)) return true
  for (const prefix of FUNCTION_PREFIXES) {
    if (field.startsWith(prefix) && field.length > prefix.length && field[prefix.length] === field[prefix.length].toUpperCase()) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// 1b. Parse a single condition string
// ---------------------------------------------------------------------------

export interface ParsedCondition {
  fieldName: string
  negated: boolean
}

export function parseCondition(condition: string): ParsedCondition | null {
  const trimmed = condition.trim()

  // Compound expressions → split into individual conditions
  if (/&&|\|\|/.test(trimmed)) return null

  // Negated: !fieldName or !field.something
  if (trimmed.startsWith('!')) {
    const inner = trimmed.slice(1).trim()
    const fieldName = extractFieldName(inner)
    if (fieldName) return { fieldName, negated: true }
    return null
  }

  // Comparison: field.length === 0, field === null, etc.
  const comparisonMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$.]*)(?:\s*(?:===?|!==?|>|<|>=|<=)\s*.+)?$/)
  if (comparisonMatch) {
    const fieldName = extractFieldName(comparisonMatch[1])
    if (fieldName) return { fieldName, negated: false }
  }

  return null
}

/**
 * Parse compound conditionals (&&, ||) into individual field references.
 * e.g. "isLoading && !error" → [{ fieldName: 'isLoading', negated: false }, { fieldName: 'error', negated: true }]
 */
export function parseCompoundCondition(condition: string): ParsedCondition[] {
  const trimmed = condition.trim()

  // If not compound, delegate to parseCondition
  if (!/&&|\|\|/.test(trimmed)) {
    const single = parseCondition(trimmed)
    return single ? [single] : []
  }

  // Split on && and || (simple split, not full parser)
  const parts = trimmed.split(/\s*(?:&&|\|\|)\s*/)
  const results: ParsedCondition[] = []

  for (const part of parts) {
    const parsed = parseCondition(part.trim())
    if (parsed) results.push(parsed)
  }

  return results
}

function extractFieldName(expr: string): string | null {
  // "data.length" → "data", "user.name" → "user", "isLoading" → "isLoading"
  const match = expr.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/)
  return match ? match[1] : null
}

// ---------------------------------------------------------------------------
// 1c. Find conditionals relevant to a hook
// ---------------------------------------------------------------------------

export function findConditionalsForHook(
  hook: HookFact,
  conditionals: ConditionalFact[],
): ConditionalFact[] {
  const fields = hook.destructuredFields
  if (!fields || fields.length === 0) return []

  const fieldSet = new Set(fields)

  return conditionals.filter((cond) => {
    // Try simple parse first
    const parsed = parseCondition(cond.condition)
    if (parsed !== null) return fieldSet.has(parsed.fieldName)

    // Try compound parse for && / || expressions
    const compounds = parseCompoundCondition(cond.condition)
    return compounds.some((c) => fieldSet.has(c.fieldName))
  })
}

// ---------------------------------------------------------------------------
// 1d. Derive states from facts
// ---------------------------------------------------------------------------

export interface DeriveStatesInput {
  label: string
  dataFields: string[]
  functionFields: string[]
  conditionals: ConditionalFact[]
}

export function deriveStatesFromFacts(
  input: DeriveStatesInput,
): Record<string, RegionState> {
  const { label, dataFields, conditionals } = input
  const states: Record<string, RegionState> = {}

  // Build default state: booleans=false, nullable=null
  const defaultMockData: Record<string, unknown> = {}
  for (const field of dataFields) {
    defaultMockData[field] = isBooleanField(field) ? false : null
  }

  states['default'] = {
    label: `${label} default`,
    mockData: { ...defaultMockData },
  }

  // For each conditional, derive a named state
  for (const cond of conditionals) {
    const parsed = parseCondition(cond.condition)
    if (!parsed) continue
    if (!dataFields.includes(parsed.fieldName)) continue

    const stateKey = deriveStateKey(parsed.fieldName)

    // Skip if we already have this state
    if (states[stateKey]) continue

    const overrides = deriveOverrides(parsed.fieldName)
    states[stateKey] = {
      label: `${label} ${stateKey}`,
      mockData: { ...defaultMockData, ...overrides },
    }
  }

  return states
}

function isBooleanField(field: string): boolean {
  return /^(is|has|can|should|was|did|will)[A-Z]/.test(field)
}

function deriveStateKey(fieldName: string): string {
  // isLoading → loading, hasError → error, isAuthenticated → authenticated
  if (/^is[A-Z]/.test(fieldName)) {
    return fieldName.slice(2, 3).toLowerCase() + fieldName.slice(3)
  }
  if (/^has[A-Z]/.test(fieldName)) {
    return fieldName.slice(3, 4).toLowerCase() + fieldName.slice(4)
  }
  if (/^can[A-Z]/.test(fieldName)) {
    return fieldName.slice(3, 4).toLowerCase() + fieldName.slice(4)
  }
  return fieldName
}

function deriveOverrides(fieldName: string): Record<string, unknown> {
  // Boolean fields: set to true
  if (isBooleanField(fieldName)) {
    return { [fieldName]: true }
  }

  // error / err fields: provide a message string
  if (/^err/i.test(fieldName)) {
    return { [fieldName]: 'Something went wrong' }
  }

  // data / items / list fields: provide sample array
  if (/^(data|items|list|results|records)$/i.test(fieldName)) {
    return { [fieldName]: [{ id: '1', name: 'Sample' }] }
  }

  // Generic: truthy placeholder
  return { [fieldName]: `${fieldName}-value` }
}

// ---------------------------------------------------------------------------
// 2. Unified state derivation across all sources
// ---------------------------------------------------------------------------

export function camelToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

export interface DerivedRegion {
  source: 'hook' | 'local-state' | 'derived-var'
  label: string
  states: Record<string, RegionState>
  defaultState: string
  hookName?: string
}

export interface DeriveAllStatesInput {
  hooks: HookFact[]
  localState: LocalStateFact[]
  derivedVars: DerivedVarFact[]
  conditionals: ConditionalFact[]
  propertyChains?: PropertyChainFact[]
}

interface VariableSource {
  source: 'hook' | 'local-state' | 'derived-var'
  regionKey: string
}

export function deriveAllStates(input: DeriveAllStatesInput): Map<string, DerivedRegion> {
  const { hooks, localState, derivedVars, conditionals, propertyChains = [] } = input
  const result = new Map<string, DerivedRegion>()

  // 1. Build variable → source map
  const variableMap = new Map<string, VariableSource>()

  for (const hook of hooks) {
    const regionKey = camelToKebab(hook.name.replace(/^use/, ''))
    const fields = hook.destructuredFields ?? []
    for (const field of fields) {
      variableMap.set(field, { source: 'hook', regionKey })
    }
  }

  for (const local of localState) {
    const regionKey = camelToKebab(local.name)
    variableMap.set(local.name, { source: 'local-state', regionKey })
  }

  for (const derived of derivedVars) {
    const regionKey = camelToKebab(derived.name)
    variableMap.set(derived.name, { source: 'derived-var', regionKey })
  }

  // 2. Match conditionals to sources (group by regionKey)
  // Supports both simple and compound conditions
  const conditionalsByRegion = new Map<string, ConditionalFact[]>()
  for (const cond of conditionals) {
    // Try simple condition first
    const parsed = parseCondition(cond.condition)
    if (parsed) {
      const varSource = variableMap.get(parsed.fieldName)
      if (varSource) {
        const existing = conditionalsByRegion.get(varSource.regionKey) ?? []
        conditionalsByRegion.set(varSource.regionKey, [...existing, cond])
      }
      continue
    }

    // Try compound condition — associate with all matched regions
    const compounds = parseCompoundCondition(cond.condition)
    const seen = new Set<string>()
    for (const c of compounds) {
      const varSource = variableMap.get(c.fieldName)
      if (varSource && !seen.has(varSource.regionKey)) {
        seen.add(varSource.regionKey)
        const existing = conditionalsByRegion.get(varSource.regionKey) ?? []
        conditionalsByRegion.set(varSource.regionKey, [...existing, cond])
      }
    }
  }

  // 3. Build regions for external hooks
  for (const hook of hooks) {
    const regionKey = camelToKebab(hook.name.replace(/^use/, ''))
    const regionConditionals = conditionalsByRegion.get(regionKey) ?? []
    if (regionConditionals.length === 0 && !(hook.destructuredFields && hook.destructuredFields.length > 0)) continue

    const fields = hook.destructuredFields ?? []
    const { dataFields, functionFields } = classifyDestructuredFields(fields)

    const states = deriveStatesFromFacts({
      label: regionKey,
      dataFields,
      functionFields,
      conditionals: regionConditionals,
    })

    result.set(regionKey, {
      source: 'hook',
      label: regionKey,
      states,
      defaultState: 'default',
      hookName: hook.name,
    })
  }

  // 4. Build regions for local state
  for (const local of localState) {
    const regionKey = camelToKebab(local.name)
    const regionConditionals = conditionalsByRegion.get(regionKey) ?? []

    // Generate region if used in a conditional OR if it's a useState(null) with property chains
    const hasPropertyChains = propertyChains.some((pc) => pc.rootVariable === local.name)
    if (regionConditionals.length === 0 && !(local.valueType === 'null' && hasPropertyChains)) continue

    let states: Record<string, RegionState>

    if (regionConditionals.length === 0 && local.valueType === 'null' && hasPropertyChains) {
      // useState(null) with property accesses — generate populated mock from inferred shape
      const shape = inferMockShapeForVariable(local.name, propertyChains)
      states = {
        default: { label: `${regionKey} default`, mockData: { [local.name]: null } },
        populated: { label: `${regionKey} populated`, mockData: { [local.name]: shape } },
      }
    } else {
      states = buildLocalStateRegion(local)
    }

    result.set(regionKey, {
      source: 'local-state',
      label: regionKey,
      states,
      defaultState: local.valueType === 'null' && hasPropertyChains ? 'populated' : 'default',
    })
  }

  // 5. Build regions for derived vars
  for (const derived of derivedVars) {
    const regionKey = camelToKebab(derived.name)
    const regionConditionals = conditionalsByRegion.get(regionKey) ?? []
    // Skip derived vars not used in any conditional
    if (regionConditionals.length === 0) continue

    const states = buildDerivedVarRegion(derived)
    result.set(regionKey, {
      source: 'derived-var',
      label: regionKey,
      states,
      defaultState: 'default',
    })
  }

  return result
}

function buildLocalStateRegion(local: LocalStateFact): Record<string, RegionState> {
  const { name, valueType } = local
  const regionKey = camelToKebab(name)

  switch (valueType) {
    case 'boolean':
      return {
        default: { label: `${regionKey} default`, mockData: { [name]: false } },
        active: { label: `${regionKey} active`, mockData: { [name]: true } },
      }
    case 'object':
      return {
        default: { label: `${regionKey} default`, mockData: { [name]: {} } },
        populated: { label: `${regionKey} populated`, mockData: { [name]: { field: 'value' } } },
      }
    case 'array':
      return {
        default: { label: `${regionKey} default`, mockData: { [name]: [] } },
        populated: { label: `${regionKey} populated`, mockData: { [name]: [{ id: '1' }] } },
      }
    case 'string':
      return {
        default: { label: `${regionKey} default`, mockData: { [name]: '' } },
        filled: { label: `${regionKey} filled`, mockData: { [name]: 'sample text' } },
      }
    case 'null':
      return {
        default: { label: `${regionKey} default`, mockData: { [name]: null } },
        present: { label: `${regionKey} present`, mockData: { [name]: 'value' } },
      }
    default:
      return {
        default: { label: `${regionKey} default`, mockData: { [name]: null } },
        active: { label: `${regionKey} active`, mockData: { [name]: true } },
      }
  }
}

function buildDerivedVarRegion(derived: DerivedVarFact): Record<string, RegionState> {
  const { name, valueType } = derived
  const regionKey = camelToKebab(name)

  if (valueType === 'boolean') {
    return {
      default: { label: `${regionKey} default`, mockData: { [name]: false } },
      active: { label: `${regionKey} active`, mockData: { [name]: true } },
    }
  }

  return {
    default: { label: `${regionKey} default`, mockData: { [name]: null } },
    active: { label: `${regionKey} active`, mockData: { [name]: `${name}-value` } },
  }
}

// ---------------------------------------------------------------------------
// Classify fields using resolved type info (shared utility)
// ---------------------------------------------------------------------------

/**
 * Classify destructured fields using resolved type information instead of name heuristics.
 * Methods from the type are classified as functions; everything else as data.
 */
export function classifyFieldsFromResolvedType(
  fields: string[],
  resolvedType: TypeShapeInfo,
): { dataFields: string[]; functionFields: string[] } {
  const methodSet = new Set(resolvedType.methods)
  const dataFields: string[] = []
  const functionFields: string[] = []

  for (const field of fields) {
    if (methodSet.has(field)) {
      functionFields.push(field)
    } else {
      dataFields.push(field)
    }
  }

  return { dataFields, functionFields }
}

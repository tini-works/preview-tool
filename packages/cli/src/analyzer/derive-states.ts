import type { HookFact, ConditionalFact, RegionState } from './types.js'

// ---------------------------------------------------------------------------
// 1a. Classify destructured fields into data vs function
// ---------------------------------------------------------------------------

const FUNCTION_PREFIXES = [
  'set', 'clear', 'login', 'logout', 'register',
  'handle', 'on', 'toggle', 'fetch', 'submit', 'reset', 'open', 'close',
]

const EXACT_FUNCTION_NAMES = new Set([
  'login', 'logout', 'register',
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

  // Compound expressions → unparseable
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
    const parsed = parseCondition(cond.condition)
    return parsed !== null && fieldSet.has(parsed.fieldName)
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

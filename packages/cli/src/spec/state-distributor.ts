import type { TypeShapeInfo } from '../analyzer/types.js'
import { inferLeafValue } from '../analyzer/infer-shape.js'

type FieldCategory =
  | 'loading-indicator'
  | 'error-indicator'
  | 'data-array'
  | 'data-nullable'
  | 'data-value'
  | 'setter'

type StateCategory =
  | 'loading'
  | 'populated'
  | 'empty'
  | 'error'
  | 'submitting'
  | 'default'

const LOADING_PATTERNS = /^(loading|fetching|pending|initializing)$/i
const POPULATED_PATTERNS =
  /^(default|populated|results|ready|success|free|active|filled|idle)$/i
const EMPTY_PATTERNS = /^(empty|no.?results|no.?data|none|blank)$/i
const ERROR_PATTERNS =
  /^(error|failed|offline|disconnected|rejected|timeout)$/i
const SUBMITTING_PATTERNS =
  /^(submitting|saving|updating|processing|sending)$/i

function categorizeStateName(stateName: string): StateCategory {
  if (LOADING_PATTERNS.test(stateName)) return 'loading'
  if (POPULATED_PATTERNS.test(stateName)) return 'populated'
  if (EMPTY_PATTERNS.test(stateName)) return 'empty'
  if (ERROR_PATTERNS.test(stateName)) return 'error'
  if (SUBMITTING_PATTERNS.test(stateName)) return 'submitting'
  return 'default'
}

const LOADING_FIELD_PATTERNS =
  /^(is_?loading|is_?fetching|is_?pending|loading|fetching|pending)$/i
const ERROR_FIELD_PATTERNS = /^(error|error_?message|err|is_?error)$/i
const SETTER_PATTERNS = /^(set[A-Z]|toggle[A-Z]|reset[A-Z]|on[A-Z])/

export function classifyField(
  fieldName: string,
  typeKind: string,
): FieldCategory {
  if (SETTER_PATTERNS.test(fieldName) || typeKind === 'function')
    return 'setter'
  if (LOADING_FIELD_PATTERNS.test(fieldName) && typeKind === 'boolean')
    return 'loading-indicator'
  if (ERROR_FIELD_PATTERNS.test(fieldName)) return 'error-indicator'
  if (typeKind === 'array') return 'data-array'
  if (typeKind.endsWith('-nullable') || typeKind === 'object-nullable')
    return 'data-nullable'
  return 'data-value'
}

function populateArray(templateItem: unknown, count: number): unknown[] {
  if (!templateItem || typeof templateItem !== 'object') {
    return Array.from({ length: count }, (_, i) => `Item ${i + 1}`)
  }
  return Array.from({ length: count }, (_, i) => {
    const item = { ...(templateItem as Record<string, unknown>) }
    if ('id' in item) {
      item.id = typeof item.id === 'number' ? i + 1 : `mock-id-${i + 1}`
    }
    if ('name' in item && typeof item.name === 'string') {
      item.name = `${item.name} ${i + 1}`
    }
    return item
  })
}

function getFieldValueForState(
  fieldName: string,
  category: FieldCategory,
  stateCategory: StateCategory,
  shapeValue: unknown,
): unknown {
  switch (category) {
    case 'setter':
      return 'NOOP'

    case 'loading-indicator':
      return stateCategory === 'loading' || stateCategory === 'submitting'

    case 'error-indicator':
      if (typeof shapeValue === 'boolean') {
        return stateCategory === 'error'
      }
      return stateCategory === 'error' ? 'Something went wrong' : null

    case 'data-array': {
      const templateItem = Array.isArray(shapeValue)
        ? shapeValue[0]
        : undefined
      switch (stateCategory) {
        case 'loading':
        case 'empty':
        case 'error':
          return []
        case 'populated':
          return populateArray(templateItem, 2)
        case 'submitting':
          return populateArray(templateItem, 1)
        default:
          return populateArray(templateItem, 1)
      }
    }

    case 'data-nullable':
      switch (stateCategory) {
        case 'loading':
        case 'empty':
        case 'error':
          return null
        default:
          return shapeValue ?? inferLeafValue(fieldName)
      }

    case 'data-value':
      return shapeValue ?? inferLeafValue(fieldName)
  }
}

function inferFieldKind(
  fieldName: string,
  shapeValue: unknown,
  methods: string[],
): string {
  if (methods.includes(fieldName)) return 'function'
  if (Array.isArray(shapeValue)) return 'array'
  if (shapeValue === null) return 'object-nullable'
  if (typeof shapeValue === 'boolean') return 'boolean'
  if (typeof shapeValue === 'string') return 'string'
  if (typeof shapeValue === 'number') return 'number'
  if (typeof shapeValue === 'object') return 'object'
  return 'unknown'
}

export function distributeByState(
  stateNames: string[],
  resolvedType: TypeShapeInfo,
  fieldKinds?: Record<string, string>,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {}

  const allFields = new Set<string>([
    ...Object.keys(resolvedType.shape),
    ...resolvedType.methods,
  ])

  for (const stateName of stateNames) {
    const stateCategory = categorizeStateName(stateName)
    const stateData: Record<string, unknown> = {}

    for (const field of allFields) {
      const shapeValue = resolvedType.shape[field] ?? null
      const kind =
        fieldKinds?.[field] ??
        inferFieldKind(field, shapeValue, resolvedType.methods)
      const category = classifyField(field, kind)
      stateData[field] = getFieldValueForState(
        field,
        category,
        stateCategory,
        shapeValue,
      )
    }

    result[stateName] = stateData
  }

  return result
}

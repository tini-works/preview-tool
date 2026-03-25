import { describe, it, expect } from 'vitest'
import {
  classifyDestructuredFields,
  parseCondition,
  parseCompoundCondition,
  findConditionalsForHook,
  deriveStatesFromFacts,
  deriveAllStates,
} from '../derive-states.js'
import type { HookFact, ConditionalFact, LocalStateFact, DerivedVarFact, PropertyChainFact } from '../types.js'

describe('classifyDestructuredFields', () => {
  it('classifies boolean-prefixed fields as data', () => {
    const result = classifyDestructuredFields(['isLoading', 'hasError', 'canEdit'])
    expect(result.dataFields).toEqual(['isLoading', 'hasError', 'canEdit'])
    expect(result.functionFields).toEqual([])
  })

  it('classifies verb-prefixed fields as functions', () => {
    const result = classifyDestructuredFields(['setUser', 'clearCart', 'handleSubmit', 'onClose', 'toggleMenu', 'fetchData', 'submitForm', 'resetState', 'openModal', 'closeDialog'])
    expect(result.dataFields).toEqual([])
    expect(result.functionFields).toEqual(['setUser', 'clearCart', 'handleSubmit', 'onClose', 'toggleMenu', 'fetchData', 'submitForm', 'resetState', 'openModal', 'closeDialog'])
  })

  it('classifies exact function names', () => {
    const result = classifyDestructuredFields(['login', 'logout', 'register'])
    expect(result.functionFields).toEqual(['login', 'logout', 'register'])
    expect(result.dataFields).toEqual([])
  })

  it('classifies standalone verb names as functions', () => {
    const result = classifyDestructuredFields(['reset', 'data', 'open', 'close', 'submit', 'toggle', 'fetch'])
    expect(result.functionFields).toEqual(['reset', 'open', 'close', 'submit', 'toggle', 'fetch'])
    expect(result.dataFields).toEqual(['data'])
  })

  it('classifies all expanded exact function names', () => {
    const verbs = ['clear', 'refresh', 'reload', 'retry', 'cancel', 'dismiss', 'confirm', 'approve', 'reject', 'delete', 'remove', 'save', 'send', 'start', 'stop', 'pause', 'resume', 'init']
    const result = classifyDestructuredFields(verbs)
    expect(result.functionFields).toEqual(verbs)
    expect(result.dataFields).toEqual([])
  })

  it('classifies plain nouns as data', () => {
    const result = classifyDestructuredFields(['user', 'error', 'data', 'items', 'token'])
    expect(result.dataFields).toEqual(['user', 'error', 'data', 'items', 'token'])
    expect(result.functionFields).toEqual([])
  })

  it('handles mixed fields', () => {
    const result = classifyDestructuredFields(['user', 'isLoading', 'login', 'error', 'setToken'])
    expect(result.dataFields).toEqual(['user', 'isLoading', 'error'])
    expect(result.functionFields).toEqual(['login', 'setToken'])
  })

  it('returns empty arrays for empty input', () => {
    const result = classifyDestructuredFields([])
    expect(result.dataFields).toEqual([])
    expect(result.functionFields).toEqual([])
  })
})

describe('parseCondition', () => {
  it('parses simple identifier', () => {
    expect(parseCondition('isLoading')).toEqual({ fieldName: 'isLoading', negated: false })
  })

  it('parses negated identifier', () => {
    expect(parseCondition('!error')).toEqual({ fieldName: 'error', negated: true })
  })

  it('parses dotted expression', () => {
    expect(parseCondition('data.length === 0')).toEqual({ fieldName: 'data', negated: false })
  })

  it('returns null for compound expressions', () => {
    expect(parseCondition('a && b')).toBeNull()
    expect(parseCondition('x || y')).toBeNull()
  })

  it('handles negated dot expressions', () => {
    expect(parseCondition('!user.isActive')).toEqual({ fieldName: 'user', negated: true })
  })

  it('handles whitespace', () => {
    expect(parseCondition('  isLoading  ')).toEqual({ fieldName: 'isLoading', negated: false })
  })
})

describe('findConditionalsForHook', () => {
  it('filters conditionals whose field is in destructuredFields', () => {
    const hook: HookFact = {
      name: 'useBookingStore',
      importPath: '@/stores/booking',
      arguments: [],
      destructuredFields: ['isLoading', 'error', 'data'],
    }
    const conditionals: ConditionalFact[] = [
      { condition: 'isLoading', trueBranch: ['Spinner'], falseBranch: [] },
      { condition: 'error', trueBranch: ['ErrorBanner'], falseBranch: [] },
      { condition: 'unrelatedFlag', trueBranch: ['Other'], falseBranch: [] },
    ]
    const result = findConditionalsForHook(hook, conditionals)
    expect(result).toHaveLength(2)
    expect(result[0].condition).toBe('isLoading')
    expect(result[1].condition).toBe('error')
  })

  it('returns empty array when hook has no destructuredFields', () => {
    const hook: HookFact = {
      name: 'useStore',
      importPath: '@/stores/store',
      arguments: [],
    }
    const conditionals: ConditionalFact[] = [
      { condition: 'isLoading', trueBranch: ['Spinner'], falseBranch: [] },
    ]
    expect(findConditionalsForHook(hook, conditionals)).toEqual([])
  })

  it('returns empty array when no conditionals match', () => {
    const hook: HookFact = {
      name: 'useStore',
      importPath: '@/stores/store',
      arguments: [],
      destructuredFields: ['user', 'token'],
    }
    const conditionals: ConditionalFact[] = [
      { condition: 'isLoading', trueBranch: ['Spinner'], falseBranch: [] },
    ]
    expect(findConditionalsForHook(hook, conditionals)).toEqual([])
  })
})

describe('deriveStatesFromFacts', () => {
  it('builds default + loading + error states from conditionals', () => {
    const result = deriveStatesFromFacts({
      label: 'Booking',
      dataFields: ['isLoading', 'error', 'data'],
      functionFields: ['setData', 'fetchBookings'],
      conditionals: [
        { condition: 'isLoading', trueBranch: ['Spinner'], falseBranch: [] },
        { condition: 'error', trueBranch: ['ErrorBanner'], falseBranch: [] },
      ],
    })

    // Should have default, loading, error
    expect(Object.keys(result)).toEqual(['default', 'loading', 'error'])

    // Default: booleans=false, nullable=null
    expect(result['default'].mockData).toEqual({
      isLoading: false,
      error: null,
      data: null,
    })

    // Loading: isLoading overridden to true
    expect(result['loading'].mockData).toEqual({
      isLoading: true,
      error: null,
      data: null,
    })

    // Error: error field gets message
    expect(result['error'].mockData).toEqual({
      isLoading: false,
      error: 'Something went wrong',
      data: null,
    })
  })

  it('returns only default state when no conditionals match', () => {
    const result = deriveStatesFromFacts({
      label: 'Settings',
      dataFields: ['theme', 'language'],
      functionFields: ['setTheme'],
      conditionals: [],
    })

    expect(Object.keys(result)).toEqual(['default'])
    expect(result['default'].mockData).toEqual({
      theme: null,
      language: null,
    })
  })

  it('excludes function fields from mockData', () => {
    const result = deriveStatesFromFacts({
      label: 'Auth',
      dataFields: ['user', 'isAuthenticated'],
      functionFields: ['login', 'logout', 'setUser'],
      conditionals: [],
    })

    expect(result['default'].mockData).toEqual({
      user: null,
      isAuthenticated: false,
    })
    expect(result['default'].mockData).not.toHaveProperty('login')
    expect(result['default'].mockData).not.toHaveProperty('logout')
    expect(result['default'].mockData).not.toHaveProperty('setUser')
  })

  it('derives data state with sample array for data fields', () => {
    const result = deriveStatesFromFacts({
      label: 'Items',
      dataFields: ['isLoading', 'data'],
      functionFields: [],
      conditionals: [
        { condition: 'data.length === 0', trueBranch: ['EmptyState'], falseBranch: [] },
      ],
    })

    expect(result['data'].mockData.data).toEqual([{ id: '1', name: 'Sample' }])
  })

  it('deduplicates state keys', () => {
    const result = deriveStatesFromFacts({
      label: 'Test',
      dataFields: ['isLoading'],
      functionFields: [],
      conditionals: [
        { condition: 'isLoading', trueBranch: ['Spinner'], falseBranch: [] },
        { condition: 'isLoading', trueBranch: ['AnotherSpinner'], falseBranch: [] },
      ],
    })

    expect(Object.keys(result)).toEqual(['default', 'loading'])
  })
})

describe('deriveAllStates', () => {
  it('creates regions from external hooks, local state, and derived vars', () => {
    const hooks: HookFact[] = [{
      name: 'useAuthStore',
      importPath: '@/stores/auth-store',
      arguments: [],
      destructuredFields: ['login', 'isLoading', 'error', 'clearError'],
    }]
    const localState: LocalStateFact[] = [
      { name: 'showPassword', hook: 'useState', setter: 'setShowPassword', initialValue: 'false', valueType: 'boolean' },
      { name: 'fieldErrors', hook: 'useState', setter: 'setFieldErrors', initialValue: '{}', valueType: 'object' },
    ]
    const derivedVars: DerivedVarFact[] = [
      { name: 'registrationSuccess', expression: 'searchParams.get("registered") === "true"', sourceVariable: 'searchParams', valueType: 'boolean' },
    ]
    const conditionals: ConditionalFact[] = [
      { condition: 'isLoading', trueBranch: ['Spinner'], falseBranch: [] },
      { condition: 'error', trueBranch: ['ErrorBanner'], falseBranch: [] },
      { condition: 'registrationSuccess', trueBranch: ['SuccessBanner'], falseBranch: [] },
      { condition: 'fieldErrors.email', trueBranch: [], falseBranch: [] },
      { condition: 'showPassword', trueBranch: ['EyeOff'], falseBranch: ['Eye'] },
    ]

    const result = deriveAllStates({ hooks, localState, derivedVars, conditionals })

    expect(result.has('auth-store')).toBe(true)
    expect(result.has('show-password')).toBe(true)
    expect(result.has('field-errors')).toBe(true)
    expect(result.has('registration-success')).toBe(true)
  })

  it('derives boolean useState states as default/active', () => {
    const result = deriveAllStates({
      hooks: [],
      localState: [{ name: 'showPassword', hook: 'useState', setter: 'setShowPassword', initialValue: 'false', valueType: 'boolean' }],
      derivedVars: [],
      conditionals: [{ condition: 'showPassword', trueBranch: ['EyeOff'], falseBranch: ['Eye'] }],
    })

    const region = result.get('show-password')
    expect(region).toBeDefined()
    expect(region!.states).toHaveProperty('default')
    expect(region!.states).toHaveProperty('active')
    expect(region!.states['default'].mockData).toEqual({ showPassword: false })
    expect(region!.states['active'].mockData).toEqual({ showPassword: true })
  })

  it('derives object useState states as default/populated', () => {
    const result = deriveAllStates({
      hooks: [],
      localState: [{ name: 'fieldErrors', hook: 'useState', setter: 'setFieldErrors', initialValue: '{}', valueType: 'object' }],
      derivedVars: [],
      conditionals: [{ condition: 'fieldErrors.email', trueBranch: [], falseBranch: [] }],
    })

    const region = result.get('field-errors')
    expect(region).toBeDefined()
    expect(region!.states).toHaveProperty('default')
    expect(region!.states).toHaveProperty('populated')
  })

  it('derives derived var states as default/active', () => {
    const result = deriveAllStates({
      hooks: [],
      localState: [],
      derivedVars: [{ name: 'registrationSuccess', expression: 'x === "true"', valueType: 'boolean' }],
      conditionals: [{ condition: 'registrationSuccess', trueBranch: ['Banner'], falseBranch: [] }],
    })

    const region = result.get('registration-success')
    expect(region).toBeDefined()
    expect(region!.states['default'].mockData).toEqual({ registrationSuccess: false })
    expect(region!.states['active'].mockData).toEqual({ registrationSuccess: true })
  })

  it('skips local state not used in any conditional', () => {
    const result = deriveAllStates({
      hooks: [],
      localState: [{ name: 'formData', hook: 'useState', setter: 'setFormData', initialValue: '{}', valueType: 'object' }],
      derivedVars: [],
      conditionals: [],
    })

    expect(result.has('form-data')).toBe(false)
  })

  it('generates region for useState(null) with property chains', () => {
    const propertyChains: PropertyChainFact[] = [
      { rootVariable: 'config', chain: 'config.enabled', accessType: 'property' },
      { rootVariable: 'config', chain: 'config.maintenanceMessage', accessType: 'property' },
    ]
    const result = deriveAllStates({
      hooks: [],
      localState: [{ name: 'config', hook: 'useState', setter: 'setConfig', initialValue: 'null', valueType: 'null' }],
      derivedVars: [],
      conditionals: [],
      propertyChains,
    })

    expect(result.has('config')).toBe(true)
    const region = result.get('config')!
    expect(region.source).toBe('local-state')
    expect(region.defaultState).toBe('populated')
    expect(region.states['default'].mockData).toEqual({ config: null })
    expect(region.states['populated'].mockData.config).toBeDefined()
    // The populated state should have inferred shape from property chains
    const populatedConfig = region.states['populated'].mockData.config as Record<string, unknown>
    expect(populatedConfig).toHaveProperty('enabled')
    expect(populatedConfig.enabled).toBe(false) // boolean heuristic
  })

  it('skips useState(null) without property chains', () => {
    const result = deriveAllStates({
      hooks: [],
      localState: [{ name: 'config', hook: 'useState', setter: 'setConfig', initialValue: 'null', valueType: 'null' }],
      derivedVars: [],
      conditionals: [],
      propertyChains: [],
    })

    expect(result.has('config')).toBe(false)
  })

  it('handles compound conditionals matching hook fields', () => {
    const hooks: HookFact[] = [{
      name: 'useDataStore',
      importPath: '@/stores/data',
      arguments: [],
      destructuredFields: ['isLoading', 'error', 'data'],
    }]
    const conditionals: ConditionalFact[] = [
      { condition: 'isLoading && !error', trueBranch: ['Spinner'], falseBranch: [] },
    ]

    const result = deriveAllStates({ hooks, localState: [], derivedVars: [], conditionals })

    const region = result.get('data-store')
    expect(region).toBeDefined()
  })
})

describe('parseCompoundCondition', () => {
  it('splits && into individual conditions', () => {
    const results = parseCompoundCondition('isLoading && !error')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ fieldName: 'isLoading', negated: false })
    expect(results[1]).toEqual({ fieldName: 'error', negated: true })
  })

  it('splits || into individual conditions', () => {
    const results = parseCompoundCondition('error || !data')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ fieldName: 'error', negated: false })
    expect(results[1]).toEqual({ fieldName: 'data', negated: true })
  })

  it('handles mix of && and ||', () => {
    const results = parseCompoundCondition('isLoading && error || hasData')
    expect(results).toHaveLength(3)
  })

  it('delegates non-compound to parseCondition', () => {
    const results = parseCompoundCondition('isLoading')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ fieldName: 'isLoading', negated: false })
  })

  it('returns empty for unparseable expressions', () => {
    const results = parseCompoundCondition('a + b')
    expect(results).toEqual([])
  })
})

describe('GAP-11: DATA_FIELD_EXCEPTIONS override function heuristic', () => {
  it('fetchStatus is classified as data field (not function)', () => {
    const { dataFields, functionFields } = classifyDestructuredFields(['fetchStatus', 'data', 'refetch'])
    expect(dataFields).toContain('fetchStatus')
    expect(functionFields).not.toContain('fetchStatus')
    expect(functionFields).toContain('refetch')
  })

  it('resetToken is classified as data field (not function)', () => {
    const { dataFields } = classifyDestructuredFields(['resetToken', 'openPrice', 'closeDate'])
    expect(dataFields).toContain('resetToken')
    expect(dataFields).toContain('openPrice')
    expect(dataFields).toContain('closeDate')
  })

  it('all DATA_FIELD_EXCEPTIONS entries are classified as data', () => {
    const exceptions = [
      'fetchStatus', 'resetToken', 'resetKey', 'resetAt', 'resetTime',
      'openDate', 'openPrice', 'openTime', 'openRate',
      'closeDate', 'closePrice', 'closeTime', 'closeRate',
      'fetchedAt', 'fetchedData', 'handlebarData', 'handleName',
    ]
    const { dataFields, functionFields } = classifyDestructuredFields(exceptions)
    expect(dataFields).toEqual(exceptions)
    expect(functionFields).toEqual([])
  })
})

describe('GAP-13: useReducer states extracted from reducerSource', () => {
  it('builds states from useReducer switch/case when reducerSource is present', () => {
    const local: LocalStateFact = {
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
    }

    const result = deriveAllStates({
      hooks: [],
      localState: [local],
      derivedVars: [],
      conditionals: [{ condition: 'status', trueBranch: [], falseBranch: [] }],
    })

    const region = result.get('status')
    expect(region).toBeDefined()
    expect(region!.source).toBe('local-state')
    expect(Object.keys(region!.states)).toContain('FETCH')
    expect(Object.keys(region!.states)).toContain('SUCCESS')
    expect(Object.keys(region!.states)).toContain('ERROR')
    expect(region!.states['FETCH'].mockData).toEqual({ status: 'FETCH' })
  })

  it('uses fallback states when reducerSource has no case patterns', () => {
    const local: LocalStateFact = {
      name: 'mode',
      hook: 'useReducer',
      initialValue: "'idle'",
      valueType: 'string',
      reducerSource: 'function reducer(state, action) { return state }',
    }

    const result = deriveAllStates({
      hooks: [],
      localState: [local],
      derivedVars: [],
      conditionals: [{ condition: 'mode', trueBranch: [], falseBranch: [] }],
    })

    const region = result.get('mode')
    expect(region).toBeDefined()
    // Should fall through to default string handling
    expect(region!.states).toHaveProperty('default')
  })
})

describe('findConditionalsForHook with compound conditions', () => {
  it('matches compound conditionals containing hook fields', () => {
    const hook: HookFact = {
      name: 'useStore',
      importPath: '@/stores/store',
      arguments: [],
      destructuredFields: ['isLoading', 'error'],
    }
    const conditionals: ConditionalFact[] = [
      { condition: 'isLoading && !error', trueBranch: ['Spinner'], falseBranch: [] },
      { condition: 'unrelated && other', trueBranch: ['Other'], falseBranch: [] },
    ]
    const result = findConditionalsForHook(hook, conditionals)
    expect(result).toHaveLength(1)
    expect(result[0].condition).toBe('isLoading && !error')
  })
})

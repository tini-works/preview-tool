import { describe, it, expect } from 'vitest'
import {
  classifyDestructuredFields,
  parseCondition,
  findConditionalsForHook,
  deriveStatesFromFacts,
  deriveAllStates,
} from '../derive-states.js'
import type { HookFact, ConditionalFact, LocalStateFact, DerivedVarFact } from '../types.js'

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
})

import { describe, it, expect } from 'vitest'
import { distributeByState, classifyField } from '../state-distributor.js'
import type { TypeShapeInfo } from '../../analyzer/types.js'

describe('classifyField', () => {
  it('classifies isLoading as loading-indicator', () => {
    expect(classifyField('isLoading', 'boolean')).toBe('loading-indicator')
  })

  it('classifies isFetching as loading-indicator', () => {
    expect(classifyField('isFetching', 'boolean')).toBe('loading-indicator')
  })

  it('classifies error as error-indicator', () => {
    expect(classifyField('error', 'string')).toBe('error-indicator')
  })

  it('classifies rooms (array) as data-array', () => {
    expect(classifyField('rooms', 'array')).toBe('data-array')
  })

  it('classifies user (nullable object) as data-nullable', () => {
    expect(classifyField('user', 'object-nullable')).toBe('data-nullable')
  })

  it('classifies name (string) as data-value', () => {
    expect(classifyField('name', 'string')).toBe('data-value')
  })

  it('classifies setSelected as setter', () => {
    expect(classifyField('setSelected', 'function')).toBe('setter')
  })
})

describe('distributeByState', () => {
  const resolvedType: TypeShapeInfo = {
    shape: {
      rooms: [{ id: '1', name: 'Sample Name', capacity: 0 }],
      isLoading: false,
      error: 'sample',
    },
    confidence: 'full',
    methods: ['refetch'],
    properties: ['rooms', 'isLoading', 'error'],
  }

  const fieldKinds: Record<string, string> = {
    rooms: 'array',
    isLoading: 'boolean',
    error: 'string-nullable',
  }

  it('generates loading state with empty arrays and isLoading true', () => {
    const result = distributeByState(['loading'], resolvedType, fieldKinds)
    expect(result.loading.isLoading).toBe(true)
    expect(result.loading.rooms).toEqual([])
    expect(result.loading.error).toBeNull()
  })

  it('generates populated state with filled arrays and isLoading false', () => {
    const result = distributeByState(['populated'], resolvedType, fieldKinds)
    expect(result.populated.isLoading).toBe(false)
    expect(result.populated.rooms).toHaveLength(2)
    expect(result.populated.rooms[0]).toHaveProperty('id')
    expect(result.populated.rooms[0]).toHaveProperty('name')
    expect(result.populated.error).toBeNull()
  })

  it('generates empty state with empty arrays', () => {
    const result = distributeByState(['empty'], resolvedType, fieldKinds)
    expect(result.empty.isLoading).toBe(false)
    expect(result.empty.rooms).toEqual([])
    expect(result.empty.error).toBeNull()
  })

  it('generates error state with error message', () => {
    const result = distributeByState(['error'], resolvedType, fieldKinds)
    expect(result.error.isLoading).toBe(false)
    expect(result.error.rooms).toEqual([])
    expect(result.error.error).toBe('Something went wrong')
  })

  it('handles unknown state names with populated defaults', () => {
    const result = distributeByState(['custom-state'], resolvedType, fieldKinds)
    expect(result['custom-state'].isLoading).toBe(false)
    expect(result['custom-state'].rooms).toHaveLength(1)
  })

  it('handles multiple states at once', () => {
    const result = distributeByState(
      ['loading', 'populated', 'empty', 'error'],
      resolvedType,
      fieldKinds,
    )
    expect(Object.keys(result)).toHaveLength(4)
    expect(result.loading.isLoading).toBe(true)
    expect(result.populated.rooms.length).toBeGreaterThan(0)
    expect(result.empty.rooms).toEqual([])
    expect(result.error.error).toBeTruthy()
  })

  it('includes NOOP for method fields', () => {
    const result = distributeByState(['default'], resolvedType, fieldKinds)
    expect(typeof result.default.refetch).toBe('string')
    expect(result.default.refetch).toBe('NOOP')
  })
})

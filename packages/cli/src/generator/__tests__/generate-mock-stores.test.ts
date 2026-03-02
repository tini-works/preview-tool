import { describe, it, expect } from 'vitest'
import {
  generateMockAuthStore,
  generateMockDevToolStore,
  generateMockApiClient,
  generateMockCollection,
  generateMockQueryClient,
  generateMockDbLibrary,
  generateMockDataModule,
} from '../generate-mock-stores.js'

describe('generateMockAuthStore', () => {
  it('generates a Zustand store with configurable mock user', () => {
    const code = generateMockAuthStore()
    expect(code).toContain('useAuthStore')
    expect(code).toContain('ADMIN')
    expect(code).toContain('CUSTOMER')
    expect(code).toContain('mock-token')
    expect(code).toContain('login')
    expect(code).toContain('logout')
    expect(code).toContain('initialize')
  })

  it('exports create for stores that re-export it', () => {
    const code = generateMockAuthStore()
    expect(code).toContain('export')
    expect(code).toContain('useAuthStore')
  })
})

describe('generateMockDevToolStore', () => {
  it('generates a no-op devtool store', () => {
    const code = generateMockDevToolStore()
    expect(code).toContain('useDevToolStore')
    expect(code).toContain('isTestMode')
    expect(code).toContain('setSectionState')
    expect(code).toContain('sectionStates')
  })
})

describe('generateMockApiClient', () => {
  it('generates a no-op axios-like default export', () => {
    const code = generateMockApiClient(['default'])
    expect(code).toContain('export default api')
    expect(code).toContain('get: async')
    expect(code).toContain('post: async')
    expect(code).toContain('put: async')
    expect(code).toContain('delete: async')
    expect(code).toContain('interceptors')
  })

  it('re-exports named exports as aliases to api', () => {
    const code = generateMockApiClient(['default', 'apiClient'])
    expect(code).toContain('export const apiClient = api')
  })
})

describe('generateMockCollection', () => {
  it('generates stubs for each named export', () => {
    const code = generateMockCollection(['servicesCollection', 'appointmentsCollection'])
    expect(code).toContain('export const servicesCollection')
    expect(code).toContain('export const appointmentsCollection')
    expect(code).toContain('find: async')
    expect(code).toContain('insert: async')
  })
})

describe('generateMockQueryClient', () => {
  it('generates a no-op QueryClient', () => {
    const code = generateMockQueryClient()
    expect(code).toContain('export const queryClient')
    expect(code).toContain('export const QueryClient')
    expect(code).toContain('invalidateQueries')
    expect(code).toContain('fetchQuery')
    expect(code).toContain('export default queryClient')
  })
})

describe('generateMockDbLibrary', () => {
  it('generates comparison operators and collection factory', () => {
    const code = generateMockDbLibrary()
    expect(code).toContain('export const eq')
    expect(code).toContain('export const ne')
    expect(code).toContain('export function createCollection')
    expect(code).toContain('export function useLiveQuery')
  })
})

describe('generateMockDataModule', () => {
  it('generates empty array exports for each named export', () => {
    const code = generateMockDataModule(['mockAvailableTimes', 'mockAvailability'])
    expect(code).toContain('export const mockAvailableTimes = []')
    expect(code).toContain('export const mockAvailability = []')
  })

  it('includes default export when requested', () => {
    const code = generateMockDataModule(['default', 'mockData'])
    expect(code).toContain('export default []')
    expect(code).toContain('export const mockData = []')
  })
})

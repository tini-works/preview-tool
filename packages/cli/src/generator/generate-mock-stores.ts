/**
 * Generates a mock auth store that provides a pre-authenticated user.
 * This allows admin-protected screens to render without real authentication.
 */
export function generateMockAuthStore(): string {
  return `// Auto-generated mock by @preview-tool/cli — do not edit manually
import { create } from 'zustand'

const mockUsers = {
  customer: { id: 'mock-cust-1', email: 'alice@example.com', name: 'Alice Meyer', role: 'CUSTOMER' as const, createdAt: new Date().toISOString() },
  admin: { id: 'mock-admin-1', email: 'bob@example.com', name: 'Bob Admin', role: 'ADMIN' as const, createdAt: new Date().toISOString() },
}

// Default to admin so all screens (including admin pages) are accessible
export const useAuthStore = create(() => ({
  user: mockUsers.admin,
  token: 'mock-token-preview',
  isLoading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  fetchMe: async () => {},
  initialize: async () => {},
}))

export default useAuthStore
`
}

/**
 * Generates a no-op devtool store that satisfies imports without side effects.
 * The preview-tool's own inspector replaces the external app's devtool entirely.
 */
/**
 * Generates a no-op API client that mimics axios-like interface.
 * All HTTP methods return empty successful responses.
 */
export function generateMockApiClient(namedExports: string[]): string {
  const namedStubs = namedExports
    .filter((e) => e !== 'default')
    .map((e) => `export const ${e} = api`)
    .join('\n')

  return `// Auto-generated mock by @preview-tool/cli — do not edit manually
const emptyResponse = { data: {}, status: 200, statusText: 'OK', headers: {}, config: {} }

const api = {
  get: async () => emptyResponse,
  post: async () => emptyResponse,
  put: async () => emptyResponse,
  patch: async () => emptyResponse,
  delete: async () => emptyResponse,
  request: async () => emptyResponse,
  defaults: { headers: { common: {} } },
  interceptors: {
    request: { use: () => 0, eject: () => {} },
    response: { use: () => 0, eject: () => {} },
  },
}

export default api
${namedStubs ? namedStubs + '\n' : ''}`
}

/**
 * Generates no-op collection stubs for each named export.
 * Each collection is an object with standard CRUD-like methods.
 */
export function generateMockCollection(namedExports: string[]): string {
  const stubs = namedExports
    .filter((e) => e !== 'default')
    .map(
      (e) =>
        `export const ${e} = {\n  find: async () => [],\n  findOne: async () => null,\n  insert: async () => ({}),\n  update: async () => ({}),\n  remove: async () => {},\n  name: '${e}',\n}`,
    )
    .join('\n\n')

  return `// Auto-generated mock by @preview-tool/cli — do not edit manually
${stubs}
`
}

/**
 * Generates a no-op QueryClient that satisfies @tanstack/react-query imports.
 */
export function generateMockQueryClient(): string {
  return `// Auto-generated mock by @preview-tool/cli — do not edit manually
class MockQueryClient {
  defaultOptions = {}
  mount() {}
  unmount() {}
  isFetching() { return 0 }
  isMutating() { return 0 }
  getQueryData() { return undefined }
  setQueryData() { return undefined }
  getQueryState() { return undefined }
  removeQueries() {}
  resetQueries() { return Promise.resolve() }
  cancelQueries() { return Promise.resolve() }
  invalidateQueries() { return Promise.resolve() }
  refetchQueries() { return Promise.resolve() }
  fetchQuery() { return Promise.resolve(undefined) }
  prefetchQuery() { return Promise.resolve() }
  getDefaultOptions() { return {} }
  setDefaultOptions() {}
  getQueryDefaults() { return {} }
  setQueryDefaults() {}
  getMutationDefaults() { return {} }
  setMutationDefaults() {}
  clear() {}
}

export const queryClient = new MockQueryClient()
export const QueryClient = MockQueryClient
export default queryClient
`
}

/**
 * Generates no-op stubs for @tanstack/react-db (or similar DB libraries).
 * Includes comparison operators, collection factory, and live query hook.
 */
export function generateMockDbLibrary(): string {
  return `// Auto-generated mock by @preview-tool/cli — do not edit manually
export const eq = (field: string, value: unknown) => ({ field, op: 'eq', value })
export const ne = (field: string, value: unknown) => ({ field, op: 'ne', value })
export const gt = (field: string, value: unknown) => ({ field, op: 'gt', value })
export const gte = (field: string, value: unknown) => ({ field, op: 'gte', value })
export const lt = (field: string, value: unknown) => ({ field, op: 'lt', value })
export const lte = (field: string, value: unknown) => ({ field, op: 'lte', value })

export function createCollection(config?: { name?: string }) {
  return {
    name: config?.name ?? 'mock-collection',
    find: async () => [],
    findOne: async () => null,
    insert: async () => ({}),
    update: async () => ({}),
    remove: async () => {},
  }
}

export function useLiveQuery(_queryFn: () => unknown, _deps?: unknown[]) {
  return { data: [] as unknown[], isLoading: false, error: null }
}

export function useQuery(_queryFn: () => unknown, _deps?: unknown[]) {
  return { data: [] as unknown[], isLoading: false, error: null }
}
`
}

/**
 * Generates empty array/object exports for mock data modules.
 * This satisfies imports like `import { mockAvailableTimes } from '@/devtool/mocks/availability'`.
 */
export function generateMockDataModule(namedExports: string[]): string {
  const stubs = namedExports
    .filter((e) => e !== 'default')
    .map((e) => `export const ${e} = []`)
    .join('\n')

  return `// Auto-generated mock by @preview-tool/cli — do not edit manually
${stubs}
${namedExports.includes('default') ? 'export default []\n' : ''}`
}

export function generateMockDevToolStore(): string {
  return `// Auto-generated mock by @preview-tool/cli — do not edit manually
import { create } from 'zustand'

export type MockState = 'loading' | 'error' | 'empty' | 'populated'

export const useDevToolStore = create(() => ({
  isTestMode: true,
  sectionStates: {} as Record<string, MockState>,
  isDrawerOpen: false,
  isCommentMode: false,
  setTestMode: () => {},
  setSectionState: () => {},
  setAllSections: () => {},
  setDrawerOpen: () => {},
  setCommentMode: () => {},
  reset: () => {},
}))

export default useDevToolStore

// Re-export types the original module might export
export const VALID_MOCK_STATES = ['loading', 'error', 'empty', 'populated']
export const allSections: unknown[] = []
export function findSectionById() { return undefined }
export function buildDefaultSectionStates() { return {} }
`
}

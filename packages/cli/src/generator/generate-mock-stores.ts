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

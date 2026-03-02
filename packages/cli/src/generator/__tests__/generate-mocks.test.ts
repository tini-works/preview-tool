import { describe, it, expect } from 'vitest'
import { generateMockModule } from '../generate-mocks.js'
import type { ClassifiedHook, ScreenRegion } from '../../analyzer/types.js'

function makeHook(overrides: Partial<ClassifiedHook> & { hookName: string; category: ClassifiedHook['category'] }): ClassifiedHook {
  return {
    importPath: 'unknown',
    callArgs: [],
    isProjectLocal: false,
    regionName: 'test',
    states: [],
    defaultState: '',
    isList: false,
    returnShape: null,
    ...overrides,
  }
}

function makeRegion(overrides: Partial<ScreenRegion> & { name: string }): ScreenRegion {
  return {
    label: overrides.name,
    source: 'useQuery("test")',
    states: ['loading', 'error', 'empty', 'populated'],
    defaultState: 'populated',
    isList: true,
    mockData: {
      loading: { data: null, isLoading: true, error: null },
      error: { data: null, isLoading: false, error: { message: 'Something went wrong' } },
      empty: { data: [], isLoading: false, error: null },
      populated: { data: [{ id: '1', name: 'Item 1' }], isLoading: false, error: null },
    },
    ...overrides,
  }
}

describe('generateMockModule', () => {
  describe('data-fetching hooks (useQuery)', () => {
    it('contains usePreviewRegion import', () => {
      const hook = makeHook({
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        category: 'data-fetching',
        callArgs: ['tasks'],
        regionName: 'tasks',
        states: ['loading', 'error', 'empty', 'populated'],
        defaultState: 'populated',
        isList: true,
      })
      const regions = [makeRegion({ name: 'tasks' })]

      const code = generateMockModule(hook, regions)

      expect(code).toContain("import { usePreviewRegion } from '@preview-tool/runtime'")
    })

    it('exports useQuery function', () => {
      const hook = makeHook({
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        category: 'data-fetching',
        callArgs: ['tasks'],
        regionName: 'tasks',
        states: ['loading', 'error', 'empty', 'populated'],
        defaultState: 'populated',
        isList: true,
      })
      const regions = [makeRegion({ name: 'tasks' })]

      const code = generateMockModule(hook, regions)

      expect(code).toContain('export function useQuery')
    })

    it('provides stubs for useQueryClient, QueryClientProvider, QueryClient, useMutation', () => {
      const hook = makeHook({
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        category: 'data-fetching',
        callArgs: ['tasks'],
        regionName: 'tasks',
        states: ['loading', 'error', 'empty', 'populated'],
        defaultState: 'populated',
        isList: true,
      })
      const regions = [makeRegion({ name: 'tasks' })]

      const code = generateMockModule(hook, regions)

      expect(code).toContain('export function useQueryClient')
      expect(code).toContain('export function QueryClientProvider')
      expect(code).toContain('export class QueryClient')
      expect(code).toContain('export function useMutation')
    })

    it('reads region state and returns mock data based on state', () => {
      const hook = makeHook({
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        category: 'data-fetching',
        callArgs: ['tasks'],
        regionName: 'tasks',
        states: ['loading', 'error', 'empty', 'populated'],
        defaultState: 'populated',
        isList: true,
      })
      const regions = [makeRegion({ name: 'tasks' })]

      const code = generateMockModule(hook, regions)

      expect(code).toContain("usePreviewRegion('tasks')")
      expect(code).toContain('mockData[state]')
    })
  })

  describe('auth hooks', () => {
    it('contains usePreviewRegion import', () => {
      const hook = makeHook({
        hookName: 'useAuth',
        importPath: '@/hooks/useAuth',
        category: 'auth',
        regionName: 'auth',
        states: ['authenticated', 'unauthenticated'],
        defaultState: 'authenticated',
      })
      const regions = [makeRegion({
        name: 'auth',
        states: ['authenticated', 'unauthenticated'],
        defaultState: 'authenticated',
        mockData: {
          authenticated: { user: { id: '1', name: 'Jane' }, isAuthenticated: true },
          unauthenticated: { user: null, isAuthenticated: false },
        },
      })]

      const code = generateMockModule(hook, regions)

      expect(code).toContain("import { usePreviewRegion } from '@preview-tool/runtime'")
    })

    it('exports useAuth function', () => {
      const hook = makeHook({
        hookName: 'useAuth',
        importPath: '@/hooks/useAuth',
        category: 'auth',
        regionName: 'auth',
        states: ['authenticated', 'unauthenticated'],
        defaultState: 'authenticated',
      })
      const regions = [makeRegion({
        name: 'auth',
        states: ['authenticated', 'unauthenticated'],
        defaultState: 'authenticated',
        mockData: {
          authenticated: { user: { id: '1', name: 'Jane' }, isAuthenticated: true },
          unauthenticated: { user: null, isAuthenticated: false },
        },
      })]

      const code = generateMockModule(hook, regions)

      expect(code).toContain('export function useAuth')
    })

    it('reads region state for auth data', () => {
      const hook = makeHook({
        hookName: 'useAuth',
        importPath: '@/hooks/useAuth',
        category: 'auth',
        regionName: 'auth',
        states: ['authenticated', 'unauthenticated'],
        defaultState: 'authenticated',
      })
      const regions = [makeRegion({
        name: 'auth',
        states: ['authenticated', 'unauthenticated'],
        defaultState: 'authenticated',
        mockData: {
          authenticated: { user: { id: '1', name: 'Jane' }, isAuthenticated: true },
          unauthenticated: { user: null, isAuthenticated: false },
        },
      })]

      const code = generateMockModule(hook, regions)

      expect(code).toContain("usePreviewRegion('auth')")
    })
  })

  describe('navigation hooks', () => {
    it('generates useNavigate that dispatches preview-navigate event', () => {
      const hook = makeHook({
        hookName: 'useNavigate',
        importPath: 'react-router-dom',
        category: 'navigation',
        regionName: 'navigate',
      })

      const code = generateMockModule(hook, [])

      expect(code).toContain('export function useNavigate')
      expect(code).toContain('preview-navigate')
    })

    it('generates stubs for useLocation, useParams, useSearchParams', () => {
      const hook = makeHook({
        hookName: 'useNavigate',
        importPath: 'react-router-dom',
        category: 'navigation',
        regionName: 'navigate',
      })

      const code = generateMockModule(hook, [])

      expect(code).toContain('export function useLocation')
      expect(code).toContain('export function useParams')
      expect(code).toContain('export function useSearchParams')
    })

    it('generates stubs for router components', () => {
      const hook = makeHook({
        hookName: 'useNavigate',
        importPath: 'react-router-dom',
        category: 'navigation',
        regionName: 'navigate',
      })

      const code = generateMockModule(hook, [])

      expect(code).toContain('export function MemoryRouter')
      expect(code).toContain('export function BrowserRouter')
      expect(code).toContain('export function Routes')
      expect(code).toContain('export function Route')
      expect(code).toContain('export function Link')
      expect(code).toContain('export function Outlet')
    })
  })

  describe('i18n hooks', () => {
    it('generates passthrough mock where t(key) => key', () => {
      const hook = makeHook({
        hookName: 'useTranslation',
        importPath: 'react-i18next',
        category: 'i18n',
        regionName: 'translation',
      })

      const code = generateMockModule(hook, [])

      expect(code).toContain('(key) => key')
    })

    it('exports useTranslation function', () => {
      const hook = makeHook({
        hookName: 'useTranslation',
        importPath: 'react-i18next',
        category: 'i18n',
        regionName: 'translation',
      })

      const code = generateMockModule(hook, [])

      expect(code).toContain('export function useTranslation')
    })
  })

  describe('custom hooks', () => {
    it('generates mock similar to data-fetching with custom hook name', () => {
      const hook = makeHook({
        hookName: 'useBookings',
        importPath: '@/hooks/useBookings',
        category: 'custom',
        isProjectLocal: true,
        regionName: 'bookings',
        states: ['loading', 'error', 'empty', 'populated'],
        defaultState: 'populated',
      })
      const regions = [makeRegion({ name: 'bookings' })]

      const code = generateMockModule(hook, regions)

      expect(code).toContain("import { usePreviewRegion } from '@preview-tool/runtime'")
      expect(code).toContain('export function useBookings')
      expect(code).toContain("usePreviewRegion('bookings')")
    })
  })

  describe('unknown hooks', () => {
    it('generates passthrough returning empty object', () => {
      const hook = makeHook({
        hookName: 'useSpring',
        importPath: 'react-spring',
        category: 'unknown',
        regionName: 'spring',
      })

      const code = generateMockModule(hook, [])

      expect(code).toContain('export function useSpring')
      expect(code).toContain('return {}')
    })
  })
})

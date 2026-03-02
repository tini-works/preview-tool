import { describe, it, expect } from 'vitest'
import { inferRegions } from '../infer-regions.js'
import type { ClassifiedHook } from '../types.js'

function makeClassifiedHook(
  overrides: Partial<ClassifiedHook> & Pick<ClassifiedHook, 'hookName' | 'category'>,
): ClassifiedHook {
  return {
    importPath: 'unknown',
    callArgs: [],
    isProjectLocal: false,
    regionName: overrides.hookName.replace(/^use/, '').charAt(0).toLowerCase() +
      overrides.hookName.replace(/^use/, '').slice(1),
    states: [],
    defaultState: '',
    isList: false,
    returnShape: null,
    ...overrides,
  }
}

describe('inferRegions', () => {
  it('creates region for data-fetching hooks with mockData', () => {
    const hooks: readonly ClassifiedHook[] = [
      makeClassifiedHook({
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        category: 'data-fetching',
        regionName: 'tasks',
        callArgs: ['tasks'],
        states: ['loading', 'error', 'empty', 'populated'],
        defaultState: 'populated',
        isList: true,
      }),
    ]

    const regions = inferRegions(hooks)

    expect(regions).toHaveLength(1)
    expect(regions[0].name).toBe('tasks')
    expect(regions[0].label).toBe('Tasks')
    expect(regions[0].source).toBe('useQuery("tasks")')
    expect(regions[0].states).toEqual(['loading', 'error', 'empty', 'populated'])
    expect(regions[0].defaultState).toBe('populated')
    expect(regions[0].isList).toBe(true)

    // Check mockData structure
    const { mockData } = regions[0]
    expect(mockData.loading).toEqual({ data: null, isLoading: true, error: null })
    expect(mockData.error).toEqual({
      data: null,
      isLoading: false,
      error: { message: 'Something went wrong' },
    })
    expect(mockData.empty).toEqual({ data: [], isLoading: false, error: null })
    expect(mockData.populated.isLoading).toBe(false)
    expect(mockData.populated.error).toBeNull()
    expect(Array.isArray(mockData.populated.data)).toBe(true)
    expect((mockData.populated.data as unknown[]).length).toBe(5)
  })

  it('creates region for auth hooks with user mockData', () => {
    const hooks: readonly ClassifiedHook[] = [
      makeClassifiedHook({
        hookName: 'useAuth',
        importPath: '@/hooks/useAuth',
        category: 'auth',
        regionName: 'auth',
        states: ['authenticated', 'unauthenticated'],
        defaultState: 'authenticated',
        isList: false,
        isProjectLocal: true,
      }),
    ]

    const regions = inferRegions(hooks)

    expect(regions).toHaveLength(1)
    expect(regions[0].name).toBe('auth')
    expect(regions[0].label).toBe('Auth')
    expect(regions[0].source).toBe('useAuth()')
    expect(regions[0].states).toEqual(['authenticated', 'unauthenticated'])
    expect(regions[0].defaultState).toBe('authenticated')
    expect(regions[0].isList).toBe(false)

    // Check auth mockData
    const { mockData } = regions[0]
    expect(mockData.authenticated).toEqual({
      user: {
        id: '1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        avatar: 'https://i.pravatar.cc/150?u=1',
      },
      isAuthenticated: true,
    })
    expect(mockData.unauthenticated).toEqual({
      user: null,
      isAuthenticated: false,
    })
  })

  it('skips navigation and i18n hooks (returns empty)', () => {
    const hooks: readonly ClassifiedHook[] = [
      makeClassifiedHook({
        hookName: 'useNavigate',
        importPath: 'react-router-dom',
        category: 'navigation',
        regionName: 'navigate',
        states: [],
        defaultState: '',
      }),
      makeClassifiedHook({
        hookName: 'useTranslation',
        importPath: 'react-i18next',
        category: 'i18n',
        regionName: 'translation',
        states: [],
        defaultState: '',
      }),
    ]

    const regions = inferRegions(hooks)

    expect(regions).toHaveLength(0)
  })

  it('skips unknown category hooks', () => {
    const hooks: readonly ClassifiedHook[] = [
      makeClassifiedHook({
        hookName: 'useSpring',
        importPath: 'react-spring',
        category: 'unknown',
        regionName: 'spring',
        states: [],
        defaultState: '',
      }),
    ]

    const regions = inferRegions(hooks)

    expect(regions).toHaveLength(0)
  })

  it('skips state category hooks', () => {
    const hooks: readonly ClassifiedHook[] = [
      makeClassifiedHook({
        hookName: 'useStore',
        importPath: 'zustand',
        category: 'state',
        regionName: 'store',
        states: [],
        defaultState: '',
      }),
    ]

    const regions = inferRegions(hooks)

    expect(regions).toHaveLength(0)
  })

  it('creates region for custom project hooks with mockData', () => {
    const hooks: readonly ClassifiedHook[] = [
      makeClassifiedHook({
        hookName: 'useBookings',
        importPath: '@/hooks/useBookings',
        category: 'custom',
        regionName: 'bookings',
        states: ['loading', 'error', 'empty', 'populated'],
        defaultState: 'populated',
        isList: false,
        isProjectLocal: true,
      }),
    ]

    const regions = inferRegions(hooks)

    expect(regions).toHaveLength(1)
    expect(regions[0].name).toBe('bookings')
    expect(regions[0].label).toBe('Bookings')

    // Check custom mockData
    const { mockData } = regions[0]
    expect(mockData.loading).toEqual({ data: null, isLoading: true, error: null })
    expect(mockData.error).toEqual({
      data: null,
      isLoading: false,
      error: { message: 'Failed to load' },
    })
    expect(mockData.empty).toEqual({ data: null, isLoading: false, error: null })
    expect(mockData.populated).toEqual({
      data: { id: '1', name: 'Sample Item', status: 'active' },
      isLoading: false,
      error: null,
    })
  })

  it('handles multiple hooks and only creates regions for relevant ones', () => {
    const hooks: readonly ClassifiedHook[] = [
      makeClassifiedHook({
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        category: 'data-fetching',
        regionName: 'tasks',
        callArgs: ['tasks'],
        states: ['loading', 'error', 'empty', 'populated'],
        defaultState: 'populated',
        isList: true,
      }),
      makeClassifiedHook({
        hookName: 'useAuth',
        importPath: '@/hooks/useAuth',
        category: 'auth',
        regionName: 'auth',
        states: ['authenticated', 'unauthenticated'],
        defaultState: 'authenticated',
        isProjectLocal: true,
      }),
      makeClassifiedHook({
        hookName: 'useNavigate',
        importPath: 'react-router-dom',
        category: 'navigation',
        regionName: 'navigate',
      }),
      makeClassifiedHook({
        hookName: 'useTranslation',
        importPath: 'react-i18next',
        category: 'i18n',
        regionName: 'translation',
      }),
    ]

    const regions = inferRegions(hooks)

    expect(regions).toHaveLength(2)
    expect(regions.map((r) => r.name).sort()).toEqual(['auth', 'tasks'])
  })

  it('formats label from camelCase region name', () => {
    const hooks: readonly ClassifiedHook[] = [
      makeClassifiedHook({
        hookName: 'useUserProfile',
        importPath: '@/hooks/useUserProfile',
        category: 'custom',
        regionName: 'userProfile',
        states: ['loading', 'error', 'empty', 'populated'],
        defaultState: 'populated',
        isProjectLocal: true,
      }),
    ]

    const regions = inferRegions(hooks)

    expect(regions).toHaveLength(1)
    expect(regions[0].label).toBe('User Profile')
  })

  it('returns empty array when no hooks provided', () => {
    const regions = inferRegions([])

    expect(regions).toEqual([])
  })
})

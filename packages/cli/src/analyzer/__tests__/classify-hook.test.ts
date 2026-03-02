import { describe, it, expect } from 'vitest'
import { classifyHook } from '../classify-hook.js'
import type { ExtractedHook } from '../types.js'

function makeHook(overrides: Partial<ExtractedHook> & { hookName: string }): ExtractedHook {
  return {
    importPath: 'unknown',
    callArgs: [],
    isProjectLocal: false,
    ...overrides,
  }
}

describe('classifyHook', () => {
  it('classifies useQuery as data-fetching with 4 states and defaultState populated', () => {
    const hook = makeHook({
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      callArgs: ['tasks'],
    })

    const classified = classifyHook(hook)

    expect(classified.category).toBe('data-fetching')
    expect(classified.states).toEqual(['loading', 'error', 'empty', 'populated'])
    expect(classified.defaultState).toBe('populated')
    expect(classified.isList).toBe(true)
    expect(classified.regionName).toBe('tasks')
    expect(classified.returnShape).toBeNull()
  })

  it('classifies useSWR as data-fetching', () => {
    const hook = makeHook({
      hookName: 'useSWR',
      importPath: 'swr',
      callArgs: ['/api/users'],
    })

    const classified = classifyHook(hook)

    expect(classified.category).toBe('data-fetching')
    expect(classified.isList).toBe(true)
    expect(classified.regionName).toBe('/api/users')
  })

  it('classifies useAuth as auth with 2 states', () => {
    const hook = makeHook({
      hookName: 'useAuth',
      importPath: '@/hooks/useAuth',
      isProjectLocal: true,
    })

    const classified = classifyHook(hook)

    expect(classified.category).toBe('auth')
    expect(classified.states).toEqual(['authenticated', 'unauthenticated'])
    expect(classified.defaultState).toBe('authenticated')
    expect(classified.isList).toBe(false)
    expect(classified.regionName).toBe('auth')
  })

  it('classifies useSession as auth', () => {
    const hook = makeHook({
      hookName: 'useSession',
      importPath: 'next-auth/react',
    })

    const classified = classifyHook(hook)

    expect(classified.category).toBe('auth')
    expect(classified.regionName).toBe('session')
  })

  it('classifies useNavigate as navigation', () => {
    const hook = makeHook({
      hookName: 'useNavigate',
      importPath: 'react-router-dom',
    })

    const classified = classifyHook(hook)

    expect(classified.category).toBe('navigation')
    expect(classified.states).toEqual([])
    expect(classified.defaultState).toBe('')
  })

  it('classifies useRouter as navigation', () => {
    const hook = makeHook({
      hookName: 'useRouter',
      importPath: 'next/router',
    })

    const classified = classifyHook(hook)

    expect(classified.category).toBe('navigation')
  })

  it('classifies useTranslation as i18n', () => {
    const hook = makeHook({
      hookName: 'useTranslation',
      importPath: 'react-i18next',
      callArgs: ['settings'],
    })

    const classified = classifyHook(hook)

    expect(classified.category).toBe('i18n')
    expect(classified.states).toEqual([])
    expect(classified.defaultState).toBe('')
    expect(classified.regionName).toBe('settings')
  })

  it('classifies useIntl as i18n', () => {
    const hook = makeHook({
      hookName: 'useIntl',
      importPath: 'react-intl',
    })

    const classified = classifyHook(hook)

    expect(classified.category).toBe('i18n')
  })

  it('classifies project-local useBookings as custom with 4 states', () => {
    const hook = makeHook({
      hookName: 'useBookings',
      importPath: '@/hooks/useBookings',
      isProjectLocal: true,
    })

    const classified = classifyHook(hook)

    expect(classified.category).toBe('custom')
    expect(classified.states).toEqual(['loading', 'error', 'empty', 'populated'])
    expect(classified.defaultState).toBe('populated')
    expect(classified.isList).toBe(false)
    expect(classified.regionName).toBe('bookings')
  })

  it('classifies unknown third-party hooks as unknown', () => {
    const hook = makeHook({
      hookName: 'useSpring',
      importPath: 'react-spring',
    })

    const classified = classifyHook(hook)

    expect(classified.category).toBe('unknown')
    expect(classified.states).toEqual([])
    expect(classified.defaultState).toBe('')
  })

  it('derives regionName from first call arg when present and not object/array', () => {
    const hook = makeHook({
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      callArgs: ['tasks'],
    })

    const classified = classifyHook(hook)

    expect(classified.regionName).toBe('tasks')
  })

  it('derives regionName from hook name when first arg is an object', () => {
    const hook = makeHook({
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      callArgs: ['{ queryKey: ["tasks"] }'],
    })

    const classified = classifyHook(hook)

    expect(classified.regionName).toBe('query')
  })

  it('derives regionName from hook name when no args', () => {
    const hook = makeHook({
      hookName: 'useAuth',
      importPath: '@/hooks/useAuth',
      isProjectLocal: true,
    })

    const classified = classifyHook(hook)

    expect(classified.regionName).toBe('auth')
  })

  it('preserves all original ExtractedHook fields', () => {
    const hook = makeHook({
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      callArgs: ['tasks'],
      isProjectLocal: false,
    })

    const classified = classifyHook(hook)

    expect(classified.hookName).toBe('useQuery')
    expect(classified.importPath).toBe('@tanstack/react-query')
    expect(classified.callArgs).toEqual(['tasks'])
    expect(classified.isProjectLocal).toBe(false)
  })
})

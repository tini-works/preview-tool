import { describe, it, expect } from 'vitest'
import { generateAliasManifest, sanitizeFileName } from '../generate-alias.js'
import type { ClassifiedHook } from '../../analyzer/types.js'

function makeHook(overrides: Partial<ClassifiedHook> & { hookName: string; category: ClassifiedHook['category']; importPath: string }): ClassifiedHook {
  return {
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

describe('sanitizeFileName', () => {
  it('converts @ scoped packages to valid filenames', () => {
    expect(sanitizeFileName('@tanstack/react-query')).toBe('_tanstack_react-query')
  })

  it('converts relative paths to valid filenames', () => {
    expect(sanitizeFileName('@/hooks/useAuth')).toBe('_hooks_useAuth')
  })

  it('converts forward slashes to underscores', () => {
    expect(sanitizeFileName('react-router-dom')).toBe('react-router-dom')
  })

  it('converts tilde paths to valid filenames', () => {
    expect(sanitizeFileName('~/hooks/useData')).toBe('_hooks_useData')
  })
})

describe('generateAliasManifest', () => {
  it('maps import paths to mock file paths', () => {
    const hooks = [
      makeHook({
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        category: 'data-fetching',
      }),
    ]

    const aliases = generateAliasManifest(hooks, '.preview/mocks')

    expect(aliases['@tanstack/react-query']).toBe('.preview/mocks/_tanstack_react-query.js')
  })

  it('skips unknown category hooks', () => {
    const hooks = [
      makeHook({
        hookName: 'useSpring',
        importPath: 'react-spring',
        category: 'unknown',
      }),
    ]

    const aliases = generateAliasManifest(hooks, '.preview/mocks')

    expect(aliases['react-spring']).toBeUndefined()
  })

  it('skips state category hooks', () => {
    const hooks = [
      makeHook({
        hookName: 'useStore',
        importPath: 'zustand',
        category: 'state',
      }),
    ]

    const aliases = generateAliasManifest(hooks, '.preview/mocks')

    expect(aliases['zustand']).toBeUndefined()
  })

  it('generates aliases for multiple hooks with different import paths', () => {
    const hooks = [
      makeHook({
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        category: 'data-fetching',
      }),
      makeHook({
        hookName: 'useAuth',
        importPath: '@/hooks/useAuth',
        category: 'auth',
      }),
      makeHook({
        hookName: 'useNavigate',
        importPath: 'react-router-dom',
        category: 'navigation',
      }),
    ]

    const aliases = generateAliasManifest(hooks, '.preview/mocks')

    expect(Object.keys(aliases)).toHaveLength(3)
    expect(aliases['@tanstack/react-query']).toBeDefined()
    expect(aliases['@/hooks/useAuth']).toBeDefined()
    expect(aliases['react-router-dom']).toBeDefined()
  })

  it('deduplicates hooks with the same import path', () => {
    const hooks = [
      makeHook({
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        category: 'data-fetching',
      }),
      makeHook({
        hookName: 'useMutation',
        importPath: '@tanstack/react-query',
        category: 'data-fetching',
      }),
    ]

    const aliases = generateAliasManifest(hooks, '.preview/mocks')

    expect(Object.keys(aliases)).toHaveLength(1)
  })

  it('returns empty object for empty hooks array', () => {
    const aliases = generateAliasManifest([], '.preview/mocks')

    expect(aliases).toEqual({})
  })
})

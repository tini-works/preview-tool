import { describe, it, expect } from 'vitest'
import { generateMockModules } from '../generate-mock-from-analysis.js'
import type { ScreenFacts } from '../../analyzer/types.js'
import type { ScreenAnalysisOutput } from '../../llm/schemas/screen-analysis.js'

describe('generateMockModules', () => {
  const facts: ScreenFacts[] = [{
    route: '/booking',
    filePath: '/app/booking.tsx',
    sourceCode: '',
    hooks: [
      { name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['services'] }"] },
      { name: 'useAuthStore', importPath: '@/stores/auth', arguments: ['s => s.user'] },
    ],
    components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
  }]

  const analyses: ScreenAnalysisOutput[] = [{
    route: '/booking',
    regions: [
      { key: 'service-list', label: 'Service List', type: 'list', hookBindings: ['useQuery:services'], states: { populated: { label: 'P', mockData: {} } }, defaultState: 'populated' },
      { key: 'auth', label: 'Auth', type: 'auth', hookBindings: ['useAuthStore:auth'], states: { authenticated: { label: 'A', mockData: {} } }, defaultState: 'authenticated' },
    ],
    flows: [],
  }]

  it('generates mock files with direct region key mapping', () => {
    const result = generateMockModules(facts, analyses)
    expect(result.mockFiles.size).toBe(2)
    expect(result.mockFiles.has('@tanstack/react-query')).toBe(true)
    expect(result.mockFiles.has('@/stores/auth')).toBe(true)
  })

  it('mock hooks use single-arg useRegionDataForHook with region key', () => {
    const result = generateMockModules(facts, analyses)
    const queryMock = result.mockFiles.get('@tanstack/react-query')!
    expect(queryMock).toContain("useRegionDataForHook('service-list')")

    const authMock = result.mockFiles.get('@/stores/auth')!
    expect(authMock).toContain("useRegionDataForHook('auth')")
  })

  it('builds alias manifest', () => {
    const result = generateMockModules(facts, analyses)
    expect(result.aliasManifest['@tanstack/react-query']).toBeDefined()
    expect(result.aliasManifest['@/stores/auth']).toBeDefined()
  })

  it('alias manifest uses safe filenames', () => {
    const result = generateMockModules(facts, analyses)
    expect(result.aliasManifest['@tanstack/react-query']).toBe('./mocks/tanstack-react-query.ts')
    expect(result.aliasManifest['@/stores/auth']).toBe('./mocks/stores-auth.ts')
  })

  it('handles unmapped hooks with DEFAULT_STATE', () => {
    const factsWithUnmapped: ScreenFacts[] = [{
      route: '/test',
      filePath: '/test.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useUnknownHook', importPath: '@/hooks/unknown', arguments: [] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }]
    const result = generateMockModules(factsWithUnmapped, [{ route: '/test', regions: [], flows: [] }])
    const code = result.mockFiles.get('@/hooks/unknown')!
    expect(code).toContain('DEFAULT_STATE')
    expect(code).not.toContain('useRegionDataForHook')
  })

  it('deduplicates hooks by name within same import', () => {
    const dupFacts: ScreenFacts[] = [
      {
        route: '/a', filePath: '/a.tsx', sourceCode: '',
        hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['a'] }"] }],
        components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
      },
      {
        route: '/b', filePath: '/b.tsx', sourceCode: '',
        hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['b'] }"] }],
        components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
      },
    ]
    const dupAnalyses: ScreenAnalysisOutput[] = [
      { route: '/a', regions: [{ key: 'a-data', label: 'A', type: 'list', hookBindings: ['useQuery:a'], states: { x: { label: 'X', mockData: {} } }, defaultState: 'x' }], flows: [] },
      { route: '/b', regions: [{ key: 'b-data', label: 'B', type: 'list', hookBindings: ['useQuery:b'], states: { x: { label: 'X', mockData: {} } }, defaultState: 'x' }], flows: [] },
    ]
    const result = generateMockModules(dupFacts, dupAnalyses)
    // Should have ONE mock file for @tanstack/react-query with ONE useQuery export
    expect(result.mockFiles.size).toBe(1)
    const code = result.mockFiles.get('@tanstack/react-query')!
    const matches = code.match(/export function useQuery/g)
    expect(matches).toHaveLength(1)
  })

  it('imports useRegionDataForHook when at least one hook has a region mapping', () => {
    const result = generateMockModules(facts, analyses)
    const queryMock = result.mockFiles.get('@tanstack/react-query')!
    expect(queryMock).toContain("import { useRegionDataForHook } from '@preview-tool/runtime'")
  })

  it('does not import useRegionDataForHook when no hooks have region mappings', () => {
    const unmappedFacts: ScreenFacts[] = [{
      route: '/test',
      filePath: '/test.tsx',
      sourceCode: '',
      hooks: [{ name: 'useHelper', importPath: '@/hooks/helper', arguments: [] }],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }]
    const result = generateMockModules(unmappedFacts, [{ route: '/test', regions: [], flows: [] }])
    const code = result.mockFiles.get('@/hooks/helper')!
    expect(code).not.toContain("import { useRegionDataForHook }")
  })

  it('includes resolveFromState helper in query mock files', () => {
    const result = generateMockModules(facts, analyses)
    const code = result.mockFiles.get('@tanstack/react-query')!
    expect(code).toContain('function resolveFromState')
    expect(code).toContain('_loading')
    expect(code).toContain('_error')
  })

  it('includes resolveStoreState helper in store mock files', () => {
    const result = generateMockModules(facts, analyses)
    const code = result.mockFiles.get('@/stores/auth')!
    expect(code).toContain('function resolveStoreState')
  })

  it('handles empty facts and analyses', () => {
    const result = generateMockModules([], [])
    expect(result.mockFiles.size).toBe(0)
    expect(Object.keys(result.aliasManifest)).toHaveLength(0)
  })

  it('generates store mock that returns state directly (no resolveFromState wrapper)', () => {
    const storeFacts: ScreenFacts[] = [{
      route: '/home',
      filePath: '/home.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useAuthStore', importPath: '@/stores/auth', arguments: [], destructuredFields: ['user', 'logout'] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }]
    const storeAnalyses: ScreenAnalysisOutput[] = [{
      route: '/home',
      regions: [{
        key: 'auth-store',
        label: 'Auth Store',
        type: 'auth',
        hookBindings: ['useAuthStore:auth-store'],
        states: { authenticated: { label: 'A', mockData: { user: { name: 'Alice' }, isAuthenticated: true } } },
        defaultState: 'authenticated',
      }],
      flows: [],
    }]
    const result = generateMockModules(storeFacts, storeAnalyses)
    const code = result.mockFiles.get('@/stores/auth')!

    // Store mock should use resolveStoreState, not resolveFromState
    expect(code).toContain('resolveStoreState')
    expect(code).not.toContain('data: stateData.data ?? stateData')
  })

  it('generates query-hook mock with resolveFromState wrapper', () => {
    const queryFacts: ScreenFacts[] = [{
      route: '/list',
      filePath: '/list.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['items'] }"], destructuredFields: ['data', 'isLoading'] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }]
    const queryAnalyses: ScreenAnalysisOutput[] = [{
      route: '/list',
      regions: [{
        key: 'items',
        label: 'Items',
        type: 'list',
        hookBindings: ['useQuery:items'],
        states: { populated: { label: 'P', mockData: { data: [{ id: '1' }] } } },
        defaultState: 'populated',
      }],
      flows: [],
    }]
    const result = generateMockModules(queryFacts, queryAnalyses)
    const code = result.mockFiles.get('@tanstack/react-query')!

    // Query mock should use resolveFromState wrapper
    expect(code).toContain('resolveFromState')
    expect(code).toContain('data: stateData.data ?? stateData')
  })

  it('generates no-op stubs for destructured function fields in store mocks', () => {
    const storeFacts: ScreenFacts[] = [{
      route: '/login',
      filePath: '/login.tsx',
      sourceCode: '',
      hooks: [
        {
          name: 'useAuthStore',
          importPath: '@/stores/auth',
          arguments: [],
          destructuredFields: ['login', 'isLoading', 'error', 'clearError'],
        },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }]
    const storeAnalyses: ScreenAnalysisOutput[] = [{
      route: '/login',
      regions: [{
        key: 'auth-store',
        label: 'Auth Store',
        type: 'auth',
        hookBindings: ['useAuthStore:auth-store'],
        states: {
          default: { label: 'Default', mockData: { isLoading: false, error: null } },
        },
        defaultState: 'default',
      }],
      flows: [],
    }]
    const result = generateMockModules(storeFacts, storeAnalyses)
    const code = result.mockFiles.get('@/stores/auth')!

    // Should have NOOP constant and resolveStoreState with fields
    expect(code).toContain('const NOOP')
    expect(code).toContain('resolveStoreState')
    expect(code).toContain("'login'")
    expect(code).toContain("'clearError'")
  })

  it('store mock without destructured fields returns state directly', () => {
    const storeFacts: ScreenFacts[] = [{
      route: '/home',
      filePath: '/home.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useAuthStore', importPath: '@/stores/auth', arguments: ['s => s.user'] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }]
    const storeAnalyses: ScreenAnalysisOutput[] = [{
      route: '/home',
      regions: [{
        key: 'auth',
        label: 'Auth',
        type: 'auth',
        hookBindings: ['useAuthStore:auth'],
        states: { authenticated: { label: 'A', mockData: { user: { name: 'Alice' } } } },
        defaultState: 'authenticated',
      }],
      flows: [],
    }]
    const result = generateMockModules(storeFacts, storeAnalyses)
    const code = result.mockFiles.get('@/stores/auth')!

    // Store without fields still uses resolveStoreState (not resolveFromState)
    expect(code).toContain('resolveStoreState')
    expect(code).not.toContain('data: stateData.data ?? stateData')
  })

  it('handles mixed store+query hooks from same import path', () => {
    const mixedFacts: ScreenFacts[] = [{
      route: '/mixed',
      filePath: '/mixed.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useUserStore', importPath: '@/lib/data', arguments: [], destructuredFields: ['user'] },
        { name: 'useUserQuery', importPath: '@/lib/data', arguments: [] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }]
    const mixedAnalyses: ScreenAnalysisOutput[] = [{
      route: '/mixed',
      regions: [
        { key: 'user-store', label: 'User Store', type: 'auth', hookBindings: ['useUserStore:user-store'], states: { default: { label: 'D', mockData: { user: null } } }, defaultState: 'default' },
        { key: 'user-query', label: 'User Query', type: 'detail', hookBindings: ['useUserQuery:user-query'], states: { loaded: { label: 'L', mockData: { name: 'Alice' } } }, defaultState: 'loaded' },
      ],
      flows: [],
    }]
    const result = generateMockModules(mixedFacts, mixedAnalyses)
    const code = result.mockFiles.get('@/lib/data')!

    // Both helpers should be present
    expect(code).toContain('resolveStoreState')
    expect(code).toContain('resolveFromState')
    expect(code).toContain('const NOOP')
    expect(code).toContain('DEFAULT_STATE')
  })

  it('skips provider hooks (useNavigate, useForm) from mock generation', () => {
    const providerFacts: ScreenFacts[] = [{
      route: '/test',
      filePath: '/test.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useNavigate', importPath: 'react-router-dom', arguments: [] },
        { name: 'useForm', importPath: 'react-hook-form', arguments: [] },
        { name: 'useTranslation', importPath: 'react-i18next', arguments: [] },
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['items'] }"] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }]
    const result = generateMockModules(providerFacts, [{ route: '/test', regions: [], flows: [] }])
    expect(result.mockFiles.has('react-router-dom')).toBe(false)
    expect(result.mockFiles.has('react-hook-form')).toBe(false)
    expect(result.mockFiles.has('react-i18next')).toBe(false)
    expect(result.mockFiles.has('@tanstack/react-query')).toBe(true)
  })
})

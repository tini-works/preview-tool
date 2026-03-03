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
    components: [], conditionals: [], navigation: [],
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
      components: [], conditionals: [], navigation: [],
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
        components: [], conditionals: [], navigation: [],
      },
      {
        route: '/b', filePath: '/b.tsx', sourceCode: '',
        hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['b'] }"] }],
        components: [], conditionals: [], navigation: [],
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
      components: [], conditionals: [], navigation: [],
    }]
    const result = generateMockModules(unmappedFacts, [{ route: '/test', regions: [], flows: [] }])
    const code = result.mockFiles.get('@/hooks/helper')!
    expect(code).not.toContain("import { useRegionDataForHook }")
  })

  it('includes resolveFromState helper in generated mocks', () => {
    const result = generateMockModules(facts, analyses)
    const code = result.mockFiles.get('@tanstack/react-query')!
    expect(code).toContain('function resolveFromState')
    expect(code).toContain('_loading')
    expect(code).toContain('_error')
  })

  it('handles empty facts and analyses', () => {
    const result = generateMockModules([], [])
    expect(result.mockFiles.size).toBe(0)
    expect(Object.keys(result.aliasManifest)).toHaveLength(0)
  })
})

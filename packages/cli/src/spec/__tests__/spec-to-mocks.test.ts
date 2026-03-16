import { describe, it, expect } from 'vitest'
import { generateMockCode, generateAliasManifest } from '../spec-to-mocks.js'
import type { SpecManifestScreen } from '../types.js'

const SCREEN: SpecManifestScreen = {
  id: 'scr-search',
  title: 'Search',
  sourceFile: 'src/pages/SearchPage.tsx',
  states: ['loading', 'results', 'error'],
  defaultState: 'loading',
  stateData: {
    loading: { isLoading: true, items: [] },
    results: { isLoading: false, items: [{ id: '1' }] },
    error: { isLoading: false, error: 'Failed' },
  },
  stateDescriptions: {},
  dataDeps: [
    { hook: 'useItems', module: '@/hooks/useItems', provides: ['items', 'isLoading', 'error'] },
    { hook: 'useBookingStore', module: '@/stores/booking', provides: ['selected', 'setSelected'] },
  ],
  routeParams: null,
  apiClient: null,
}

describe('generateMockCode', () => {
  it('generates a mock module for a hook', () => {
    const code = generateMockCode(SCREEN, SCREEN.dataDeps[0])
    expect(code).toContain("import { useRegionDataForHook } from '@preview-tool/runtime'")
    expect(code).toContain('export function useItems(')
    expect(code).toContain("useRegionDataForHook('scr-search')")
    expect(code).toContain('items')
    expect(code).toContain('isLoading')
    expect(code).toContain('error')
  })

  it('generates a store mock with NOOP for non-data fields', () => {
    const code = generateMockCode(SCREEN, SCREEN.dataDeps[1])
    expect(code).toContain('export function useBookingStore(')
    expect(code).toContain('typeof args[0] === \'function\'')
  })

  it('re-exports original module for non-mocked exports', () => {
    const code = generateMockCode(SCREEN, SCREEN.dataDeps[0])
    expect(code).toContain("export * from '__real:@/hooks/useItems'")
  })
})

describe('generateAliasManifest', () => {
  it('maps module paths to virtual module IDs', () => {
    const manifest = generateAliasManifest([SCREEN])
    expect(manifest['@/hooks/useItems']).toBeDefined()
    expect(manifest['@/stores/booking']).toBeDefined()
  })

  it('deduplicates when multiple screens share a hook module', () => {
    const screen2: SpecManifestScreen = {
      ...SCREEN,
      id: 'scr-detail',
      dataDeps: [{ hook: 'useItems', module: '@/hooks/useItems', provides: ['items'] }],
    }
    const manifest = generateAliasManifest([SCREEN, screen2])
    expect(Object.keys(manifest).filter((k) => k === '@/hooks/useItems')).toHaveLength(1)
  })
})

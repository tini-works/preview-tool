import { describe, it, expect } from 'vitest'
import { generateMockHook } from '../generate-mock-hooks.js'
import type { HookAnalysis } from '../../analyzer/types.js'

describe('generateMockHook', () => {
  it('generates mock for useAppLiveQuery', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useAppLiveQuery',
        importPath: '@/hooks/use-app-live-query',
        sectionId: 'service-grid',
        returnShape: 'data-loading-error',
      },
    ]

    const code = generateMockHook(hooks, '@/hooks/use-app-live-query')
    expect(code).toContain('useDevToolsStore')
    expect(code).toContain('export function useAppLiveQuery')
    expect(code).toContain('regionStates')
    expect(code).toContain('_loading')
    expect(code).toContain('_error')
  })

  it('generates mock for useQuery from react-query', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        returnShape: 'data-loading-error',
      },
    ]

    const code = generateMockHook(hooks, '@tanstack/react-query')
    expect(code).toContain('export function useQuery')
    expect(code).toContain('regionStates')
  })

  it('includes registerModels export', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useAppLiveQuery',
        importPath: '@/hooks/use-app-live-query',
        sectionId: 'service-grid',
        returnShape: 'data-loading-error',
      },
    ]

    const code = generateMockHook(hooks, '@/hooks/use-app-live-query')
    expect(code).toContain('export function registerModels')
  })

  it('preserves original function signature for useAppLiveQuery', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useAppLiveQuery',
        importPath: '@/hooks/use-app-live-query',
        sectionId: 'service-grid',
        returnShape: 'data-loading-error',
      },
    ]

    const code = generateMockHook(hooks, '@/hooks/use-app-live-query')
    // Must accept same params as the original
    expect(code).toContain('depsOrSectionId')
    expect(code).toContain('sectionId')
  })
})

describe('generateMockHook — useRegionDataForHook integration', () => {
  it('generates mock that imports useRegionDataForHook from runtime', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        returnShape: 'data-loading-error',
        hookMappingType: 'query-hook',
      },
    ]

    const code = generateMockHook(hooks, '@tanstack/react-query')
    expect(code).toContain('useRegionDataForHook')
    expect(code).toContain("from '@preview-tool/runtime'")
  })

  it('generates useQuery mock that calls useRegionDataForHook with query-hook type', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        returnShape: 'data-loading-error',
        hookMappingType: 'query-hook',
      },
    ]

    const code = generateMockHook(hooks, '@tanstack/react-query')
    expect(code).toContain("useRegionDataForHook('query-hook'")
  })

  it('generates useAppLiveQuery mock that calls useRegionDataForHook with custom-hook type', () => {
    const hooks: HookAnalysis[] = [
      {
        hookName: 'useAppLiveQuery',
        importPath: '@/hooks/use-app-live-query',
        sectionId: 'service-grid',
        returnShape: 'data-loading-error',
        hookMappingType: 'custom-hook',
      },
    ]

    const code = generateMockHook(hooks, '@/hooks/use-app-live-query')
    expect(code).toContain("useRegionDataForHook('custom-hook'")
  })
})

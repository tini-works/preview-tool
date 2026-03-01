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

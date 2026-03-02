import { describe, it, expect } from 'vitest'
import { enrichModelWithHookMapping } from '../index.js'
import type { ModelOutput, HookAnalysisResult } from '../../analyzer/types.js'

describe('enrichModelWithHookMapping', () => {
  it('returns model unchanged when no hook results', () => {
    const model: ModelOutput = {
      regions: {
        'my-region': {
          label: 'My Region',
          states: { populated: { data: [] } },
          defaultState: 'populated',
        },
      },
    }
    expect(enrichModelWithHookMapping(model, null)).toEqual(model)
  })

  it('adds hookMapping when sectionId matches region key exactly', () => {
    const model: ModelOutput = {
      regions: {
        'service-grid': {
          label: 'Service Grid',
          states: { populated: { data: [] } },
          defaultState: 'populated',
        },
      },
    }
    const hooks: HookAnalysisResult = {
      hooks: [{
        hookName: 'useAppLiveQuery',
        importPath: '@/hooks/use-app-live-query',
        sectionId: 'service-grid',
        hookMappingType: 'custom-hook',
        returnShape: 'data-loading-error',
      }],
      imports: [],
    }

    const result = enrichModelWithHookMapping(model, hooks)
    expect(result.regions['service-grid'].hookMapping).toEqual({
      type: 'custom-hook',
      hookName: 'useAppLiveQuery',
      identifier: 'service-grid',
      importPath: '@/hooks/use-app-live-query',
    })
  })

  it('assigns hookMapping to unmatched region when sectionId differs from key', () => {
    const model: ModelOutput = {
      regions: {
        'service-grid': {
          label: 'Service Grid',
          states: { populated: { data: [] } },
          defaultState: 'populated',
        },
      },
    }
    const hooks: HookAnalysisResult = {
      hooks: [{
        hookName: 'useAppLiveQuery',
        importPath: '@/hooks/use-app-live-query',
        sectionId: 'service-detail',
        hookMappingType: 'custom-hook',
        returnShape: 'data-loading-error',
      }],
      imports: [],
    }

    const result = enrichModelWithHookMapping(model, hooks)
    // The hook should be assigned to the unmatched region
    expect(result.regions['service-grid'].hookMapping).toEqual({
      type: 'custom-hook',
      hookName: 'useAppLiveQuery',
      identifier: 'service-detail',
      importPath: '@/hooks/use-app-live-query',
    })
  })

  it('creates new region when no unassigned regions available', () => {
    const model: ModelOutput = {
      regions: {
        'existing': {
          label: 'Existing',
          states: { populated: { data: [] } },
          defaultState: 'populated',
          hookMapping: {
            type: 'custom-hook',
            hookName: 'useSomething',
            identifier: 'existing',
            importPath: '@/hooks/something',
          },
        },
      },
    }
    const hooks: HookAnalysisResult = {
      hooks: [{
        hookName: 'useQuery',
        importPath: '@tanstack/react-query',
        sectionId: 'availability',
        hookMappingType: 'query-hook',
        returnShape: 'data-loading-error',
      }],
      imports: [],
    }

    const result = enrichModelWithHookMapping(model, hooks)
    // New region created with the sectionId as key
    expect(result.regions['availability']).toBeDefined()
    expect(result.regions['availability'].hookMapping).toEqual({
      type: 'query-hook',
      hookName: 'useQuery',
      identifier: 'availability',
      importPath: '@tanstack/react-query',
    })
    // Original region unchanged
    expect(result.regions['existing'].hookMapping?.identifier).toBe('existing')
  })

  it('does not overwrite existing hookMapping', () => {
    const model: ModelOutput = {
      regions: {
        'service-grid': {
          label: 'Service Grid',
          states: { populated: { data: [] } },
          defaultState: 'populated',
          hookMapping: {
            type: 'custom-hook',
            hookName: 'useManual',
            identifier: 'manual-id',
            importPath: '@/hooks/manual',
          },
        },
      },
    }
    const hooks: HookAnalysisResult = {
      hooks: [{
        hookName: 'useAppLiveQuery',
        importPath: '@/hooks/use-app-live-query',
        sectionId: 'service-grid',
        hookMappingType: 'custom-hook',
        returnShape: 'data-loading-error',
      }],
      imports: [],
    }

    const result = enrichModelWithHookMapping(model, hooks)
    // Should keep the existing hookMapping
    expect(result.regions['service-grid'].hookMapping?.identifier).toBe('manual-id')
  })

  it('handles multiple hooks mapping to different regions', () => {
    const model: ModelOutput = {
      regions: {
        'dashboard-stats': {
          label: 'Stats',
          states: { populated: { data: [] } },
          defaultState: 'populated',
        },
        'dashboard-upcoming': {
          label: 'Upcoming',
          states: { populated: { data: [] } },
          defaultState: 'populated',
        },
      },
    }
    const hooks: HookAnalysisResult = {
      hooks: [
        {
          hookName: 'useLiveQuery',
          importPath: '@/hooks/use-app-live-query',
          sectionId: 'dashboard-stats',
          hookMappingType: 'custom-hook',
          returnShape: 'data-loading-error',
        },
        {
          hookName: 'useLiveQuery',
          importPath: '@/hooks/use-app-live-query',
          sectionId: 'dashboard-upcoming',
          hookMappingType: 'custom-hook',
          returnShape: 'data-loading-error',
        },
      ],
      imports: [],
    }

    const result = enrichModelWithHookMapping(model, hooks)
    expect(result.regions['dashboard-stats'].hookMapping?.identifier).toBe('dashboard-stats')
    expect(result.regions['dashboard-upcoming'].hookMapping?.identifier).toBe('dashboard-upcoming')
  })
})

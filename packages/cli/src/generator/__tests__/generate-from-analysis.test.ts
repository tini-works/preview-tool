import { describe, it, expect } from 'vitest'
import { analysisToModel, analysisToController, inferHookMappingType } from '../generate-from-analysis.js'
import type { ScreenAnalysisOutput } from '../../llm/schemas/screen-analysis.js'

const sampleAnalysis: ScreenAnalysisOutput = {
  route: '/booking',
  regions: [
    {
      key: 'service-list',
      label: 'Service List',
      type: 'list',
      hookBindings: ['useQuery:services'],
      states: {
        populated: { label: 'Populated', mockData: { data: [{ id: '1', name: 'Haircut' }] } },
        loading: { label: 'Loading', mockData: { _loading: true } },
        empty: { label: 'Empty', mockData: { data: [] } },
      },
      defaultState: 'populated',
      isList: true,
      mockItems: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), name: `Service ${i + 1}` })),
      defaultCount: 3,
    },
  ],
  flows: [
    { trigger: { selector: 'button', text: 'Book Now' }, action: 'navigate', target: '/booking/confirm' },
    { trigger: { selector: 'button', text: 'Show Loading' }, action: 'setRegionState', target: 'loading', targetRegion: 'service-list' },
  ],
}

describe('analysisToModel', () => {
  it('converts regions to ModelOutput format', () => {
    const model = analysisToModel(sampleAnalysis)
    expect(model.regions['service-list']).toBeDefined()
    expect(model.regions['service-list'].label).toBe('Service List')
    expect(model.regions['service-list'].states.populated).toEqual({ data: [{ id: '1', name: 'Haircut' }] })
    expect(model.regions['service-list'].states.loading).toEqual({ _loading: true })
    expect(model.regions['service-list'].defaultState).toBe('populated')
    expect(model.regions['service-list'].isList).toBe(true)
    expect(model.regions['service-list'].mockItems).toHaveLength(10)
    expect(model.regions['service-list'].defaultCount).toBe(3)
  })

  it('derives hookMapping from hookBindings', () => {
    const model = analysisToModel(sampleAnalysis)
    const mapping = model.regions['service-list'].hookMapping
    expect(mapping).toBeDefined()
    expect(mapping!.type).toBe('query-hook')
    expect(mapping!.hookName).toBe('useQuery')
    expect(mapping!.identifier).toBe('service-list')
  })

  it('handles regions without hookBindings', () => {
    const analysis: ScreenAnalysisOutput = {
      route: '/test',
      regions: [{
        key: 'hero',
        label: 'Hero Section',
        type: 'custom',
        hookBindings: [],
        states: { default: { label: 'Default', mockData: { title: 'Hello' } } },
        defaultState: 'default',
      }],
      flows: [],
    }
    const model = analysisToModel(analysis)
    expect(model.regions['hero']).toBeDefined()
    expect(model.regions['hero'].hookMapping).toBeUndefined()
  })

  it('handles empty regions', () => {
    const analysis: ScreenAnalysisOutput = { route: '/empty', regions: [], flows: [] }
    const model = analysisToModel(analysis)
    expect(Object.keys(model.regions)).toHaveLength(0)
  })

  it('infers store hookMappingType for store hooks', () => {
    const analysis: ScreenAnalysisOutput = {
      route: '/test',
      regions: [{
        key: 'auth',
        label: 'Auth',
        type: 'auth',
        hookBindings: ['useAuthStore:auth'],
        states: { authenticated: { label: 'A', mockData: { user: { name: 'Alice' } } } },
        defaultState: 'authenticated',
      }],
      flows: [],
    }
    const model = analysisToModel(analysis)
    expect(model.regions['auth'].hookMapping!.type).toBe('store')
  })

  it('infers custom-hook hookMappingType for livequery hooks', () => {
    const analysis: ScreenAnalysisOutput = {
      route: '/test',
      regions: [{
        key: 'data',
        label: 'Data',
        type: 'list',
        hookBindings: ['useAppLiveQuery:items'],
        states: { populated: { label: 'P', mockData: { data: [] } } },
        defaultState: 'populated',
      }],
      flows: [],
    }
    const model = analysisToModel(analysis)
    expect(model.regions['data'].hookMapping!.type).toBe('custom-hook')
  })

  it('sets component to Screen and componentPath to empty string', () => {
    const model = analysisToModel(sampleAnalysis)
    expect(model.regions['service-list'].component).toBe('Screen')
    expect(model.regions['service-list'].componentPath).toBe('')
  })
})

describe('inferHookMappingType', () => {
  it('classifies useAuthStore as store', () => {
    expect(inferHookMappingType('useAuthStore')).toBe('store')
  })

  it('classifies useQuery as query-hook', () => {
    expect(inferHookMappingType('useQuery')).toBe('query-hook')
  })

  it('does not misclassify useRestoreSession as store', () => {
    expect(inferHookMappingType('useRestoreSession')).not.toBe('store')
  })

  it('classifies useCartStore as store', () => {
    expect(inferHookMappingType('useCartStore')).toBe('store')
  })
})

describe('analysisToController', () => {
  it('converts navigate flows', () => {
    const controller = analysisToController(sampleAnalysis)
    expect(controller.flows[0]).toEqual({
      trigger: { selector: 'button', text: 'Book Now' },
      navigate: '/booking/confirm',
    })
  })

  it('converts setRegionState flows', () => {
    const controller = analysisToController(sampleAnalysis)
    expect(controller.flows[1]).toEqual({
      trigger: { selector: 'button', text: 'Show Loading' },
      setRegionState: { region: 'service-list', state: 'loading' },
    })
  })

  it('converts setState flows as navigate', () => {
    const analysis: ScreenAnalysisOutput = {
      route: '/test',
      regions: [],
      flows: [
        { trigger: { selector: 'a', text: 'Go' }, action: 'setState', target: '/next' },
      ],
    }
    const controller = analysisToController(analysis)
    expect(controller.flows[0]).toEqual({
      trigger: { selector: 'a', text: 'Go' },
      navigate: '/next',
    })
  })

  it('returns empty componentStates and journeys', () => {
    const controller = analysisToController(sampleAnalysis)
    expect(controller.componentStates).toEqual({})
    expect(controller.journeys).toEqual([])
  })

  it('preserves ariaLabel on trigger', () => {
    const analysis: ScreenAnalysisOutput = {
      route: '/test',
      regions: [],
      flows: [
        { trigger: { selector: 'button', ariaLabel: 'Close dialog' }, action: 'navigate', target: '/home' },
      ],
    }
    const controller = analysisToController(analysis)
    expect(controller.flows[0].trigger.ariaLabel).toBe('Close dialog')
  })

  it('handles empty flows', () => {
    const analysis: ScreenAnalysisOutput = { route: '/test', regions: [], flows: [] }
    const controller = analysisToController(analysis)
    expect(controller.flows).toHaveLength(0)
  })
})

import { describe, it, expect } from 'vitest'
import {
  SpecScreenSchema,
  SpecFlowSchema,
  SpecCodeMapSchema,
  SpecManifestSchema,
  type SpecScreen,
  type SpecFlow,
} from '../types.js'

describe('SpecScreenSchema', () => {
  it('parses a minimal screen', () => {
    const input = {
      id: 'scr-home',
      type: 'screen',
      title: 'Home',
      states: [{ name: 'default', description: 'Initial state' }],
    }
    const result = SpecScreenSchema.parse(input)
    expect(result.id).toBe('scr-home')
    expect(result.states).toHaveLength(1)
    expect(result.states[0].mockData).toBeUndefined()
    expect(result.data_deps).toEqual([])
  })

  it('parses a screen with mockData and data_deps', () => {
    const input = {
      id: 'scr-search',
      type: 'screen',
      title: 'Search',
      states: [
        {
          name: 'loading',
          description: 'Fetching',
          mockData: { isLoading: true, items: [] },
        },
        {
          name: 'results',
          description: 'Loaded',
          mockData: { isLoading: false, items: [{ id: '1', name: 'Test' }] },
        },
      ],
      data_deps: [
        {
          hook: 'useItems',
          module: '@/hooks/useItems',
          provides: ['items', 'isLoading'],
        },
      ],
    }
    const result = SpecScreenSchema.parse(input)
    expect(result.states[0].mockData).toEqual({ isLoading: true, items: [] })
    expect(result.data_deps).toHaveLength(1)
    expect(result.data_deps[0].hook).toBe('useItems')
  })

  it('rejects a screen without id', () => {
    expect(() =>
      SpecScreenSchema.parse({ type: 'screen', title: 'No ID', states: [] })
    ).toThrow()
  })
})

describe('SpecFlowSchema', () => {
  it('parses a flow with steps and branches', () => {
    const input = {
      id: 'flow-booking',
      type: 'flow',
      title: 'Booking Flow',
      steps: [
        { screen: 'scr-search', entry_state: 'results' },
        { screen: 'scr-doctor', entry_state: 'listing' },
      ],
      branches: [
        { at_step: 1, action: 'skip', resume_step: 3 },
      ],
    }
    const result = SpecFlowSchema.parse(input)
    expect(result.steps).toHaveLength(2)
    expect(result.branches).toHaveLength(1)
  })
})

describe('SpecCodeMapSchema', () => {
  it('parses flat array mapping', () => {
    const input = {
      'scr-home': ['src/pages/HomePage.tsx'],
      'scr-search': ['src/pages/SearchPage.tsx', 'src/components/SearchBar.tsx'],
    }
    const result = SpecCodeMapSchema.parse(input)
    expect(result['scr-home']).toEqual(['src/pages/HomePage.tsx'])
  })

  it('parses structured mapping with route field', () => {
    const input = {
      'scr-home': {
        route: 'src/routes/index.tsx',
        components: ['src/components/RoomCard.tsx'],
      },
    }
    const result = SpecCodeMapSchema.parse(input)
    expect(result['scr-home']).toEqual({
      route: 'src/routes/index.tsx',
      components: ['src/components/RoomCard.tsx'],
    })
  })
})

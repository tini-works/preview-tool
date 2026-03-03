import { describe, it, expect } from 'vitest'
import { ScreenAnalysisSchema } from '../screen-analysis.js'

describe('ScreenAnalysisSchema', () => {
  it('validates a complete screen analysis', () => {
    const input = {
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
          },
          defaultState: 'populated',
          isList: true,
          mockItems: [{ id: '1' }],
          defaultCount: 3,
        },
      ],
      flows: [
        {
          trigger: { selector: 'button', text: 'Book Now' },
          action: 'navigate',
          target: '/booking/confirm',
        },
      ],
    }
    const result = ScreenAnalysisSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects missing regions field', () => {
    const result = ScreenAnalysisSchema.safeParse({ route: '/x', flows: [] })
    expect(result.success).toBe(false)
  })

  it('rejects invalid region type', () => {
    const result = ScreenAnalysisSchema.safeParse({
      route: '/x',
      regions: [{ key: 'a', label: 'A', type: 'invalid-type', hookBindings: [], states: {}, defaultState: 'x' }],
      flows: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid flow action', () => {
    const result = ScreenAnalysisSchema.safeParse({
      route: '/x',
      regions: [],
      flows: [{ trigger: { selector: 'button' }, action: 'invalid', target: '/x' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts minimal valid input', () => {
    const result = ScreenAnalysisSchema.safeParse({
      route: '/home',
      regions: [],
      flows: [],
    })
    expect(result.success).toBe(true)
  })
})

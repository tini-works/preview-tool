import { describe, it, expect } from 'vitest'
import { validateScreens } from '../validate-screens.js'
import type { EnrichedScreen } from '../spec-pipeline-orchestrator.js'

function makeScreen(overrides: Partial<EnrichedScreen>): EnrichedScreen {
  return {
    id: 'test-screen',
    title: 'Test',
    sourceFile: null,
    states: ['default'],
    defaultState: 'default',
    stateData: {},
    stateDescriptions: {},
    dataDeps: [],
    routeParams: null,
    apiClient: null,
    mergedDeps: [],
    enrichedRegions: {},
    ...overrides,
  }
}

describe('validateScreens', () => {
  it('passes screen with different state values', () => {
    const screen = makeScreen({
      enrichedRegions: {
        'test-region': {
          label: 'Test',
          defaultState: 'default',
          states: {
            default: { isLoading: false, error: null, items: [1, 2] },
            loading: { isLoading: true, error: null, items: [] },
            error: { isLoading: false, error: 'Failed', items: [] },
          },
        },
      },
    })
    const results = validateScreens([screen], '/tmp')
    expect(results[0].status).toBe('pass')
    expect(results[0].issues.filter((i) => i.severity === 'warning')).toHaveLength(0)
  })

  it('warns when all states have identical data', () => {
    const screen = makeScreen({
      enrichedRegions: {
        'test-region': {
          label: 'Test',
          defaultState: 'default',
          states: {
            default: { isLoading: false, items: [] },
            loading: { isLoading: false, items: [] },
            error: { isLoading: false, items: [] },
          },
        },
      },
    })
    const results = validateScreens([screen], '/tmp')
    expect(results[0].status).toBe('warn')
    expect(results[0].issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('identical data'),
      })
    )
  })

  it('warns when screen has no regions', () => {
    const screen = makeScreen({ enrichedRegions: {} })
    const results = validateScreens([screen], '/tmp')
    expect(results[0].issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('No regions'),
      })
    )
  })

  it('info when region has only one state', () => {
    const screen = makeScreen({
      enrichedRegions: {
        'single': {
          label: 'Single',
          defaultState: 'default',
          states: { default: { name: 'Test' } },
        },
      },
    })
    const results = validateScreens([screen], '/tmp')
    expect(results[0].issues).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        message: expect.stringContaining('only 1 state'),
      })
    )
  })
})

import { describe, it, expect } from 'vitest'
import { generateScenarios } from '../generate-scenarios.js'
import type { ScreenStateMachine } from '../../analyzer/types.js'

function makeMachine(overrides: Partial<ScreenStateMachine> = {}): ScreenStateMachine {
  return {
    screenName: 'HomeScreen',
    states: [
      { id: 'loading', label: 'Fetching data', mockData: { isLoading: true }, source: 'library' },
      { id: 'success', label: 'Data loaded',   mockData: { isLoading: false, data: [] }, source: 'library' },
      { id: 'error',   label: 'Fetch failed',  mockData: { isLoading: false, error: { message: 'Oops' } }, source: 'library' },
    ],
    transitions: [],
    initialState: 'loading',
    ...overrides,
  }
}

describe('generateScenarios', () => {
  it('produces export const scenarios', () => {
    const code = generateScenarios(makeMachine())
    expect(code).toContain('export const scenarios')
  })

  it('produces one scenario object per state', () => {
    const code = generateScenarios(makeMachine())
    const matches = code.match(/\bid:/g)
    expect(matches).toHaveLength(3)
  })

  it('exports defaultScenario = success when success state present', () => {
    const code = generateScenarios(makeMachine())
    expect(code).toContain("export const defaultScenario = 'success'")
  })

  it('exports defaultScenario = initialState when no success or done state', () => {
    const machine = makeMachine({
      states: [{ id: 'step-1', label: 'Step 1', mockData: {}, source: 'use-state-enum' }],
      initialState: 'step-1',
    })
    const code = generateScenarios(machine)
    expect(code).toContain("export const defaultScenario = 'step-1'")
  })

  it('imports Scenario type from @preview-tool/runtime', () => {
    const code = generateScenarios(makeMachine())
    expect(code).toContain("from '@preview-tool/runtime'")
  })

  it('never emits new Error(', () => {
    const machine = makeMachine({
      states: [{ id: 'error', label: 'Error', mockData: { error: { message: 'Oops' } }, source: 'library' }],
      initialState: 'error',
    })
    const code = generateScenarios(machine)
    expect(code).not.toContain('new Error(')
  })

  it('never throws on empty states', () => {
    const machine = makeMachine({ states: [], initialState: 'default' })
    expect(() => generateScenarios(machine)).not.toThrow()
  })
})

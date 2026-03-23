import { describe, it, expect } from 'vitest'
import { deriveStateMachine } from '../derive-state-machine.js'
import type { ScreenFacts } from '../types.js'

// ScreenFacts requires sourceCode — include it in the base fixture
function emptyFacts(): ScreenFacts {
  return {
    route: '/test',
    filePath: 'test.tsx',
    sourceCode: '',
    hooks: [],
    components: [],
    conditionals: [],
    navigation: [],
    localState: [],
    derivedVars: [],
    functions: [],
    propertyChains: [],
  }
}

describe('deriveStateMachine — Layer 1: library fingerprints', () => {
  it('maps useQuery to idle/loading/success/error', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{
        name: 'useQuery',
        importPath: '@tanstack/react-query',
        arguments: [],
        returnVariable: 'result',
      }],
    }
    const machine = deriveStateMachine('HomeScreen', facts)
    const ids = machine.states.map(s => s.id)
    expect(ids).toEqual(['idle', 'loading', 'success', 'error'])
    expect(machine.states[0].source).toBe('library')
    expect(machine.initialState).toBe('success')
  })

  it('maps useMutation to idle/loading/success/error', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{
        name: 'useMutation',
        importPath: '@tanstack/react-query',
        arguments: [],
        returnVariable: 'mutation',
      }],
    }
    const machine = deriveStateMachine('FormScreen', facts)
    const ids = machine.states.map(s => s.id)
    expect(ids).toEqual(['idle', 'loading', 'success', 'error'])
  })

  it('maps useForm to form states', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{
        name: 'useForm',
        importPath: 'react-hook-form',
        arguments: [],
        returnVariable: 'form',
      }],
    }
    const machine = deriveStateMachine('LoginScreen', facts)
    const ids = machine.states.map(s => s.id)
    expect(ids).toContain('submitting')
    expect(machine.states[0].source).toBe('form')
  })

  it('falls back to default for unknown hook', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{
        name: 'useCustomThing',
        importPath: '../hooks/useCustomThing',
        arguments: [],
        returnVariable: 'thing',
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    expect(machine.states).toHaveLength(1)
    expect(machine.states[0].id).toBe('default')
    expect(machine.states[0].source).toBe('unknown')
  })

  it('never throws on empty facts', () => {
    expect(() => deriveStateMachine('Empty', emptyFacts())).not.toThrow()
    const machine = deriveStateMachine('Empty', emptyFacts())
    expect(machine.states).toHaveLength(1)
    expect(machine.states[0].id).toBe('default')
  })
})

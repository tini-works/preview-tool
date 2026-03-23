import { describe, it, expect } from 'vitest'
import { deriveStateMachine } from '../derive-state-machine.js'
import type { ScreenFacts, StateNode } from '../types.js'

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
    const ids = machine.states.map((s: StateNode) => s.id)
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
    const ids = machine.states.map((s: StateNode) => s.id)
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
    const ids = machine.states.map((s: StateNode) => s.id)
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

describe('deriveStateMachine — Layer 3: useState enum', () => {
  it('extracts union literal type as state ids', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      localState: [{
        name: 'status',
        hook: 'useState',
        initialValue: "'idle'",
        valueType: 'string',
        valueTypeUnion: ['idle', 'loading', 'done'],
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    const ids = machine.states.map((s: StateNode) => s.id)
    expect(ids).toEqual(['idle', 'loading', 'done'])
    expect(machine.states[0].source).toBe('use-state-enum')
    expect(machine.states[0].mockData).toEqual({ status: 'idle' })
    expect(machine.states[1].mockData).toEqual({ status: 'loading' })
    expect(machine.initialState).toBe('done')   // pickDefaultState prefers 'done' over 'idle'
  })
})

describe('deriveStateMachine — Layer 6: heuristics', () => {
  it('maps isLoading variable to idle/loading states', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      localState: [{
        name: 'isLoading',
        hook: 'useState',
        initialValue: 'false',
        valueType: 'boolean',
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    const ids = machine.states.map((s: StateNode) => s.id)
    expect(ids).toContain('idle')
    expect(ids).toContain('loading')
    expect(machine.states[0].source).toBe('heuristic')
    expect(machine.states[0].mockData).toEqual({ isLoading: false })
    expect(machine.states[1].mockData).toEqual({ isLoading: true })
  })

  it('maps isOpen variable to closed/open states', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      localState: [{
        name: 'isOpen',
        hook: 'useState',
        initialValue: 'false',
        valueType: 'boolean',
      }],
    }
    const machine = deriveStateMachine('ModalScreen', facts)
    const ids = machine.states.map((s: StateNode) => s.id)
    expect(ids).toEqual(['closed', 'open'])
  })

  it('useReducer does not trigger heuristic (heuristic only matches useState)', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      localState: [{
        name: 'isLoading',
        hook: 'useReducer',
        initialValue: 'false',
        valueType: 'boolean',
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    expect(machine.states[0].id).toBe('default')
    expect(machine.states[0].source).toBe('unknown')
  })
})

describe('deriveStateMachine — Layer 7: JSX conditionals', () => {
  it('maps a conditional fact to true/false branch states', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      conditionals: [{ condition: 'isLoggedIn', trueBranch: ['Dashboard'], falseBranch: ['Login'] }],
    }
    const machine = deriveStateMachine('Screen', facts)
    expect(machine.states).toHaveLength(2)
    expect(machine.states[0].id).toBe('true-branch')
    expect(machine.states[0].mockData).toEqual({ isLoggedIn: true })
    expect(machine.states[0].source).toBe('conditional')
    expect(machine.states[1].id).toBe('false-branch')
    expect(machine.states[1].mockData).toEqual({ isLoggedIn: false })
  })
})

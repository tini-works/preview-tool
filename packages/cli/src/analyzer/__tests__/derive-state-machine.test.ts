import { describe, it, expect } from 'vitest'
import { deriveStateMachine } from '../derive-state-machine.js'
import type { ScreenFacts, StateNode } from '../types.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeTempCwd(queryVersion: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'preview-test-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    dependencies: { '@tanstack/react-query': queryVersion }
  }))
  return dir
}

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

describe('deriveStateMachine — Layer 2: useReducer', () => {
  it('extracts states from switch/case string literals in reducer source', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      localState: [{
        name: 'status',
        hook: 'useReducer',
        initialValue: "'idle'",
        valueType: 'string',
        reducerSource: `
          function reducer(state, action) {
            switch (action.type) {
              case 'FETCH': return 'loading'
              case 'SUCCESS': return 'success'
              case 'ERROR': return 'error'
              default: return state
            }
          }
        `,
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    const ids = machine.states.map((s: StateNode) => s.id)
    expect(ids).toContain('FETCH')
    expect(ids).toContain('SUCCESS')
    expect(ids).toContain('ERROR')
    expect(machine.states[0].source).toBe('use-reducer')
  })

  it('falls through to default when reducerSource is absent', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      localState: [{
        name: 'count',
        hook: 'useReducer',
        initialValue: '0',
        valueType: 'number',
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    expect(machine.states[0].id).toBe('default')
    expect(machine.states[0].source).toBe('unknown')
  })
})

describe('detectQueryVersion edge cases', () => {
  it('returns 4 when cwd is not provided', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' }],
    }
    const machine = deriveStateMachine('Screen', facts)  // no cwd
    const loading = machine.states.find(s => s.id === 'loading')
    expect(loading?.mockData).toHaveProperty('isLoading', true)
    expect(loading?.mockData).not.toHaveProperty('isPending')
  })

  it('returns 4 when package.json missing @tanstack/react-query', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preview-test-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: {} }))
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    expect(machine.states.find(s => s.id === 'loading')?.mockData).toHaveProperty('isLoading')
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns 4 when version string is "latest" (non-numeric)', () => {
    const dir = makeTempCwd('latest')
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    expect(machine.states.find(s => s.id === 'loading')?.mockData).toHaveProperty('isLoading')
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns 4 when version is "^4.0.0" (explicit v4)', () => {
    const dir = makeTempCwd('^4.0.0')
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    expect(machine.states.find(s => s.id === 'loading')?.mockData).toHaveProperty('isLoading', true)
    expect(machine.states.find(s => s.id === 'loading')?.mockData).not.toHaveProperty('isPending')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('deriveStateMachine — React Query v5', () => {
  it('uses isPending (not isLoading) when @tanstack/react-query ^5 is installed', () => {
    const dir = makeTempCwd('^5.0.0')
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'result' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    const loading = machine.states.find(s => s.id === 'loading')
    expect(loading?.mockData).toHaveProperty('isPending', true)
    expect(loading?.mockData).not.toHaveProperty('isLoading')
    rmSync(dir, { recursive: true, force: true })
  })

  it('useSuspenseQuery v5 maps to loading/success only (no error — throws to Error Boundary)', () => {
    const dir = makeTempCwd('^5.0.0')
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useSuspenseQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'result' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    expect(machine.states.map((s: StateNode) => s.id)).toEqual(['loading', 'success'])
    expect(machine.states.find(s => s.id === 'loading')?.mockData).toEqual({ data: undefined })
    expect(machine.states.find(s => s.id === 'success')?.mockData).toEqual({ data: [] })
    rmSync(dir, { recursive: true, force: true })
  })

  it('useInfiniteQuery with v5 also uses isPending (not isLoading)', () => {
    const dir = makeTempCwd('^5.0.0')
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useInfiniteQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'result' }],
    }
    const machine = deriveStateMachine('Screen', facts, dir)
    const loading = machine.states.find(s => s.id === 'loading')
    expect(loading?.mockData).toHaveProperty('isPending', true)
    expect(loading?.mockData).not.toHaveProperty('isLoading')
    rmSync(dir, { recursive: true, force: true })
  })

  it('useSuspenseQuery without cwd still gets 2-state machine (no version detection)', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{ name: 'useSuspenseQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'result' }],
    }
    const machine = deriveStateMachine('Screen', facts)  // no cwd
    expect(machine.states.map((s: StateNode) => s.id)).toEqual(['loading', 'success'])
  })
})

describe('deriveStateMachine — Layer 1.5: Zustand selector pattern', () => {
  it('applies heuristics to isLoading selector field', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{
        name: 'useAppStore',
        importPath: '../stores/appStore',
        arguments: ['(s) => s.isLoading'],
        returnVariable: 'isLoading',
        destructuredFields: ['isLoading'],
        selectorPattern: true,
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    const ids = machine.states.map((s: StateNode) => s.id)
    expect(ids).toEqual(['idle', 'loading'])
    expect(machine.states[0].source).toBe('heuristic')
    expect(machine.states[0].mockData).toEqual({ isLoading: false })
    expect(machine.states[1].mockData).toEqual({ isLoading: true })
  })

  it('applies heuristics to isOpen selector field', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{
        name: 'useUIStore',
        importPath: '../stores/uiStore',
        arguments: ['(s) => s.isOpen'],
        returnVariable: 'isOpen',
        destructuredFields: ['isOpen'],
        selectorPattern: true,
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    expect(machine.states.map((s: StateNode) => s.id)).toEqual(['closed', 'open'])
  })

  it('skips Layer 1.5 when selector field has no heuristic match', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [{
        name: 'useStore',
        importPath: '../stores/store',
        arguments: ['(s) => s.username'],
        returnVariable: 'username',
        destructuredFields: ['username'],
        selectorPattern: true,
      }],
    }
    const machine = deriveStateMachine('Screen', facts)
    // Falls through to default
    expect(machine.states[0].id).toBe('default')
  })

  it('Layer 1 takes priority over Layer 1.5 (library hook wins)', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' },
        { name: 'useStore', importPath: '../store', arguments: ['(s) => s.isLoading'], returnVariable: 'isLoading', destructuredFields: ['isLoading'], selectorPattern: true },
      ],
    }
    const machine = deriveStateMachine('Screen', facts)
    // Layer 1 wins — 4 states from useQuery, not 2 from heuristic
    expect(machine.states).toHaveLength(4)
  })
})

describe('deriveStateMachine — hook priority (Layer 1)', () => {
  it('useForm wins over useQuery when both present (form > data fetcher)', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'result' },
        { name: 'useForm', importPath: 'react-hook-form', arguments: [], returnVariable: 'form' },
      ],
    }
    const machine = deriveStateMachine('CheckoutScreen', facts)
    expect(machine.states.some(s => s.id === 'submitting')).toBe(true)
    expect(machine.states[0].source).toBe('form')
  })

  it('useMutation wins over useQuery (mutation > data fetcher)', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'q' },
        { name: 'useMutation', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'm' },
      ],
    }
    const machine = deriveStateMachine('Screen', facts)
    // Mutation machine states have 'isPending' key (not 'isLoading')
    expect(machine.states.find(s => s.id === 'idle')?.mockData).toHaveProperty('isPending')
  })

  it('useForm wins over useMutation (form > mutation)', () => {
    const facts: ScreenFacts = {
      ...emptyFacts(),
      hooks: [
        { name: 'useMutation', importPath: '@tanstack/react-query', arguments: [], returnVariable: 'm' },
        { name: 'useForm', importPath: 'react-hook-form', arguments: [], returnVariable: 'form' },
      ],
    }
    const machine = deriveStateMachine('Screen', facts)
    expect(machine.states.some(s => s.id === 'submitting')).toBe(true)
    expect(machine.states[0].source).toBe('form')
  })
})

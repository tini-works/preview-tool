import { describe, it, expect } from 'vitest'
import { Project } from 'ts-morph'
import { extractViewFields } from '../view-analyzer.js'
import { extractHookSources } from '../view-analyzer.js'
import { extractStaticTexts } from '../view-analyzer.js'
import { analyzeView } from '../view-analyzer.js'

function analyzeCode(code: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile('test.tsx', code)
  return extractViewFields(sf)
}

function analyzeHooks(code: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile('test.tsx', code)
  return extractHookSources(sf)
}

function analyzeTexts(code: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile('test.tsx', code)
  return extractStaticTexts(sf)
}

function analyzeFullView(code: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile('test.tsx', code)
  return analyzeView(sf, 'test-screen')
}

describe('extractViewFields', () => {
  it('extracts rendered text fields', () => {
    const fields = analyzeCode(`
      function Page({ data }) {
        return <p>{data.name}</p>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'data.name', path: ['data', 'name'], inferredType: 'string' })
    )
  })

  it('extracts boolean conditions from && expressions', () => {
    const fields = analyzeCode(`
      function Page({ isLoading }) {
        return <div>{isLoading && <span>Loading</span>}</div>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'isLoading', inferredType: 'boolean', usageContext: 'condition' })
    )
  })

  it('extracts array fields from .map() calls', () => {
    const fields = analyzeCode(`
      function Page({ items }) {
        return <div>{items.map(i => <p>{i.title}</p>)}</div>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'items', inferredType: 'array', usageContext: 'iterator' })
    )
  })

  it('extracts function fields from event handlers', () => {
    const fields = analyzeCode(`
      function Page({ onSubmit }) {
        return <button onClick={onSubmit}>Go</button>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'onSubmit', inferredType: 'function', usageContext: 'event-handler' })
    )
  })

  it('extracts fields from ternary conditions', () => {
    const fields = analyzeCode(`
      function Page({ error }) {
        return <div>{error ? <p>{error}</p> : <p>OK</p>}</div>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'error', usageContext: 'condition' })
    )
  })

  it('extracts nullable fields from optional chaining', () => {
    const fields = analyzeCode(`
      function Page({ user }) {
        return <p>{user?.avatar}</p>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'user?.avatar', path: ['user', 'avatar'] })
    )
  })
})

describe('extractHookSources', () => {
  it('traces variable to hook import', () => {
    const sources = analyzeHooks(`
      import { useAuthStore } from '@/stores/auth-store'
      function Page() {
        const { user, logout } = useAuthStore()
        return <p>{user.name}</p>
      }
    `)
    expect(sources).toContainEqual(
      expect.objectContaining({
        hookName: 'useAuthStore',
        modulePath: '@/stores/auth-store',
        returnFields: expect.arrayContaining(['user', 'logout']),
        calledWith: 'no-args',
      })
    )
  })

  it('detects selector pattern', () => {
    const sources = analyzeHooks(`
      import { useStore } from '@/stores/main'
      function Page() {
        const name = useStore((s) => s.user.name)
        return <p>{name}</p>
      }
    `)
    expect(sources).toContainEqual(
      expect.objectContaining({
        hookName: 'useStore',
        calledWith: 'selector',
      })
    )
  })

  it('detects tuple destructuring (useState-like)', () => {
    const sources = analyzeHooks(`
      import { useSearchParams } from 'react-router-dom'
      function Page() {
        const [params, setParams] = useSearchParams()
        return <p>{params.get('q')}</p>
      }
    `)
    expect(sources).toContainEqual(
      expect.objectContaining({
        hookName: 'useSearchParams',
        calledWith: 'tuple-destructure',
      })
    )
  })
})

describe('extractStaticTexts', () => {
  it('extracts text from JSX elements', () => {
    const texts = analyzeTexts(`
      function Page() {
        return <div>
          <h1>Termin buchen</h1>
          <p>Willkommen zurück</p>
        </div>
      }
    `)
    expect(texts).toContain('Termin buchen')
    expect(texts).toContain('Willkommen zurück')
  })

  it('ignores dynamic expressions', () => {
    const texts = analyzeTexts(`
      function Page({ name }) {
        return <p>{name}</p>
      }
    `)
    expect(texts).toHaveLength(0)
  })

  it('extracts translatable string props', () => {
    const texts = analyzeTexts(`
      function Page() {
        return <input placeholder="Fachrichtung suchen..." />
      }
    `)
    expect(texts).toContain('Fachrichtung suchen...')
  })
})

describe('analyzeView', () => {
  it('produces complete ViewShape', () => {
    const shape = analyzeFullView(`
      import { useAuthStore } from '@/stores/auth-store'
      function Page() {
        const { user, logout } = useAuthStore()
        return (
          <div>
            <h1>Willkommen</h1>
            {user && <p>{user.name}</p>}
            <button onClick={logout}>Abmelden</button>
          </div>
        )
      }
    `)
    expect(shape.fields.length).toBeGreaterThan(0)
    expect(shape.hookSources).toHaveLength(1)
    expect(shape.hookSources[0].hookName).toBe('useAuthStore')
    expect(shape.staticTexts).toContain('Willkommen')
    expect(shape.staticTexts).toContain('Abmelden')
  })
})

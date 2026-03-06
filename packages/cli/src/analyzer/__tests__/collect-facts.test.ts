import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { extractHookFacts, extractComponentFacts, extractConditionalFacts, extractNavigationFacts, extractLocalStateFacts, extractDerivedVarFacts, extractFunctionFacts, collectAllFacts } from '../collect-facts.js'
import { Project } from 'ts-morph'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function createSourceFile(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 4, strict: true },
  })
  return project.createSourceFile('test.tsx', code)
}

describe('extractHookFacts', () => {
  it('extracts useQuery with queryKey', () => {
    const sf = createSourceFile(`
      import { useQuery } from '@tanstack/react-query'
      function Screen() {
        const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
        return <div>{data}</div>
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].name).toBe('useQuery')
    expect(hooks[0].importPath).toBe('@tanstack/react-query')
    expect(hooks[0].arguments).toHaveLength(1)
    expect(hooks[0].arguments[0]).toContain('queryKey')
    expect(hooks[0].returnVariable).toBe('{ data, isLoading }')
  })

  it('extracts useAppLiveQuery with sectionId string', () => {
    const sf = createSourceFile(`
      import { useAppLiveQuery } from '@/hooks/use-app-live-query'
      function Screen() {
        const result = useAppLiveQuery(q => q, 'service-grid')
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].name).toBe('useAppLiveQuery')
    expect(hooks[0].importPath).toBe('@/hooks/use-app-live-query')
    expect(hooks[0].arguments).toHaveLength(2)
  })

  it('extracts Zustand store hook', () => {
    const sf = createSourceFile(`
      import { useAuthStore } from '@/stores/auth'
      function Screen() {
        const user = useAuthStore(s => s.user)
        return <div>{user.name}</div>
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].name).toBe('useAuthStore')
    expect(hooks[0].importPath).toBe('@/stores/auth')
  })

  it('parses destructured fields from returnVariable', () => {
    const sf = createSourceFile(`
      import { useAuthStore } from '@/stores/auth-store'
      function Screen() {
        const { login, isLoading, error, clearError } = useAuthStore()
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].returnVariable).toBe('{ login, isLoading, error, clearError }')
    expect(hooks[0].destructuredFields).toEqual([
      'login', 'isLoading', 'error', 'clearError'
    ])
  })

  it('returns undefined destructuredFields for non-destructured returns', () => {
    const sf = createSourceFile(`
      import { useAuthStore } from '@/stores/auth-store'
      function Screen() {
        const store = useAuthStore()
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks[0].destructuredFields).toBeUndefined()
  })

  it('parses destructured fields with renamed bindings', () => {
    const sf = createSourceFile(`
      import { useAuthStore } from '@/stores/auth-store'
      function Screen() {
        const { error: storeError, isLoading } = useAuthStore()
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks[0].destructuredFields).toEqual(['error', 'isLoading'])
  })

  it('extracts useContext call', () => {
    const sf = createSourceFile(`
      import { useContext } from 'react'
      import { AuthContext } from '../context/auth'
      function Screen() {
        const auth = useContext(AuthContext)
        return <div>{auth.user}</div>
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].name).toBe('useContext')
    expect(hooks[0].importPath).toBe('react')
    expect(hooks[0].arguments).toEqual(['AuthContext'])
    expect(hooks[0].returnVariable).toBe('auth')
  })

  it('handles aliased imports', () => {
    const sf = createSourceFile(`
      import { useQuery as useCustomQuery } from '@tanstack/react-query'
      function Screen() {
        const data = useCustomQuery({ queryKey: ['items'] })
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(1)
    // Should use the original export name, not the local alias,
    // so generated mocks export the correct name for other consumers
    expect(hooks[0].name).toBe('useQuery')
    expect(hooks[0].importPath).toBe('@tanstack/react-query')
  })

  it('skips non-hook function calls', () => {
    const sf = createSourceFile(`
      import { formatDate } from '../utils'
      function Screen() {
        const date = formatDate(new Date())
        return <div>{date}</div>
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(0)
  })

  it('handles multiple hooks in same component', () => {
    const sf = createSourceFile(`
      import { useQuery } from '@tanstack/react-query'
      import { useAuthStore } from '@/stores/auth'
      function Screen() {
        const { data } = useQuery({ queryKey: ['services'] })
        const user = useAuthStore(s => s.user)
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(2)
  })
})

describe('extractComponentFacts', () => {
  it('extracts components with props and children', () => {
    const sf = createSourceFile(`
      import { DataTable } from '@/components/DataTable'
      import { Button } from '@/components/Button'
      function Screen() {
        return (
          <DataTable data={items} loading={isLoading}>
            <Button onClick={handleClick}>Submit</Button>
          </DataTable>
        )
      }
    `)
    const components = extractComponentFacts(sf)
    expect(components).toHaveLength(2)
    expect(components.find(c => c.name === 'DataTable')).toMatchObject({
      name: 'DataTable',
      importPath: '@/components/DataTable',
      props: expect.arrayContaining(['data', 'loading']),
    })
    expect(components.find(c => c.name === 'Button')).toMatchObject({
      name: 'Button',
      importPath: '@/components/Button',
    })
  })

  it('skips HTML elements and only captures imported components', () => {
    const sf = createSourceFile(`
      import { Card } from '@/ui/Card'
      function Screen() {
        return <div><Card title="test"><span>text</span></Card></div>
      }
    `)
    const components = extractComponentFacts(sf)
    expect(components).toHaveLength(1)
    expect(components[0].name).toBe('Card')
  })
})

describe('extractConditionalFacts', () => {
  it('extracts ternary JSX conditionals', () => {
    const sf = createSourceFile(`
      function Screen({ isLoading, data }: any) {
        return (
          <div>
            {isLoading ? <Spinner /> : <DataTable data={data} />}
          </div>
        )
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    expect(conditionals).toHaveLength(1)
    expect(conditionals[0].condition).toBe('isLoading')
    expect(conditionals[0].trueBranch).toContain('Spinner')
    expect(conditionals[0].falseBranch).toContain('DataTable')
  })

  it('extracts logical AND JSX conditionals', () => {
    const sf = createSourceFile(`
      function Screen({ error }: any) {
        return (
          <div>
            {error && <ErrorMessage message={error} />}
          </div>
        )
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    expect(conditionals).toHaveLength(1)
    expect(conditionals[0].condition).toBe('error')
    expect(conditionals[0].trueBranch).toContain('ErrorMessage')
  })

  it('ignores non-JSX ternaries', () => {
    const sf = createSourceFile(`
      function Screen() {
        const value = true ? 'a' : 'b'
        return <div>{value}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    expect(conditionals).toHaveLength(0)
  })
})

describe('extractNavigationFacts', () => {
  it('extracts navigate() calls', () => {
    const sf = createSourceFile(`
      import { useNavigate } from 'react-router-dom'
      function Screen() {
        const navigate = useNavigate()
        return <button onClick={() => navigate('/booking')}>Book</button>
      }
    `)
    const nav = extractNavigationFacts(sf)
    expect(nav).toHaveLength(1)
    expect(nav[0].target).toContain('/booking')
  })

  it('extracts Link components', () => {
    const sf = createSourceFile(`
      import { Link } from 'react-router-dom'
      function Screen() {
        return <Link to="/details">View Details</Link>
      }
    `)
    const nav = extractNavigationFacts(sf)
    expect(nav).toHaveLength(1)
    expect(nav[0].target).toContain('/details')
  })

  it('extracts router.push calls', () => {
    const sf = createSourceFile(`
      import { useRouter } from 'next/router'
      function Screen() {
        const router = useRouter()
        return <button onClick={() => router.push('/home')}>Go Home</button>
      }
    `)
    const nav = extractNavigationFacts(sf)
    expect(nav).toHaveLength(1)
    expect(nav[0].target).toContain('/home')
  })
})

describe('extractLocalStateFacts', () => {
  it('extracts useState with boolean initial value', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [showPassword, setShowPassword] = useState(false)
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toEqual({
      name: 'showPassword',
      hook: 'useState',
      setter: 'setShowPassword',
      initialValue: 'false',
      valueType: 'boolean',
    })
  })

  it('extracts useState with object initial value', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [formData, setFormData] = useState({ email: '', password: '' })
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(1)
    expect(facts[0].name).toBe('formData')
    expect(facts[0].setter).toBe('setFormData')
    expect(facts[0].valueType).toBe('object')
  })

  it('extracts useState with empty object', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [errors, setErrors] = useState({})
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(1)
    expect(facts[0].valueType).toBe('object')
  })

  it('extracts useRef', () => {
    const sf = createSourceFile(`
      import { useRef } from 'react'
      function Screen() {
        const inputRef = useRef(null)
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toEqual({
      name: 'inputRef',
      hook: 'useRef',
      initialValue: 'null',
      valueType: 'null',
    })
  })

  it('extracts multiple useState calls in order', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [name, setName] = useState('')
        const [count, setCount] = useState(0)
        const [items, setItems] = useState([])
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(3)
    expect(facts[0]).toMatchObject({ name: 'name', valueType: 'string' })
    expect(facts[1]).toMatchObject({ name: 'count', valueType: 'number' })
    expect(facts[2]).toMatchObject({ name: 'items', valueType: 'array' })
  })

  it('skips useState not imported from react', () => {
    const sf = createSourceFile(`
      import { useState } from './custom-hooks'
      function Screen() {
        const [val, setVal] = useState(false)
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(0)
  })
})

describe('extractDerivedVarFacts', () => {
  it('extracts const variable used in a conditional', () => {
    const sf = createSourceFile(`
      function Screen() {
        const registrationSuccess = searchParams.get('registered') === 'true'
        return <div>{registrationSuccess && <span>Success</span>}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    const hookVarNames = new Set<string>()
    const localStateNames = new Set<string>()
    const facts = extractDerivedVarFacts(sf, conditionals, hookVarNames, localStateNames)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({
      name: 'registrationSuccess',
      valueType: 'boolean',
    })
    expect(facts[0].expression).toContain('searchParams.get')
  })

  it('resolves sourceVariable from expression', () => {
    const sf = createSourceFile(`
      function Screen() {
        const isReady = data.length > 0
        return <div>{isReady && <span>Ready</span>}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    const facts = extractDerivedVarFacts(sf, conditionals, new Set(), new Set())
    expect(facts).toHaveLength(1)
    expect(facts[0].sourceVariable).toBe('data')
  })

  it('skips variables already tracked by hooks or local state', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [isOpen, setIsOpen] = useState(false)
        return <div>{isOpen && <span>Open</span>}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    const localStateNames = new Set(['isOpen'])
    const facts = extractDerivedVarFacts(sf, conditionals, new Set(), localStateNames)
    expect(facts).toHaveLength(0)
  })

  it('skips variables not used in any conditional', () => {
    const sf = createSourceFile(`
      function Screen() {
        const greeting = 'Hello'
        return <div>{greeting}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    const facts = extractDerivedVarFacts(sf, conditionals, new Set(), new Set())
    expect(facts).toHaveLength(0)
  })

  it('infers boolean type from comparison expressions', () => {
    const sf = createSourceFile(`
      function Screen() {
        const hasItems = items.length > 0
        return <div>{hasItems && <span>Items</span>}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    const facts = extractDerivedVarFacts(sf, conditionals, new Set(), new Set())
    expect(facts[0].valueType).toBe('boolean')
  })
})

describe('extractFunctionFacts', () => {
  it('extracts named function with onSubmit trigger', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [data, setData] = useState('')
        function handleSubmit(e: any) {
          setData('submitted')
        }
        return <form onSubmit={handleSubmit}><button>Go</button></form>
      }
    `)
    const setterNames = new Set(['setData'])
    const externalFnNames = new Set<string>()
    const facts = extractFunctionFacts(sf, setterNames, externalFnNames)
    expect(facts).toHaveLength(1)
    expect(facts[0].name).toBe('handleSubmit')
    expect(facts[0].kind).toBe('function')
    expect(facts[0].triggers).toEqual([{ element: 'form', event: 'onSubmit' }])
    expect(facts[0].settersCalled).toContain('setData')
  })

  it('extracts arrow function with onClick trigger', () => {
    const sf = createSourceFile(`
      function Screen() {
        const handleClick = () => { navigate('/home') }
        return <button onClick={handleClick}>Go</button>
      }
    `)
    const facts = extractFunctionFacts(sf, new Set(), new Set())
    expect(facts).toHaveLength(1)
    expect(facts[0].name).toBe('handleClick')
    expect(facts[0].kind).toBe('arrow')
    expect(facts[0].navigationCalls).toContain("navigate('/home')")
  })

  it('detects inline arrow toggling a setter', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [show, setShow] = useState(false)
        return <button onClick={() => setShow(prev => !prev)}>Toggle</button>
      }
    `)
    const setterNames = new Set(['setShow'])
    const facts = extractFunctionFacts(sf, setterNames, new Set())
    const inlineFact = facts.find(f => f.name.startsWith('__inline_'))
    expect(inlineFact).toBeDefined()
    expect(inlineFact!.settersCalled).toContain('setShow')
    expect(inlineFact!.triggers).toEqual([{ element: 'button', event: 'onClick' }])
  })

  it('detects external function calls from hooks', () => {
    const sf = createSourceFile(`
      function Screen() {
        function handleSubmit() {
          login(email, password)
          clearError()
        }
        return <form onSubmit={handleSubmit}><button>Go</button></form>
      }
    `)
    const externalFnNames = new Set(['login', 'clearError'])
    const facts = extractFunctionFacts(sf, new Set(), externalFnNames)
    expect(facts[0].externalCalls).toEqual(expect.arrayContaining(['login', 'clearError']))
  })

  it('skips functions with no JSX triggers', () => {
    const sf = createSourceFile(`
      function Screen() {
        function helperFn() { return 42 }
        return <div>{helperFn()}</div>
      }
    `)
    const facts = extractFunctionFacts(sf, new Set(), new Set())
    expect(facts).toHaveLength(0)
  })
})

describe('collectAllFacts', () => {
  const testDir = join(tmpdir(), 'collect-facts-test-' + Date.now())

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, 'ScreenA.tsx'), `
      import { useQuery } from '@tanstack/react-query'
      export default function ScreenA() {
        const { data } = useQuery({ queryKey: ['users'] })
        return <div>{data}</div>
      }
    `)
    writeFileSync(join(testDir, 'ScreenB.tsx'), `
      import { useAuthStore } from '@/stores/auth'
      export default function ScreenB() {
        const user = useAuthStore(s => s.user)
        return <div>{user.name}</div>
      }
    `)
  })

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('includes localState, derivedVars, and functions in collected facts', async () => {
    const testDirNew = join(tmpdir(), 'collect-facts-new-' + Date.now())
    mkdirSync(testDirNew, { recursive: true })
    writeFileSync(join(testDirNew, 'LoginPage.tsx'), `
      import { useState } from 'react'
      import { useAuthStore } from '@/stores/auth-store'
      function LoginPage() {
        const { login, isLoading, error, clearError } = useAuthStore()
        const [showPassword, setShowPassword] = useState(false)
        const registrationSuccess = searchParams.get('registered') === 'true'
        function handleSubmit(e: any) {
          login(email, password)
        }
        return (
          <div>
            {registrationSuccess && <span>Success</span>}
            {error && <span>Error</span>}
            {isLoading ? <span>Loading</span> : <span>Ready</span>}
            <form onSubmit={handleSubmit}>
              <button onClick={() => setShowPassword(p => !p)}>Toggle</button>
            </form>
          </div>
        )
      }
    `)

    const screens = [{ filePath: join(testDirNew, 'LoginPage.tsx'), route: '/login' }]
    const facts = await collectAllFacts(screens)

    expect(facts[0].localState).toHaveLength(1)
    expect(facts[0].localState[0].name).toBe('showPassword')

    expect(facts[0].derivedVars).toHaveLength(1)
    expect(facts[0].derivedVars[0].name).toBe('registrationSuccess')

    expect(facts[0].functions.length).toBeGreaterThanOrEqual(1)
    expect(facts[0].functions.find(f => f.name === 'handleSubmit')).toBeDefined()

    rmSync(testDirNew, { recursive: true, force: true })
  })

  it('collects facts from multiple screens in parallel with shared Project', async () => {
    const screens = [
      { filePath: join(testDir, 'ScreenA.tsx'), route: '/screen-a' },
      { filePath: join(testDir, 'ScreenB.tsx'), route: '/screen-b' },
    ]

    const facts = await collectAllFacts(screens)

    expect(facts).toHaveLength(2)
    expect(facts[0].route).toBe('/screen-a')
    expect(facts[0].hooks).toHaveLength(1)
    expect(facts[0].hooks[0].name).toBe('useQuery')
    expect(facts[0].sourceCode).toContain('useQuery')

    expect(facts[1].route).toBe('/screen-b')
    expect(facts[1].hooks).toHaveLength(1)
    expect(facts[1].hooks[0].name).toBe('useAuthStore')
  })
})


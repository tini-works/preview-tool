import { describe, it, expect } from 'vitest'
import { extractHookFacts, extractComponentFacts, extractConditionalFacts, extractNavigationFacts } from '../collect-facts.js'
import { Project } from 'ts-morph'

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
    expect(hooks[0].name).toBe('useCustomQuery')
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


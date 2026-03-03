import { describe, it, expect } from 'vitest'
import { extractHookFacts } from '../collect-facts.js'
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

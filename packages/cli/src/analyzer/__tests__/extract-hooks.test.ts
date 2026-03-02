import { describe, it, expect } from 'vitest'
import { extractHooks } from '../extract-hooks.js'

describe('extractHooks', () => {
  it('extracts useQuery with importPath @tanstack/react-query', () => {
    const source = `
      import { useQuery } from '@tanstack/react-query'

      export default function TasksScreen() {
        const { data } = useQuery({ queryKey: ['tasks'], queryFn: fetchTasks })
        return <div>{data}</div>
      }
    `

    const hooks = extractHooks(source, 'TasksScreen.tsx')

    expect(hooks).toHaveLength(1)
    expect(hooks[0].hookName).toBe('useQuery')
    expect(hooks[0].importPath).toBe('@tanstack/react-query')
    expect(hooks[0].isProjectLocal).toBe(false)
  })

  it('extracts useAuth from @/hooks/useAuth with isProjectLocal true', () => {
    const source = `
      import { useAuth } from '@/hooks/useAuth'

      export default function ProfileScreen() {
        const { user } = useAuth()
        return <div>{user.name}</div>
      }
    `

    const hooks = extractHooks(source, 'ProfileScreen.tsx')

    expect(hooks).toHaveLength(1)
    expect(hooks[0].hookName).toBe('useAuth')
    expect(hooks[0].importPath).toBe('@/hooks/useAuth')
    expect(hooks[0].isProjectLocal).toBe(true)
  })

  it('ignores React built-in hooks (useState, useEffect)', () => {
    const source = `
      import { useState, useEffect } from 'react'
      import { useQuery } from '@tanstack/react-query'

      export default function Home() {
        const [count, setCount] = useState(0)
        useEffect(() => { console.log(count) }, [count])
        const { data } = useQuery({ queryKey: ['items'] })
        return <div>{count}</div>
      }
    `

    const hooks = extractHooks(source, 'Home.tsx')

    expect(hooks).toHaveLength(1)
    expect(hooks[0].hookName).toBe('useQuery')
  })

  it('extracts useTranslation from react-i18next', () => {
    const source = `
      import { useTranslation } from 'react-i18next'

      export default function Settings() {
        const { t } = useTranslation('settings')
        return <div>{t('title')}</div>
      }
    `

    const hooks = extractHooks(source, 'Settings.tsx')

    expect(hooks).toHaveLength(1)
    expect(hooks[0].hookName).toBe('useTranslation')
    expect(hooks[0].importPath).toBe('react-i18next')
    expect(hooks[0].callArgs).toEqual(['settings'])
    expect(hooks[0].isProjectLocal).toBe(false)
  })

  it('extracts call arguments and strips quotes', () => {
    const source = `
      import { useQuery } from '@tanstack/react-query'

      export default function TasksScreen() {
        const { data } = useQuery('tasks')
        return <div>{data}</div>
      }
    `

    const hooks = extractHooks(source, 'TasksScreen.tsx')

    expect(hooks).toHaveLength(1)
    expect(hooks[0].callArgs).toEqual(['tasks'])
  })

  it('handles multiple hooks in the same file', () => {
    const source = `
      import { useQuery } from '@tanstack/react-query'
      import { useAuth } from '@/hooks/useAuth'
      import { useTranslation } from 'react-i18next'

      export default function Dashboard() {
        const { user } = useAuth()
        const { t } = useTranslation()
        const { data } = useQuery({ queryKey: ['stats'] })
        return <div>{user.name} - {t('title')}</div>
      }
    `

    const hooks = extractHooks(source, 'Dashboard.tsx')

    expect(hooks).toHaveLength(3)
    const names = hooks.map((h) => h.hookName)
    expect(names).toContain('useAuth')
    expect(names).toContain('useTranslation')
    expect(names).toContain('useQuery')
  })

  it('marks relative imports as project local', () => {
    const source = `
      import { useBookings } from './hooks/useBookings'
      import { useTheme } from '../shared/useTheme'

      export default function BookingsPage() {
        const { bookings } = useBookings()
        const theme = useTheme()
        return <div>{bookings.length}</div>
      }
    `

    const hooks = extractHooks(source, 'BookingsPage.tsx')

    expect(hooks).toHaveLength(2)
    expect(hooks[0].isProjectLocal).toBe(true)
    expect(hooks[1].isProjectLocal).toBe(true)
  })

  it('returns unknown importPath for hooks not found in imports', () => {
    const source = `
      export default function Page() {
        const data = useSomething()
        return <div>{data}</div>
      }
    `

    const hooks = extractHooks(source, 'Page.tsx')

    expect(hooks).toHaveLength(1)
    expect(hooks[0].hookName).toBe('useSomething')
    expect(hooks[0].importPath).toBe('unknown')
  })
})

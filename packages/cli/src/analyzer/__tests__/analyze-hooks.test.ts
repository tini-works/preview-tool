import { describe, it, expect } from 'vitest'
import { analyzeHooks } from '../analyze-hooks.js'

describe('analyzeHooks', () => {
  it('detects useAppLiveQuery with section ID', () => {
    const source = `
import { useAppLiveQuery } from '@/hooks/use-app-live-query'

export default function HomePage() {
  const { data, isLoading } = useAppLiveQuery(
    (q) => q.from({ service: servicesCollection }),
    'service-grid'
  )
  return <div>{data}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/home.tsx')
    expect(result.hooks).toHaveLength(1)
    expect(result.hooks[0]).toMatchObject({
      hookName: 'useAppLiveQuery',
      importPath: '@/hooks/use-app-live-query',
      sectionId: 'service-grid',
      returnShape: 'data-loading-error',
    })
  })

  it('detects useQuery from @tanstack/react-query', () => {
    const source = `
import { useQuery } from '@tanstack/react-query'

export default function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => fetch('/api/services').then(r => r.json()),
  })
  return <div>{data}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks).toHaveLength(1)
    expect(result.hooks[0]).toMatchObject({
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      returnShape: 'data-loading-error',
    })
  })

  it('detects devtool store imports that need mocking', () => {
    const source = `
import { useDevToolStore } from '@/devtool/devtool-store'

export default function LoginPage() {
  const mockState = useDevToolStore((s) => s.sectionStates['login-form'])
  return <div />
}
`
    const result = analyzeHooks(source, 'src/pages/login.tsx')
    expect(result.imports).toContainEqual(
      expect.objectContaining({
        path: '@/devtool/devtool-store',
        needsMocking: true,
        reason: 'devtool-store',
      })
    )
  })

  it('detects auth store imports', () => {
    const source = `
import { useAuthStore } from '@/stores/auth'

export default function Page() {
  const user = useAuthStore((s) => s.user)
  return <div>{user?.name}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.imports).toContainEqual(
      expect.objectContaining({
        path: '@/stores/auth',
        needsMocking: true,
        reason: 'auth-store',
      })
    )
  })

  it('detects multiple hooks in one file', () => {
    const source = `
import { useAppLiveQuery } from '@/hooks/use-app-live-query'
import { useDevToolStore } from '@/devtool/devtool-store'

export default function BookingPage() {
  const { data: service } = useAppLiveQuery(q => q.from(services), 'service-detail')
  const timeSlotsState = useDevToolStore(s => s.sectionStates['time-slots'])
  const { data: slots } = useAppLiveQuery(q => q.from(availability), 'time-slots')
  return <div />
}
`
    const result = analyzeHooks(source, 'src/pages/booking.tsx')
    expect(result.hooks).toHaveLength(2)
    expect(result.hooks.map(h => h.sectionId)).toContain('service-detail')
    expect(result.hooks.map(h => h.sectionId)).toContain('time-slots')
  })

  it('detects aliased imports', () => {
    const source = `
import { useAppLiveQuery as useLiveQuery } from '@/hooks/use-app-live-query'

export default function Page() {
  const { data } = useLiveQuery(q => q, 'my-section')
  return <div />
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks).toHaveLength(1)
    expect(result.hooks[0].importPath).toBe('@/hooks/use-app-live-query')
    expect(result.hooks[0].sectionId).toBe('my-section')
  })

  it('ignores type-only specifiers in named imports', () => {
    const source = `
import { useAuthStore, type AuthState } from '@/stores/auth'

export default function Page() {
  const user = useAuthStore((s) => s.user)
  return <div>{user?.name}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    const authImport = result.imports.find(i => i.path === '@/stores/auth')
    expect(authImport).toBeDefined()
    expect(authImport!.namedExports).toEqual(['useAuthStore'])
    // 'type AuthState' must not appear
    expect(authImport!.namedExports).not.toContainEqual(expect.stringContaining('type'))
  })

  it('does not emit a hook entry when hook is imported but never called', () => {
    const source = `
import { useAppLiveQuery } from '@/hooks/use-app-live-query'

export default function Page() {
  return <div>Static content</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks).toHaveLength(0)
    // But the import should still be tracked for mocking
    expect(result.imports).toContainEqual(
      expect.objectContaining({
        path: '@/hooks/use-app-live-query',
        needsMocking: true,
        reason: 'data-hook',
      })
    )
  })

  it('returns empty results for screens with no data hooks', () => {
    const source = `
import React from 'react'

export default function StaticPage() {
  return <div>Hello</div>
}
`
    const result = analyzeHooks(source, 'src/pages/static.tsx')
    expect(result.hooks).toHaveLength(0)
    expect(result.imports).toHaveLength(0)
  })

  it('detects hookMappingType for useQuery as query-hook', () => {
    const source = `
import { useQuery } from '@tanstack/react-query'

export default function Page() {
  const { data } = useQuery({
    queryKey: ['services'],
    queryFn: () => fetch('/api/services'),
  })
  return <div>{data}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks[0].hookMappingType).toBe('query-hook')
  })

  it('detects hookMappingType for useAppLiveQuery as custom-hook', () => {
    const source = `
import { useAppLiveQuery } from '@/hooks/use-app-live-query'

export default function Page() {
  const { data } = useAppLiveQuery(q => q.from(services), 'service-grid')
  return <div>{data}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks[0].hookMappingType).toBe('custom-hook')
  })

  it('detects hookMappingType for useSWR as query-hook', () => {
    const source = `
import useSWR from 'swr'

export default function Page() {
  const { data } = useSWR('/api/users')
  return <div>{data}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks[0].hookMappingType).toBe('query-hook')
  })

  it('detects query-client imports', () => {
    const source = `
import { queryClient } from '@/lib/query-client'

export default function App() {
  return <div />
}
`
    const result = analyzeHooks(source, 'src/app.tsx')
    expect(result.imports).toContainEqual(
      expect.objectContaining({
        path: '@/lib/query-client',
        needsMocking: true,
        reason: 'query-client',
      })
    )
  })

  it('detects @tanstack/react-db as db-library', () => {
    const source = `
import { eq, createCollection, useLiveQuery } from '@tanstack/react-db'

export default function Page() {
  const { data } = useLiveQuery(() => [])
  return <div />
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.imports).toContainEqual(
      expect.objectContaining({
        path: '@tanstack/react-db',
        needsMocking: true,
        reason: 'db-library',
        namedExports: expect.arrayContaining(['eq', 'createCollection', 'useLiveQuery']),
      })
    )
  })

  it('detects devtool mock data imports', () => {
    const source = `
import { mockAvailableTimes, mockAvailability } from '@/devtool/mocks/availability'

export default function Page() {
  return <div>{mockAvailableTimes.length}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.imports).toContainEqual(
      expect.objectContaining({
        path: '@/devtool/mocks/availability',
        needsMocking: true,
        reason: 'mock-data',
        namedExports: expect.arrayContaining(['mockAvailableTimes', 'mockAvailability']),
      })
    )
  })

  it('detects default imports that match mock patterns', () => {
    const source = `
import api from '@/lib/api'

export default function Page() {
  return <div />
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.imports).toContainEqual(
      expect.objectContaining({
        path: '@/lib/api',
        needsMocking: true,
        reason: 'api-client',
        namedExports: expect.arrayContaining(['default']),
      })
    )
  })

  it('extracts sectionId from useQuery queryKey array', () => {
    const source = `
import { useQuery } from '@tanstack/react-query'

export default function Page() {
  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users'),
  })
  return <div>{data}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks).toHaveLength(1)
    expect(result.hooks[0].sectionId).toBe('users')
  })

  it('extracts sectionId from useQuery with multi-element queryKey', () => {
    const source = `
import { useQuery } from '@tanstack/react-query'

export default function Page() {
  const { data } = useQuery({
    queryKey: ['availability', date],
    queryFn: () => fetch('/api/availability'),
  })
  return <div>{data}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks).toHaveLength(1)
    expect(result.hooks[0].sectionId).toBe('availability')
  })

  it('extracts sectionId from object sectionId property', () => {
    const source = `
import { useAppLiveQuery } from '@/hooks/use-app-live-query'

export default function Page() {
  const { data } = useAppLiveQuery({
    query: (q) => q.from(services),
    sectionId: 'service-grid',
  })
  return <div>{data}</div>
}
`
    const result = analyzeHooks(source, 'src/pages/page.tsx')
    expect(result.hooks).toHaveLength(1)
    expect(result.hooks[0].sectionId).toBe('service-grid')
  })

})

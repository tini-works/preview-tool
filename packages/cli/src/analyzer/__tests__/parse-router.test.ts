import { describe, it, expect } from 'vitest'
import { parseRouterRoutes } from '../parse-router.js'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const FIXTURES = join(__dirname, '..', '..', '..', 'test-fixtures')

describe('parseRouterRoutes', () => {
  it('returns empty array when no router found', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'no-router-'))
    const routes = await parseRouterRoutes(dir)
    expect(routes).toEqual([])
  })

  it('extracts routes from createBrowserRouter', async () => {
    const cwd = join(FIXTURES, 'router-app')
    const routes = await parseRouterRoutes(cwd)

    expect(routes).toHaveLength(3)

    const paths = routes.map((r) => r.path).sort()
    expect(paths).toEqual(['/', '/login', '/settings'])

    const dashboardRoute = routes.find((r) => r.path === '/')
    expect(dashboardRoute).toBeDefined()
    expect(dashboardRoute!.componentName).toBe('Dashboard')
    expect(dashboardRoute!.componentFile).toBe('src/screens/Dashboard.tsx')

    const settingsRoute = routes.find((r) => r.path === '/settings')
    expect(settingsRoute).toBeDefined()
    expect(settingsRoute!.componentName).toBe('Settings')
    expect(settingsRoute!.componentFile).toBe('src/screens/Settings.tsx')

    const loginRoute = routes.find((r) => r.path === '/login')
    expect(loginRoute).toBeDefined()
    expect(loginRoute!.componentName).toBe('Login')
    expect(loginRoute!.componentFile).toBe('src/screens/Login.tsx')
  })

  it('extracts routes from JSX Route elements', async () => {
    const cwd = join(FIXTURES, 'jsx-router-app')
    const routes = await parseRouterRoutes(cwd)

    expect(routes).toHaveLength(2)

    const paths = routes.map((r) => r.path).sort()
    expect(paths).toEqual(['/', '/profile'])

    const homeRoute = routes.find((r) => r.path === '/')
    expect(homeRoute).toBeDefined()
    expect(homeRoute!.componentName).toBe('Home')
    expect(homeRoute!.componentFile).toBe('src/pages/Home.tsx')

    const profileRoute = routes.find((r) => r.path === '/profile')
    expect(profileRoute).toBeDefined()
    expect(profileRoute!.componentName).toBe('Profile')
    expect(profileRoute!.componentFile).toBe('src/pages/Profile.tsx')
  })
})

import { describe, it, expect } from 'vitest'
import { generateScreenRegistry } from '../generate-registry.js'
import type { ScreenManifestEntry } from '../../analyzer/types.js'

function makeEntry(overrides: Partial<ScreenManifestEntry> & { name: string }): ScreenManifestEntry {
  return {
    path: `/${overrides.name.toLowerCase()}`,
    file: `src/screens/${overrides.name}.tsx`,
    regions: [],
    ...overrides,
  }
}

describe('generateScreenRegistry', () => {
  it('generates a TypeScript module with screens array export', () => {
    const screens = [
      makeEntry({ name: 'Home', path: '/' }),
      makeEntry({ name: 'Settings', path: '/settings' }),
    ]

    const code = generateScreenRegistry(screens)

    expect(code).toContain('export const screens')
  })

  it('creates lazy import functions for each screen', () => {
    const screens = [
      makeEntry({ name: 'Home', path: '/', file: 'src/screens/Home.tsx' }),
    ]

    const code = generateScreenRegistry(screens)

    expect(code).toContain('() => import(')
    expect(code).toContain('@host/screens/Home.tsx')
  })

  it('includes route, module, and regions for each screen entry', () => {
    const screens = [
      makeEntry({
        name: 'Dashboard',
        path: '/dashboard',
        file: 'src/screens/Dashboard.tsx',
        regions: [
          {
            name: 'tasks',
            label: 'Tasks',
            source: 'useQuery("tasks")',
            states: ['loading', 'error', 'empty', 'populated'],
            defaultState: 'populated',
            isList: true,
            mockData: {},
          },
        ],
      }),
    ]

    const code = generateScreenRegistry(screens)

    expect(code).toContain('/dashboard')
    expect(code).toContain('Dashboard')
    expect(code).toContain('tasks')
  })

  it('handles empty screens array', () => {
    const code = generateScreenRegistry([])

    expect(code).toContain('export const screens')
    expect(code).toContain('[]')
  })

  it('handles multiple screens', () => {
    const screens = [
      makeEntry({ name: 'Home', path: '/' }),
      makeEntry({ name: 'Profile', path: '/profile' }),
      makeEntry({ name: 'Settings', path: '/settings' }),
    ]

    const code = generateScreenRegistry(screens)

    expect(code).toContain('Home')
    expect(code).toContain('Profile')
    expect(code).toContain('Settings')
  })
})

import { describe, it, expect } from 'vitest'
import { buildMockModuleCode, buildModelFromV2, buildAdapterFromV2 } from '../generate-all-v2.js'

describe('buildMockModuleCode', () => {
  it('generates a mock module with stateMap', () => {
    const mockModule = {
      hookName: 'useAuthStore',
      importPath: '@/store/auth',
      defaultState: 'authenticated',
      stateMap: {
        authenticated: { user: { id: '1', name: 'Dr. Chen' }, isAuthenticated: true, login: '__fn__', logout: '__fn__' },
        loading: { user: null, isAuthenticated: false, login: '__fn__', logout: '__fn__' },
      },
    }

    const code = buildMockModuleCode(mockModule)
    expect(code).toContain('useRegionDataForHook')
    expect(code).toContain('useAuthStore')
    expect(code).toContain('Dr. Chen')
    expect(code).toContain('() => {}')
    expect(code).not.toContain('__fn__')
  })
})

describe('buildModelFromV2', () => {
  it('converts V2 regions to model output', () => {
    const regions = [
      {
        key: 'auth-store',
        label: 'Authentication',
        type: 'auth' as const,
        source: { type: 'hook' as const, name: 'useAuthStore', importPath: '@/store/auth' },
        states: {
          authenticated: { label: 'Logged in', mockData: { user: { id: '1' }, isAuthenticated: true } },
          loading: { label: 'Loading', mockData: { user: null, isAuthenticated: false } },
        },
      },
    ]
    const model = buildModelFromV2(regions)
    expect(model.regions['auth-store']).toBeDefined()
    expect(model.regions['auth-store'].states.authenticated).toBeDefined()
    expect(model.regions['auth-store'].defaultState).toBe('authenticated')
  })
})

describe('buildAdapterFromV2', () => {
  it('generates adapter with RegionDataProvider wrapper', () => {
    const code = buildAdapterFromV2('BookingPage', '../../src/pages/BookingPage')
    expect(code).toContain('RegionDataProvider')
    expect(code).toContain('BookingPage')
    expect(code).toContain('import')
  })
})

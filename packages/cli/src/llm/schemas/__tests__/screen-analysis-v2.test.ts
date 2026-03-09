import { describe, it, expect } from 'vitest'
import { ScreenAnalysisV2Schema } from '../screen-analysis-v2.js'

describe('ScreenAnalysisV2Schema', () => {
  it('validates a complete screen analysis', () => {
    const input = {
      regions: [
        {
          key: 'auth-store',
          label: 'Authentication',
          type: 'auth',
          source: { type: 'hook', name: 'useAuthStore', importPath: '@/store/auth' },
          states: {
            authenticated: {
              label: 'Logged in',
              mockData: { user: { id: '1', name: 'Dr. Sarah Chen' }, isAuthenticated: true },
            },
            loading: {
              label: 'Loading',
              mockData: { user: null, isAuthenticated: false },
            },
          },
        },
      ],
      flows: [
        { trigger: 'Click "Login" button', action: 'navigate', to: '/dashboard' },
      ],
      mockModules: [
        {
          hookName: 'useAuthStore',
          importPath: '@/store/auth',
          defaultState: 'authenticated',
          stateMap: {
            authenticated: { user: { id: '1', name: 'Dr. Sarah Chen' }, isAuthenticated: true, login: '__fn__', logout: '__fn__' },
            loading: { user: null, isAuthenticated: false, login: '__fn__', logout: '__fn__' },
          },
        },
      ],
    }
    const result = ScreenAnalysisV2Schema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects region without source', () => {
    const input = {
      regions: [{ key: 'test', label: 'Test', type: 'custom', states: {} }],
      flows: [],
      mockModules: [],
    }
    const result = ScreenAnalysisV2Schema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

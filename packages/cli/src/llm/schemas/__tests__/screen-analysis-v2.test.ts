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
          role: 'state_store',
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

  it('coerces flow trigger/to from objects to strings', () => {
    const input = {
      regions: [],
      flows: [
        {
          trigger: { type: 'click', element: 'button' },
          action: 'navigate',
          to: { path: '/home' },
        },
      ],
      mockModules: [],
    }
    const result = ScreenAnalysisV2Schema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.flows[0].trigger).toBe('{"type":"click","element":"button"}')
      expect(result.data.flows[0].to).toBe('{"path":"/home"}')
    }
  })

  it('coerces flow from: null to undefined, object to string', () => {
    const input = {
      regions: [],
      flows: [
        { trigger: 'click', action: 'navigate', from: null, to: '/page' },
        { trigger: 'click', action: 'navigate', from: { screen: 'home' }, to: '/page' },
      ],
      mockModules: [],
    }
    const result = ScreenAnalysisV2Schema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.flows[0].from).toBeUndefined()
      expect(result.data.flows[1].from).toBe('{"screen":"home"}')
    }
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

import { describe, it, expect } from 'vitest'
import { buildFromTemplates } from '../template-fallback.js'
import type { ScreenFacts } from '../types.js'

describe('buildFromTemplates', () => {
  it('maps useQuery to list region with loading/populated/empty/error', () => {
    const facts: ScreenFacts = {
      route: '/users',
      filePath: '/app/users.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['users'] }"] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
    expect(result.regions[0].key).toBe('users')
    expect(result.regions[0].type).toBe('list')
    expect(Object.keys(result.regions[0].states)).toEqual(
      expect.arrayContaining(['populated', 'loading', 'empty', 'error'])
    )
    expect(result.regions[0].hookBindings).toContain('useQuery:users')
  })

  it('maps useAuthStore to auth region', () => {
    const facts: ScreenFacts = {
      route: '/profile',
      filePath: '/app/profile.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useAuthStore', importPath: '@/stores/auth', arguments: ['s => s.user'] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
    expect(result.regions[0].type).toBe('auth')
    expect(Object.keys(result.regions[0].states)).toEqual(
      expect.arrayContaining(['authenticated', 'unauthenticated'])
    )
  })

  it('maps Zustand store to status region', () => {
    const facts: ScreenFacts = {
      route: '/settings',
      filePath: '/app/settings.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useSettingsStore', importPath: '@/stores/settings', arguments: [] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
    expect(result.regions[0].type).toBe('status')
  })

  it('extracts navigation flows', () => {
    const facts: ScreenFacts = {
      route: '/home',
      filePath: '/app/home.tsx',
      sourceCode: '',
      hooks: [],
      components: [], conditionals: [],
      navigation: [
        { target: "'/booking'", trigger: 'navigate() call' },
      ],
      localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.flows).toHaveLength(1)
    expect(result.flows[0].action).toBe('navigate')
    expect(result.flows[0].target).toBe('/booking')
  })

  it('derives key from sectionId string argument', () => {
    const facts: ScreenFacts = {
      route: '/services',
      filePath: '/app/services.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useAppLiveQuery', importPath: '@/hooks/live-query', arguments: ['q => q', "'service-grid'"] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions[0].key).toBe('service-grid')
  })

  it('deduplicates regions by key', () => {
    const facts: ScreenFacts = {
      route: '/page',
      filePath: '/app/page.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['items'] }"] },
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['items'] }"] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
  })

  it('maps useSWR to list region', () => {
    const facts: ScreenFacts = {
      route: '/posts',
      filePath: '/app/posts.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useSWR', importPath: 'swr', arguments: ["'/api/posts'"] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
    expect(result.regions[0].type).toBe('list')
    expect(result.regions[0].key).toBe('/api/posts')
  })

  it('maps useContext to status region with active/inactive', () => {
    const facts: ScreenFacts = {
      route: '/theme',
      filePath: '/app/theme.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useContext', importPath: 'react', arguments: ['ThemeContext'] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
    expect(result.regions[0].type).toBe('status')
    expect(Object.keys(result.regions[0].states)).toEqual(
      expect.arrayContaining(['active', 'inactive'])
    )
  })

  it('maps unrecognized custom hooks to custom region type', () => {
    const facts: ScreenFacts = {
      route: '/custom',
      filePath: '/app/custom.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useCustomThing', importPath: './hooks/custom', arguments: [] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
    expect(result.regions[0].key).toBe('custom-thing')
    expect(result.regions[0].type).toBe('custom')
    expect(Object.keys(result.regions[0].states)).toEqual(
      expect.arrayContaining(['populated', 'loading', 'error'])
    )
  })

  it('skips React built-in hooks (no regions for useState/useEffect)', () => {
    const facts: ScreenFacts = {
      route: '/dashboard',
      filePath: '/app/dashboard.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useState', importPath: 'react', arguments: ['[]'] },
        { name: 'useEffect', importPath: 'react', arguments: [] },
        { name: 'useRef', importPath: 'react', arguments: ['null'] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(0)
  })

  it('handles auth detected by import path', () => {
    const facts: ScreenFacts = {
      route: '/login',
      filePath: '/app/login.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useSession', importPath: '@/services/auth-service', arguments: [] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
    expect(result.regions[0].type).toBe('auth')
  })

  it('sets isList and mockItems for list regions', () => {
    const facts: ScreenFacts = {
      route: '/items',
      filePath: '/app/items.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['items'] }"] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions[0].isList).toBe(true)
    expect(result.regions[0].mockItems).toBeDefined()
    expect(result.regions[0].defaultCount).toBe(3)
  })

  it('sets route from facts', () => {
    const facts: ScreenFacts = {
      route: '/dashboard',
      filePath: '/app/dashboard.tsx',
      sourceCode: '',
      hooks: [],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.route).toBe('/dashboard')
    expect(result.regions).toHaveLength(0)
    expect(result.flows).toHaveLength(0)
  })

  it('derives states from AST when Zustand store has destructuredFields + conditionals', () => {
    const facts: ScreenFacts = {
      route: '/booking',
      filePath: '/app/booking.tsx',
      sourceCode: '',
      hooks: [
        {
          name: 'useBookingStore',
          importPath: '@/stores/booking',
          arguments: [],
          destructuredFields: ['isLoading', 'error', 'data', 'fetchBookings', 'setData'],
        },
      ],
      components: [],
      conditionals: [
        { condition: 'isLoading', trueBranch: ['Spinner'], falseBranch: [] },
        { condition: 'error', trueBranch: ['ErrorBanner'], falseBranch: [] },
      ],
      navigation: [],
      localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
    const region = result.regions[0]

    // Should have derived states: default, loading, error
    expect(Object.keys(region.states)).toEqual(
      expect.arrayContaining(['default', 'loading', 'error'])
    )
    expect(region.defaultState).toBe('default')

    // Default state: booleans false, nullable null — no function fields
    expect(region.states['default'].mockData).toEqual({
      isLoading: false,
      error: null,
      data: null,
    })

    // Loading state: isLoading overridden to true
    expect(region.states['loading'].mockData.isLoading).toBe(true)

    // Error state: error gets message
    expect(region.states['error'].mockData.error).toBe('Something went wrong')
  })

  it('falls back to hardcoded auth states when no destructuredFields', () => {
    const facts: ScreenFacts = {
      route: '/profile',
      filePath: '/app/profile.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useAuthStore', importPath: '@/stores/auth', arguments: ['s => s.user'] },
      ],
      components: [],
      conditionals: [
        { condition: 'isAuthenticated', trueBranch: ['Profile'], falseBranch: ['LoginPrompt'] },
      ],
      navigation: [],
      localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
    // Without destructuredFields, falls back to template hardcoded states
    expect(Object.keys(result.regions[0].states)).toEqual(
      expect.arrayContaining(['authenticated', 'unauthenticated'])
    )
  })

  it('falls back to hardcoded states when no matching conditionals', () => {
    const facts: ScreenFacts = {
      route: '/settings',
      filePath: '/app/settings.tsx',
      sourceCode: '',
      hooks: [
        {
          name: 'useSettingsStore',
          importPath: '@/stores/settings',
          arguments: [],
          destructuredFields: ['theme', 'language', 'setTheme'],
        },
      ],
      components: [],
      conditionals: [],
      navigation: [],
      localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(1)
    // No matching conditionals → falls back to template states
    expect(Object.keys(result.regions[0].states)).toEqual(
      expect.arrayContaining(['populated', 'loading', 'error'])
    )
  })

  it('creates local-state regions from useState with conditionals', () => {
    const facts: ScreenFacts = {
      route: '/login',
      filePath: '/app/login.tsx',
      sourceCode: '',
      hooks: [],
      components: [], conditionals: [
        { condition: 'showPassword', trueBranch: ['EyeOff'], falseBranch: ['Eye'] },
      ],
      navigation: [],
      localState: [
        { name: 'showPassword', hook: 'useState', setter: 'setShowPassword', initialValue: 'false', valueType: 'boolean' },
      ],
      derivedVars: [],
      functions: [],
    }
    const result = buildFromTemplates(facts)
    const region = result.regions.find(r => r.key === 'show-password')
    expect(region).toBeDefined()
    expect(region!.type).toBe('local-state')
    expect(Object.keys(region!.states)).toContain('default')
    expect(Object.keys(region!.states)).toContain('active')
  })

  it('creates derived-var regions from conditional-driven variables', () => {
    const facts: ScreenFacts = {
      route: '/login',
      filePath: '/app/login.tsx',
      sourceCode: '',
      hooks: [],
      components: [], conditionals: [
        { condition: 'registrationSuccess', trueBranch: ['Banner'], falseBranch: [] },
      ],
      navigation: [],
      localState: [],
      derivedVars: [
        { name: 'registrationSuccess', expression: 'x === "true"', sourceVariable: 'searchParams', valueType: 'boolean' },
      ],
      functions: [],
    }
    const result = buildFromTemplates(facts)
    const region = result.regions.find(r => r.key === 'registration-success')
    expect(region).toBeDefined()
    expect(region!.type).toBe('derived-var')
  })

  it('generates flows from FunctionFacts', () => {
    const facts: ScreenFacts = {
      route: '/login',
      filePath: '/app/login.tsx',
      sourceCode: '',
      hooks: [],
      components: [], conditionals: [],
      navigation: [],
      localState: [],
      derivedVars: [],
      functions: [
        {
          name: 'handleSubmit',
          kind: 'function',
          triggers: [{ element: 'form', event: 'onSubmit' }],
          settersCalled: ['setFieldErrors'],
          navigationCalls: ['navigate(redirectTo)'],
          externalCalls: ['login'],
        },
        {
          name: '__inline_setShowPassword',
          kind: 'arrow',
          triggers: [{ element: 'button', event: 'onClick' }],
          settersCalled: ['setShowPassword'],
          navigationCalls: [],
          externalCalls: [],
        },
      ],
    }
    const result = buildFromTemplates(facts)

    expect(result.flows.length).toBeGreaterThanOrEqual(2)

    const submitFlow = result.flows.find(f => f.trigger.selector === 'form')
    expect(submitFlow).toBeDefined()

    const toggleFlow = result.flows.find(f =>
      f.action === 'setRegionState' && f.targetRegion === 'show-password'
    )
    expect(toggleFlow).toBeDefined()
  })

  it('skips provider hooks (useNavigate, useForm, useTranslation) — no regions produced', () => {
    const facts: ScreenFacts = {
      route: '/register',
      filePath: '/app/register.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useNavigate', importPath: 'react-router-dom', arguments: [] },
        { name: 'useForm', importPath: 'react-hook-form', arguments: [] },
        { name: 'useTranslation', importPath: 'react-i18next', arguments: [] },
        { name: 'useParams', importPath: 'react-router-dom', arguments: [] },
      ],
      components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [],
    }
    const result = buildFromTemplates(facts)
    expect(result.regions).toHaveLength(0)
  })
})

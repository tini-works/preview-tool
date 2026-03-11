import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { Project } from 'ts-morph'
import { extractHookFacts } from '../../analyzer/collect-facts.js'
import type { SpecManifestScreen } from '../types.js'
import type { HookFact } from '../../analyzer/types.js'
import {
  runSpecPipeline,
  specToPerHookRegions,
  detectContextHooks,
  generateContextShim,
  toSafeFileName,
  type MergedHookDep,
} from '../spec-pipeline-orchestrator.js'

const FIXTURES = join(import.meta.dirname, 'fixtures')
const HOME_SOURCE = join(FIXTURES, 'src', 'pages', 'HomePage.tsx')

const SCREEN: SpecManifestScreen = {
  id: 'scr-home',
  title: 'Home Screen',
  sourceFile: 'src/pages/HomePage.tsx',
  states: ['loading', 'populated', 'error'],
  defaultState: 'loading',
  stateData: {
    loading: { isLoading: true, rooms: [], bookings: [] },
    populated: { isLoading: false, rooms: [{ id: '1', name: 'Room A' }], bookings: [{ id: 'b1' }] },
    error: { isLoading: false, error: 'Failed' },
  },
  dataDeps: [
    { hook: 'useRooms', module: '@/hooks/useRooms', provides: ['rooms', 'isLoading', 'error'] },
  ],
  routeParams: null,
}

describe('AST hook discovery', () => {
  it('discovers hooks from source file via AST', () => {
    const project = new Project({
      useInMemoryFileSystem: false,
      compilerOptions: { strict: true, jsx: 4 },
    })
    project.addSourceFileAtPath(HOME_SOURCE)
    const sf = project.getSourceFileOrThrow(HOME_SOURCE)
    const hooks = extractHookFacts(sf)

    const hookNames = hooks.map((h) => h.name)
    expect(hookNames).toContain('useRooms')
    expect(hookNames).toContain('useBookings')
    expect(hookNames).toContain('useServerClock')
    expect(hookNames).toContain('useToast')
    expect(hookNames).toContain('useNavigate')
  })
})

describe('specToPerHookRegions', () => {
  it('creates one region per hook', () => {
    const deps: MergedHookDep[] = [
      { hook: 'useRooms', module: '@/hooks/useRooms', provides: ['rooms', 'isLoading', 'error'], origin: 'spec' },
      { hook: 'useBookings', module: '@/hooks/useBookings', provides: ['bookings'], origin: 'ast' },
      { hook: 'useServerClock', module: '@/hooks/useServerClock', provides: ['currentTime', 'isConnected'], origin: 'ast' },
    ]
    const regions = specToPerHookRegions(SCREEN, deps)

    expect(Object.keys(regions)).toHaveLength(3)
    expect(regions['rooms']).toBeDefined()
    expect(regions['bookings']).toBeDefined()
    expect(regions['server-clock']).toBeDefined()
  })

  it('includes hookMapping in each region', () => {
    const deps: MergedHookDep[] = [
      { hook: 'useRooms', module: '@/hooks/useRooms', provides: ['rooms', 'isLoading'], origin: 'spec' },
    ]
    const regions = specToPerHookRegions(SCREEN, deps)

    expect(regions['rooms'].hookMapping).toBeDefined()
    expect(regions['rooms'].hookMapping!.hookName).toBe('useRooms')
    expect(regions['rooms'].hookMapping!.importPath).toBe('@/hooks/useRooms')
  })

  it('distributes stateData across hook regions by provides', () => {
    const deps: MergedHookDep[] = [
      { hook: 'useRooms', module: '@/hooks/useRooms', provides: ['rooms', 'isLoading', 'error'], origin: 'spec' },
      { hook: 'useBookings', module: '@/hooks/useBookings', provides: ['bookings'], origin: 'ast' },
    ]
    const regions = specToPerHookRegions(SCREEN, deps)

    // rooms region should have rooms/isLoading/error fields
    expect(regions['rooms'].states['loading']).toEqual({ isLoading: true, rooms: [] })
    expect(regions['rooms'].states['populated']).toEqual({ isLoading: false, rooms: [{ id: '1', name: 'Room A' }] })

    // bookings region should have bookings fields
    expect(regions['bookings'].states['loading']).toEqual({ bookings: [] })
    expect(regions['bookings'].states['populated']).toEqual({ bookings: [{ id: 'b1' }] })
  })
})

describe('runSpecPipeline', () => {
  it('merges spec data_deps with AST hooks', async () => {
    const result = await runSpecPipeline([SCREEN], FIXTURES, FIXTURES)

    expect(result.enrichedScreens).toHaveLength(1)
    const enriched = result.enrichedScreens[0]
    const hookNames = enriched.mergedDeps.map((d) => d.hook)

    // useRooms from spec, useBookings + useServerClock from AST
    expect(hookNames).toContain('useRooms')
    expect(hookNames).toContain('useBookings')
    expect(hookNames).toContain('useServerClock')

    // useNavigate should NOT be included (provider hook)
    expect(hookNames).not.toContain('useNavigate')
  })

  it('generates mock file with __real: re-export', async () => {
    const result = await runSpecPipeline([SCREEN], FIXTURES, FIXTURES)

    const roomsMock = result.mockFiles.get('@/hooks/useRooms')
    expect(roomsMock).toBeDefined()
    expect(roomsMock).toContain("export * from '__real:@/hooks/useRooms'")
    expect(roomsMock).toContain('useRegionDataForHook')
  })

  it('generates alias manifest mapping import paths to mock files', async () => {
    const result = await runSpecPipeline([SCREEN], FIXTURES, FIXTURES)

    expect(result.aliasManifest['@/hooks/useRooms']).toBe('./mocks/hooks-useRooms.ts')
  })

  it('creates enriched regions with multiple regions per screen', async () => {
    const result = await runSpecPipeline([SCREEN], FIXTURES, FIXTURES)
    const enriched = result.enrichedScreens[0]

    const regionKeys = Object.keys(enriched.enrichedRegions)
    // Should have regions for each data hook
    expect(regionKeys.length).toBeGreaterThanOrEqual(1)
    expect(regionKeys).toContain('rooms')
  })
})

describe('detectContextHooks', () => {
  it('does not include useNavigate (handled by wrapper)', () => {
    const hooks: HookFact[] = [
      { name: 'useNavigate', importPath: 'react-router-dom', arguments: [] },
      { name: 'useToast', importPath: '@/contexts/toast', arguments: [], destructuredFields: ['showToast', 'dismissToast'] },
    ]
    const dataKeys = new Set<string>()
    const context = detectContextHooks(hooks, dataKeys)

    expect(context.map((h) => h.name)).not.toContain('useNavigate')
  })

  it('does not include hooks already mocked as data', () => {
    const hooks: HookFact[] = [
      { name: 'useRooms', importPath: '@/hooks/useRooms', arguments: [], destructuredFields: ['rooms'] },
    ]
    const dataKeys = new Set(['@/hooks/useRooms::useRooms'])
    const context = detectContextHooks(hooks, dataKeys)

    expect(context).toHaveLength(0)
  })
})

describe('generateContextShim', () => {
  it('generates shim with NOOP for action fields, null for data fields', () => {
    const hook: HookFact = {
      name: 'useToast',
      importPath: '@/contexts/toast',
      arguments: [],
      destructuredFields: ['showToast', 'dismissToast', 'toastMessage'],
    }
    const shim = generateContextShim(hook, '@/contexts/toast')

    expect(shim).toContain("export * from '__real:@/contexts/toast'")
    expect(shim).toContain('export function useToast')
    expect(shim).toContain('showToast: (() => {}) as any,')
    expect(shim).toContain('dismissToast: (() => {}) as any,')
    expect(shim).toContain('toastMessage: null as any,')
  })
})

describe('toSafeFileName', () => {
  it('converts @/ paths to safe filenames', () => {
    expect(toSafeFileName('@/hooks/useRooms')).toBe('hooks-useRooms')
    expect(toSafeFileName('@tanstack/react-query')).toBe('tanstack-react-query')
    expect(toSafeFileName('@/stores/auth')).toBe('stores-auth')
  })
})

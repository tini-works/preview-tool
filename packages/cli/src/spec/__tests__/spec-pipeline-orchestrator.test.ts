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
  isServerFunctionImport,
  generateServerFunctionStub,
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

// ---------------------------------------------------------------------------
// Integration: type-extracted mock data
// ---------------------------------------------------------------------------

const TYPED_FIXTURES = join(import.meta.dirname, 'fixtures', 'typed-app')

const TYPED_SCREEN: SpecManifestScreen = {
  id: 'scr-home',
  title: 'Home',
  sourceFile: 'src/pages/HomePage.tsx',
  states: ['loading', 'populated', 'empty', 'error'],
  defaultState: 'loading',
  stateData: {},
  dataDeps: [],
  routeParams: null,
}

describe('integration: type-extracted mock data', () => {
  it('discovers useRooms from AST and resolves its typed return', async () => {
    const result = await runSpecPipeline([TYPED_SCREEN], TYPED_FIXTURES)
    const home = result.enrichedScreens.find((s) => s.id === 'scr-home')
    expect(home).toBeDefined()

    // Should have discovered useRooms from AST
    const hookNames = home!.mergedDeps.map((d) => d.hook)
    expect(hookNames).toContain('useRooms')

    // useRooms dep should have resolvedType
    const roomsDep = home!.mergedDeps.find((d) => d.hook === 'useRooms')
    expect(roomsDep?.resolvedType).toBeDefined()
    expect(roomsDep!.resolvedType!.confidence).not.toBe('none')
  })

  it('generates type-aware state data in enriched regions', async () => {
    const result = await runSpecPipeline([TYPED_SCREEN], TYPED_FIXTURES)
    const home = result.enrichedScreens.find((s) => s.id === 'scr-home')!
    const roomsRegion = home.enrichedRegions['rooms']
    expect(roomsRegion).toBeDefined()

    // Loading state: isLoading true, empty array, no error
    expect(roomsRegion.states.loading.isLoading).toBe(true)
    expect(roomsRegion.states.loading.rooms).toEqual([])
    expect(roomsRegion.states.loading.error).toBeNull()

    // Populated state: isLoading false, filled array with typed items
    expect(roomsRegion.states.populated.isLoading).toBe(false)
    const populatedRooms = roomsRegion.states.populated.rooms as unknown[]
    expect(populatedRooms.length).toBeGreaterThan(0)
    expect(populatedRooms[0]).toHaveProperty('id')
    expect(populatedRooms[0]).toHaveProperty('name')
    expect(populatedRooms[0]).toHaveProperty('capacity')

    // Error state: error message present, empty array
    expect(roomsRegion.states.error.error).toBeTruthy()
    expect(roomsRegion.states.error.rooms).toEqual([])

    // Empty state: empty array, no error
    expect(roomsRegion.states.empty.rooms).toEqual([])
    expect(roomsRegion.states.empty.error).toBeNull()
  })

  it('includes NOOP for method fields (refetch)', async () => {
    const result = await runSpecPipeline([TYPED_SCREEN], TYPED_FIXTURES)
    const home = result.enrichedScreens.find((s) => s.id === 'scr-home')!
    const roomsRegion = home.enrichedRegions['rooms']

    // refetch should be a NOOP string in all states
    expect(roomsRegion.states.populated.refetch).toBe('NOOP')
  })

  it('generates mock code with default shapes from resolved types', async () => {
    const result = await runSpecPipeline([TYPED_SCREEN], TYPED_FIXTURES)
    const mockCode = result.mockFiles.get('../hooks/useRooms')
    expect(mockCode).toBeDefined()
    expect(mockCode).toContain('export function useRooms')
    expect(mockCode).toContain('useRegionDataForHook')
    // Should have non-empty defaults object (not just {})
    expect(mockCode).toContain('const defaults =')
  })
})

describe('isServerFunctionImport', () => {
  it('detects server-functions paths', () => {
    expect(isServerFunctionImport('~/server-functions/rooms.js')).toBe(true)
    expect(isServerFunctionImport('~/server_functions/auth.js')).toBe(true)
    expect(isServerFunctionImport('~/serverFunctions/rooms.js')).toBe(true)
    expect(isServerFunctionImport('~/serverfunctions/rooms.js')).toBe(true)
    expect(isServerFunctionImport('~/server-function/rooms.js')).toBe(true)
  })

  it('detects actions paths', () => {
    expect(isServerFunctionImport('~/actions/submit.js')).toBe(true)
    expect(isServerFunctionImport('@/actions/create.ts')).toBe(true)
  })

  it('rejects non-server paths', () => {
    expect(isServerFunctionImport('~/hooks/useRooms.js')).toBe(false)
    expect(isServerFunctionImport('~/lib/utils.js')).toBe(false)
    expect(isServerFunctionImport('react')).toBe(false)
  })
})

describe('generateServerFunctionStub', () => {
  it('generates async no-op stubs for all exports', () => {
    const stub = generateServerFunctionStub('~/server-functions/rooms.js', ['getRooms', 'getRoom'])
    expect(stub).toContain('export function getRooms')
    expect(stub).toContain('export function getRoom')
    expect(stub).toContain('Promise.resolve(undefined)')
    // Must NOT re-export from __real: (would crash)
    expect(stub).not.toContain('__real:')
  })

  it('includes comment header', () => {
    const stub = generateServerFunctionStub('~/server-functions/auth.js', ['login'])
    expect(stub).toContain('Auto-generated server function stub')
    expect(stub).toContain('~/server-functions/auth.js')
  })
})

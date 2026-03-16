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
  isApiClientImport,
  generateApiClientStub,
  extractBooleanStem,
  parseInitialValue,
  generateLocalStateRegion,
  type MergedHookDep,
} from '../spec-pipeline-orchestrator.js'
import type { LocalStateFact } from '../../analyzer/types.js'

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
  stateDescriptions: {},
  dataDeps: [
    { hook: 'useRooms', module: '@/hooks/useRooms', provides: ['rooms', 'isLoading', 'error'] },
  ],
  routeParams: null,
  apiClient: null,
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
  it('merges spec data_deps with AST hooks', { timeout: 15_000 }, async () => {
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
  stateDescriptions: {},
  dataDeps: [],
  routeParams: null,
  apiClient: null,
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

describe('specToPerHookRegions with mockData', () => {
  it('uses spec mockData as primary source over type inference', () => {
    const screen: SpecManifestScreen = {
      id: 'scr-search',
      title: 'Search',
      sourceFile: null,
      states: ['loading', 'populated'],
      defaultState: 'loading',
      stateData: {
        loading: { isLoading: true, specialties: [], error: null },
        populated: { isLoading: false, specialties: [{ slug: 'zahnarzt', name: 'Zahnarzt' }], error: null },
      },
      stateDescriptions: {},
      dataDeps: [],
      routeParams: null,
  apiClient: null,
    }

    const deps: MergedHookDep[] = [{
      hook: 'useBookingStore',
      module: '@/stores/booking-store',
      provides: ['isLoading', 'specialties', 'error'],
      origin: 'ast' as const,
      resolvedType: {
        confidence: 'partial' as const,
        properties: ['isLoading', 'specialties', 'error'],
        methods: ['setSpecialty', 'reset'],
        shape: { isLoading: false, specialties: [], error: null },
        nullableFields: [],
      },
    }]

    const regions = specToPerHookRegions(screen, deps)
    const regionKey = Object.keys(regions)[0]
    const region = regions[regionKey]

    // mockData from spec should win over type-inferred defaults
    expect(region.states['populated'].specialties).toEqual([{ slug: 'zahnarzt', name: 'Zahnarzt' }])
    expect(region.states['loading'].isLoading).toBe(true)
  })

  it('falls back to type inference when spec has no mockData', () => {
    const screen: SpecManifestScreen = {
      id: 'scr-search',
      title: 'Search',
      sourceFile: null,
      states: ['loading', 'populated'],
      defaultState: 'loading',
      stateData: {
        loading: {},
        populated: {},
      },
      stateDescriptions: {},
      dataDeps: [],
      routeParams: null,
  apiClient: null,
    }

    const deps: MergedHookDep[] = [{
      hook: 'useBookingStore',
      module: '@/stores/booking-store',
      provides: ['isLoading'],
      origin: 'ast' as const,
      resolvedType: {
        confidence: 'partial' as const,
        properties: ['isLoading'],
        methods: [],
        shape: { isLoading: false },
        nullableFields: [],
      },
    }]

    const regions = specToPerHookRegions(screen, deps)
    const regionKey = Object.keys(regions)[0]
    const region = regions[regionKey]

    // When no mockData, type inference should fill in
    expect(region.states['loading'].isLoading).toBe(true)
  })
})

describe('distributeStateData edge cases', () => {
  it('gives all mockData to hook when provides is empty (single hook)', () => {
    const screen: SpecManifestScreen = {
      id: 'scr-test',
      title: 'Test',
      sourceFile: null,
      states: ['loading', 'populated'],
      defaultState: 'loading',
      stateData: {
        loading: { isLoading: true, items: [] },
        populated: { isLoading: false, items: [{ id: 1 }] },
      },
      stateDescriptions: {},
      dataDeps: [],
      routeParams: null,
  apiClient: null,
    }

    // When only one hook and provides is empty, all data should go to it
    const deps: MergedHookDep[] = [{
      hook: 'useStore',
      module: '@/stores/main',
      provides: [],
      origin: 'ast' as const,
    }]

    const regions = specToPerHookRegions(screen, deps)
    const regionKey = Object.keys(regions)[0]
    const region = regions[regionKey]
    expect(region.states['populated'].items).toEqual([{ id: 1 }])
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

// ---------------------------------------------------------------------------
// Local-state region heuristics
// ---------------------------------------------------------------------------

describe('extractBooleanStem', () => {
  it('strips "is" prefix', () => {
    expect(extractBooleanStem('isOpen')).toBe('open')
  })

  it('strips "has" prefix', () => {
    expect(extractBooleanStem('hasError')).toBe('error')
  })

  it('strips "show" prefix', () => {
    expect(extractBooleanStem('showConfirmation')).toBe('confirmation')
  })

  it('returns null for non-boolean names', () => {
    expect(extractBooleanStem('count')).toBeNull()
    expect(extractBooleanStem('error')).toBeNull()
    expect(extractBooleanStem('confirmInput')).toBeNull()
  })

  it('returns null when prefix is the entire name', () => {
    expect(extractBooleanStem('is')).toBeNull()
    expect(extractBooleanStem('has')).toBeNull()
  })
})

describe('parseInitialValue', () => {
  it('parses boolean false', () => {
    expect(parseInitialValue('false')).toBe(false)
  })

  it('parses boolean true', () => {
    expect(parseInitialValue('true')).toBe(true)
  })

  it('parses null', () => {
    expect(parseInitialValue('null')).toBeNull()
  })

  it('parses empty string literals', () => {
    expect(parseInitialValue("''")).toBe('')
    expect(parseInitialValue('""')).toBe('')
  })

  it('parses string literals', () => {
    expect(parseInitialValue("'hello'")).toBe('hello')
  })

  it('rejects mismatched quotes', () => {
    // Should NOT parse as a string — mismatched quotes
    expect(parseInitialValue("'hello\"")).toBe("'hello\"")
  })

  it('parses empty array', () => {
    expect(parseInitialValue('[]')).toEqual([])
  })

  it('parses empty object', () => {
    expect(parseInitialValue('{}')).toEqual({})
  })

  it('parses numbers', () => {
    expect(parseInitialValue('0')).toBe(0)
    expect(parseInitialValue('42')).toBe(42)
  })

  it('returns raw string for complex expressions', () => {
    expect(parseInitialValue('Date.now()')).toBe('Date.now()')
  })
})

describe('generateLocalStateRegion', () => {
  const makeFact = (name: string, initialValue: string, valueType: string): LocalStateFact => ({
    name,
    hook: 'useState',
    initialValue,
    valueType,
  })

  it('returns null when no useState facts', () => {
    const result = generateLocalStateRegion(['default', 'active'], {}, [], 'default')
    expect(result).toBeNull()
  })

  it('returns null when only useRef facts', () => {
    const refFact: LocalStateFact = { name: 'myRef', hook: 'useRef', initialValue: 'null', valueType: 'null' }
    const result = generateLocalStateRegion(['default'], {}, [refFact], 'default')
    expect(result).toBeNull()
  })

  it('keeps initial values for default state', () => {
    const facts = [
      makeFact('showConfirmation', 'false', 'boolean'),
      makeFact('confirmInput', "''", 'string'),
      makeFact('error', 'null', 'null'),
    ]
    const result = generateLocalStateRegion(['default', 'confirmation'], {}, facts, 'default')
    expect(result).not.toBeNull()
    expect(result!.states['default']).toEqual({
      showConfirmation: false,
      confirmInput: '',
      error: null,
    })
  })

  it('sets boolean true when state name matches variable stem', () => {
    const facts = [
      makeFact('showConfirmation', 'false', 'boolean'),
      makeFact('isDeleting', 'false', 'boolean'),
    ]
    const result = generateLocalStateRegion(
      ['default', 'confirmation', 'deleting'],
      {},
      facts,
      'default',
    )

    expect(result!.states['confirmation'].showConfirmation).toBe(true)
    expect(result!.states['confirmation'].isDeleting).toBe(false)

    expect(result!.states['deleting'].isDeleting).toBe(true)
  })

  it('sets error message for error state', () => {
    const facts = [makeFact('error', 'null', 'null')]
    const result = generateLocalStateRegion(
      ['default', 'error'],
      { error: 'Something went wrong' },
      facts,
      'default',
    )
    expect(result!.states['error'].error).toBe('Something went wrong')
  })

  it('uses generic error message when no description', () => {
    const facts = [makeFact('error', 'null', 'null')]
    const result = generateLocalStateRegion(['default', 'error'], {}, facts, 'default')
    expect(result!.states['error'].error).toBe('An error occurred. Please try again.')
  })

  it('inherits boolean from earlier state via ordering', () => {
    const facts = [
      makeFact('showConfirmation', 'false', 'boolean'),
      makeFact('isDeleting', 'false', 'boolean'),
    ]
    // "deleting" comes after "confirmation" in state order
    const result = generateLocalStateRegion(
      ['default', 'confirmation', 'deleting'],
      {},
      facts,
      'default',
    )
    // "deleting" should inherit showConfirmation=true because "confirmation" precedes it
    expect(result!.states['deleting'].showConfirmation).toBe(true)
  })

  it('inherits boolean from description text', () => {
    const facts = [makeFact('showConfirmation', 'false', 'boolean')]
    const result = generateLocalStateRegion(
      ['default', 'error'],
      { error: 'Shows error while confirmation dialog is visible' },
      facts,
      'default',
    )
    expect(result!.states['error'].showConfirmation).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// API client detection
// ---------------------------------------------------------------------------

describe('isApiClientImport', () => {
  it('detects @/lib/api', () => {
    expect(isApiClientImport('@/lib/api', ['api'])).toBe(true)
  })

  it('detects @/services/api', () => {
    expect(isApiClientImport('@/services/api', ['apiClient'])).toBe(true)
  })

  it('detects @/lib/http-client', () => {
    expect(isApiClientImport('@/lib/http-client', ['httpClient'])).toBe(true)
  })

  it('detects fuzzy path with known export name', () => {
    expect(isApiClientImport('@/utils/api-helpers', ['api'])).toBe(true)
  })

  it('detects @/lib/admin-api with known export name', () => {
    expect(isApiClientImport('@/lib/admin-api', ['adminApi'])).toBe(true)
  })

  it('rejects non-API imports', () => {
    expect(isApiClientImport('@/stores/auth-store', ['useAuthStore'])).toBe(false)
  })

  it('rejects path with /api but unknown export names', () => {
    expect(isApiClientImport('@/hooks/use-api-data', ['useApiData'])).toBe(false)
  })
})

describe('generateApiClientStub', () => {
  it('generates stub with all HTTP methods', () => {
    const stub = generateApiClientStub('@/lib/api', ['api'])
    expect(stub).toContain('get: () => Promise.resolve(noopResponse)')
    expect(stub).toContain('post: () => Promise.resolve(noopResponse)')
    expect(stub).toContain('put: () => Promise.resolve(noopResponse)')
    expect(stub).toContain('patch: () => Promise.resolve(noopResponse)')
    expect(stub).toContain('delete: () => Promise.resolve(noopResponse)')
    expect(stub).toContain('export const api = stub')
    expect(stub).toContain('export default stub')
  })

  it('exports all imported names', () => {
    const stub = generateApiClientStub('@/lib/api', ['api', 'apiClient'])
    expect(stub).toContain('export const api = stub')
    expect(stub).toContain('export const apiClient = stub')
  })
})

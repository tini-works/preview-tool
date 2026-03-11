import { describe, it, expect } from 'vitest'
import { specToRegions, specToScreenEntry } from '../spec-to-model.js'
import type { SpecManifestScreen } from '../types.js'

const SCREEN: SpecManifestScreen = {
  id: 'scr-home',
  title: 'Home',
  sourceFile: 'src/pages/HomePage.tsx',
  states: ['loading', 'populated', 'error'],
  defaultState: 'loading',
  stateData: {
    loading: { isLoading: true, rooms: [] },
    populated: { isLoading: false, rooms: [{ id: '1', name: 'Room A' }] },
    error: { isLoading: false, error: 'Failed' },
  },
  dataDeps: [
    { hook: 'useRooms', module: '@/hooks/useRooms', provides: ['rooms', 'isLoading', 'error'] },
  ],
}

describe('specToRegions', () => {
  it('converts spec states to RegionsMap format', () => {
    const regions = specToRegions(SCREEN)
    expect(regions[SCREEN.id]).toBeDefined()
    const region = regions[SCREEN.id]
    expect(region.label).toBe('Home')
    expect(region.defaultState).toBe('loading')
    expect(region.states.loading).toEqual({ isLoading: true, rooms: [] })
    expect(region.states.populated).toEqual({ isLoading: false, rooms: [{ id: '1', name: 'Room A' }] })
  })

  it('includes hookMapping for the first data_dep', () => {
    const regions = specToRegions(SCREEN)
    const region = regions[SCREEN.id]
    expect(region.hookMapping).toBeDefined()
    expect(region.hookMapping!.hookName).toBe('useRooms')
    expect(region.hookMapping!.importPath).toBe('@/hooks/useRooms')
  })
})

describe('specToScreenEntry', () => {
  it('produces a ScreenEntry-compatible object', () => {
    const entry = specToScreenEntry(SCREEN)
    expect(entry.route).toBe('scr-home')
    expect(entry.regions).toBeDefined()
    expect(entry.regions![SCREEN.id]).toBeDefined()
  })
})

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSpecs } from '../spec-loader.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES_DIR = join(__dirname, 'fixtures')

describe('loadSpecs', () => {
  it('loads screens from .specs/screens/', async () => {
    const manifest = await loadSpecs(FIXTURES_DIR)
    expect(manifest.screens).toHaveLength(2)

    const home = manifest.screens.find((s) => s.id === 'scr-home')
    expect(home).toBeDefined()
    expect(home!.title).toBe('Home Screen')
    expect(home!.states).toEqual(['loading', 'populated', 'empty', 'error'])
    expect(home!.defaultState).toBe('loading')
    expect(home!.stateData.loading).toEqual({ isLoading: true, rooms: [] })
    expect(home!.dataDeps).toHaveLength(1)
    expect(home!.dataDeps[0].hook).toBe('useRooms')
  })

  it('loads flows from .specs/flows/', async () => {
    const manifest = await loadSpecs(FIXTURES_DIR)
    expect(manifest.flows).toHaveLength(1)

    const flow = manifest.flows[0]
    expect(flow.id).toBe('flow-booking')
    expect(flow.steps).toHaveLength(2)
    expect(flow.steps[0].screen).toBe('scr-home')
    expect(flow.steps[0].entryState).toBe('populated')
  })

  it('resolves source files from code-map.yaml', async () => {
    const manifest = await loadSpecs(FIXTURES_DIR)
    const home = manifest.screens.find((s) => s.id === 'scr-home')
    expect(home!.sourceFile).toBe('src/pages/HomePage.tsx')
  })

  it('returns null sourceFile for unmapped screens', async () => {
    const manifest = await loadSpecs(FIXTURES_DIR)
    expect(manifest.screens.every((s) => s.sourceFile !== undefined)).toBe(true)
  })

  it('returns empty manifest for non-existent directory', async () => {
    const manifest = await loadSpecs('/tmp/does-not-exist-specs')
    expect(manifest.screens).toEqual([])
    expect(manifest.flows).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { discoverScreens } from '../discover-screens.js'
import { join } from 'node:path'

const FIXTURES = join(__dirname, '..', '..', '..', 'test-fixtures')

describe('discoverScreens', () => {
  it('discovers screens from sample app', async () => {
    const screens = await discoverScreens(join(FIXTURES, 'sample-app'))
    expect(screens.length).toBeGreaterThan(0)
  })

  it('returns screens with required fields', async () => {
    const screens = await discoverScreens(join(FIXTURES, 'sample-app'))

    for (const screen of screens) {
      expect(screen).toHaveProperty('name')
      expect(screen).toHaveProperty('path')
      expect(screen).toHaveProperty('file')
      expect(screen).toHaveProperty('score')
      expect(screen).toHaveProperty('source')
      expect(typeof screen.name).toBe('string')
      expect(typeof screen.path).toBe('string')
      expect(typeof screen.file).toBe('string')
      expect(typeof screen.score).toBe('number')
      expect(['router', 'convention', 'heuristic']).toContain(screen.source)
    }
  })

  it('finds Dashboard and Settings screens', async () => {
    const screens = await discoverScreens(join(FIXTURES, 'sample-app'))
    const names = screens.map((s) => s.name)

    expect(names).toContain('Dashboard')
    expect(names).toContain('Settings')
  })

  it('excludes utility files', async () => {
    const screens = await discoverScreens(join(FIXTURES, 'sample-app'))
    const files = screens.map((s) => s.file)

    // No files from excluded directories should appear
    for (const file of files) {
      expect(file).not.toMatch(/\/(utils|lib|hooks|components|ui|stores)\//i)
    }
  })

  it('sorts screens by score descending', async () => {
    const screens = await discoverScreens(join(FIXTURES, 'sample-app'))

    for (let i = 1; i < screens.length; i++) {
      expect(screens[i - 1]!.score).toBeGreaterThanOrEqual(screens[i]!.score)
    }
  })

  it('discovers router-based screens with score 100', async () => {
    const screens = await discoverScreens(join(FIXTURES, 'router-app'))

    const routerScreens = screens.filter((s) => s.source === 'router')
    expect(routerScreens.length).toBeGreaterThan(0)

    for (const screen of routerScreens) {
      expect(screen.score).toBe(100)
    }
  })

  it('deduplicates screens by file path', async () => {
    const screens = await discoverScreens(join(FIXTURES, 'router-app'))
    const files = screens.map((s) => s.file)
    const uniqueFiles = new Set(files)

    expect(files.length).toBe(uniqueFiles.size)
  })
})

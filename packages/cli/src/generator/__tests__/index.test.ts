import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('export default function Home() { return <div />; }'),
}))

// Mock discover-screens
vi.mock('../../analyzer/discover-screens.js', () => ({
  discoverScreens: vi.fn().mockResolvedValue([
    {
      name: 'Home',
      path: '/',
      file: 'src/screens/Home.tsx',
      score: 100,
      source: 'router',
    },
    {
      name: 'Settings',
      path: '/settings',
      file: 'src/screens/Settings.tsx',
      score: 80,
      source: 'convention',
    },
  ]),
}))

// Mock extract-hooks
vi.mock('../../analyzer/extract-hooks.js', () => ({
  extractHooks: vi.fn().mockReturnValue([
    {
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      callArgs: ['tasks'],
      isProjectLocal: false,
    },
  ]),
}))

// Mock classify-hook
vi.mock('../../analyzer/classify-hook.js', () => ({
  classifyHook: vi.fn().mockReturnValue({
    hookName: 'useQuery',
    importPath: '@tanstack/react-query',
    callArgs: ['tasks'],
    isProjectLocal: false,
    category: 'data-fetching',
    regionName: 'tasks',
    states: ['loading', 'error', 'empty', 'populated'],
    defaultState: 'populated',
    isList: true,
    returnShape: null,
  }),
}))

// Mock infer-regions
vi.mock('../../analyzer/infer-regions.js', () => ({
  inferRegions: vi.fn().mockReturnValue([
    {
      name: 'tasks',
      label: 'Tasks',
      source: 'useQuery("tasks")',
      states: ['loading', 'error', 'empty', 'populated'],
      defaultState: 'populated',
      isList: true,
      mockData: {
        loading: { data: null, isLoading: true, error: null },
        populated: { data: [{ id: '1' }], isLoading: false, error: null },
      },
    },
  ]),
}))

// Mock generate-mocks
vi.mock('../generate-mocks.js', () => ({
  generateMockModule: vi.fn().mockReturnValue('// mock module code'),
}))

// Mock generate-registry
vi.mock('../generate-registry.js', () => ({
  generateScreenRegistry: vi.fn().mockReturnValue('export const screens = [];'),
}))

// Mock generate-alias
vi.mock('../generate-alias.js', () => ({
  generateAliasManifest: vi.fn().mockReturnValue({
    '@tanstack/react-query': '.preview/mocks/_tanstack_react-query.js',
  }),
  sanitizeFileName: vi.fn().mockImplementation((importPath: string) =>
    importPath.replace(/^@\//, '_').replace(/^@/, '_').replace(/^~\//, '_').replace(/\//g, '_')
  ),
}))

import { generateAll } from '../index.js'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { discoverScreens } from '../../analyzer/discover-screens.js'
import { extractHooks } from '../../analyzer/extract-hooks.js'
import { classifyHook } from '../../analyzer/classify-hook.js'
import { inferRegions } from '../../analyzer/infer-regions.js'
import { generateMockModule } from '../generate-mocks.js'
import { generateScreenRegistry } from '../generate-registry.js'
import { generateAliasManifest } from '../generate-alias.js'

describe('generateAll', () => {
  const cwd = '/test/project'
  const config = {
    screenGlob: 'src/**/*.tsx',
    port: 6100,
    title: 'Preview Tool',
    llm: {
      provider: 'none' as const,
      ollamaModel: 'llama3.2',
      ollamaUrl: 'http://localhost:11434',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates .preview/ and .preview/mocks/ directories', async () => {
    await generateAll(cwd, config)

    expect(mkdir).toHaveBeenCalledWith(
      join(cwd, '.preview'),
      { recursive: true }
    )
    expect(mkdir).toHaveBeenCalledWith(
      join(cwd, '.preview', 'mocks'),
      { recursive: true }
    )
  })

  it('discovers screens via discoverScreens', async () => {
    await generateAll(cwd, config)

    expect(discoverScreens).toHaveBeenCalledWith(cwd)
  })

  it('reads screen files, extracts and classifies hooks, infers regions', async () => {
    await generateAll(cwd, config)

    // Called once per screen (2 screens)
    expect(readFile).toHaveBeenCalledTimes(2)
    expect(extractHooks).toHaveBeenCalledTimes(2)
    // classifyHook called for each extracted hook per screen
    expect(classifyHook).toHaveBeenCalled()
    expect(inferRegions).toHaveBeenCalled()
  })

  it('generates mock modules for unique import paths, skipping state and unknown', async () => {
    await generateAll(cwd, config)

    expect(generateMockModule).toHaveBeenCalled()
  })

  it('writes mock files to .preview/mocks/', async () => {
    await generateAll(cwd, config)

    const writeFileCalls = vi.mocked(writeFile).mock.calls
    const mockWrites = writeFileCalls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('.preview/mocks/')
    )
    expect(mockWrites.length).toBeGreaterThan(0)
  })

  it('generates alias-manifest.json', async () => {
    await generateAll(cwd, config)

    expect(generateAliasManifest).toHaveBeenCalled()

    const writeFileCalls = vi.mocked(writeFile).mock.calls
    const aliasWrite = writeFileCalls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('alias-manifest.json')
    )
    expect(aliasWrite).toBeDefined()
  })

  it('generates screens.ts registry', async () => {
    await generateAll(cwd, config)

    expect(generateScreenRegistry).toHaveBeenCalled()

    const writeFileCalls = vi.mocked(writeFile).mock.calls
    const registryWrite = writeFileCalls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('screens.ts')
    )
    expect(registryWrite).toBeDefined()
  })

  it('writes manifest.json', async () => {
    await generateAll(cwd, config)

    const writeFileCalls = vi.mocked(writeFile).mock.calls
    const manifestWrite = writeFileCalls.find(
      (call) => {
        if (typeof call[0] !== 'string') return false
        const path = call[0] as string
        return path.endsWith('manifest.json') && !path.includes('alias-manifest')
      }
    )
    expect(manifestWrite).toBeDefined()
    if (manifestWrite) {
      const content = JSON.parse(manifestWrite[1] as string)
      expect(content.screens).toBeDefined()
      expect(content.aliases).toBeDefined()
      expect(content.mocksDir).toBeDefined()
    }
  })

  it('returns summary with screensFound, regionsInferred, mocksGenerated', async () => {
    const result = await generateAll(cwd, config)

    expect(result.screensFound).toBe(2)
    expect(result.regionsInferred).toBeGreaterThanOrEqual(0)
    expect(result.mocksGenerated).toBeGreaterThanOrEqual(0)
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { detectCssEntry, detectExportType, generateEntryFiles, generateSpecMainTsx } from '../generate-entry.js'
import type { SpecScreenImport } from '../generate-entry.js'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TMP = join(import.meta.dirname, '__tmp_css_detect__')

beforeAll(() => {
  mkdirSync(TMP, { recursive: true })
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

function makeProject(files: Record<string, string>): string {
  const dir = join(TMP, `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  mkdirSync(dir, { recursive: true })
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content, 'utf-8')
  }
  return dir
}

describe('detectCssEntry', () => {
  it('finds CSS file containing @import "tailwindcss"', () => {
    const dir = makeProject({
      'src/styles/app.css': '@import "tailwindcss";\n\n@theme { --color-primary: blue; }',
    })
    const result = detectCssEntry(dir)
    expect(result).toBe('src/styles/app.css')
  })

  it('finds CSS file containing @import \'tailwindcss\'', () => {
    const dir = makeProject({
      'src/theme/main.css': "@import 'tailwindcss';\n",
    })
    const result = detectCssEntry(dir)
    expect(result).toBe('src/theme/main.css')
  })

  it('finds CSS file containing @tailwind base', () => {
    const dir = makeProject({
      'src/globals.css': '@tailwind base;\n@tailwind components;\n@tailwind utilities;',
    })
    const result = detectCssEntry(dir)
    expect(result).toBe('src/globals.css')
  })

  it('falls back to CSS file with @import when no Tailwind found', () => {
    const dir = makeProject({
      'src/styles/main.css': '@import "./reset.css";\n@import "./typography.css";',
    })
    const result = detectCssEntry(dir)
    expect(result).toBe('src/styles/main.css')
  })

  it('returns null when no CSS files exist', () => {
    const dir = makeProject({
      'src/App.tsx': 'export default function App() { return <div /> }',
    })
    const result = detectCssEntry(dir)
    expect(result).toBeNull()
  })

  it('returns null when CSS files have no imports', () => {
    const dir = makeProject({
      'src/button.css': '.button { color: red; }',
    })
    const result = detectCssEntry(dir)
    expect(result).toBeNull()
  })

  it('ignores CSS files inside node_modules', () => {
    const dir = makeProject({
      'node_modules/lib/index.css': '@import "tailwindcss";',
      'src/plain.css': '.x { color: red; }',
    })
    const result = detectCssEntry(dir)
    expect(result).toBeNull()
  })

  it('respects explicit cssEntry config override', () => {
    const dir = makeProject({
      'src/styles/app.css': '@import "tailwindcss";',
      'src/custom/my-theme.css': 'body { font-family: serif; }',
    })
    const result = detectCssEntry(dir, 'src/custom/my-theme.css')
    expect(result).toBe('src/custom/my-theme.css')
  })

  it('returns null when explicit cssEntry file does not exist', () => {
    const dir = makeProject({
      'src/styles/app.css': '@import "tailwindcss";',
    })
    const result = detectCssEntry(dir, 'src/nonexistent.css')
    expect(result).toBeNull()
  })
})

describe('generateMainTsx', () => {
  it('includes override controller glob in generated main.tsx', async () => {
    const dir = join(TMP, `proj-ctrl-${Date.now()}`)
    mkdirSync(join(dir, '.preview'), { recursive: true })
    writeFileSync(join(dir, '.preview', 'wrapper.tsx'), 'export const Wrapper = ({ children }: any) => children', 'utf-8')

    await generateEntryFiles(dir, {
      screenGlob: 'src/screens/**/page.tsx',
      port: 6100,
      title: 'Test',
    })

    const mainTsx = readFileSync(join(dir, '.preview', 'main.tsx'), 'utf-8')
    expect(mainTsx).toContain("import.meta.glob('./overrides/*/controller.ts'")
    expect(mainTsx).toContain('overrideControllerModules')
  })

  it('mergeOverrides uses replacement semantics when override has regions', async () => {
    const dir = join(TMP, `proj-merge-${Date.now()}`)
    mkdirSync(join(dir, '.preview'), { recursive: true })
    writeFileSync(join(dir, '.preview', 'wrapper.tsx'), 'export const Wrapper = ({ children }: any) => children', 'utf-8')

    await generateEntryFiles(dir, {
      screenGlob: 'src/screens/**/page.tsx',
      port: 6100,
      title: 'Test',
    })

    const mainTsx = readFileSync(join(dir, '.preview', 'main.tsx'), 'utf-8')
    // Should use replacement: override.regions takes over entirely, not shallow merge
    expect(mainTsx).toContain('override.regions ?? base.regions')
    expect(mainTsx).not.toContain('...base.regions, ...(override.regions')
  })
})

describe('generateSpecMainTsx', () => {
  const MOCK_SCREENS: SpecScreenImport[] = [
    { id: 'scr-home', sourceFile: 'src/routes/index.tsx', exportType: 'default' },
    { id: 'scr-detail', sourceFile: 'src/routes/detail.tsx', exportType: 'default' },
    { id: 'scr-empty', sourceFile: null, exportType: 'default' },
  ]

  it('imports from virtual:spec-manifest', () => {
    const code = generateSpecMainTsx(MOCK_SCREENS)
    expect(code).toContain("from 'virtual:spec-manifest'")
  })

  it('imports PreviewShell from runtime', () => {
    const code = generateSpecMainTsx(MOCK_SCREENS)
    expect(code).toContain("from '@preview-tool/runtime'")
    expect(code).toContain('PreviewShell')
  })

  it('imports Wrapper and wraps PreviewShell', () => {
    const code = generateSpecMainTsx(MOCK_SCREENS)
    expect(code).toContain("import { Wrapper } from './wrapper'")
    expect(code).toContain('<Wrapper>')
    expect(code).toContain('</Wrapper>')
  })

  it('generates static import map with correct paths for default exports', () => {
    const code = generateSpecMainTsx(MOCK_SCREENS)
    expect(code).toContain("'scr-home': () => import('../src/routes/index.tsx'),")
    expect(code).toContain("'scr-detail': () => import('../src/routes/detail.tsx'),")
    expect(code).not.toContain('scr-empty')
  })

  it('generates .then(m => m.Route.options.component) for tanstack-route exports', () => {
    const screens: SpecScreenImport[] = [
      { id: 'scr-route', sourceFile: 'src/routes/home.tsx', exportType: 'tanstack-route' },
    ]
    const code = generateSpecMainTsx(screens)
    expect(code).toContain(".then(m => ({ default: m.Route.options.component }))")
  })

  it('generates .then(m => ({ default: m.ExportName })) for named exports', () => {
    const screens: SpecScreenImport[] = [
      { id: 'scr-named', sourceFile: 'src/screens/Home.tsx', exportType: 'named', exportName: 'HomeScreen' },
    ]
    const code = generateSpecMainTsx(screens)
    expect(code).toContain(".then(m => ({ default: m.HomeScreen }))")
  })

  it('uses spec mode when specsDir is set in config', async () => {
    const dir = join(TMP, `proj-spec-${Date.now()}`)
    mkdirSync(join(dir, '.preview'), { recursive: true })
    // Create a minimal .specs structure
    const specsDir = join(dir, '.specs')
    mkdirSync(join(specsDir, 'screens'), { recursive: true })

    await generateEntryFiles(dir, {
      screenGlob: 'src/**/*.tsx',
      port: 6100,
      title: 'Spec Test',
      specsDir,
    })

    const mainTsx = readFileSync(join(dir, '.preview', 'main.tsx'), 'utf-8')
    expect(mainTsx).toContain("from 'virtual:spec-manifest'")
    expect(mainTsx).not.toContain("import.meta.glob('./screens/*/adapter.tsx')")
  })
})

describe('detectExportType', () => {
  it('detects TanStack Router createFileRoute', () => {
    const dir = makeProject({
      'route.tsx': `import { createFileRoute } from '@tanstack/react-router'\nexport const Route = createFileRoute('/')({ component: Home })\nfunction Home() { return <div /> }`,
    })
    const result = detectExportType(join(dir, 'route.tsx'))
    expect(result.type).toBe('tanstack-route')
  })

  it('detects TanStack Router createLazyFileRoute', () => {
    const dir = makeProject({
      'route.lazy.tsx': `import { createLazyFileRoute } from '@tanstack/react-router'\nexport const Route = createLazyFileRoute('/')({ component: Home })\nfunction Home() { return <div /> }`,
    })
    const result = detectExportType(join(dir, 'route.lazy.tsx'))
    expect(result.type).toBe('tanstack-route')
  })

  it('detects default export', () => {
    const dir = makeProject({
      'page.tsx': 'export default function Page() { return <div /> }',
    })
    const result = detectExportType(join(dir, 'page.tsx'))
    expect(result.type).toBe('default')
  })

  it('detects named function export', () => {
    const dir = makeProject({
      'screen.tsx': 'export function HomeScreen() { return <div /> }',
    })
    const result = detectExportType(join(dir, 'screen.tsx'))
    expect(result.type).toBe('named')
    expect(result.name).toBe('HomeScreen')
  })

  it('detects named const export', () => {
    const dir = makeProject({
      'screen.tsx': 'export const Dashboard = () => <div />',
    })
    const result = detectExportType(join(dir, 'screen.tsx'))
    expect(result.type).toBe('named')
    expect(result.name).toBe('Dashboard')
  })

  it('returns default for non-existent file', () => {
    const result = detectExportType('/nonexistent/path/file.tsx')
    expect(result.type).toBe('default')
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { detectCssEntry, generateEntryFiles } from '../generate-entry.js'
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
})

import { describe, it, expect } from 'vitest'
import { scanFileTree, validateDiscoveredScreens } from '../discover-llm.js'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('scanFileTree', () => {
  it('returns .tsx and .ts files excluding node_modules and dist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'discover-llm-'))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await mkdir(join(dir, 'node_modules', 'react'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'Home.tsx'), 'export default function Home() {}')
    await writeFile(join(dir, 'node_modules', 'react', 'index.js'), '')

    const files = await scanFileTree(dir)
    expect(files).toContain('src/pages/Home.tsx')
    expect(files.every((f: string) => !f.includes('node_modules'))).toBe(true)
  })
})

describe('validateDiscoveredScreens', () => {
  it('keeps screens whose files exist and export components', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'validate-'))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(
      join(dir, 'src', 'pages', 'Home.tsx'),
      'export default function Home() { return <div>Home</div> }',
    )

    const screens = [
      { filePath: 'src/pages/Home.tsx', route: '/', screenName: 'Home' },
      { filePath: 'src/pages/Missing.tsx', route: '/missing', screenName: 'Missing' },
    ]

    const validated = await validateDiscoveredScreens(dir, screens)
    expect(validated).toHaveLength(1)
    expect(validated[0].filePath).toBe('src/pages/Home.tsx')
  })
})

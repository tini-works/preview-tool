import { describe, it, expect } from 'vitest'
import { detectFramework } from '../detect-framework.js'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('detectFramework', () => {
  it('detects React + Vite with src/pages/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0' },
      devDependencies: { vite: '^6.0.0' },
      scripts: { dev: 'vite' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), 'export default function Home() {}')

    const result = await detectFramework(dir)

    expect(result.name).toBe('react')
    expect(result.bundler).toBe('vite')
    expect(result.pagePattern).toBe('src/pages/**/*.tsx')
  })

  it('detects React + Vite with src/screens/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0' },
      devDependencies: { vite: '^6.0.0' },
      scripts: { dev: 'vite' },
    }))
    await mkdir(join(dir, 'src', 'screens', 'login'), { recursive: true })
    await writeFile(join(dir, 'src', 'screens', 'login', 'index.tsx'), 'export default function Login() {}')

    const result = await detectFramework(dir)

    expect(result.pagePattern).toBe('src/screens/**/index.tsx')
  })

  it('detects i18n when react-i18next is present', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', 'react-i18next': '^15.0.0' },
      devDependencies: { vite: '^6.0.0' },
      scripts: { dev: 'vite' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.providers).toContain('react-i18next')
  })

  it('throws when no package.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await expect(detectFramework(dir)).rejects.toThrow('No package.json')
  })
})

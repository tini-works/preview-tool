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

  it('returns null devToolStorePath when no DevToolStore exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.devToolStorePath).toBeNull()
  })

  it('detects devToolStorePath when DevToolStore with Zustand exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', zustand: '^5.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'devtool'), { recursive: true })
    await writeFile(join(dir, 'src', 'devtool', 'devtool-store.ts'), `
import { create } from 'zustand'
export const useDevToolStore = create<DevToolState>((set) => ({
  sectionStates: {},
  setSectionState: (id, state) => set((s) => ({ sectionStates: { ...s.sectionStates, [id]: state } })),
  setTestMode: (enabled) => set({ isTestMode: enabled }),
}))
`)
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.devToolStorePath).toBe('src/devtool/devtool-store.ts')
  })

  it('parses devToolConfig when config file exists alongside store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', zustand: '^5.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'devtool'), { recursive: true })
    await writeFile(join(dir, 'src', 'devtool', 'devtool-store.ts'), `
import { create } from 'zustand'
export const useDevToolStore = create<State>((set) => ({
  sectionStates: {},
  setSectionState: (id, state) => set((s) => ({ sectionStates: { ...s.sectionStates, [id]: state } })),
}))
`)
    await writeFile(join(dir, 'src', 'devtool', 'config.ts'), `
export const devToolPages = {
  HomePage: {
    label: 'Home',
    path: '/',
    sections: [
      { id: 'service-grid', label: 'Service Grid', states: ['populated', 'loading', 'empty', 'error'] },
    ],
  },
  Dashboard: {
    label: 'Dashboard',
    path: '/dashboard',
    sections: [
      { id: 'stats', label: 'Stats Cards', states: ['populated', 'loading'] },
      { id: 'upcoming', label: 'Upcoming List', states: ['populated', 'loading', 'empty'] },
    ],
  },
}
`)
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.devToolConfig).not.toBeNull()
    expect(result.devToolConfig!.pages).toHaveLength(2)
    expect(result.devToolConfig!.pages[0]).toEqual({
      route: '/',
      sections: [{ id: 'service-grid', label: 'Service Grid', states: ['populated', 'loading', 'empty', 'error'] }],
    })
    expect(result.devToolConfig!.pages[1].sections).toHaveLength(2)
    expect(result.devToolConfig!.pages[1].sections[0].id).toBe('stats')
    expect(result.devToolConfig!.pages[1].sections[1].id).toBe('upcoming')
  })

  it('skips DevToolStore without setSectionState', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', zustand: '^5.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'devtool'), { recursive: true })
    await writeFile(join(dir, 'src', 'devtool', 'devtool-store.ts'), `
import { create } from 'zustand'
export const useStore = create((set) => ({ count: 0 }))
`)
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.devToolStorePath).toBeNull()
  })
})

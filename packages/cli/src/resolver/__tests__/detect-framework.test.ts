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

  it('detects i18n config at non-standard path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', 'react-i18next': '^15.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'lib'), { recursive: true })
    await writeFile(join(dir, 'src', 'lib', 'i18n.ts'), `
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
i18next.use(initReactI18next).init({ fallbackLng: 'en' })
export default i18next
`)
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.i18nPath).toBe('src/lib/i18n.ts')
  })

  it('returns null i18nPath when react-i18next is not present', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.i18nPath).toBeNull()
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

  it('detects react-hook-form as a provider', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', 'react-hook-form': '^7.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.providers).toContain('react-hook-form')
  })

  it('does not detect zustand or bare redux as providers, but detects @reduxjs/toolkit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', zustand: '^5.0.0', redux: '^5.0.0', '@reduxjs/toolkit': '^2.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.providers).not.toContain('zustand')
    expect(result.providers).not.toContain('redux')
    expect(result.providers).toContain('@reduxjs/toolkit')
  })

  it('detects jotai as a provider', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', jotai: '^2.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.providers).toContain('jotai')
  })

  it('detects mobx-react-lite as a provider', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', 'mobx-react-lite': '^4.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.providers).toContain('mobx-react-lite')
  })

  it('detects styled-components as a provider', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', 'styled-components': '^6.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.providers).toContain('styled-components')
  })

  it('detects @emotion/react as a provider', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', '@emotion/react': '^11.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.providers).toContain('@emotion/react')
  })

  it('does not detect @reduxjs/toolkit as provider when it is absent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'test-'))
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      dependencies: { react: '^19.0.0', 'react-redux': '^9.0.0' },
      devDependencies: { vite: '^6.0.0' },
    }))
    await mkdir(join(dir, 'src', 'pages'), { recursive: true })
    await writeFile(join(dir, 'src', 'pages', 'home.tsx'), '')

    const result = await detectFramework(dir)

    expect(result.providers).not.toContain('@reduxjs/toolkit')
    expect(result.providers).not.toContain('react-redux')
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

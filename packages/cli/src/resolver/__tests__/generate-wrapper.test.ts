import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateWrapperCode, syncWrapperProviders } from '../generate-wrapper.js'

describe('generateWrapperCode', () => {
  it('generates empty wrapper when no providers', () => {
    const code = generateWrapperCode([])
    expect(code).toContain('export function Wrapper')
    expect(code).toContain('{children}')
    expect(code).not.toContain('QueryClientProvider')
  })

  it('wraps with QueryClientProvider for @tanstack/react-query', () => {
    const code = generateWrapperCode(['@tanstack/react-query'])
    expect(code).toContain('QueryClientProvider')
    expect(code).toContain('QueryClient')
    expect(code).toContain("from '@tanstack/react-query'")
  })

  it('wraps with MemoryRouter for react-router-dom', () => {
    const code = generateWrapperCode(['react-router-dom'])
    expect(code).toContain('MemoryRouter')
    expect(code).toContain("from 'react-router-dom'")
  })

  it('wraps with I18nextProvider for react-i18next', () => {
    const code = generateWrapperCode(['react-i18next'])
    expect(code).toContain('I18nextProvider')
    expect(code).toContain("from 'react-i18next'")
  })

  it('generates I18nSyncWrapper that syncs language from Zustand', () => {
    const code = generateWrapperCode(['react-i18next'])
    expect(code).toContain('function I18nSyncWrapper')
    expect(code).toContain('useDevToolsStore')
    expect(code).toContain('i18n.changeLanguage')
    expect(code).toContain('<I18nSyncWrapper>')
    expect(code).toContain('</I18nSyncWrapper>')
    const wrapperBody = code.slice(code.indexOf('export function Wrapper'))
    expect(wrapperBody).not.toContain('<I18nextProvider')
  })

  it('I18nSyncWrapper imports useEffect and useDevToolsStore', () => {
    const code = generateWrapperCode(['react-i18next'])
    expect(code).toContain("import { useEffect } from 'react'")
    expect(code).toContain("import { useDevToolsStore } from '@preview-tool/runtime'")
  })

  it('nests multiple providers in correct order', () => {
    const code = generateWrapperCode(['@tanstack/react-query', 'react-router-dom', 'react-i18next'])
    const qcpIdx = code.indexOf('QueryClientProvider')
    const routerIdx = code.indexOf('MemoryRouter')
    const i18nIdx = code.indexOf('<I18nSyncWrapper>')
    expect(qcpIdx).toBeLessThan(routerIdx)
    expect(routerIdx).toBeLessThan(i18nIdx)
  })

  it('wraps with TanStackRouterWrapper for @tanstack/react-router', () => {
    const code = generateWrapperCode(['@tanstack/react-router'])
    expect(code).toContain('RouterProvider')
    expect(code).toContain('createRouter')
    expect(code).toContain('createRootRoute')
    expect(code).toContain('createMemoryHistory')
    expect(code).toContain("from '@tanstack/react-router'")
    expect(code).toContain('TanStackRouterWrapper')
    expect(code).toContain('<TanStackRouterWrapper>')
    expect(code).toContain('</TanStackRouterWrapper>')
  })

  it('ignores unknown providers', () => {
    const code = generateWrapperCode(['zustand', 'some-unknown-lib'])
    expect(code).toContain('export function Wrapper')
    expect(code).not.toContain('zustand')
  })

  it('does not include state bridge (removed in favor of module aliasing)', () => {
    const code = generateWrapperCode(['react-router-dom'])
    expect(code).not.toContain('useStateBridge')
    expect(code).not.toContain('useDevToolsStore')
    expect(code).toContain('MemoryRouter')
  })

  // -----------------------------------------------------------------------
  // react-hook-form FormProvider
  // -----------------------------------------------------------------------

  it('wraps with FormProvider for react-hook-form', () => {
    const code = generateWrapperCode(['react-hook-form'])
    expect(code).toContain('FormProvider')
    expect(code).toContain('useForm')
    expect(code).toContain("from 'react-hook-form'")
    expect(code).toContain('const methods = useForm()')
    expect(code).toContain('<FormProvider {...methods}>')
    expect(code).toContain('</FormProvider>')
  })

  // -----------------------------------------------------------------------
  // Route parameter support
  // -----------------------------------------------------------------------

  it('uses MemoryRouter with initialEntries when route is provided', () => {
    const code = generateWrapperCode(['react-router-dom'], '/register')
    expect(code).toContain("initialEntries={['/register']}")
    expect(code).toContain('MemoryRouter')
  })

  it('uses plain MemoryRouter when no route is provided', () => {
    const code = generateWrapperCode(['react-router-dom'])
    expect(code).toContain('<MemoryRouter>')
    expect(code).not.toContain('initialEntries')
  })

  it('route parameter does not affect non-router providers', () => {
    const code = generateWrapperCode(['@tanstack/react-query'], '/some-route')
    expect(code).not.toContain('initialEntries')
    expect(code).toContain('QueryClientProvider')
  })
})

// ---------------------------------------------------------------------------
// syncWrapperProviders
// ---------------------------------------------------------------------------

describe('syncWrapperProviders', () => {
  let tmpDir: string
  let wrapperPath: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `preview-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    wrapperPath = join(tmpDir, 'wrapper.tsx')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates wrapper if file is missing', () => {
    const updated = syncWrapperProviders(wrapperPath, ['react-router-dom'])
    expect(updated).toBe(true)
    expect(existsSync(wrapperPath)).toBe(true)
    const content = readFileSync(wrapperPath, 'utf-8')
    expect(content).toContain('MemoryRouter')
  })

  it('skips sync when all providers already present', () => {
    const initial = generateWrapperCode(['react-router-dom', '@tanstack/react-query'])
    writeFileSync(wrapperPath, initial, 'utf-8')

    const updated = syncWrapperProviders(wrapperPath, ['react-router-dom', '@tanstack/react-query'])
    expect(updated).toBe(false)
  })

  it('updates wrapper when new provider detected', () => {
    const initial = generateWrapperCode(['react-router-dom'])
    writeFileSync(wrapperPath, initial, 'utf-8')

    const updated = syncWrapperProviders(wrapperPath, ['react-router-dom', '@tanstack/react-query'])
    expect(updated).toBe(true)
    const content = readFileSync(wrapperPath, 'utf-8')
    expect(content).toContain('MemoryRouter')
    expect(content).toContain('QueryClientProvider')
  })

  it('returns false when providers list is empty', () => {
    const initial = generateWrapperCode([])
    writeFileSync(wrapperPath, initial, 'utf-8')

    const updated = syncWrapperProviders(wrapperPath, [])
    expect(updated).toBe(false)
  })
})

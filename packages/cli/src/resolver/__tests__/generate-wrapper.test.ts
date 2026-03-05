import { describe, it, expect } from 'vitest'
import { generateWrapperCode } from '../generate-wrapper.js'

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

  it('nests multiple providers in correct order', () => {
    const code = generateWrapperCode(['@tanstack/react-query', 'react-router-dom', 'react-i18next'])
    const qcpIdx = code.indexOf('QueryClientProvider')
    const routerIdx = code.indexOf('MemoryRouter')
    const i18nIdx = code.indexOf('I18nextProvider')
    expect(qcpIdx).toBeLessThan(routerIdx)
    expect(routerIdx).toBeLessThan(i18nIdx)
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

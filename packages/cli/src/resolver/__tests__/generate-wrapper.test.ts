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
})

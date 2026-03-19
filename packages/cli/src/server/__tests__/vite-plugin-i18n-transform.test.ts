import { describe, it, expect } from 'vitest'
import { transformI18n } from '../vite-plugin-i18n-transform.js'

const translatable = new Set(['Termin buchen', 'Willkommen', 'Fachrichtung suchen...'])
const index = {
  'Termin buchen': { en: 'Book Appointment' },
  'Willkommen': { en: 'Welcome' },
  'Fachrichtung suchen...': { en: 'Search specialty...' },
}

describe('transformI18n (AST-based)', () => {
  it('wraps JSX text with __pt()', () => {
    const code = `
function Page() {
  return <h1>Termin buchen</h1>
}
`
    const result = transformI18n(code, 'Page.tsx', translatable, index)
    expect(result).not.toBeNull()
    expect(result).toContain('__pt("Termin buchen")')
  })

  it('wraps translatable string props', () => {
    const code = `
function Page() {
  return <input placeholder="Fachrichtung suchen..." />
}
`
    const result = transformI18n(code, 'Page.tsx', translatable, index)
    expect(result).not.toBeNull()
    expect(result).toContain('__pt("Fachrichtung suchen...")')
  })

  it('injects __pt function and language subscription', () => {
    const code = `
export function Page() {
  return <h1>Termin buchen</h1>
}
`
    const result = transformI18n(code, 'Page.tsx', translatable, index)
    expect(result).not.toBeNull()
    expect(result).toContain('function __pt(s)')
    expect(result).toContain('__ptIdx')
    expect(result).toContain('const __lang = useDevToolsStore')
  })

  it('preserves non-translatable text', () => {
    const code = `
function Page() {
  return <div>
    <h1>Termin buchen</h1>
    <p>{user.name}</p>
  </div>
}
`
    const result = transformI18n(code, 'Page.tsx', translatable, index)
    expect(result).not.toBeNull()
    expect(result).toContain('__pt("Termin buchen")')
    expect(result).toContain('{user.name}')
  })

  it('returns null when no translatable strings found', () => {
    const code = `
function Page() {
  return <h1>Hello World</h1>
}
`
    const result = transformI18n(code, 'Page.tsx', translatable, index)
    expect(result).toBeNull()
  })

  it('does not wrap strings inside import declarations', () => {
    const code = `
import { something } from 'Termin buchen'
function Page() {
  return <h1>Termin buchen</h1>
}
`
    const result = transformI18n(code, 'Page.tsx', translatable, index)
    expect(result).not.toBeNull()
    // The import string should NOT be wrapped
    expect(result).toContain("from 'Termin buchen'")
    // The JSX text should be wrapped
    expect(result).toContain('__pt("Termin buchen")')
  })
})

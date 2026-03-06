import { describe, it, expect } from 'vitest'
import { camelToKebab } from '../usePreviewState.ts'

describe('camelToKebab', () => {
  it('converts simple camelCase to kebab-case', () => {
    expect(camelToKebab('showPassword')).toBe('show-password')
  })

  it('converts single word (lowercase) unchanged', () => {
    expect(camelToKebab('visible')).toBe('visible')
  })

  it('converts multiple humps', () => {
    expect(camelToKebab('isUserLoggedIn')).toBe('is-user-logged-in')
  })

  it('handles consecutive uppercase letters', () => {
    expect(camelToKebab('parseHTMLContent')).toBe('parse-html-content')
  })

  it('handles single character segments', () => {
    expect(camelToKebab('aB')).toBe('a-b')
  })

  it('handles already kebab-case input', () => {
    expect(camelToKebab('already-kebab')).toBe('already-kebab')
  })

  it('handles all lowercase', () => {
    expect(camelToKebab('count')).toBe('count')
  })

  it('handles numbers in the name', () => {
    expect(camelToKebab('step2Active')).toBe('step2-active')
  })
})

describe('usePreviewState module', () => {
  it('exports usePreviewState as a function', async () => {
    const mod = await import('../usePreviewState.ts')
    expect(typeof mod.usePreviewState).toBe('function')
  })

  it('exports camelToKebab as a function', async () => {
    const mod = await import('../usePreviewState.ts')
    expect(typeof mod.camelToKebab).toBe('function')
  })
})

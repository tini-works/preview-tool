import { describe, it, expect } from 'vitest'
import { generateMockAuthStore, generateMockDevToolStore } from '../generate-mock-stores.js'

describe('generateMockAuthStore', () => {
  it('generates a Zustand store with configurable mock user', () => {
    const code = generateMockAuthStore()
    expect(code).toContain('useAuthStore')
    expect(code).toContain('ADMIN')
    expect(code).toContain('CUSTOMER')
    expect(code).toContain('mock-token')
    expect(code).toContain('login')
    expect(code).toContain('logout')
    expect(code).toContain('initialize')
  })

  it('exports create for stores that re-export it', () => {
    const code = generateMockAuthStore()
    expect(code).toContain('export')
    expect(code).toContain('useAuthStore')
  })
})

describe('generateMockDevToolStore', () => {
  it('generates a no-op devtool store', () => {
    const code = generateMockDevToolStore()
    expect(code).toContain('useDevToolStore')
    expect(code).toContain('isTestMode')
    expect(code).toContain('setSectionState')
    expect(code).toContain('sectionStates')
  })
})

import { describe, it, expect } from 'vitest'
import { buildUnderstandScreensPrompt } from '../understand-screens.js'
import type { ScreenFacts } from '../../../analyzer/types.js'

describe('buildUnderstandScreensPrompt', () => {
  it('includes destructured fields for store hooks', () => {
    const facts: ScreenFacts[] = [{
      route: '/login',
      filePath: 'src/pages/LoginPage.tsx',
      sourceCode: 'const { login, isLoading, error, clearError } = useAuthStore()',
      hooks: [{
        name: 'useAuthStore',
        importPath: '@/stores/auth-store',
        arguments: [],
        returnVariable: '{ login, isLoading, error, clearError }',
        destructuredFields: ['login', 'isLoading', 'error', 'clearError'],
      }],
      components: [], conditionals: [], navigation: [],
    }]
    const prompt = buildUnderstandScreensPrompt(facts)
    expect(prompt).toContain('[fields: login, isLoading, error, clearError]')
  })

  it('omits fields annotation on hooks without destructuredFields', () => {
    const facts: ScreenFacts[] = [{
      route: '/home',
      filePath: 'src/pages/Home.tsx',
      sourceCode: 'const store = useAuthStore()',
      hooks: [{
        name: 'useAuthStore',
        importPath: '@/stores/auth-store',
        arguments: [],
        returnVariable: 'store',
      }],
      components: [], conditionals: [], navigation: [],
    }]
    const prompt = buildUnderstandScreensPrompt(facts)
    // The hook line itself should NOT have a [fields: ...] annotation
    const hookLine = prompt.split('\n').find(l => l.includes('useAuthStore()') && l.includes('stores/auth-store'))
    expect(hookLine).toBeDefined()
    expect(hookLine).not.toContain('[fields:')
  })

  it('includes store-specific guidance in rules', () => {
    const facts: ScreenFacts[] = [{
      route: '/test',
      filePath: 'test.tsx',
      sourceCode: '',
      hooks: [],
      components: [], conditionals: [], navigation: [],
    }]
    const prompt = buildUnderstandScreensPrompt(facts)
    expect(prompt).toContain('store hooks (useXxxStore)')
    expect(prompt).toContain('auto-stubbed')
    expect(prompt).toContain('States MUST be derived from the screen\'s ACTUAL conditional rendering')
    expect(prompt).toContain('defaultState should be the most common visual state')
  })
})

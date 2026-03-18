// packages/cli/src/generator/__tests__/universal-mock.test.ts
import { describe, it, expect } from 'vitest'
import { generateUniversalMock } from '../universal-mock.js'

describe('generateUniversalMock', () => {
  it('generates mock with region data lookup', () => {
    const code = generateUniversalMock({
      hookName: 'useAuthStore',
      regionKey: 'auth-store',
      importPath: '@/stores/auth-store',
      isBarrel: false,
      hasStaticGetState: false,
      returnStyle: 'object',
    })
    expect(code).toContain("export function useAuthStore")
    expect(code).toContain("useRegionDataForHook('auth-store')")
    expect(code).toContain("export * from '__real:@/stores/auth-store'")
  })

  it('adds .getState() when requested', () => {
    const code = generateUniversalMock({
      hookName: 'useAuthStore',
      regionKey: 'auth-store',
      importPath: '@/stores/auth-store',
      isBarrel: false,
      hasStaticGetState: true,
      returnStyle: 'object',
    })
    expect(code).toContain("useAuthStore.getState")
    expect(code).toContain("useAuthStore.setState")
    expect(code).toContain("useAuthStore.subscribe")
  })

  it('generates tuple return for tuple-destructure style', () => {
    const code = generateUniversalMock({
      hookName: 'useSearchParams',
      regionKey: 'search-params',
      importPath: 'react-router-dom',
      isBarrel: false,
      hasStaticGetState: false,
      returnStyle: 'tuple',
    })
    expect(code).toContain("return [")
    expect(code).toContain("NOOP")
  })

  it('skips __real: re-export for barrel files', () => {
    const code = generateUniversalMock({
      hookName: 'useAuth',
      regionKey: 'auth',
      importPath: '@/hooks/index',
      isBarrel: true,
      hasStaticGetState: false,
      returnStyle: 'object',
    })
    expect(code).not.toContain("__real:")
  })
})

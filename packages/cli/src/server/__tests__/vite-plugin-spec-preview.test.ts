import { describe, it, expect } from 'vitest'
import { createSpecPreviewPlugin } from '../vite-plugin-spec-preview.js'

describe('createSpecPreviewPlugin', () => {
  it('returns a Vite plugin object with correct name', () => {
    const plugin = createSpecPreviewPlugin({
      specsDir: '/tmp/test-specs',
      cwd: '/tmp/test-project',
    })
    expect(plugin.name).toBe('spec-preview')
  })

  it('resolves virtual:spec-manifest module ID', () => {
    const plugin = createSpecPreviewPlugin({
      specsDir: '/tmp/test-specs',
      cwd: '/tmp/test-project',
    })
    const resolved = (plugin.resolveId as Function)('virtual:spec-manifest')
    expect(resolved).toBe('\0virtual:spec-manifest')
  })

  it('resolves virtual:spec-mock: prefixed module IDs', () => {
    const plugin = createSpecPreviewPlugin({
      specsDir: '/tmp/test-specs',
      cwd: '/tmp/test-project',
    })
    const resolved = (plugin.resolveId as Function)('virtual:spec-mock:@/hooks/useItems')
    expect(resolved).toBe('\0virtual:spec-mock:@/hooks/useItems')
  })

  it('does not resolve non-virtual module IDs', () => {
    const plugin = createSpecPreviewPlugin({
      specsDir: '/tmp/test-specs',
      cwd: '/tmp/test-project',
    })
    const resolved = (plugin.resolveId as Function)('./some-real-file.ts')
    expect(resolved).toBeUndefined()
  })
})

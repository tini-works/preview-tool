import { describe, it, expect } from 'vitest'
import { buildAnalyzeScreenPrompt } from '../analyze-screen.js'

describe('buildAnalyzeScreenPrompt', () => {
  const screenSource = `
    import { useAuthStore } from '@/store/auth'
    export default function LoginPage() {
      const { user, isLoading } = useAuthStore()
      if (isLoading) return <Spinner />
      return <div>{user?.name}</div>
    }
  `
  const hookSources = {
    '@/store/auth': `
      export function useAuthStore() {
        return useStore((s) => ({ user: s.user, isLoading: s.isLoading }))
      }
    `,
  }

  it('includes the screen source code', () => {
    const prompt = buildAnalyzeScreenPrompt(screenSource, hookSources, {})
    expect(prompt).toContain('useAuthStore')
    expect(prompt).toContain('isLoading')
  })

  it('includes imported hook sources', () => {
    const prompt = buildAnalyzeScreenPrompt(screenSource, hookSources, {})
    expect(prompt).toContain('Imported Hook Sources')
    expect(prompt).toContain('@/store/auth')
  })

  it('includes type information when provided', () => {
    const typeInfo = { useAuthStore: { user: 'User | null', isLoading: 'boolean' } }
    const prompt = buildAnalyzeScreenPrompt(screenSource, hookSources, typeInfo)
    expect(prompt).toContain('Type Information')
    expect(prompt).toContain('User | null')
  })

  it('includes instructions for regions, flows, and mockModules', () => {
    const prompt = buildAnalyzeScreenPrompt(screenSource, {}, {})
    expect(prompt).toContain('Regions')
    expect(prompt).toContain('Flows')
    expect(prompt).toContain('Mock Modules')
  })
})

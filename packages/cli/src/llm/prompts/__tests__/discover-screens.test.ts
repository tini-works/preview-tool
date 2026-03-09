import { describe, it, expect } from 'vitest'
import { buildDiscoveryPrompt } from '../discover-screens.js'

describe('buildDiscoveryPrompt', () => {
  it('includes the file tree in the prompt', () => {
    const files = [
      'src/App.tsx',
      'src/main.tsx',
      'src/pages/BookingPage.tsx',
      'src/pages/LoginPage.tsx',
      'src/components/Button.tsx',
      'src/hooks/useAuth.ts',
    ]
    const prompt = buildDiscoveryPrompt(files)
    expect(prompt).toContain('src/pages/BookingPage.tsx')
    expect(prompt).toContain('src/pages/LoginPage.tsx')
    expect(prompt).toContain('src/components/Button.tsx')
  })

  it('includes instructions to identify screens', () => {
    const prompt = buildDiscoveryPrompt(['src/pages/Home.tsx'])
    expect(prompt).toContain('screen')
    expect(prompt).toContain('route')
    expect(prompt).toContain('filePath')
  })

  it('instructs to exclude non-screen files', () => {
    const prompt = buildDiscoveryPrompt(['src/App.tsx'])
    expect(prompt).toContain('Do NOT include')
  })
})

import { describe, it, expect } from 'vitest'
import { extractHookSources, validateAnalysis } from '../analyze-screen-llm.js'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('extractHookSources', () => {
  it('reads source code of imported hooks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hook-src-'))
    await mkdir(join(dir, 'src', 'hooks'), { recursive: true })
    await writeFile(
      join(dir, 'src', 'hooks', 'useAuth.ts'),
      'export function useAuth() { return { user: null } }',
    )

    const screenSource = `import { useAuth } from '@/hooks/useAuth'\nexport default function Page() { const { user } = useAuth() }`
    const sources = await extractHookSources(dir, screenSource)
    expect(sources['@/hooks/useAuth']).toContain('useAuth')
  })
})

describe('validateAnalysis', () => {
  it('removes regions referencing non-existent hooks', () => {
    const screenSource = `import { useAuth } from '@/hooks/useAuth'`
    const analysis = {
      regions: [
        {
          key: 'auth',
          label: 'Auth',
          type: 'auth' as const,
          source: { type: 'hook' as const, name: 'useAuth', importPath: '@/hooks/useAuth' },
          states: { ok: { label: 'OK', mockData: {} } },
        },
        {
          key: 'fake',
          label: 'Fake',
          type: 'custom' as const,
          source: { type: 'hook' as const, name: 'useFake', importPath: '@/hooks/useFake' },
          states: { ok: { label: 'OK', mockData: {} } },
        },
      ],
      flows: [],
      mockModules: [],
    }

    const validated = validateAnalysis(analysis, screenSource)
    expect(validated.regions).toHaveLength(1)
    expect(validated.regions[0].key).toBe('auth')
  })

  it('keeps useState regions without import validation', () => {
    const screenSource = 'const [show, setShow] = useState(false)'
    const analysis = {
      regions: [
        {
          key: 'show-password',
          label: 'Show Password',
          type: 'status' as const,
          source: { type: 'useState' as const, name: 'show' },
          states: { shown: { label: 'Shown', mockData: { value: true } } },
        },
      ],
      flows: [],
      mockModules: [],
    }

    const validated = validateAnalysis(analysis, screenSource)
    expect(validated.regions).toHaveLength(1)
  })
})

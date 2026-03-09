import { describe, it, expect } from 'vitest'
import { scanFileTree, validateDiscoveredScreens } from '../../analyzer/discover-llm.js'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SAMPLE_APP = join(__dirname, '../../../test-fixtures/sample-app')
const skipIfNoSampleApp = existsSync(SAMPLE_APP) ? describe : describe.skip

skipIfNoSampleApp('LLM Pipeline Integration (sample-app)', () => {
  it('scans file tree excluding node_modules', async () => {
    const files = await scanFileTree(SAMPLE_APP)
    expect(files.some((f: string) => f.includes('screens/dashboard'))).toBe(true)
    expect(files.every((f: string) => !f.includes('node_modules'))).toBe(true)
  })

  it('validates discovered screens against real files', async () => {
    const screens = [
      { filePath: 'src/screens/dashboard/index.tsx', route: '/dashboard', screenName: 'Dashboard' },
      { filePath: 'src/screens/settings/index.tsx', route: '/settings', screenName: 'Settings' },
      { filePath: 'src/screens/nonexistent/index.tsx', route: '/404', screenName: 'Missing' },
    ]
    const validated = await validateDiscoveredScreens(SAMPLE_APP, screens)
    expect(validated.length).toBeGreaterThanOrEqual(2)
    expect(validated.every((s) => existsSync(join(SAMPLE_APP, s.filePath)))).toBe(true)
  })
})

import { glob } from 'glob'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LLMDiscoveredScreen } from '../llm/schemas/discovery.js'
import type { LLMConfig } from '../llm/types.js'
import type { DiscoveredScreen } from './types.js'
import { buildDiscoveryPrompt } from '../llm/prompts/discover-screens.js'
import { DiscoveryOutputSchema } from '../llm/schemas/discovery.js'
import { callLLM } from '../llm/index.js'

const EXCLUDED_DIRS = ['node_modules', 'dist', '.preview', '.next', '.git', 'build', 'coverage']

export async function scanFileTree(cwd: string): Promise<string[]> {
  const ignore = [
    ...EXCLUDED_DIRS.map((d) => `**/${d}/**`),
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/*.story.*',
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/*.d.ts',
  ]
  const files = await glob('**/*.{tsx,ts,jsx}', { cwd, ignore })
  return files.sort()
}

export async function validateDiscoveredScreens(
  cwd: string,
  screens: LLMDiscoveredScreen[],
): Promise<DiscoveredScreen[]> {
  const validated: DiscoveredScreen[] = []

  for (const screen of screens) {
    const absPath = join(cwd, screen.filePath)
    if (!existsSync(absPath)) continue

    const basename = screen.filePath.split('/').pop() ?? ''
    if (/\.(test|spec|stories|story)\./.test(basename)) continue

    const source = readFileSync(absPath, 'utf-8')
    const hasJSX = source.includes('return') && (source.includes('<') || source.includes('jsx'))
    const hasExport = source.includes('export')

    if (hasJSX && hasExport) {
      validated.push({
        filePath: screen.filePath,
        route: screen.route,
        pattern: 'monolithic',
        exportName: undefined,
      })
    }
  }

  return validated
}

export async function discoverScreensWithLLM(
  cwd: string,
  llmConfig: LLMConfig,
): Promise<DiscoveredScreen[]> {
  const fileTree = await scanFileTree(cwd)
  const prompt = buildDiscoveryPrompt(fileTree)

  const raw = await callLLM(prompt, llmConfig)
  if (!raw) {
    throw new Error('LLM discovery returned no response. An LLM provider is required.')
  }

  const parsed = DiscoveryOutputSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`LLM discovery returned invalid format: ${parsed.error.message}`)
  }

  return validateDiscoveredScreens(cwd, parsed.data.screens)
}

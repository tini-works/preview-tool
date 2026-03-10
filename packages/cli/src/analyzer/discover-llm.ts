import { glob } from 'glob'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import type { LLMDiscoveredScreen } from '../llm/schemas/discovery.js'
import type { DiscoveredScreen } from './types.js'
import { buildDiscoveryPrompt } from '../llm/prompts/discover-screens.js'
import { DiscoveryOutputSchema } from '../llm/schemas/discovery.js'
import { callClaudeCode } from '../llm/claude-code.js'

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

    try {
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
    } catch {
      // File unreadable (permissions, race) — skip silently
    }
  }

  return validated
}

/**
 * Fallback screen discovery using file patterns when LLM is unavailable.
 * Scans common page/route directories and validates each file.
 */
async function discoverScreensByFilePattern(cwd: string): Promise<DiscoveredScreen[]> {
  const patterns = [
    'src/routes/**/*.tsx',
    'src/pages/**/*.tsx',
    'src/screens/**/index.tsx',
    'src/app/**/page.tsx',
    'pages/**/*.tsx',
    'app/**/page.tsx',
  ]

  const ignore = [
    ...EXCLUDED_DIRS.map((d) => `**/${d}/**`),
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/*.story.*',
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/*.d.ts',
    '**/layout.tsx',
    '**/loading.tsx',
    '**/error.tsx',
    '**/not-found.tsx',
  ]

  for (const pattern of patterns) {
    const files = await glob(pattern, { cwd, ignore })
    if (files.length > 0) {
      const screens: LLMDiscoveredScreen[] = files.map((f) => ({
        filePath: f,
        screenName: f.split('/').pop()?.replace(/\.tsx$/, '') ?? 'Screen',
        route: '/' + f
          .replace(/^src\/(routes|pages|screens|app)\//, '')
          .replace(/\/index\.tsx$/, '')
          .replace(/\/page\.tsx$/, '')
          .replace(/\.tsx$/, '')
          .replace(/\.\$/, '/:')  // TanStack Router dynamic params
          .replace(/\[([^\]]+)\]/g, ':$1'),  // Next.js dynamic params
      }))
      return validateDiscoveredScreens(cwd, screens)
    }
  }

  return []
}

export async function discoverScreensWithLLM(
  cwd: string,
): Promise<DiscoveredScreen[]> {
  const fileTree = await scanFileTree(cwd)
  const prompt = buildDiscoveryPrompt(fileTree)

  const raw = await callClaudeCode(prompt)
  if (!raw) {
    console.log(chalk.yellow('  LLM unavailable — using file-based screen discovery'))
    return discoverScreensByFilePattern(cwd)
  }

  const parsed = DiscoveryOutputSchema.safeParse(raw)
  if (!parsed.success) {
    console.log(chalk.yellow(`  LLM returned invalid format — using file-based fallback`))
    return discoverScreensByFilePattern(cwd)
  }

  return validateDiscoveredScreens(cwd, parsed.data.screens)
}

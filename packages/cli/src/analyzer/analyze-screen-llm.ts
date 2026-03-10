import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import chalk from 'chalk'
import type { ScreenAnalysisV2 } from '../llm/schemas/screen-analysis-v2.js'
import type { DiscoveredScreen } from './types.js'
import { buildAnalyzeScreenPrompt } from '../llm/prompts/analyze-screen.js'
import { ScreenAnalysisV2Schema } from '../llm/schemas/screen-analysis-v2.js'
import { callClaudeCode } from '../llm/claude-code.js'

/** Returns true if the file source exports at least one React hook (use* naming convention). */
function containsHookExport(source: string): boolean {
  return /export\s+(function|const)\s+use[A-Z]/.test(source)
}

export async function extractHookSources(
  cwd: string,
  screenFilePath: string,
  screenSource: string,
): Promise<Record<string, string>> {
  const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g
  const sources: Record<string, string> = {}
  let match: RegExpExecArray | null

  while ((match = importRegex.exec(screenSource)) !== null) {
    const importPath = match[1]
    if (importPath.startsWith('.') || importPath.startsWith('@/') || importPath.startsWith('~/')) {
      const resolved = resolveImportPath(cwd, importPath, screenFilePath)
      if (resolved && existsSync(resolved)) {
        try {
          const fileSource = readFileSync(resolved, 'utf-8')
          // Only include files that export React hooks — skip UI components, utilities, constants
          if (containsHookExport(fileSource)) {
            sources[importPath] = fileSource
          }
        } catch {
          // File unreadable — skip
        }
      }
    }
  }

  return sources
}

function resolveImportPath(cwd: string, importPath: string, fromFile?: string): string | null {
  let basePath: string
  if (importPath.startsWith('@/') || importPath.startsWith('~/')) {
    basePath = join(cwd, 'src', importPath.slice(2))
  } else if (importPath.startsWith('.') && fromFile) {
    // Resolve relative to the screen file's directory
    const screenDir = dirname(join(cwd, fromFile))
    basePath = join(screenDir, importPath)
  } else {
    basePath = join(cwd, importPath)
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx']
  for (const ext of extensions) {
    const full = basePath + ext
    if (existsSync(full)) return full
  }
  for (const ext of extensions) {
    const full = join(basePath, `index${ext}`)
    if (existsSync(full)) return full
  }
  return null
}

export function validateAnalysis(
  analysis: ScreenAnalysisV2,
  screenSource: string,
): ScreenAnalysisV2 {
  const validRegions = analysis.regions.filter((region) => {
    if (region.source.type === 'hook') {
      return screenSource.includes(region.source.name)
    }
    return true
  })

  const validMockModules = analysis.mockModules.filter((mod) => {
    return screenSource.includes(mod.hookName)
  })

  return {
    ...analysis,
    regions: validRegions,
    mockModules: validMockModules,
  }
}

export async function analyzeScreenWithLLM(
  cwd: string,
  screen: DiscoveredScreen,
): Promise<ScreenAnalysisV2> {
  const absPath = join(cwd, screen.filePath)

  let screenSource: string
  try {
    screenSource = readFileSync(absPath, 'utf-8')
  } catch {
    throw new Error(`Cannot read screen file: ${screen.filePath}`)
  }

  const hookSources = await extractHookSources(cwd, screen.filePath, screenSource)
  const typeInfo: Record<string, unknown> = {}

  const prompt = buildAnalyzeScreenPrompt(screenSource, hookSources, typeInfo)
  const raw = await callClaudeCode(prompt)

  if (!raw) {
    throw new Error(`LLM analysis returned no response for ${screen.filePath}`)
  }

  const parsed = ScreenAnalysisV2Schema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      `LLM analysis returned invalid format for ${screen.filePath}: ${parsed.error.message}`,
    )
  }

  return validateAnalysis(parsed.data, screenSource)
}

const ANALYSIS_CONCURRENCY = 3
const MAX_RETRIES = 1

export async function analyzeAllScreens(
  cwd: string,
  screens: DiscoveredScreen[],
): Promise<Map<string, ScreenAnalysisV2>> {
  const results = new Map<string, ScreenAnalysisV2>()
  const queue = screens.map((s) => ({ screen: s, attempt: 0 }))

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift()!
      const { screen, attempt } = item
      try {
        console.log(chalk.dim(`  Analyzing ${screen.filePath}...${attempt > 0 ? ` (retry ${attempt})` : ''}`))
        const analysis = await analyzeScreenWithLLM(cwd, screen)
        results.set(screen.route, analysis)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (attempt < MAX_RETRIES) {
          console.warn(chalk.yellow(`  Retrying ${screen.filePath} (attempt ${attempt + 1}): ${msg}`))
          queue.push({ screen, attempt: attempt + 1 })
        } else {
          console.warn(`  Warning: Failed to analyze ${screen.filePath}: ${msg}`)
        }
      }
    }
  }

  const workerCount = Math.min(ANALYSIS_CONCURRENCY, screens.length)
  await Promise.allSettled(Array.from({ length: workerCount }, () => worker()))

  return results
}

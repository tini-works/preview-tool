import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ScreenAnalysisV2 } from '../llm/schemas/screen-analysis-v2.js'
import type { DiscoveredScreen } from './types.js'
import { buildAnalyzeScreenPrompt } from '../llm/prompts/analyze-screen.js'
import { ScreenAnalysisV2Schema } from '../llm/schemas/screen-analysis-v2.js'
import { callLLM } from '../llm/index.js'

export async function extractHookSources(
  cwd: string,
  screenSource: string,
): Promise<Record<string, string>> {
  const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g
  const sources: Record<string, string> = {}
  let match: RegExpExecArray | null

  while ((match = importRegex.exec(screenSource)) !== null) {
    const importPath = match[1]
    if (importPath.startsWith('.') || importPath.startsWith('@/') || importPath.startsWith('~/')) {
      const resolved = resolveImportPath(cwd, importPath)
      if (resolved && existsSync(resolved)) {
        sources[importPath] = readFileSync(resolved, 'utf-8')
      }
    }
  }

  return sources
}

function resolveImportPath(cwd: string, importPath: string): string | null {
  let basePath: string
  if (importPath.startsWith('@/') || importPath.startsWith('~/')) {
    basePath = join(cwd, 'src', importPath.slice(2))
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
  const screenSource = readFileSync(absPath, 'utf-8')
  const hookSources = await extractHookSources(cwd, screenSource)
  const typeInfo: Record<string, unknown> = {}

  const prompt = buildAnalyzeScreenPrompt(screenSource, hookSources, typeInfo)
  const raw = await callLLM(prompt)

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

export async function analyzeAllScreens(
  cwd: string,
  screens: DiscoveredScreen[],
): Promise<Map<string, ScreenAnalysisV2>> {
  const results = new Map<string, ScreenAnalysisV2>()

  const analyses = await Promise.allSettled(
    screens.map((screen) => analyzeScreenWithLLM(cwd, screen)),
  )

  screens.forEach((screen, i) => {
    const result = analyses[i]
    if (result.status === 'fulfilled') {
      results.set(screen.route, result.value)
    } else {
      console.warn(`  Warning: Failed to analyze ${screen.filePath}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
    }
  })

  return results
}

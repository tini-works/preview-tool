import chalk from 'chalk'
import { callLLMBatch, callLLM } from '../llm/index.js'
import { buildUnderstandScreensPrompt } from '../llm/prompts/understand-screens.js'
import { ScreenAnalysisSchema, type ScreenAnalysisOutput } from '../llm/schemas/screen-analysis.js'
import { buildFromTemplates } from './template-fallback.js'
import type { ScreenFacts } from './types.js'
import type { LLMConfig } from '../llm/types.js'
import { z } from 'zod'

const BatchOutputSchema = z.array(ScreenAnalysisSchema)

/**
 * Stage 3 orchestrator: send screen facts to an LLM for semantic analysis,
 * validate the output, and fall back to template-based heuristics when
 * the LLM is unavailable or returns invalid data.
 */
export async function understandScreens(
  screenFacts: ScreenFacts[],
  llmConfig: LLMConfig,
): Promise<ScreenAnalysisOutput[]> {
  // Fast path: no LLM configured
  if (llmConfig.provider === 'none') {
    console.log(chalk.dim('  Using AST-driven template analysis (use --llm <provider> to enable LLM)'))
    return screenFacts.map(buildFromTemplates)
  }

  const prompt = buildUnderstandScreensPrompt(screenFacts)
  const llmOptions = { temperature: 0.2, maxTokens: 32768, jsonMode: true }

  try {
    // Try batch call first (claude-code only)
    let raw = await callLLMBatch(prompt, llmConfig, llmOptions)

    // Fall back to single-call provider chain
    if (raw == null) {
      raw = await callLLM(prompt, llmConfig, llmOptions)
    }

    // All providers failed
    if (raw == null) {
      console.log(chalk.dim('  All LLM providers unavailable, using template fallback'))
      return screenFacts.map(buildFromTemplates)
    }

    // Attempt to parse the raw response
    const parsed = parseResponse(raw, screenFacts)
    return fillMissing(parsed, screenFacts)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.yellow(`  understandScreens failed: ${message}, using template fallback`))
    return screenFacts.map(buildFromTemplates)
  }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Try parsing the LLM output in two formats:
 * 1. Array of ScreenAnalysisOutput (preferred)
 * 2. Record<string, ScreenAnalysisOutput> keyed by route or filePath
 */
function parseResponse(
  raw: unknown,
  screenFacts: ScreenFacts[],
): ScreenAnalysisOutput[] {
  // Format 1: direct array
  const arrayResult = BatchOutputSchema.safeParse(raw)
  if (arrayResult.success) {
    return arrayResult.data
  }

  // Format 2: object keyed by route or filePath
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>
    const results: ScreenAnalysisOutput[] = []

    for (const facts of screenFacts) {
      const entry = record[facts.route] ?? record[facts.filePath]
      if (entry != null) {
        const parsed = ScreenAnalysisSchema.safeParse(entry)
        if (parsed.success) {
          results.push(parsed.data)
        }
      }
    }

    if (results.length > 0) {
      return results
    }
  }

  console.log(chalk.yellow('  LLM response did not match expected schema, using template fallback'))
  return screenFacts.map(buildFromTemplates)
}

// ---------------------------------------------------------------------------
// Fill missing screens with templates
// ---------------------------------------------------------------------------

function fillMissing(
  parsed: ScreenAnalysisOutput[],
  screenFacts: ScreenFacts[],
): ScreenAnalysisOutput[] {
  const coveredRoutes = new Set(parsed.map((p) => p.route))

  const missing = screenFacts.filter((f) => !coveredRoutes.has(f.route))
  if (missing.length > 0) {
    console.log(
      chalk.dim(`  Filling ${missing.length} screen(s) not returned by LLM with templates`),
    )
  }

  return [...parsed, ...missing.map(buildFromTemplates)]
}

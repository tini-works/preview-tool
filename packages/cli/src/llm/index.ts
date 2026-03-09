import chalk from 'chalk'
import type { LLMOptions } from './types.js'
import { createClaudeCodeProvider } from './providers/claude-code.js'
import { SYSTEM_PROMPT } from './prompts/system.js'

export async function callLLM(
  prompt: string,
  options: LLMOptions = {},
): Promise<unknown | null> {
  const provider = createClaudeCodeProvider()

  const opts: LLMOptions = {
    ...options,
    systemPrompt: options.systemPrompt ?? SYSTEM_PROMPT,
  }

  try {
    const available = await provider.isAvailable()
    if (!available) {
      console.log(chalk.dim('  LLM: claude-code not available'))
      return null
    }

    console.log(chalk.dim(`  LLM: Using ${provider.name}...`))
    return await provider.generate(prompt, { ...opts, jsonMode: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.yellow(`  LLM: ${provider.name} failed: ${message}`))
    return null
  }
}

/**
 * Batch LLM call — uses claude-code provider.
 * Returns null if claude-code is unavailable (caller should fall back to per-screen).
 */
export async function callLLMBatch(
  prompt: string,
  options: LLMOptions = {},
): Promise<unknown | null> {
  const provider = createClaudeCodeProvider()

  try {
    const available = await provider.isAvailable()
    if (!available) {
      return null
    }

    console.log(chalk.dim(`  LLM: Using ${provider.name} (batch mode)...`))
    const opts: LLMOptions = {
      ...options,
      systemPrompt: options.systemPrompt ?? SYSTEM_PROMPT,
    }
    return await provider.generate(prompt, { ...opts, jsonMode: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.yellow(`  LLM: ${provider.name} batch failed: ${message}`))
    return null
  }
}

export type { LLMOptions, LLMProvider } from './types.js'

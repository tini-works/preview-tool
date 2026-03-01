import chalk from 'chalk'
import type { LLMProvider, LLMConfig, LLMOptions } from './types.js'
import { createOllamaProvider } from './providers/ollama.js'
import { createAnthropicProvider } from './providers/anthropic.js'
import { createOpenAIProvider } from './providers/openai.js'
import { SYSTEM_PROMPT } from './prompts/system.js'

export async function callLLM(
  prompt: string,
  config: LLMConfig,
  options: LLMOptions = {},
): Promise<unknown | null> {
  const providers = buildProviderChain(config)

  // Inject system prompt unless caller provides one
  const opts: LLMOptions = {
    ...options,
    systemPrompt: options.systemPrompt ?? SYSTEM_PROMPT,
  }

  for (const provider of providers) {
    try {
      const available = await provider.isAvailable()
      if (!available) {
        console.log(chalk.dim(`  LLM: ${provider.name} not available, skipping`))
        continue
      }

      console.log(chalk.dim(`  LLM: Using ${provider.name}...`))
      const result = await provider.generate(prompt, { ...opts, jsonMode: true })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(chalk.yellow(`  LLM: ${provider.name} failed: ${message}`))
    }
  }

  console.log(chalk.dim('  LLM: All providers failed, using heuristic fallback'))
  return null
}

function buildProviderChain(config: LLMConfig): LLMProvider[] {
  if (config.provider === 'none') {
    return []
  }

  if (config.provider !== 'auto') {
    switch (config.provider) {
      case 'ollama':
        return [createOllamaProvider(config.ollamaModel, config.ollamaUrl)]
      case 'anthropic':
        return [createAnthropicProvider()]
      case 'openai':
        return [createOpenAIProvider()]
    }
  }

  return [
    createOllamaProvider(config.ollamaModel, config.ollamaUrl),
    createAnthropicProvider(),
    createOpenAIProvider(),
  ]
}

export type { LLMConfig, LLMOptions, LLMProvider } from './types.js'
export { DEFAULT_LLM_CONFIG } from './types.js'

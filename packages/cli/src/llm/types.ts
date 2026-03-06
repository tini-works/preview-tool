export interface LLMProvider {
  name: string
  isAvailable(): Promise<boolean>
  generate(prompt: string, options: LLMOptions): Promise<unknown>
}

export interface LLMOptions {
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
  systemPrompt?: string
  timeoutMs?: number
}

export interface LLMConfig {
  provider: 'auto' | 'claude-code' | 'ollama' | 'anthropic' | 'openai' | 'none'
  ollamaModel: string
  ollamaUrl: string
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'none',
  ollamaModel: 'llama3.2',
  ollamaUrl: 'http://localhost:11434',
}

/** Default timeout for LLM generate() calls: 60 seconds */
export const DEFAULT_LLM_TIMEOUT_MS = 60_000

/** Timeout for batch claude-code generation: 180 seconds */
export const CLAUDE_CODE_BATCH_TIMEOUT_MS = 180_000

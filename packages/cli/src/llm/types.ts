export interface LLMProvider {
  name: string
  isAvailable(): Promise<boolean>
  generate(prompt: string, options: LLMOptions): Promise<unknown>
}

export interface LLMOptions {
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
}

export interface LLMConfig {
  provider: 'auto' | 'ollama' | 'anthropic' | 'openai' | 'none'
  ollamaModel: string
  ollamaUrl: string
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'auto',
  ollamaModel: 'llama3.2',
  ollamaUrl: 'http://localhost:11434',
}

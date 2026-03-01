import type { LLMProvider, LLMOptions } from '../types.js'
import { DEFAULT_LLM_TIMEOUT_MS } from '../types.js'

export function createOllamaProvider(model: string, baseUrl: string): LLMProvider {
  return {
    name: 'ollama',

    async isAvailable(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(2000),
        })
        if (!response.ok) return false

        // Verify the configured model is actually available
        const data = (await response.json()) as { models?: { name: string }[] }
        const models = data.models ?? []
        return models.some((m) => m.name === model || m.name.startsWith(`${model}:`))
      } catch {
        return false
      }
    },

    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      const timeout = options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS

      const body: Record<string, unknown> = {
        model,
        prompt: options.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt,
        stream: false,
        format: options.jsonMode ? 'json' : undefined,
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: options.maxTokens ?? 4096,
        },
      }

      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      })

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { response: string }
      return JSON.parse(data.response) as unknown
    },
  }
}

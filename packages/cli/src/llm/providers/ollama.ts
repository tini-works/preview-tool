import type { LLMProvider, LLMOptions } from '../types.js'

export function createOllamaProvider(model: string, baseUrl: string): LLMProvider {
  return {
    name: 'ollama',

    async isAvailable(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(2000),
        })
        return response.ok
      } catch {
        return false
      }
    },

    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: options.jsonMode ? 'json' : undefined,
          options: {
            temperature: options.temperature ?? 0.2,
            num_predict: options.maxTokens ?? 4096,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { response: string }
      return JSON.parse(data.response) as unknown
    },
  }
}

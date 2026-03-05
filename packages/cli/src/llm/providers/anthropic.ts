import type { LLMProvider, LLMOptions } from '../types.js'
import { DEFAULT_LLM_TIMEOUT_MS } from '../types.js'
import { extractJson } from '../utils.js'

export function createAnthropicProvider(): LLMProvider {
  return {
    name: 'anthropic',

    async isAvailable(): Promise<boolean> {
      return Boolean(process.env.ANTHROPIC_API_KEY)
    },

    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not set')
      }

      const timeout = options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS

      const body: Record<string, unknown> = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.2,
        messages: [{ role: 'user', content: prompt }],
      }

      // Use native system parameter when available
      if (options.systemPrompt) {
        body.system = options.systemPrompt
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic error: ${response.status} ${errorText}`)
      }

      const data = (await response.json()) as {
        content: { type: string; text: string }[]
      }
      const textBlock = data.content.find((c) => c.type === 'text')
      if (!textBlock) {
        throw new Error('No text block in Anthropic response')
      }

      return JSON.parse(extractJson(textBlock.text)) as unknown
    },
  }
}

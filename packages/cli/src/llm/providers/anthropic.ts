import type { LLMProvider, LLMOptions } from '../types.js'

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

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.2,
          messages: [{ role: 'user', content: prompt }],
        }),
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

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }
  return text.trim()
}

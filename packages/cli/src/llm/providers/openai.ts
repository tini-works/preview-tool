import type { LLMProvider, LLMOptions } from '../types.js'
import { DEFAULT_LLM_TIMEOUT_MS } from '../types.js'
import { extractJson } from '../utils.js'

export function createOpenAIProvider(): LLMProvider {
  return {
    name: 'openai',

    async isAvailable(): Promise<boolean> {
      return Boolean(process.env.OPENAI_API_KEY)
    },

    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not set')
      }

      const timeout = options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS

      // Build messages with native system role when available
      const messages: { role: string; content: string }[] = []
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt })
      }
      messages.push({ role: 'user', content: prompt })

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.2,
          response_format: options.jsonMode ? { type: 'json_object' } : undefined,
          messages,
        }),
        signal: AbortSignal.timeout(timeout),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI error: ${response.status} ${errorText}`)
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[]
      }
      const content = data.choices[0]?.message?.content
      if (!content) {
        throw new Error('No content in OpenAI response')
      }

      return JSON.parse(extractJson(content)) as unknown
    },
  }
}

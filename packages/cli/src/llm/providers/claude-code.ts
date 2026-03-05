import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { LLMProvider, LLMOptions } from '../types.js'
import { CLAUDE_CODE_BATCH_TIMEOUT_MS } from '../types.js'
import { extractJson } from '../utils.js'

const execFileAsync = promisify(execFile)

export function createClaudeCodeProvider(): LLMProvider {
  return {
    name: 'claude-code',

    async isAvailable(): Promise<boolean> {
      try {
        await execFileAsync('claude', ['--version'], {
          timeout: 3000,
        })
        return true
      } catch {
        return false
      }
    },

    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      const timeout = options.timeoutMs ?? CLAUDE_CODE_BATCH_TIMEOUT_MS

      const fullPrompt = options.systemPrompt
        ? `${options.systemPrompt}\n\n${prompt}`
        : prompt

      const { stdout } = await execFileAsync(
        'claude',
        ['-p', fullPrompt, '--output-format', 'json', '--max-turns', '30'],
        { timeout, maxBuffer: 10 * 1024 * 1024 },
      )

      // claude --output-format json returns { result: "...", ... }
      const envelope = JSON.parse(stdout) as { result: string }
      const text = envelope.result

      return JSON.parse(extractJson(text)) as unknown
    },
  }
}

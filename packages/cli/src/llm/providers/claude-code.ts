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

      // Unset CLAUDECODE to allow spawning from within a Claude Code session
      const env = { ...process.env }
      delete env.CLAUDECODE

      const { stdout } = await execFileAsync(
        'claude',
        ['-p', fullPrompt, '--output-format', 'json', '--max-turns', '30'],
        { timeout, maxBuffer: 10 * 1024 * 1024, env },
      )

      // Parse the CLI envelope — may be non-JSON on timeout/error
      let envelope: { result?: string }
      try {
        envelope = JSON.parse(stdout) as { result?: string }
      } catch {
        throw new Error(`claude CLI returned non-JSON output (${stdout.length} bytes)`)
      }

      const text = envelope.result
      if (typeof text !== 'string') {
        throw new Error(`claude CLI envelope missing "result" field: ${JSON.stringify(Object.keys(envelope))}`)
      }

      // Parse the LLM's JSON response from within the result text
      try {
        return JSON.parse(extractJson(text)) as unknown
      } catch {
        throw new Error(`LLM response is not valid JSON: ${text.slice(0, 200)}...`)
      }
    },
  }
}

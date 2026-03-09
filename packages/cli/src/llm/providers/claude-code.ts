import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { LLMProvider, LLMOptions } from '../types.js'
import { CLAUDE_CODE_BATCH_TIMEOUT_MS } from '../types.js'
import { extractJson } from '../utils.js'

const execFileAsync = promisify(execFile)

/**
 * Spawns `claude -p` and pipes the prompt via stdin to avoid
 * command-line argument length limits on large codebases.
 */
function spawnClaude(prompt: string, timeout: number, env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', '--output-format', 'json', '--max-turns', '30'],
      { timeout, env, stdio: ['pipe', 'pipe', 'pipe'] },
    )

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code !== 0) {
        const err = new Error(`claude CLI exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ''}`)
        reject(err)
      } else {
        resolve({ stdout, stderr })
      }
    })

    // Pipe prompt via stdin
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

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

      const { stdout, stderr } = await spawnClaude(fullPrompt, timeout, env)

      if (stderr) {
        // Log stderr for diagnostics (claude CLI may print progress here)
        process.stderr.write(stderr)
      }

      // Parse the CLI envelope — may be non-JSON on timeout/error
      let envelope: { result?: string }
      try {
        envelope = JSON.parse(stdout) as { result?: string }
      } catch {
        throw new Error(`claude CLI returned non-JSON output (${stdout.length} bytes): ${stdout.slice(0, 200)}`)
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

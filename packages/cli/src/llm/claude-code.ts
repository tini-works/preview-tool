import { spawn, execFile } from 'node:child_process'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { SYSTEM_PROMPT } from './prompts/system.js'

const execFileAsync = promisify(execFile)

const DEFAULT_TIMEOUT_MS = 180_000

export interface CallOptions {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  timeoutMs?: number
}

/**
 * Spawns `claude -p` and pipes the prompt via stdin to avoid
 * command-line argument length limits on large codebases.
 * Uses stream piping to handle backpressure on large prompts (>64KB).
 */
function spawnClaude(prompt: string, timeout: number, env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', '--output-format', 'json', '--max-turns', '2'],
      { timeout, env, stdio: ['pipe', 'pipe', 'pipe'] },
    )

    let stdout = ''
    let stderr = ''
    let settled = false

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    child.on('error', (err: Error) => {
      if (!settled) {
        settled = true
        reject(err)
      }
    })

    child.on('close', (code: number | null, signal: string | null) => {
      if (settled) return
      settled = true

      if (signal === 'SIGTERM') {
        reject(new Error(`claude CLI timed out after ${timeout / 1000}s`))
      } else if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ''}`))
      } else {
        resolve({ stdout, stderr })
      }
    })

    // Pipe prompt via stdin using stream to handle backpressure on large prompts
    Readable.from([prompt]).pipe(child.stdin)
  })
}

export async function callClaudeCode(
  prompt: string,
  options: CallOptions = {},
): Promise<unknown | null> {
  try {
    const available = await isClaudeCodeAvailable()
    if (!available) {
      console.log(chalk.dim('  LLM: claude-code not available'))
      return null
    }

    console.log(chalk.dim('  LLM: Using claude-code...'))

    const systemPrompt = options.systemPrompt ?? SYSTEM_PROMPT
    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const fullPrompt = `${systemPrompt}\n\n${prompt}`

    // Unset CLAUDECODE to allow spawning from within a Claude Code session
    const env = { ...process.env }
    delete env.CLAUDECODE

    const { stdout, stderr } = await spawnClaude(fullPrompt, timeout, env)

    if (stderr) {
      process.stderr.write(stderr)
    }

    // claude --output-format json returns { result: "...", ... }
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

    return JSON.parse(extractJson(text)) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.yellow(`  LLM: claude-code failed: ${message}`))
    return null
  }
}

function extractJson(text: string): string {
  // Try code block first (defense-in-depth: prompt says no fences, but LLM may add them)
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }
  // Try to find a JSON object in the text
  const jsonMatch = text.match(/(\{[\s\S]*\})/)
  if (jsonMatch) {
    return jsonMatch[1].trim()
  }
  return text.trim()
}

async function isClaudeCodeAvailable(): Promise<boolean> {
  try {
    await execFileAsync('claude', ['--version'], { timeout: 3000 })
    return true
  } catch {
    return false
  }
}

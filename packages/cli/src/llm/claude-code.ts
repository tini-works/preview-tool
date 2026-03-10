import { execFile } from 'node:child_process'
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

    const { stdout } = await execFileAsync(
      'claude',
      ['-p', fullPrompt, '--output-format', 'json', '--max-turns', '30'],
      { timeout, maxBuffer: 10 * 1024 * 1024, env },
    )

    // claude --output-format json returns { result: "...", ... }
    const envelope = JSON.parse(stdout) as { result: string }
    const text = envelope.result

    return JSON.parse(extractJson(text)) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.yellow(`  LLM: claude-code failed: ${message}`))
    return null
  }
}

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
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

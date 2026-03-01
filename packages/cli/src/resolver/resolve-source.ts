import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ResolvedSource, ResolveOptions } from './types.js'

export function isGitUrl(input: string): boolean {
  if (input.startsWith('https://') || input.startsWith('http://')) return true
  if (input.startsWith('git@')) return true
  if (/^github\.com\//.test(input)) return true
  if (/^gitlab\.com\//.test(input)) return true
  if (/^bitbucket\.org\//.test(input)) return true
  return false
}

export function parseGitUrl(input: string): string {
  let url = input
  if (!url.startsWith('https://') && !url.startsWith('http://') && !url.startsWith('git@')) {
    url = `https://${url}`
  }
  if (!url.endsWith('.git')) {
    url = `${url}.git`
  }
  return url
}

export async function resolveSource(
  input: string,
  options: ResolveOptions = {}
): Promise<ResolvedSource> {
  if (isGitUrl(input)) {
    return resolveRemote(input, options)
  }
  return resolveLocal(input, options)
}

function resolveLocal(input: string, options: ResolveOptions): ResolvedSource {
  const expanded = input.startsWith('~')
    ? input.replace('~', process.env.HOME ?? '')
    : input
  let cwd = resolve(expanded)
  if (options.path) {
    cwd = join(cwd, options.path)
  }
  if (!existsSync(cwd)) {
    throw new Error(`Directory not found: ${cwd}`)
  }
  return { cwd, isRemote: false }
}

async function resolveRemote(input: string, options: ResolveOptions): Promise<ResolvedSource> {
  const gitUrl = parseGitUrl(input)
  const tempDir = await mkdtemp(join(tmpdir(), 'preview-tool-'))
  execSync(`git clone --depth 1 --single-branch ${gitUrl} ${tempDir}`, { stdio: 'pipe' })
  let cwd = tempDir
  if (options.path) {
    cwd = join(cwd, options.path)
    if (!existsSync(cwd)) {
      throw new Error(`Subdirectory not found in cloned repo: ${options.path}`)
    }
  }
  return { cwd, isRemote: true, tempDir: options.keep ? undefined : tempDir }
}

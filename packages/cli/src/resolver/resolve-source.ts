import { resolve } from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
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
  if (/[;&|`$(){}[\]!#]/.test(url)) {
    throw new Error(`Invalid characters in URL: ${url}`)
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
    const resolved = join(cwd, options.path)
    if (!resolved.startsWith(cwd)) {
      throw new Error(`Path traversal detected: ${options.path}`)
    }
    cwd = resolved
  }
  if (!existsSync(cwd)) {
    throw new Error(`Directory not found: ${cwd}`)
  }
  return { cwd, isRemote: false }
}

async function resolveRemote(input: string, options: ResolveOptions): Promise<ResolvedSource> {
  const gitUrl = parseGitUrl(input)
  const tempDir = await mkdtemp(join(tmpdir(), 'preview-tool-'))

  try {
    execFileSync('git', ['clone', '--depth', '1', '--single-branch', gitUrl, tempDir], {
      stdio: 'pipe',
    })
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to clone ${input}: ${message}`)
  }

  let cwd = tempDir
  if (options.path) {
    const resolved = join(cwd, options.path)
    if (!resolved.startsWith(tempDir)) {
      await rm(tempDir, { recursive: true, force: true })
      throw new Error(`Path traversal detected: ${options.path}`)
    }
    cwd = resolved
    if (!existsSync(cwd)) {
      throw new Error(`Subdirectory not found in cloned repo: ${options.path}`)
    }
  }

  return { cwd, isRemote: true, tempDir: options.keep ? undefined : tempDir }
}

/**
 * Detect if cwd is a monorepo root and find the React web package.
 * Returns the absolute path to the package directory, or null if not a monorepo
 * or no React package found.
 */
export function detectMonorepoPackage(cwd: string): string | null {
  if (existsSync(join(cwd, 'src'))) return null

  const workspaceDirs = getWorkspacePackageDirs(cwd)
  if (workspaceDirs.length === 0) return null

  const candidates: Array<{ dir: string; score: number }> = []

  for (const pkgDir of workspaceDirs) {
    const pkgJsonPath = join(pkgDir, 'package.json')
    if (!existsSync(pkgJsonPath)) continue

    let pkg: { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    try {
      pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
    } catch {
      continue
    }

    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (!deps['react']) continue

    const srcDir = join(pkgDir, 'src')
    if (!existsSync(srcDir)) continue

    const tsxCount = countFiles(srcDir, '.tsx', 50)
    if (tsxCount === 0) continue

    let score = tsxCount > 5 ? 1 : 0

    if (deps['react-dom']) score += 2

    const dirName = pkgDir.split('/').pop() ?? ''
    if (['web', 'client', 'app', 'frontend'].includes(dirName)) score += 2

    candidates.push({ dir: pkgDir, score })
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].dir
}

function getWorkspacePackageDirs(cwd: string): string[] {
  const dirs: string[] = []

  const pnpmWs = join(cwd, 'pnpm-workspace.yaml')
  if (existsSync(pnpmWs)) {
    try {
      const content = readFileSync(pnpmWs, 'utf-8')
      const matches = content.matchAll(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$/gm)
      for (const m of matches) {
        dirs.push(...expandGlobPattern(cwd, m[1].trim()))
      }
    } catch { /* ignore */ }
  }

  if (dirs.length === 0) {
    const rootPkgPath = join(cwd, 'package.json')
    if (existsSync(rootPkgPath)) {
      try {
        const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'))
        const workspaces: string[] = Array.isArray(rootPkg.workspaces)
          ? rootPkg.workspaces
          : rootPkg.workspaces?.packages ?? []
        for (const pattern of workspaces) {
          dirs.push(...expandGlobPattern(cwd, pattern))
        }
      } catch { /* ignore */ }
    }
  }

  return dirs
}

function expandGlobPattern(base: string, pattern: string): string[] {
  if (pattern.endsWith('/*')) {
    const parent = join(base, pattern.slice(0, -2))
    if (!existsSync(parent)) return []
    try {
      return readdirSync(parent, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => join(parent, e.name))
    } catch {
      return []
    }
  }

  const direct = join(base, pattern)
  if (existsSync(direct)) return [direct]
  return []
}

function countFiles(dir: string, ext: string, max: number, depth = 3): number {
  if (depth <= 0) return 0
  let count = 0
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (count >= max) break
      if (entry.name === 'node_modules' || entry.name === '.preview') continue
      if (entry.isDirectory()) {
        count += countFiles(join(dir, entry.name), ext, max - count, depth - 1)
      } else if (entry.name.endsWith(ext)) {
        count++
      }
    }
  } catch { /* ignore */ }
  return count
}

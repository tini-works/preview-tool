import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import chalk from 'chalk'

interface PackageManagerInfo {
  pm: 'pnpm' | 'yarn' | 'bun' | 'npm'
  root: string
}

const LOCKFILE_MAP: Record<string, 'pnpm' | 'yarn' | 'bun'> = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'bun.lockb': 'bun',
}

/**
 * Detect package manager by walking up from cwd to find a lockfile.
 * This handles monorepos where the lockfile is at the workspace root.
 */
export function detectPackageManager(cwd: string): PackageManagerInfo {
  let dir = resolve(cwd)

  while (true) {
    for (const [lockfile, pm] of Object.entries(LOCKFILE_MAP)) {
      if (existsSync(join(dir, lockfile))) {
        return { pm, root: dir }
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return { pm: 'npm', root: cwd }
}

export function installDependencies(cwd: string): void {
  const { pm, root } = detectPackageManager(cwd)
  console.log(chalk.dim(`  Installing with ${pm}...`))
  try {
    execFileSync(pm, ['install'], { cwd: root, stdio: 'pipe' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Dependency installation failed (${pm}): ${message}`)
  }
}

export function ensureNodeModules(cwd: string): boolean {
  if (existsSync(join(cwd, 'node_modules'))) return true

  // For monorepos, check if the workspace root has node_modules
  const { root } = detectPackageManager(cwd)
  if (root !== cwd && existsSync(join(root, 'node_modules'))) return true

  return false
}

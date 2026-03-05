import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import chalk from 'chalk'

export function detectPackageManager(cwd: string): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'bun.lockb'))) return 'bun'
  return 'npm'
}

export function installDependencies(cwd: string): void {
  const pm = detectPackageManager(cwd)
  console.log(chalk.dim(`  Installing with ${pm}...`))
  try {
    execFileSync(pm, ['install'], { cwd, stdio: 'pipe' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Dependency installation failed (${pm}): ${message}`)
  }
}

export function ensureNodeModules(cwd: string): boolean {
  return existsSync(join(cwd, 'node_modules'))
}

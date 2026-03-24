import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface AliasEntry {
  find: string
  replacement: string
}

/**
 * Reads compilerOptions.paths from the project's tsconfig.json and converts
 * each path mapping to a Vite resolve.alias entry.
 *
 * Rules:
 *   "@/*": ["src/*"]      →  { find: "@/",  replacement: "<cwd>/src/" }
 *   "@":   ["src"]        →  { find: "@",   replacement: "<cwd>/src"  }
 *
 * Entries are sorted longest-find-first so "@components/" precedes "@/" and
 * more-specific aliases always win.
 *
 * Returns [] if tsconfig.json is absent, has no paths, or cannot be parsed.
 */
export function readProjectAliases(cwd: string): AliasEntry[] {
  const tsconfigPath = join(cwd, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return []

  let tsconfig: Record<string, unknown>
  try {
    tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8')) as Record<string, unknown>
  } catch {
    return []
  }

  const compilerOptions = tsconfig['compilerOptions'] as Record<string, unknown> | undefined
  const paths = compilerOptions?.['paths'] as Record<string, string[]> | undefined
  if (!paths || typeof paths !== 'object') return []

  const aliases: AliasEntry[] = []

  for (const [alias, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets) || targets.length === 0) continue
    const target = targets[0] as string

    const hasWildcard = alias.endsWith('/*')
    const find = hasWildcard
      ? alias.slice(0, -1)                  // "@/*" → "@/"
      : alias                               // "@"   → "@"
    const resolvedTarget = target.replace(/\/\*$/, '')  // "src/*" → "src"
    const replacement = hasWildcard
      ? join(cwd, resolvedTarget) + '/'
      : join(cwd, resolvedTarget)

    aliases.push({ find, replacement })
  }

  // Longest find first — prevents "@/" from matching before "@components/"
  aliases.sort((a, b) => b.find.length - a.find.length)

  return aliases
}

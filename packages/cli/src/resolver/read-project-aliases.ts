import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

export interface AliasEntry {
  find: string
  replacement: string
}

/**
 * Recursively reads compilerOptions.paths from a tsconfig file, following the
 * `extends` chain. Base paths are merged first; child paths override same keys.
 * Recursion is capped at 5 levels to prevent infinite loops.
 */
function readTsconfigPaths(tsconfigPath: string, depth: number): Record<string, string[]> {
  if (depth > 5) return {}
  if (!existsSync(tsconfigPath)) return {}

  let tsconfig: Record<string, unknown>
  try {
    tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }

  // Follow extends chain first (base paths)
  let basePaths: Record<string, string[]> = {}
  const extendsValue = tsconfig['extends']
  if (typeof extendsValue === 'string') {
    let extendedPath = resolve(dirname(tsconfigPath), extendsValue)
    if (!extendedPath.endsWith('.json')) {
      extendedPath += '.json'
    }
    basePaths = readTsconfigPaths(extendedPath, depth + 1)
  }

  const compilerOptions = tsconfig['compilerOptions'] as Record<string, unknown> | undefined
  const ownPaths = compilerOptions?.['paths'] as Record<string, string[]> | undefined

  return {
    ...basePaths,
    ...(ownPaths && typeof ownPaths === 'object' ? ownPaths : {}),
  }
}

/**
 * Reads compilerOptions.paths from the project's tsconfig.json (following
 * the `extends` chain) and converts each path mapping to a Vite resolve.alias entry.
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

  const paths = readTsconfigPaths(tsconfigPath, 0)
  if (!paths || Object.keys(paths).length === 0) return []

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

import type { ClassifiedHook, HookCategory } from '../analyzer/types.js'

const SKIP_CATEGORIES: ReadonlySet<HookCategory> = new Set([
  'unknown',
  'state',
])

export function sanitizeFileName(importPath: string): string {
  return importPath
    .replace(/^@\//, '_')
    .replace(/^@/, '_')
    .replace(/^~\//, '_')
    .replace(/\//g, '_')
}

export function generateAliasManifest(
  hooks: readonly ClassifiedHook[],
  mocksDir: string,
): Record<string, string> {
  const aliases: Record<string, string> = {}

  for (const hook of hooks) {
    if (SKIP_CATEGORIES.has(hook.category)) {
      continue
    }

    if (aliases[hook.importPath] !== undefined) {
      continue
    }

    const fileName = sanitizeFileName(hook.importPath)
    aliases[hook.importPath] = `${mocksDir}/${fileName}.js`
  }

  return aliases
}

/**
 * Vite plugin that transforms screen files for preview mode:
 * 1. useState → usePreviewState (controlled by region state machine)
 * 2. useEffect → no-op (suppresses side effects like fetch calls)
 */

// Matches: const [x, setX] = useState(init) and const [x, setX] = useState<Type>(init)
// The (?:<[^(]+>)? handles generic type params like <LoginFormData> or <Partial<Record<K, V>>>
// It matches any chars except '(' between < and > — safe because generic params don't contain '('
const USE_STATE_PATTERN =
  /const\s+\[(\w+),\s*(\w+)\]\s*=\s*(?:React\.)?useState(?:<[^(]+>)?\(([^)]*)\)/g

export function transformUseState(code: string): string {
  let transformed = code
  let hasStateReplacements = false

  transformed = transformed.replace(
    USE_STATE_PATTERN,
    (_match, varName, setterName, initialValue) => {
      hasStateReplacements = true
      return `const [${varName}, ${setterName}] = usePreviewState('${varName}', ${initialValue})`
    },
  )

  if (hasStateReplacements) {
    // Check for the specific usePreviewState import — not just any runtime import
    // (the i18n plugin may have already added a different runtime import)
    if (!transformed.includes('import { usePreviewState }')) {
      transformed = `import { usePreviewState } from '@preview-tool/runtime'\n${transformed}`
    }
  }

  // Suppress useEffect — override with no-op to prevent side effects (API calls, timers, etc.)
  // In preview mode, all data comes from the region state machine, not from effects.
  // We remove useEffect from the React import and shadow it with a no-op const.
  if (transformed.includes('useEffect')) {
    // Remove useEffect from the import: import { useState, useEffect, useCallback } from 'react'
    // → import { useState, useCallback } from 'react'
    transformed = transformed.replace(
      /(import\s*\{[^}]*)\buseEffect\b\s*,?\s*/,
      (match, before) => {
        // Clean up trailing/leading commas
        return before.replace(/,\s*$/, '')
      }
    )
    // Also handle if useEffect was the last named import: { foo, useEffect }
    transformed = transformed.replace(/,\s*useEffect\s*}/g, ' }')
    // Handle if useEffect was the only import: { useEffect }
    transformed = transformed.replace(/\{\s*useEffect\s*\}/g, '{}')

    // Shadow useEffect with a no-op
    if (!transformed.includes('const useEffect =')) {
      transformed = `const useEffect = (() => {}) as any\n${transformed}`
    }
  }

  return transformed
}

export function createPreviewStatePlugin(screenFilePaths: readonly string[]) {
  const screenSet = new Set(screenFilePaths)

  return {
    name: 'preview-state-transform',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      // Strip query/hash suffix Vite may append (e.g. ?v=xxx)
      const cleanId = id.replace(/[?#].*$/, '')
      if (!screenSet.has(cleanId)) return undefined

      const transformed = transformUseState(code)
      if (transformed === code) return undefined

      return { code: transformed, map: null }
    },
  }
}

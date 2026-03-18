/**
 * Vite plugin that transforms useState calls to usePreviewState in screen files.
 * Applied only during `preview dev` to screen component files.
 */

// Matches: const [x, setX] = useState(init) and const [x, setX] = useState<Type>(init)
// The (?:<[^(]+>)? handles generic type params like <LoginFormData> or <Partial<Record<K, V>>>
// It matches any chars except '(' between < and > — safe because generic params don't contain '('
const USE_STATE_PATTERN =
  /const\s+\[(\w+),\s*(\w+)\]\s*=\s*(?:React\.)?useState(?:<[^(]+>)?\(([^)]*)\)/g

export function transformUseState(code: string): string {
  let transformed = code
  let hasReplacements = false

  transformed = transformed.replace(
    USE_STATE_PATTERN,
    (_match, varName, setterName, initialValue) => {
      hasReplacements = true
      return `const [${varName}, ${setterName}] = usePreviewState('${varName}', ${initialValue})`
    },
  )

  if (hasReplacements) {
    // Check for the specific usePreviewState import — not just any runtime import
    // (the i18n plugin may have already added a different runtime import)
    if (!transformed.includes('import { usePreviewState }')) {
      transformed = `import { usePreviewState } from '@preview-tool/runtime'\n${transformed}`
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

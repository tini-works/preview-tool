/**
 * Vite plugin that transforms useState calls to usePreviewState in screen files.
 * Applied only during `preview dev` to screen component files.
 */

const USE_STATE_PATTERN =
  /const\s+\[(\w+),\s*(\w+)\]\s*=\s*(?:React\.)?useState\(([^)]*)\)/g

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
    if (
      !transformed.includes("from '@preview-tool/runtime'") ||
      !transformed.includes('usePreviewState')
    ) {
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
      if (!screenSet.has(id)) return undefined

      const transformed = transformUseState(code)
      if (transformed === code) return undefined

      return { code: transformed, map: null }
    },
  }
}

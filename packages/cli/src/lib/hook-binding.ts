/**
 * Parses a hookBinding string in the format "hookName:identifier".
 * Returns { hookName, identifier } or undefined if the format is invalid.
 *
 * Used by both generate-from-analysis and generate-mock-from-analysis.
 */
export function parseHookBinding(binding: string): { hookName: string; identifier: string } | undefined {
  const colonIndex = binding.indexOf(':')
  if (colonIndex === -1) {
    return undefined
  }
  const hookName = binding.slice(0, colonIndex).trim()
  const identifier = binding.slice(colonIndex + 1).trim()
  if (!hookName || !identifier) {
    return undefined
  }
  return { hookName, identifier }
}

/** Import paths that should never be mocked or produce regions — provided by React itself */
export const REACT_IMPORT_PATHS = new Set([
  'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime',
])

/**
 * React built-in hooks that should never produce regions.
 *
 * Note: `useContext` is intentionally included here even though template-fallback.ts
 * template-4 has a special pattern for it. Template-4 runs before the catch-all
 * template-5, which guards against REACT_BUILTIN_HOOKS members — so including
 * useContext here ensures template-5 can never accidentally claim it if template-4
 * were removed or reordered.
 */
export const REACT_BUILTIN_HOOKS = new Set([
  'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback',
  'useReducer', 'useLayoutEffect', 'useId', 'useImperativeHandle',
  'useInsertionEffect', 'useSyncExternalStore', 'useTransition',
  'useDeferredValue', 'useDebugValue',
  // useContext is a React built-in; template-fallback.ts template-4 handles it specially
  'useContext',
  // React 19+
  'useFormState', 'useActionState', 'useOptimistic', 'use',
])

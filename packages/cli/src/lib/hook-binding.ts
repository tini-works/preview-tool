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

/** React built-in hooks that should never produce regions */
export const REACT_BUILTIN_HOOKS = new Set([
  'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback',
  'useReducer', 'useLayoutEffect', 'useId', 'useImperativeHandle',
  'useInsertionEffect', 'useSyncExternalStore', 'useTransition',
  'useDeferredValue', 'useDebugValue',
  // React 19+
  'useFormState', 'useActionState', 'useOptimistic', 'use',
])

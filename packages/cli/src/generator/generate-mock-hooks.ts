import type { HookAnalysis } from '../analyzer/types.js'

/**
 * Generates a mock hook module that reads from @preview-tool/runtime's
 * RegionDataContext via useRegionDataForHook.
 *
 * Each generated mock:
 * - Exports the same function name as the original hook
 * - Calls useRegionDataForHook to resolve region data
 * - Returns a default loading state when region data is not available
 * - Returns { data, isLoading, isError } based on the active state
 */
export function generateMockHook(
  hooks: HookAnalysis[],
  importPath: string,
): string {
  const hookNames = [...new Set(hooks.map((h) => h.hookName))]
  const isAppLiveQuery = hookNames.some((n) =>
    n === 'useAppLiveQuery' || n === 'useLiveQuery'
  )
  const isReactQuery = importPath === '@tanstack/react-query'
  const isSWR = importPath === 'swr'

  const lines: string[] = [
    '// Auto-generated mock by @preview-tool/cli — do not edit manually',
    "import { useRegionDataForHook } from '@preview-tool/runtime'",
    '',
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    'function resolveFromState(stateData: Record<string, any>) {',
    "  if (stateData._loading) return { data: undefined, isLoading: true, isError: false, isReady: false }",
    "  if (stateData._error) return { data: undefined, isLoading: false, isError: true, isReady: false, error: stateData.message }",
    '  return { data: stateData.data ?? stateData, isLoading: false, isError: false, isReady: true }',
    '}',
    '',
    'const DEFAULT_STATE = { data: undefined, isLoading: true, isError: false, isReady: false }',
    '',
  ]

  if (isAppLiveQuery) {
    for (const hookName of hookNames) {
      lines.push(
        `// Mock replacement for ${hookName}`,
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
        `export function ${hookName}(`,
        '  _queryFn: any,',
        '  depsOrSectionId?: Array<unknown> | string,',
        '  sectionId?: string,',
        ') {',
        '  const resolvedId = typeof depsOrSectionId === \'string\' ? depsOrSectionId : sectionId',
        "  const contextData = useRegionDataForHook('custom-hook', resolvedId)",
        '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
        '  if (contextData) return resolveFromState(contextData as Record<string, any>)',
        '  return DEFAULT_STATE',
        '}',
        '',
      )
    }
  } else if (isReactQuery) {
    lines.push(
      '// Mock replacement for useQuery',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      'export function useQuery(options: any) {',
      '  const queryKey = Array.isArray(options?.queryKey) ? options.queryKey : []',
      "  const contextData = useRegionDataForHook('query-hook', queryKey)",
      '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
      '  if (contextData) return resolveFromState(contextData as Record<string, any>)',
      '  return DEFAULT_STATE',
      '}',
      '',
      '// Pass-through for non-data hooks',
      'export function useMutation() { return { mutate: () => {}, mutateAsync: async () => {}, isPending: false } }',
      'export function useQueryClient() { return { invalidateQueries: () => {}, setQueryData: () => {} } }',
      'export function QueryClientProvider({ children }: { children: React.ReactNode }) { return children }',
      'export class QueryClient { constructor() {} }',
      '',
    )
  } else if (isSWR) {
    lines.push(
      '// Mock replacement for useSWR',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      'export default function useSWR(key: any) {',
      '  const keyArr = typeof key === \'string\' ? [key] : Array.isArray(key) ? key : []',
      "  const contextData = useRegionDataForHook('query-hook', keyArr)",
      '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
      "  if (contextData) { const s = resolveFromState(contextData as Record<string, any>); return { ...s, error: s.isError ? new Error('Mock error') : undefined, isValidating: false } }",
      "  return { ...DEFAULT_STATE, error: undefined, isValidating: false }",
      '}',
      '',
    )
  }

  // Catch-all for generic hooks
  if (!isAppLiveQuery && !isReactQuery && !isSWR) {
    for (const hookName of hookNames) {
      lines.push(
        `// Mock replacement for ${hookName}`,
        '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
        `export function ${hookName}(...args: any[]) {`,
        '  const sectionId = args.find((a): a is string => typeof a === \'string\')',
        "  const contextData = useRegionDataForHook('unknown', sectionId)",
        '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
        '  if (contextData) return resolveFromState(contextData as Record<string, any>)',
        '  return DEFAULT_STATE',
        '}',
        '',
      )
    }
  }

  lines.push('// Re-export types as empty to prevent import errors')
  lines.push('export type { }')

  return lines.join('\n')
}

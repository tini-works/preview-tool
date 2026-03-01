import type { HookAnalysis } from '../analyzer/types.js'

/**
 * Generates a mock hook module that reads from @preview-tool/runtime's
 * regionStates instead of fetching real data.
 *
 * Each generated mock:
 * - Exports the same function name as the original hook
 * - Reads regionState from useDevToolsStore
 * - Looks up mock data from the model registry
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
    "import { useDevToolsStore } from '@preview-tool/runtime'",
    '',
    '// Model registry: sectionId → { stateName → stateData }',
    'let modelRegistry: Record<string, Record<string, unknown>> = {}',
    '',
    'export function registerModels(models: Record<string, Record<string, unknown>>) {',
    '  modelRegistry = { ...models }',
    '}',
    '',
    'function resolveState(sectionId: string | undefined) {',
    "  const regionState = useDevToolsStore((s) => sectionId ? (s.regionStates[sectionId] ?? 'populated') : 'populated')",
    '  const listCount = useDevToolsStore((s) => sectionId ? s.regionListCounts[sectionId] : undefined)',
    '  const stateData = sectionId ? (modelRegistry[sectionId]?.[regionState] ?? {}) : {}',
    '',
    '  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
    '  const raw = stateData as Record<string, any>',
    "  if (raw._loading) return { data: undefined, isLoading: true, isError: false, isReady: false }",
    "  if (raw._error) return { data: undefined, isLoading: false, isError: true, isReady: false }",
    '',
    '  let data = raw.data',
    '  if (Array.isArray(data) && listCount !== undefined) {',
    '    data = data.slice(0, listCount)',
    '  }',
    '  return { data, isLoading: false, isError: false, isReady: true }',
    '}',
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
        '  return resolveState(resolvedId)',
        '}',
        '',
      )
    }
  } else if (isReactQuery) {
    lines.push(
      '// Mock replacement for useQuery',
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      'export function useQuery(options: any) {',
      '  const queryKey = Array.isArray(options?.queryKey) ? options.queryKey.join(\'-\') : undefined',
      '  return resolveState(queryKey)',
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
      '  const sectionId = typeof key === \'string\' ? key : Array.isArray(key) ? key.join(\'-\') : undefined',
      '  const state = resolveState(sectionId)',
      '  return { ...state, error: state.isError ? new Error(\'Mock error\') : undefined, isValidating: false }',
      '}',
      '',
    )
  }

  // Re-export anything else the original module might export as no-ops
  lines.push('// Re-export types as empty to prevent import errors')
  lines.push('export type { }')

  return lines.join('\n')
}

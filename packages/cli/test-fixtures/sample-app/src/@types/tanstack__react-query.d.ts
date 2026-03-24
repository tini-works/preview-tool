// Minimal ambient declaration for test fixture — not the real package types.
// Allows TypeScript to compile screens that import from @tanstack/react-query
// without requiring the package to be installed.
declare module '@tanstack/react-query' {
  export function useQuery(options: Record<string, unknown>): {
    data: unknown
    isLoading: boolean
    isPending: boolean
    error: unknown
  }
  export function useMutation(options: Record<string, unknown>): {
    mutate: (vars: unknown) => void
    isPending: boolean
    error: unknown
  }
  export function useSuspenseQuery(options: Record<string, unknown>): {
    data: unknown
    isPending: boolean
    error: unknown
  }
}

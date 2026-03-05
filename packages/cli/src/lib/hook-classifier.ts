/**
 * Hook classifier: determines whether a hook should be mocked (data)
 * or provided via real library providers (provider).
 *
 * - 'data'     — hooks returning app data/state, need mocking (useQuery, useAuthStore, etc.)
 * - 'provider' — hooks from libraries that ship providers or return utility objects
 *                (useForm, useNavigate, useTranslation, etc.)
 */

// ---------------------------------------------------------------------------
// Known provider hooks (exact name match)
// ---------------------------------------------------------------------------

export const PROVIDER_HOOKS = new Set([
  // react-router-dom
  'useNavigate',
  'useParams',
  'useLocation',
  'useSearchParams',
  'useMatch',
  'useMatches',
  // react-hook-form
  'useForm',
  'useFormContext',
  'useController',
  'useWatch',
  'useFieldArray',
  // react-i18next
  'useTranslation',
  // @tanstack/react-query (mutation-only — queries are data hooks)
  'useMutation',
])

// ---------------------------------------------------------------------------
// Known provider packages (import path match)
// ---------------------------------------------------------------------------

export const PROVIDER_PACKAGES = new Set([
  'react-router-dom',
  'react-hook-form',
  'react-i18next',
  'next/router',
  'next/navigation',
])

// ---------------------------------------------------------------------------
// Known data hooks (exact name match — npm packages that return app data)
// ---------------------------------------------------------------------------

export const DATA_HOOKS = new Set([
  'useQuery',          // @tanstack/react-query
  'useSWR',            // swr
  'useFetch',          // various data-fetching libs
  'useLiveQuery',      // dexie-react-hooks
  'useAppLiveQuery',   // app-specific live queries
])

// ---------------------------------------------------------------------------
// Data hook name patterns
// ---------------------------------------------------------------------------

const DATA_HOOK_PATTERNS = [
  /^use\w+Store$/,        // useXxxStore — Zustand stores
  /^use\w*Query$/,        // useXxxQuery — data fetching
]

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export type HookCategory = 'data' | 'provider'

/**
 * Classifies a hook as either 'data' (needs mocking) or 'provider' (use real providers).
 *
 * Classification strategy (ordered by specificity):
 * 1. Exact name match against PROVIDER_HOOKS set → provider
 * 2. Exact name match against DATA_HOOKS set → data
 * 3. Import path match against PROVIDER_PACKAGES set → provider
 * 4. Name pattern match (useXxxStore, useXxxQuery → data)
 * 5. Default: local imports → data, npm packages → provider
 */
export function classifyHook(hookName: string, importPath: string): HookCategory {
  // 1. Exact provider hook name
  if (PROVIDER_HOOKS.has(hookName)) {
    return 'provider'
  }

  // 2. Exact data hook name (npm data-fetching libraries)
  if (DATA_HOOKS.has(hookName)) {
    return 'data'
  }

  // 3. Known provider package
  if (PROVIDER_PACKAGES.has(importPath)) {
    return 'provider'
  }

  // 4. Data hook name patterns
  for (const pattern of DATA_HOOK_PATTERNS) {
    if (pattern.test(hookName)) {
      return 'data'
    }
  }

  // 5. Default: local imports are data, npm packages are provider
  if (isLocalImport(importPath)) {
    return 'data'
  }

  return 'provider'
}

function isLocalImport(importPath: string): boolean {
  return importPath.startsWith('./') ||
    importPath.startsWith('../') ||
    importPath.startsWith('@/') ||
    importPath.startsWith('~/')
}

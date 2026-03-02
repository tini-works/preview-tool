import { basename, dirname } from 'node:path'

const SCREEN_DIRECTORIES = ['screens', 'pages', 'views', 'routes']

const SCREEN_FILE_SUFFIXES = ['Page', 'Screen', 'View']

const ROUTING_HOOKS = [
  'useParams',
  'useNavigate',
  'useRouter',
  'useRoute',
  'useLocation',
  'useSearchParams',
  'useMatch',
  'useHistory',
]

const DATA_FETCHING_HOOKS = [
  'useQuery',
  'useSWR',
  'useMutation',
  'useInfiniteQuery',
  'useSuspenseQuery',
  'useLazyQuery',
  'useFetch',
]

/**
 * Score a file to determine how likely it is to be a screen/page component.
 *
 * Scoring rules:
 * - +50: File path matches a route-referenced file
 * - +30: File is in screens/, pages/, views/, or routes/ directory
 * - +20: File named *Page.tsx, *Screen.tsx, *View.tsx
 * - +15: Content contains routing hooks
 * - +15: Content has default export
 * - +10: Content contains data-fetching hooks
 * - +10: File is index.tsx inside a PascalCase-named folder
 */
export function scoreFile(
  filePath: string,
  content: string,
  routeReferencedFiles: readonly string[]
): number {
  let score = 0

  score += scoreRouteReference(filePath, routeReferencedFiles)
  score += scoreScreenDirectory(filePath)
  score += scoreScreenFileName(filePath)
  score += scoreRoutingHooks(content)
  score += scoreDefaultExport(content)
  score += scoreDataFetchingHooks(content)
  score += scorePascalCaseIndex(filePath)

  return score
}

function scoreRouteReference(
  filePath: string,
  routeReferencedFiles: readonly string[]
): number {
  const normalized = filePath.replace(/\\/g, '/')
  const matches = routeReferencedFiles.some((ref) => {
    const normalizedRef = ref.replace(/\\/g, '/')
    return normalized === normalizedRef || normalized.endsWith(`/${normalizedRef}`)
  })
  return matches ? 50 : 0
}

function scoreScreenDirectory(filePath: string): number {
  const parts = filePath.replace(/\\/g, '/').split('/')
  const hasScreenDir = parts.some((part) => SCREEN_DIRECTORIES.includes(part))
  return hasScreenDir ? 30 : 0
}

function scoreScreenFileName(filePath: string): number {
  const fileName = basename(filePath).replace(/\.(tsx|jsx|ts|js)$/, '')
  const hasSuffix = SCREEN_FILE_SUFFIXES.some((suffix) => fileName.endsWith(suffix))
  return hasSuffix ? 20 : 0
}

function scoreRoutingHooks(content: string): number {
  const hasRoutingHook = ROUTING_HOOKS.some((hook) => content.includes(hook))
  return hasRoutingHook ? 15 : 0
}

function scoreDefaultExport(content: string): number {
  return /export\s+default\s+/.test(content) ? 15 : 0
}

function scoreDataFetchingHooks(content: string): number {
  const hasFetchHook = DATA_FETCHING_HOOKS.some((hook) => content.includes(hook))
  return hasFetchHook ? 10 : 0
}

function scorePascalCaseIndex(filePath: string): number {
  const normalized = filePath.replace(/\\/g, '/')
  const fileName = basename(normalized)

  if (!fileName.startsWith('index.')) return 0

  const parentDir = basename(dirname(normalized))
  const isPascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(parentDir)

  return isPascalCase ? 10 : 0
}

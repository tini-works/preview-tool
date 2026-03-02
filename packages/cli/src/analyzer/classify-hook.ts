import type { ExtractedHook, ClassifiedHook, HookCategory } from './types.js'

interface CategoryPattern {
  readonly category: HookCategory
  readonly names: ReadonlySet<string>
  readonly states: readonly string[]
  readonly defaultState: string
  readonly isList: boolean
}

const CATEGORY_PATTERNS: readonly CategoryPattern[] = [
  {
    category: 'data-fetching',
    names: new Set([
      'useQuery',
      'useSWR',
      'useFetch',
      'useAppLiveQuery',
      'useLiveQuery',
    ]),
    states: ['loading', 'error', 'empty', 'populated'],
    defaultState: 'populated',
    isList: true,
  },
  {
    category: 'auth',
    names: new Set([
      'useAuth',
      'useSession',
      'useUser',
      'useCurrentUser',
    ]),
    states: ['authenticated', 'unauthenticated'],
    defaultState: 'authenticated',
    isList: false,
  },
  {
    category: 'navigation',
    names: new Set([
      'useNavigate',
      'useRouter',
      'useLocation',
      'useParams',
      'useSearchParams',
      'useMatch',
      'useHistory',
    ]),
    states: [],
    defaultState: '',
    isList: false,
  },
  {
    category: 'i18n',
    names: new Set([
      'useTranslation',
      'useIntl',
      'useLocale',
      'useI18n',
      'useFormatMessage',
    ]),
    states: [],
    defaultState: '',
    isList: false,
  },
]

function deriveRegionName(hook: ExtractedHook): string {
  const firstArg = hook.callArgs[0]

  if (
    firstArg !== undefined &&
    firstArg.length > 0 &&
    !firstArg.startsWith('{') &&
    !firstArg.startsWith('[')
  ) {
    return firstArg
  }

  const withoutUse = hook.hookName.replace(/^use/, '')
  return withoutUse.charAt(0).toLowerCase() + withoutUse.slice(1)
}

export function classifyHook(hook: ExtractedHook): ClassifiedHook {
  // Check against known patterns
  for (const pattern of CATEGORY_PATTERNS) {
    if (pattern.names.has(hook.hookName)) {
      return {
        ...hook,
        category: pattern.category,
        regionName: deriveRegionName(hook),
        states: pattern.states,
        defaultState: pattern.defaultState,
        isList: pattern.isList,
        returnShape: null,
      }
    }
  }

  // Custom project hooks (local, not matched above)
  if (hook.isProjectLocal) {
    return {
      ...hook,
      category: 'custom',
      regionName: deriveRegionName(hook),
      states: ['loading', 'error', 'empty', 'populated'],
      defaultState: 'populated',
      isList: false,
      returnShape: null,
    }
  }

  // Unknown
  return {
    ...hook,
    category: 'unknown',
    regionName: deriveRegionName(hook),
    states: [],
    defaultState: '',
    isList: false,
    returnShape: null,
  }
}

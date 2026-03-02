import type { ClassifiedHook, HookCategory, ScreenRegion } from './types.js'

const SKIP_CATEGORIES: ReadonlySet<HookCategory> = new Set([
  'navigation',
  'i18n',
  'state',
  'unknown',
])

function formatLabel(name: string): string {
  // Convert camelCase / PascalCase to Title Case with spaces
  const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatSource(hook: ClassifiedHook): string {
  const args = hook.callArgs.length > 0
    ? `(${hook.callArgs.map((a) => JSON.stringify(a)).join(', ')})`
    : '()'
  return `${hook.hookName}${args}`
}

function buildDataFetchingMockData(): Record<string, Record<string, unknown>> {
  return {
    loading: { data: null, isLoading: true, error: null },
    error: {
      data: null,
      isLoading: false,
      error: { message: 'Something went wrong' },
    },
    empty: { data: [], isLoading: false, error: null },
    populated: {
      data: [
        { id: '1', name: 'Item 1', status: 'active', createdAt: '2024-01-01T00:00:00Z' },
        { id: '2', name: 'Item 2', status: 'active', createdAt: '2024-01-02T00:00:00Z' },
        { id: '3', name: 'Item 3', status: 'pending', createdAt: '2024-01-03T00:00:00Z' },
        { id: '4', name: 'Item 4', status: 'inactive', createdAt: '2024-01-04T00:00:00Z' },
        { id: '5', name: 'Item 5', status: 'active', createdAt: '2024-01-05T00:00:00Z' },
      ],
      isLoading: false,
      error: null,
    },
  }
}

function buildAuthMockData(): Record<string, Record<string, unknown>> {
  return {
    authenticated: {
      user: {
        id: '1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        avatar: 'https://i.pravatar.cc/150?u=1',
      },
      isAuthenticated: true,
    },
    unauthenticated: {
      user: null,
      isAuthenticated: false,
    },
  }
}

function buildCustomMockData(): Record<string, Record<string, unknown>> {
  return {
    loading: { data: null, isLoading: true, error: null },
    error: {
      data: null,
      isLoading: false,
      error: { message: 'Failed to load' },
    },
    empty: { data: null, isLoading: false, error: null },
    populated: {
      data: { id: '1', name: 'Sample Item', status: 'active' },
      isLoading: false,
      error: null,
    },
  }
}

function buildMockData(category: HookCategory): Record<string, Record<string, unknown>> {
  switch (category) {
    case 'data-fetching':
      return buildDataFetchingMockData()
    case 'auth':
      return buildAuthMockData()
    case 'custom':
      return buildCustomMockData()
    default:
      return {}
  }
}

export function inferRegions(
  hooks: readonly ClassifiedHook[],
): readonly ScreenRegion[] {
  const regions: ScreenRegion[] = []

  for (const hook of hooks) {
    if (SKIP_CATEGORIES.has(hook.category)) {
      continue
    }

    if (hook.states.length === 0) {
      continue
    }

    const region: ScreenRegion = {
      name: hook.regionName,
      label: formatLabel(hook.regionName),
      source: formatSource(hook),
      states: hook.states,
      defaultState: hook.defaultState,
      isList: hook.isList,
      mockData: buildMockData(hook.category),
    }

    regions.push(region)
  }

  return regions
}

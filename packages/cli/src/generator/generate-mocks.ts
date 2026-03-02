import type { ClassifiedHook, ScreenRegion } from '../analyzer/types.js'

function buildMockDataLiteral(regions: readonly ScreenRegion[], regionName: string): string {
  const region = regions.find((r) => r.name === regionName)
  if (!region) {
    return '{}'
  }
  return JSON.stringify(region.mockData, null, 2)
}

function generateDataFetchingMock(
  hook: ClassifiedHook,
  regions: readonly ScreenRegion[],
): string {
  const mockDataLiteral = buildMockDataLiteral(regions, hook.regionName)

  return `import { usePreviewRegion } from '@preview-tool/runtime';

const mockData = ${mockDataLiteral};

export function useQuery() {
  const { state } = usePreviewRegion('${hook.regionName}');
  return mockData[state] ?? mockData['${hook.defaultState}'] ?? {};
}

export function useQueryClient() {
  return {
    invalidateQueries: () => Promise.resolve(),
    prefetchQuery: () => Promise.resolve(),
    getQueryData: () => undefined,
    setQueryData: () => undefined,
  };
}

export function QueryClientProvider({ children }) {
  return children;
}

export class QueryClient {
  constructor() {}
  invalidateQueries() { return Promise.resolve(); }
  prefetchQuery() { return Promise.resolve(); }
  getQueryData() { return undefined; }
  setQueryData() { return undefined; }
}

export function useMutation() {
  return {
    mutate: () => {},
    mutateAsync: () => Promise.resolve(),
    isLoading: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
    reset: () => {},
  };
}
`
}

function generateAuthMock(
  hook: ClassifiedHook,
  regions: readonly ScreenRegion[],
): string {
  const mockDataLiteral = buildMockDataLiteral(regions, hook.regionName)

  return `import { usePreviewRegion } from '@preview-tool/runtime';

const mockData = ${mockDataLiteral};

export function ${hook.hookName}() {
  const { state } = usePreviewRegion('${hook.regionName}');
  return mockData[state] ?? mockData['${hook.defaultState}'] ?? {};
}
`
}

function generateNavigationMock(): string {
  return `export function useNavigate() {
  return (to) => {
    window.dispatchEvent(
      new CustomEvent('preview-navigate', { detail: { to } })
    );
  };
}

export function useLocation() {
  return { pathname: '/', search: '', hash: '', state: null, key: 'default' };
}

export function useParams() {
  return {};
}

export function useSearchParams() {
  return [new URLSearchParams(), () => {}];
}

export function MemoryRouter({ children }) {
  return children;
}

export function BrowserRouter({ children }) {
  return children;
}

export function Routes({ children }) {
  return children;
}

export function Route({ element }) {
  return element ?? null;
}

export function Link({ children, to, ...props }) {
  return children;
}

export function Outlet() {
  return null;
}
`
}

function generateI18nMock(hook: ClassifiedHook): string {
  return `export function ${hook.hookName}() {
  return {
    t: (key) => key,
    i18n: {
      language: 'en',
      changeLanguage: () => Promise.resolve(),
    },
  };
}
`
}

function generateCustomMock(
  hook: ClassifiedHook,
  regions: readonly ScreenRegion[],
): string {
  const mockDataLiteral = buildMockDataLiteral(regions, hook.regionName)

  return `import { usePreviewRegion } from '@preview-tool/runtime';

const mockData = ${mockDataLiteral};

export function ${hook.hookName}() {
  const { state } = usePreviewRegion('${hook.regionName}');
  return mockData[state] ?? mockData['${hook.defaultState}'] ?? {};
}
`
}

function generateUnknownMock(hook: ClassifiedHook): string {
  return `export function ${hook.hookName}() {
  return {};
}
`
}

export function generateMockModule(
  hook: ClassifiedHook,
  regions: readonly ScreenRegion[],
): string {
  switch (hook.category) {
    case 'data-fetching':
      return generateDataFetchingMock(hook, regions)
    case 'auth':
      return generateAuthMock(hook, regions)
    case 'navigation':
      return generateNavigationMock()
    case 'i18n':
      return generateI18nMock(hook)
    case 'custom':
      return generateCustomMock(hook, regions)
    case 'unknown':
      return generateUnknownMock(hook)
    case 'state':
      return generateUnknownMock(hook)
  }
}

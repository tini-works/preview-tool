# Module Aliasing Preview — Design Document

**Date:** 2026-03-01
**Status:** Approved
**Goal:** Make preview-tool work as a universal React screen simulator for external codebases by intercepting data hooks via Vite module aliasing

## Problem Statement

The current CLI generates `.preview/` artifacts with correct region/state definitions, but **state switching doesn't work** because:

1. `model.ts` state objects are empty `{}` — no actual mock data
2. External screens fetch their own data via hooks (`useLiveQuery`, `useQuery`, etc.) — they don't consume the preview-tool's `data` prop
3. The state bridge approach requires the external app to have a compatible devtool store

## Solution: Module Aliasing + Mock Data Generation

### Core Concept

Instead of trying to control the external app's state management externally, **replace its data hooks at build time** with mock implementations that read from the preview-tool's runtime store.

```
External screen (unchanged source):
  import { useLiveQuery } from '@/hooks/use-app-live-query'
  const { data } = useLiveQuery(q => q.from(services), 'service-grid')

Vite alias (in .preview/vite.config.ts):
  '@/hooks/use-app-live-query' → '.preview/mocks/use-app-live-query.ts'

Mock hook reads from preview-tool:
  regionStates['service-grid'] === 'loading' → return { isLoading: true }
  regionStates['service-grid'] === 'populated' → return { data: mockServices }
```

## Architecture

### MVC Decomposition

| Layer | Source | Content |
|-------|--------|---------|
| **M (Model)** | CLI + LLM generates | Region definitions + realistic mock data per state |
| **V (View)** | Original screen component (imported as-is) | Unchanged JSX rendering |
| **C (Controller)** | CLI + LLM generates | Flow definitions (click → navigate, click → state change) |

### Data Flow

```
Inspector clicks "loading"
         │
         ▼
useDevToolsStore.regionStates['service-grid'] = 'loading'
         │
         ▼
Mock hook (via Vite alias) reads regionState
         │
         ▼
Returns { data: undefined, isLoading: true, isError: false }
         │
         ▼
Screen re-renders with loading spinner
```

### Generated File Structure

```
.preview/
├── mocks/                          # Mock hook implementations
│   ├── use-app-live-query.ts       # Mock for @/hooks/use-app-live-query
│   ├── auth-store.ts               # Mock for @/stores/auth
│   └── collections.ts              # Mock for @/lib/collections
├── screens/
│   └── {route}/
│       ├── model.ts                # Regions + mock data (enhanced)
│       ├── view.ts                 # ViewTree (unchanged)
│       ├── controller.ts           # Flows + journeys (unchanged)
│       └── adapter.ts              # Imports screen + exports MVC
├── overrides/                      # User customizations (unchanged)
├── wrapper.tsx                     # Provider wrapper (simplified, no state bridge)
├── main.tsx                        # Auto-discovery + registration
├── preview.config.json             # Configuration
├── preview.css                     # Tailwind + host CSS
├── index.html                      # Entry HTML
└── vite.config.ts                  # Aliases for hook interception
```

## Detailed Design

### 1. Enhanced model.ts Format

```typescript
// .preview/screens/root/model.ts
export const meta = {
  route: '/',
  pattern: 'src/pages/**/*.tsx',
  filePath: 'src/pages/home.tsx',
}

export const regions = {
  'service-grid': {
    label: 'Service Grid',
    states: {
      populated: {
        data: [
          { id: 'svc-1', name: 'Classic Haircut', duration: 30, price: 35, description: '...' },
          { id: 'svc-2', name: 'Deep Tissue Massage', duration: 60, price: 95, description: '...' },
          // 10+ items for list regions
        ],
      },
      loading: { _loading: true },
      empty: { data: [] },
      error: { _error: true, message: 'Failed to load services' },
    },
    defaultState: 'populated',
    isList: true,
    defaultCount: 3,
  },
}
```

**Key changes from current:**
- States contain actual mock data (not empty `{}`)
- Special `_loading` and `_error` flags signal hook behavior
- `isList` + `defaultCount` enable list item count control in inspector
- Mock data is realistic and type-correct (LLM-generated or imported from app's existing mocks)

### 2. Mock Hook Generation

For each detected hook pattern, the CLI generates a mock implementation:

```typescript
// .preview/mocks/use-app-live-query.ts
import { useDevToolsStore } from '@preview-tool/runtime'

let modelRegistry: Record<string, Record<string, unknown>> = {}

export function registerModels(models: Record<string, Record<string, unknown>>) {
  modelRegistry = { ...models }
}

export function useAppLiveQuery<T>(
  _queryFn: unknown,
  _depsOrSectionId?: unknown[] | string,
  sectionId?: string,
): { data: T | undefined; isLoading: boolean; isError: boolean } {
  const resolvedId = typeof _depsOrSectionId === 'string' ? _depsOrSectionId : sectionId

  const regionState = useDevToolsStore((s) =>
    resolvedId ? s.regionStates[resolvedId] ?? 'populated' : 'populated'
  )
  const listCount = useDevToolsStore((s) =>
    resolvedId ? s.regionListCounts[resolvedId] : undefined
  )

  const stateData = resolvedId ? modelRegistry[resolvedId]?.[regionState] : undefined

  if (stateData?._loading) return { data: undefined, isLoading: true, isError: false }
  if (stateData?._error) return { data: undefined, isLoading: false, isError: true }

  let data = stateData?.data as T
  if (Array.isArray(data) && listCount !== undefined) {
    data = data.slice(0, listCount) as T
  }
  return { data, isLoading: false, isError: false }
}
```

### 3. Supported Hook Patterns

| Hook Pattern | Detection | Mock Signature |
|---|---|---|
| `useLiveQuery(query, sectionId)` | Import from `@/hooks/*live*query*` | `{ data, isLoading, isError }` |
| `useQuery({ queryKey, queryFn })` | Import from `@tanstack/react-query` | `{ data, isLoading, isError, error }` |
| `useSWR(key, fetcher)` | Import from `swr` | `{ data, isLoading, error }` |
| `useEffect + fetch` | AST: `useEffect` containing `fetch/axios` | Replace with state-driven local state |
| Custom hooks wrapping the above | Follow import chain to identify underlying pattern | Same as underlying hook |

### 4. Vite Config Aliases

```typescript
// .preview/vite.config.ts (auto-generated)
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      // Host app aliases
      '@': resolve(hostAppRoot, 'src'),
      '@host': resolve(hostAppRoot),

      // Mock overrides (ORDER MATTERS — specific before general)
      '@/hooks/use-app-live-query': resolve(__dirname, 'mocks/use-app-live-query.ts'),
      '@/stores/auth': resolve(__dirname, 'mocks/auth-store.ts'),
      '@/lib/collections': resolve(__dirname, 'mocks/collections.ts'),
      '@/devtool/devtool-store': resolve(__dirname, 'mocks/devtool-store.ts'),
    },
  },
})
```

### 5. Auth Store Mocking

```typescript
// .preview/mocks/auth-store.ts
import { create } from 'zustand'
import { useDevToolsStore } from '@preview-tool/runtime'

// Configurable mock users
const mockUsers = {
  customer: { id: 'mock-cust-1', email: 'alice@example.com', name: 'Alice', role: 'CUSTOMER' },
  admin: { id: 'mock-admin-1', email: 'bob@example.com', name: 'Bob Admin', role: 'ADMIN' },
}

export const useAuthStore = create(() => ({
  user: mockUsers.admin,  // Default to admin to access all screens
  token: 'mock-token',
  isLoading: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  fetchMe: async () => {},
  initialize: async () => {},
}))
```

### 6. Wrapper Simplification

Current wrapper.tsx has a state bridge. New wrapper only provides context:

```typescript
// .preview/wrapper.tsx (simplified)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '@host/src/i18n'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

export default function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <I18nextProvider i18n={i18n}>
          {children}
        </I18nextProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}
```

### 7. Mock Data Sources (Priority Order)

1. **Existing mocks in app** — If the app has `devtool/mocks/` or `__mocks__/` or `fixtures/`, import and use them
2. **LLM generation** — Analyze TypeScript types + screen context, generate realistic data
3. **Heuristic generation** — Based on field names and types (fallback when LLM unavailable)

### 8. Enhanced AST Analysis

Current `analyze-view.ts` extracts the ViewTree. New analysis also extracts:

```typescript
interface HookAnalysis {
  hookName: string              // 'useAppLiveQuery'
  importPath: string            // '@/hooks/use-app-live-query'
  sectionId?: string            // 'service-grid' (if detectable)
  queryKey?: string             // ['services'] (for react-query)
  returnType?: string           // inferred from usage
  paramSignature: string[]      // parameter types/names
}

interface ImportAnalysis {
  path: string                  // '@/stores/auth'
  namedExports: string[]        // ['useAuthStore']
  needsMocking: boolean         // true if it manages state/data
  mockStrategy: 'alias' | 'noop' | 'passthrough'
}
```

## What Changes vs Current Implementation

| Area | Current | New |
|---|---|---|
| model.ts states | Empty `{}` | Real mock data per state |
| Hook interception | State bridge → app's devtool store | Module aliasing → mock hooks |
| Mock data source | None | LLM-generated or imported from app's mocks |
| Vite config | Basic `@host` alias | Extended with hook/store aliases |
| wrapper.tsx | State bridge + providers | Providers only |
| Auth mocking | Not handled | Mock auth store with configurable user |
| AST analysis | ViewTree only | ViewTree + hook calls + import analysis |

## What Stays Unchanged

- **PreviewShell, CatalogPanel, InspectorPanel** — all runtime UI
- **ScreenRenderer** — data assembly pipeline
- **FlowProvider** — click interception and navigation
- **Screen discovery** — glob-based auto-discovery
- **model.ts/controller.ts/adapter.ts** file structure
- **Overrides** — manual user customizations still supported

## Constraints

- **No production code changes** — all mocking happens in `.preview/` via Vite aliases
- **Zero-config ideal** — should work with any React app without requiring conventions
- **External app untouched** — `.preview/` is the only generated directory
- **LLM optional** — `--no-llm` flag falls back to heuristic mock data generation

## Success Criteria

1. Running `preview ~/Desktop/booking/client` generates accurate regions for all 9 screens
2. Switching states in the inspector immediately changes the center panel rendering
3. Mock data is realistic and type-correct
4. List regions support item count control (slider in inspector)
5. Flow triggers navigate between screens correctly
6. Auth-gated screens (admin/*) render without authentication errors
7. Both locales (de/en) work via language switcher

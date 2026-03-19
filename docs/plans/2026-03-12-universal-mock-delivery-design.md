# Universal Mock Data Delivery Design

**Date:** 2026-03-12
**Status:** Approved
**Goal:** Make preview-tool deliver spec mockData to any React component regardless of data-fetching pattern — without changing production code.

---

## Problem

The preview-tool renders real components from target apps but can't control their data. Different apps use different data patterns:

| Pattern | Example Apps | Current Support |
|---------|-------------|-----------------|
| Zustand store | booking, monster-chess | Partial (hook mock exists, no mockData) |
| TanStack Query | roomio, music-player | No |
| useEffect + fetch() | booking | No |
| Socket.IO push | roomio, music-player | No |
| Local useState | all | No |

State switching in devtools has no visible effect because:
1. RegionDataProvider is not mounted around screens in spec-driven mode
2. Spec states have no mockData (descriptions only)
3. Most screen data comes from fetch() calls the mock system can't reach

## Constraints

- **Zero changes to production code** — target apps are not modified
- **Specs stay minimal** — only states + mockData, no data_deps or api_deps required
- **Preview-tool does all the heavy lifting** — AST analysis, mock generation, data delivery
- **Works across all 4 target apps** — booking, roomio, monster-chess, music-player

## Spec Contract

Specs provide states with mockData. Keys match variable names used in the component's JSX:

```yaml
# .specs/screens/scr-search.md
---
id: scr-search
type: screen
title: Search Page
states:
  - name: loading
    mockData:
      isLoading: true
      specialties: []
      error: null
  - name: populated
    mockData:
      isLoading: false
      specialties:
        - { slug: zahnarzt, name: Zahnarzt }
        - { slug: orthopade, name: "Orthopäde" }
      error: null
  - name: error
    mockData:
      isLoading: false
      specialties: []
      error: "Fehler beim Laden"
---
```

No `data_deps`, no `api_deps`. The preview-tool figures out delivery.

## Architecture: Three-Layer Mock Delivery

### Layer 1: Hook/Store Mocking (existing, enhanced)

For hooks and stores discovered via AST, replace imports with mock modules that read from RegionDataContext:

```typescript
// Auto-generated mock for useBookingStore
export function useBookingStore(...args: any[]) {
  const data = useRegionDataForHook('booking-store')
  const state = { ...defaults, ...data }
  if (typeof args[0] === 'function') return args[0](state)
  return state
}
```

MockData comes from spec states (primary), type extraction (fallback). When user switches state, `data` updates to the spec's mockData for that state.

Covers: Zustand stores, custom hooks, TanStack Query wrapper hooks, context hooks.

### Layer 2: Fetch Interception (new)

For `useState` + `fetch()` patterns, inject a global fetch mock at preview startup:

```typescript
// Auto-generated: injected into preview entry point
const fetchHandlers = {
  'GET /api/specialties': () => regionDataForKey('specialties'),
  'GET /api/doctors': () => regionDataForKey('doctors'),
}

const originalFetch = window.fetch
window.fetch = (url, opts) => {
  const handler = matchHandler(url, opts, fetchHandlers)
  if (handler) return Promise.resolve(new Response(JSON.stringify(handler())))
  return originalFetch(url, opts)
}
```

AST discovers `fetch('/api/specialties')` → traces result to `specialties` variable → spec has `mockData.specialties` → connected.

Covers: inline fetch, axios, custom API clients, any HTTP call.

### Layer 3: RegionDataProvider Mounting (fix existing gap)

Currently broken — provider not mounted around screens in spec-driven mode. Fix: generated `main.tsx` wraps each screen:

```tsx
module: () => import('../src/pages/SearchPage.tsx').then(mod => ({
  default: (props) => (
    <RegionDataProvider regions={regions} regionData={props.regionData}>
      <mod.default />
    </RegionDataProvider>
  )
}))
```

## Data Source Discovery (AST Analysis)

When the preview-tool loads a screen, it analyzes the source to build a data source map:

```
SearchPage.tsx analysis:
Variable          Source Type      Origin
specialties       useState         fed by fetch('/api/specialties')
isLoading         useState         fetch loading flag
error             useState         fetch error
setSpecialty()    Zustand hook     useBookingStore
navigate()        Router hook      useNavigate (excluded)
```

Classification rules:

| Source Type | Interception Strategy |
|------------|----------------------|
| Custom hook (useRooms, useEmployees) | Layer 1: alias mock |
| Zustand/Redux store (useBookingStore) | Layer 1: alias mock |
| TanStack Query (useQuery) | Layer 1: alias mock wrapping queryFn |
| useState + fetch (inline pattern) | Layer 2: global fetch mock |
| useState (UI-only: query, selectedId) | Skip — not data-driven |
| Router/Provider hooks (useNavigate) | NOOP shim (already supported) |

## Cross-App Compatibility

| App | Layer 1 (hooks) | Layer 2 (fetch) | Layer 3 (provider) |
|-----|-----------------|-----------------|-------------------|
| booking | useBookingStore, useAuthStore | /api/specialties, /api/doctors, etc. | Yes |
| roomio | useRooms, useRoomState, useEmployees | — | Yes |
| monster-chess | useGameStore | — | Yes |
| music-player | query hooks, useRealtimeQueue | fallback for server fns | Yes |

Socket.IO: skipped in preview — mock hooks provide the data that sockets would push.
PixiJS: receives game state from mocked store, renders accordingly.

## Changes to Preview-Tool Codebase

### New files

| File | Purpose |
|------|---------|
| `packages/cli/src/analyzer/discover-fetch.ts` | AST: find fetch/axios/api calls, trace which variable receives result |
| `packages/cli/src/spec/fetch-mock-mapper.ts` | Match discovered fetch URLs to spec mockData keys via variable tracing |
| `packages/cli/src/spec/generate-fetch-interceptor.ts` | Generate window.fetch override code for preview entry |
| `packages/cli/src/spec/tanstack-query-mock.ts` | Specialized mock for useQuery/useSuspenseQuery returning mockData |

### Modified files

| File | Change |
|------|--------|
| `server/generate-entry.ts` | Wrap screen components with RegionDataProvider in dynamic import |
| `server/vite-plugin-spec-preview.ts` | Pass enriched regions with spec mockData into screenEntries |
| `spec/spec-pipeline-orchestrator.ts` | Use spec mockData as primary source, type extraction as fallback |
| `.preview/main.tsx` (generated) | Inject fetch interceptor before app mount |

### Not changed

- Spec format (states + mockData only)
- Runtime components (PreviewShell, ScreenRenderer, devtools, RegionDataContext)
- Production code in target apps

## End-to-End Flow

```
preview dev --cwd ~/Desktop/booking/client --specs ~/Desktop/booking/.specs

1. Load specs → SpecManifest with states + mockData per screen
2. AST analysis → data source map per screen (hooks, stores, fetch calls)
3. Match mockData keys to data sources → generate mocks for all layers
4. Generate artifacts → .preview/mocks/, fetch-handlers, main.tsx
5. Start Vite → virtual:spec-manifest with enriched screenEntries
6. User selects screen → real component loads, wrapped with RegionDataProvider
7. User switches state → mockData swaps → all layers update → component re-renders
```

## Sizing

| Component | Effort |
|-----------|--------|
| Fetch URL discovery (AST) | Medium |
| Fetch interceptor generation | Small |
| RegionDataProvider mounting fix | Small |
| TanStack Query mock pattern | Medium |
| MockData-first pipeline | Small |
| Integration testing (4 apps) | Large |

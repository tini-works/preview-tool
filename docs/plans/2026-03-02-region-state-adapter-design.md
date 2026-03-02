# Region State Adapter Design

**Date**: 2026-03-02
**Status**: Approved
**Goal**: Make inspector panel state changes actually affect rendered screens

## Problem

When a user clicks a region state in the inspector panel (e.g., "loading" for "time-slots"), the screen should re-render that section in the selected state. Currently this doesn't work because:

1. ScreenRenderer passes a flat `data` prop but components don't accept or use it
2. Mock hooks independently read `regionStates` but use wrong keys to look up data (e.g., `useQuery` joins its queryKey into `'availability-2024-01-15'`, but the model has region key `'time-slots'`)
3. There's no bridge between the inspector's region state and the component's actual data sources

## Solution: Per-Screen Adapter with Region Data Context

Three coordinated changes:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  1. MODEL        │     │  2. ADAPTER       │     │  3. MOCK HOOKS      │
│  Enhanced with   │────▶│  Generated per    │────▶│  Read from          │
│  hookMapping     │     │  screen, provides │     │  RegionDataContext   │
│  (CLI change)    │     │  RegionDataContext │     │  (runtime change)   │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
```

## Data Flow

```
User clicks "loading" for "time-slots" in Inspector
  ↓
useDevToolsStore.regionStates['time-slots'] = 'loading'
  ↓
ScreenRenderer recomputes per-region data:
  regionData = {
    'time-slots': { activeState: 'loading', stateData: { _loading: true } },
    'service-detail': { activeState: 'populated', stateData: { data: {...} } }
  }
  ↓
<Adapter regionData={regionData} flags={flags} />
  ↓
Adapter wraps with <RegionDataProvider regions={regions} regionData={regionData}>
  ↓
<BookingPage /> renders, calls useQuery({ queryKey: ['availability', date] })
  ↓
Mock useQuery → useRegionDataForHook('useQuery', ['availability', date])
  ↓
Matches hookMapping: { type: 'query-hook', identifier: 'availability' } → 'time-slots'
  ↓
Returns regionData['time-slots'].stateData = { _loading: true }
  ↓
Mock useQuery returns { data: undefined, isLoading: true }
  ↓
Component renders loading spinner ✅
```

## 1. Enhanced Region Model

Each region in `model.ts` gains a `hookMapping` field:

```typescript
export const regions = {
  "time-slots": {
    label: "Time Slots",
    hookMapping: {
      type: "query-hook",
      hookName: "useQuery",
      identifier: "availability",
      importPath: "@tanstack/react-query",
    },
    states: {
      populated: { data: [{ startTime: "09:00", providerId: 1 }] },
      loading: { _loading: true },
      empty: { data: [] },
      error: { _error: true, message: "Failed to load" },
    },
    defaultState: "populated",
    isList: true,
    mockItems: [...],
  },
}
```

### hookMapping Interface

```typescript
interface HookMapping {
  type: 'query-hook'    // useQuery, useSWR, useAsyncData, custom fetch hooks
       | 'store'        // Zustand, Redux, MobX, Jotai, Valtio
       | 'context'      // React context
       | 'prop'         // Direct prop passing
       | 'local-state'  // useState/useReducer
       | 'unknown'      // CLI couldn't determine — uses fallback
  hookName: string      // Actual import name: "useQuery", "useSWR", "useSelector"
  identifier: string    // Match key: queryKey prefix, selector path, prop name
  importPath: string    // Import source: "@tanstack/react-query", "@/stores/auth"
}
```

### Auto-Detection Coverage

| Pattern | Detection | Mock Strategy |
|---------|-----------|---------------|
| useQuery/useSWR/useAsyncData | Import detection | Return resolved state from region |
| useMutation/useAction | Import detection | No-op function, isPending: false |
| Zustand useStore(selector) | create() call detection | Override store with region data |
| Redux useSelector | Import detection | Return region data |
| useContext | Import detection | Wrap with mock provider |
| Custom fetch hooks | Return type analysis | Return resolved state from region |
| useState with initial value | AST analysis | Override initial value |
| Props-only components | Signature analysis | Pass data directly as props |

### Fallback for `unknown` Type

- Mock hook returns assembled region data as-is
- User can manually configure hookMapping via `.preview/overrides/{screen}/model.ts`
- Inspector still shows regions + states even if mock can't wire them

## 2. Generated Adapter Wrapper

Current `adapter.ts` is a pass-through re-export. New `adapter.tsx` becomes a real component:

```typescript
// Generated .preview/screens/booking/adapter.tsx
import { BookingPage as Screen } from '../../../src/pages/booking'
import { meta, regions } from './model'
import { flows, componentStates, journeys } from './controller'
import { view } from './view'
import { RegionDataProvider } from '@preview-tool/runtime'

function Adapter({
  regionData,
  flags,
}: {
  regionData: Record<string, { activeState: string; stateData: unknown }>
  flags: Record<string, boolean>
}) {
  return (
    <RegionDataProvider regions={regions} regionData={regionData}>
      <Screen />
    </RegionDataProvider>
  )
}

export default Adapter
export { meta, regions, flows, componentStates, journeys, view }
```

### ScreenRenderer Change

```typescript
// Before: flat merge (loses region identity)
const data = assembleRegionData(regions, regionStates, regionListCounts)
<Component data={data} flags={flags} />

// After: per-region data (preserves region identity)
const regionData = computeRegionData(regions, regionStates, regionListCounts)
<Component regionData={regionData} flags={flags} />
```

`computeRegionData` returns:
```typescript
{
  'time-slots': { activeState: 'loading', stateData: { _loading: true } },
  'service-detail': { activeState: 'populated', stateData: { data: {...} } }
}
```

## 3. Enhanced Mock Hooks

Mock hooks now read from `RegionDataContext` instead of `modelRegistry`:

```typescript
// Generated mock: .preview/mocks/_tanstack--react-query.ts
import { useRegionDataForHook } from '@preview-tool/runtime'

export function useQuery(options: any) {
  const queryKey = Array.isArray(options?.queryKey) ? options.queryKey : []
  const resolved = useRegionDataForHook('query-hook', queryKey)

  if (resolved) {
    if (resolved._loading) return { data: undefined, isLoading: true, isError: false }
    if (resolved._error) return { data: undefined, isLoading: false, isError: true, error: resolved.message }
    return { data: resolved.data ?? resolved, isLoading: false, isError: false }
  }

  return { data: undefined, isLoading: false, isError: false }
}

export function useMutation() {
  return { mutate: () => {}, mutateAsync: async () => {}, isPending: false }
}
```

### `useRegionDataForHook` (Runtime)

```typescript
export function useRegionDataForHook(hookType: string, identifier: unknown): unknown | null {
  const ctx = useContext(RegionDataContext)
  if (!ctx) return null

  const { regions, regionData } = ctx

  for (const [regionKey, region] of Object.entries(regions)) {
    const mapping = region.hookMapping
    if (!mapping) continue

    // Type-based matching
    if (hookType === 'query-hook' && mapping.type === 'query-hook') {
      const queryKey = identifier as string[]
      if (queryKey[0] === mapping.identifier || queryKey.join('-').startsWith(mapping.identifier)) {
        return regionData[regionKey]?.stateData ?? null
      }
    }

    if (hookType === 'custom-hook' && mapping.type === 'custom-hook') {
      if (identifier === mapping.identifier) {
        return regionData[regionKey]?.stateData ?? null
      }
    }

    if (hookType === 'store' && mapping.type === 'store') {
      if (identifier === mapping.identifier) {
        return regionData[regionKey]?.stateData ?? null
      }
    }

    // ... context, prop, local-state matching
  }

  return null
}
```

## Files to Change

### Runtime (`packages/runtime/src/`)

| File | Change |
|------|--------|
| `RegionDataContext.tsx` (new) | React context + RegionDataProvider + useRegionDataForHook() |
| `ScreenRenderer.tsx` | Replace assembleRegionData() with computeRegionData(), pass regionData |
| `types.ts` | Add HookMapping to region type, add RegionData type |
| `index.ts` | Export new context/hooks |

### CLI (`packages/cli/src/`)

| File | Change |
|------|--------|
| `generator/generate-model.ts` | Add hookMapping field based on hook analysis |
| `generator/generate-adapter.ts` (new or enhance) | Generate adapter component wrapping with RegionDataProvider |
| `generator/generate-mock-hooks.ts` | Use useRegionDataForHook() instead of modelRegistry |
| `server/generate-entry.ts` | Remove registerModels() calls (no longer needed) |
| `analyzer/analyze-hooks.ts` | Return hookMapping info (hook type + identifier + importPath) |

### Backward Compatibility

- The `data` prop path still works for components that accept a `data` prop
- The adapter detects this and passes data directly for those components
- Override files in `.preview/overrides/` allow manual hookMapping configuration
- `registerModels()` can be kept but deprecated (mock hooks prefer context when available)

# Region-Based Inspector Controls Design

## Goal

Replace flat per-screen scenarios with per-region controls in the inspector. Each region within a screen (e.g., Insurance, Family Members) has its own state selector and list item counter, independently controllable.

## Architecture: Replace Flat Scenarios with Regions

Each screen's `scenarios.ts` exports a `regions` object instead of `scenarios`. Each region defines its own states, mock data, and whether it has list data. The ScreenRenderer merges all active region states into a single `data` prop. Backward compatible — screens with old `scenarios` export still work.

## Region Definition Convention

```typescript
// src/screens/Profile/scenarios.ts

export const regions = {
  user: {
    label: 'User Info',
    states: {
      loading: { isLoading: true, user: EMPTY_USER, settings: MOCK_SETTINGS },
      populated: { isLoading: false, user: MOCK_USER, settings: MOCK_SETTINGS },
    },
    defaultState: 'populated',
  },
  insurances: {
    label: 'Insurance',
    isList: true,
    mockItems: MOCK_INSURANCES,
    states: {
      loading: { insurances: [] as Insurance[] },
      empty: { insurances: [] as Insurance[] },
      populated: { insurances: MOCK_INSURANCES },
    },
    defaultState: 'populated',
  },
  familyMembers: {
    label: 'Family Members',
    isList: true,
    mockItems: MOCK_FAMILY,
    states: {
      loading: { familyMembers: [] as FamilyMember[] },
      empty: { familyMembers: [] as FamilyMember[] },
      populated: { familyMembers: MOCK_FAMILY },
    },
    defaultState: 'populated',
  },
}
```

Key fields:
- `label` — Display name in the inspector
- `states` — Map of state name → partial data object (merged into screen data)
- `defaultState` — Initial active state
- `isList` — Show list item counter in inspector (optional, default false)
- `mockItems` — Full mock array for list counter slicing (required when isList is true)

## Data Assembly (ScreenRenderer)

ScreenRenderer reads the active state for each region from the store, then merges:

```typescript
let data = {}
for (const [key, region] of Object.entries(regions)) {
  const activeState = regionStates[key] ?? region.defaultState
  const stateData = region.states[activeState]
  data = { ...data, ...stateData }

  // If isList and has a list count override, slice mockItems
  if (region.isList && regionListCounts[key] != null) {
    const listField = Object.keys(stateData).find(k => Array.isArray(stateData[k]))
    if (listField) {
      data[listField] = region.mockItems.slice(0, regionListCounts[key])
    }
  }
}
```

Screen component still receives `{ data: ProfileData }` — no change to screen implementation.

## Inspector UI

The "States" and "List Items" sections are replaced by a region-based view:

```
┌─ REGIONS ──────────────────────┐
│                                │
│ ▼ User Info                    │
│   [loading] [populated]        │
│                                │
│ ▼ Insurance           3 items  │
│   [loading] [empty] [populated]│
│   [−] [3] [+]                  │
│                                │
│ ▼ Family Members      0 items  │
│   [loading] [empty] [populated]│
│   [−] [0] [+]                  │
│                                │
└────────────────────────────────┘
```

Each region is a collapsible group showing:
- State buttons (region-specific)
- List item counter (only when isList is true)

For screens using old flat `scenarios`, the inspector shows the current States section (backward compatible).

## Store Changes

Replace `selectedState`, `listItemCount` with region-based state:

```typescript
// New state
regionStates: Record<string, string>       // { [regionKey]: activeStateName }
regionListCounts: Record<string, number>   // { [regionKey]: count }

// New actions
setRegionState: (regionKey: string, state: string) => void
setRegionListCount: (regionKey: string, count: number) => void
resetRegions: () => void

// Removed
selectedState, setSelectedState, listItemCount, setListItemCount
```

`regionStates` and `regionListCounts` are ephemeral (not persisted). Reset when switching screens.

## Backward Compatibility

Detection order:
1. Screen exports `regions` → region-based rendering + region inspector UI
2. Screen exports `scenarios` → legacy flat scenario rendering + old States section

Screens can be migrated one at a time.

## Files Changed

| File | Change |
|------|--------|
| `src/screens/types.ts` | Add `RegionDefinition`, `RegionsModule` types; add optional `regions` to `ScreenEntry` |
| `src/screens/useScreenModules.ts` | Glob `regions` exports alongside scenarios |
| `src/devtools/useDevToolsStore.ts` | Replace `selectedState`/`listItemCount` with `regionStates`/`regionListCounts` |
| `src/devtools/InspectorPanel.tsx` | Replace States/List Items sections with region-based UI |
| `src/screens/ScreenRenderer.tsx` | Add region data assembly logic; keep legacy scenario path |
| `src/screens/Profile/scenarios.ts` | Convert to regions (first migration) |
| `src/App.tsx` | Update `selectedState` → region-aware flow |

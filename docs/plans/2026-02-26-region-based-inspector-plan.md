# Region-Based Inspector Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace flat per-screen scenarios with per-region controls so each region within a screen (e.g., Insurance, Family Members) has its own independent state selector and list item counter.

**Architecture:** Each screen's `scenarios.ts` exports a `regions` object (map of region key → region definition with states, mock items, default state). The ScreenRenderer merges all active region states into a single `data` prop passed to the screen component. The InspectorPanel renders collapsible region groups with per-region state buttons and optional list counters. Screens still using old `scenarios` export work unchanged (backward compatible).

**Tech Stack:** React 19, TypeScript (strict), Zustand, Tailwind CSS v4

**Design doc:** `docs/plans/2026-02-26-region-based-inspector-design.md`

---

### Task 1: Add Region Types to `src/screens/types.ts`

**Files:**
- Modify: `src/screens/types.ts`

**Step 1: Add `RegionDefinition` type**

Add these types after the existing `FlagModule` interface:

```typescript
export interface RegionDefinition {
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
}

export type RegionsMap = Record<string, RegionDefinition>
```

**Step 2: Add optional `regions` field to `ScreenEntry`**

Add `regions?: RegionsMap` to the `ScreenEntry` interface so it becomes:

```typescript
export interface ScreenEntry {
  route: string
  module: () => Promise<ScreenModule>
  scenarios: Record<string, Scenario>
  flags?: Record<string, FlagDefinition>
  hasListData?: boolean
  regions?: RegionsMap
}
```

**Step 3: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: PASS (no errors)

**Step 4: Commit**

```bash
git add src/screens/types.ts
git commit -m "feat(types): add RegionDefinition and RegionsMap types"
```

---

### Task 2: Update `useScreenModules.ts` to Glob `regions` Exports

**Files:**
- Modify: `src/screens/useScreenModules.ts`

**Step 1: Update the `scenarioModules` glob type**

The glob type already reads `scenarios`, `flags`, `hasListData`. Add `regions` to the type:

```typescript
const scenarioModules = import.meta.glob<
  ScenarioModule & {
    flags?: Record<string, { label: string; default: boolean }>
    hasListData?: boolean
    regions?: RegionsMap
  }
>('/src/screens/*/scenarios.ts', { eager: true })
```

Import `RegionsMap` from `@/screens/types`.

**Step 2: Pass `regions` through in the return**

In the `useScreenModules` function, add `regions` to the returned `ScreenEntry`:

```typescript
return {
  route: filePathToRoute(filePath),
  module: loader,
  scenarios: scenarioMod?.scenarios ?? {},
  flags: scenarioMod?.flags,
  hasListData: scenarioMod?.hasListData,
  regions: scenarioMod?.regions,
}
```

**Step 3: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/screens/useScreenModules.ts
git commit -m "feat(useScreenModules): glob regions exports from scenarios.ts"
```

---

### Task 3: Add Region State to the Zustand Store

**Files:**
- Modify: `src/devtools/useDevToolsStore.ts`

This task adds `regionStates` and `regionListCounts` to the store. We keep `selectedState` and `listItemCount` for now (backward compat during transition). We'll remove them in a later cleanup task.

**Step 1: Add new state fields to `DevToolsState`**

Add these fields to the `DevToolsState` interface:

```typescript
regionStates: Record<string, string>
regionListCounts: Record<string, number>
```

**Step 2: Add new actions to `DevToolsActions`**

```typescript
setRegionState: (regionKey: string, state: string) => void
setRegionListCount: (regionKey: string, count: number) => void
resetRegions: () => void
```

**Step 3: Add defaults to `DEFAULT_STATE`**

```typescript
regionStates: {},
regionListCounts: {},
```

**Step 4: Implement the three actions**

In the `create` function body:

```typescript
setRegionState: (regionKey, state) =>
  set((prev) => ({
    regionStates: { ...prev.regionStates, [regionKey]: state },
  })),

setRegionListCount: (regionKey, count) =>
  set((prev) => ({
    regionListCounts: {
      ...prev.regionListCounts,
      [regionKey]: Math.max(0, Math.min(99, Math.round(count))),
    },
  })),

resetRegions: () =>
  set({ regionStates: {}, regionListCounts: {} }),
```

**Step 5: Update `setSelectedRoute` to also reset regions**

When the user switches screens, regions should reset. Modify `setSelectedRoute`:

```typescript
setSelectedRoute: (route) =>
  set((prev) => {
    if (route === prev.selectedRoute) return {}
    return {
      selectedRoute: route,
      selectedState: null,
      regionStates: {},
      regionListCounts: {},
    }
  }),
```

**Step 6: Do NOT add `regionStates`/`regionListCounts` to `partialize`**

They are ephemeral — not persisted. The existing `partialize` already excludes them (it only includes listed keys).

**Step 7: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 8: Commit**

```bash
git add src/devtools/useDevToolsStore.ts
git commit -m "feat(store): add regionStates and regionListCounts with actions"
```

---

### Task 4: Convert Profile Screen to Regions

**Files:**
- Modify: `src/screens/Profile/scenarios.ts`

This is the first screen migration. The Profile screen has three natural regions: User Info, Insurance (list), Family Members (list).

**Step 1: Rewrite `scenarios.ts` to export `regions` instead of `scenarios`**

Keep all existing type exports (`Insurance`, `FamilyMember`, `Settings`, `User`, `ProfileData`) and mock data constants (`MOCK_USER`, `MOCK_INSURANCES`, `MOCK_FAMILY`, `MOCK_SETTINGS`, `EMPTY_USER`).

Remove `export const scenarios = { ... }` and `export const hasListData = true`.

Add:

```typescript
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

**Step 2: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/screens/Profile/scenarios.ts
git commit -m "feat(Profile): convert from flat scenarios to regions"
```

---

### Task 5: Add Region Data Assembly to ScreenRenderer

**Files:**
- Modify: `src/screens/ScreenRenderer.tsx`

This task adds the region data assembly logic alongside the existing scenario path.

**Step 1: Import `RegionsMap` type**

```typescript
import type { ScreenModule, RegionsMap } from '@/screens/types'
```

**Step 2: Add store selectors for region state**

Inside `ScreenRenderer`, after the existing `fontScale` selector:

```typescript
const regionStates = useDevToolsStore((s) => s.regionStates)
const regionListCounts = useDevToolsStore((s) => s.regionListCounts)
```

**Step 3: Add a helper function `assembleRegionData`**

Add this function inside the file (outside the component, above `ScreenRenderer`):

```typescript
function assembleRegionData(
  regions: RegionsMap,
  regionStates: Record<string, string>,
  regionListCounts: Record<string, number>
): Record<string, unknown> {
  let data: Record<string, unknown> = {}

  for (const [key, region] of Object.entries(regions)) {
    const activeState = regionStates[key] ?? region.defaultState
    const stateData = region.states[activeState] ?? region.states[region.defaultState] ?? {}
    data = { ...data, ...stateData }

    if (region.isList && regionListCounts[key] != null && region.mockItems) {
      const listField = Object.keys(stateData).find(
        (k) => Array.isArray(stateData[k])
      )
      if (listField) {
        data = { ...data, [listField]: region.mockItems.slice(0, regionListCounts[key]) }
      }
    }
  }

  return data
}
```

**Step 4: Update the data resolution logic**

Replace the current data resolution block (lines ~67-76 in the current file):

```typescript
// Old code:
const scenarios = entry.scenarios
const scenarioKeys = Object.keys(scenarios)
const activeScenario = activeState && scenarios[activeState]
  ? scenarios[activeState]
  : scenarioKeys.length > 0
    ? scenarios[scenarioKeys[0]]
    : null
const data = activeScenario?.data ?? {}
```

With dual-path logic:

```typescript
const regions = entry.regions
let data: Record<string, unknown>

if (regions && Object.keys(regions).length > 0) {
  // Region-based path
  data = assembleRegionData(regions, regionStates, regionListCounts)
} else {
  // Legacy scenario path
  const scenarios = entry.scenarios
  const scenarioKeys = Object.keys(scenarios)
  const activeScenario =
    activeState && scenarios[activeState]
      ? scenarios[activeState]
      : scenarioKeys.length > 0
        ? scenarios[scenarioKeys[0]]
        : null
  data = (activeScenario?.data as Record<string, unknown>) ?? {}
}
```

**Step 5: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 6: Test manually**

Open the app (`pnpm dev`), navigate to the Profile screen. It should render with all three regions at their default "populated" states — the screen should look identical to before the migration.

**Step 7: Commit**

```bash
git add src/screens/ScreenRenderer.tsx
git commit -m "feat(ScreenRenderer): add region data assembly with legacy fallback"
```

---

### Task 6: Build Region Inspector UI in InspectorPanel

**Files:**
- Modify: `src/devtools/InspectorPanel.tsx`

This task replaces the flat "States" and "List Items" sections with region-based controls when a screen exports `regions`.

**Step 1: Add store selectors for region state**

After the existing `featureFlags` selector in InspectorPanel, add:

```typescript
const regionStates = useDevToolsStore((s) => s.regionStates)
const setRegionState = useDevToolsStore((s) => s.setRegionState)
const regionListCounts = useDevToolsStore((s) => s.regionListCounts)
const setRegionListCount = useDevToolsStore((s) => s.setRegionListCount)
```

**Step 2: Get regions from current module**

After the existing `const hasListData = currentModule?.hasListData` line, add:

```typescript
const regions = currentModule?.regions
const hasRegions = regions && Object.keys(regions).length > 0
```

**Step 3: Create a `RegionGroup` component**

Add a new component at the bottom of the file (or right above the `Section` component):

```typescript
function RegionGroup({
  regionKey,
  label,
  states,
  defaultState,
  isList,
  mockItems,
  activeState,
  listCount,
  onStateChange,
  onListCountChange,
}: {
  regionKey: string
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  activeState: string
  listCount?: number
  onStateChange: (state: string) => void
  onListCountChange: (count: number) => void
}) {
  const stateKeys = Object.keys(states)
  const maxItems = mockItems?.length ?? 0
  const currentCount = listCount ?? maxItems

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-600">{label}</span>
        {isList && (
          <span className="text-[10px] text-neutral-400">
            {currentCount} {currentCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      {/* State buttons */}
      <div className="flex flex-wrap gap-1">
        {stateKeys.map((key) => (
          <button
            key={key}
            onClick={() => onStateChange(key)}
            className={
              activeState === key
                ? 'rounded-md bg-neutral-900/5 px-2 py-0.5 text-xs font-medium text-neutral-900'
                : 'rounded-md px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50'
            }
          >
            {key}
          </button>
        ))}
      </div>

      {/* List counter (only when isList) */}
      {isList && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onListCountChange(currentCount - 1)}
            disabled={currentCount <= 0}
            className="flex size-6 items-center justify-center rounded border border-neutral-200 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
          >
            &minus;
          </button>
          <input
            type="number"
            value={currentCount}
            onChange={(e) => {
              const val = Number(e.target.value)
              if (!Number.isNaN(val)) onListCountChange(val)
            }}
            min={0}
            max={maxItems}
            className="h-6 w-12 rounded border border-neutral-200 bg-white px-1 text-center text-xs text-neutral-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            onClick={() => onListCountChange(currentCount + 1)}
            disabled={currentCount >= maxItems}
            className="flex size-6 items-center justify-center rounded border border-neutral-200 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}
```

**Step 4: Replace the States + List Items sections with conditional rendering**

Find the current "State section" block (`{stateKeys.length > 0 && ( <Section title="States">...`) and the "List Item Count section" block (`{hasListData && ( <Section title="List Items">...`).

Replace both blocks with:

```tsx
{/* Region-based controls (when screen exports regions) */}
{hasRegions && (
  <Section title="Regions">
    <div className="flex flex-col gap-3">
      {Object.entries(regions!).map(([key, region]) => (
        <RegionGroup
          key={key}
          regionKey={key}
          label={region.label}
          states={region.states}
          defaultState={region.defaultState}
          isList={region.isList}
          mockItems={region.mockItems}
          activeState={regionStates[key] ?? region.defaultState}
          listCount={regionListCounts[key]}
          onStateChange={(state) => setRegionState(key, state)}
          onListCountChange={(count) => setRegionListCount(key, count)}
        />
      ))}
    </div>
  </Section>
)}

{/* Legacy state section (only when no regions and screen has scenarios) */}
{!hasRegions && stateKeys.length > 0 && (
  <Section title="States">
    <div className="flex flex-col gap-1">
      {stateKeys.map((key) => (
        <button
          key={key}
          onClick={() => setSelectedState(key)}
          className={
            selectedState === key
              ? 'rounded-md bg-neutral-900/5 px-2 py-1 text-left text-sm font-medium text-neutral-900'
              : 'rounded-md px-2 py-1 text-left text-sm text-neutral-600 hover:bg-neutral-50'
          }
        >
          {key}
        </button>
      ))}
    </div>
  </Section>
)}

{/* Legacy list items (only when no regions and screen has list data) */}
{!hasRegions && hasListData && (
  <Section title="List Items">
    <div className="flex items-center gap-2">
      <button
        onClick={() => setListItemCount(listItemCount - 1)}
        disabled={listItemCount <= 0}
        className="flex size-7 items-center justify-center rounded-md border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
      >
        &minus;
      </button>
      <input
        type="number"
        value={listItemCount}
        onChange={(e) => {
          const val = Number(e.target.value)
          if (!Number.isNaN(val)) setListItemCount(val)
        }}
        min={0}
        max={99}
        className="h-7 w-14 rounded-md border border-neutral-200 bg-white px-2 text-center text-sm text-neutral-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        onClick={() => setListItemCount(listItemCount + 1)}
        disabled={listItemCount >= 99}
        className="flex size-7 items-center justify-center rounded-md border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
      >
        +
      </button>
    </div>
  </Section>
)}
```

**Step 5: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 6: Test manually**

Open the app, navigate to the Profile screen. You should see:
- A "Regions" section with three groups: User Info, Insurance (with counter), Family Members (with counter)
- Clicking state buttons should change the screen data for that region only
- The counter +/- buttons should slice the list data

Navigate to a legacy screen (e.g., LoginForm). You should see the old "States" section as before.

**Step 7: Commit**

```bash
git add src/devtools/InspectorPanel.tsx
git commit -m "feat(InspectorPanel): add region-based controls with legacy fallback"
```

---

### Task 7: Update `App.tsx` Auto-Select Logic for Regions

**Files:**
- Modify: `src/App.tsx`

Currently `App.tsx` auto-selects the first scenario state when navigating to a new route. For region-based screens, there's no `selectedState` — the defaults are baked into the region definitions. The auto-select should only fire for legacy screens.

**Step 1: Update the auto-select `useEffect`**

Modify the useEffect in `App.tsx` (around lines 24-34):

```typescript
useEffect(() => {
  if (selectedRoute === prevRouteRef.current) return
  prevRouteRef.current = selectedRoute

  if (!selectedRoute) return

  const mod = modules.find((m) => m.route === selectedRoute)
  if (!mod) return

  // Region-based screens don't use selectedState
  const hasRegions = mod.regions && Object.keys(mod.regions).length > 0
  if (hasRegions) {
    setSelectedState(null)
    return
  }

  // Legacy: auto-select first scenario
  const scenarioKeys = Object.keys(mod.scenarios)
  const firstState = scenarioKeys.length > 0 ? scenarioKeys[0] : null
  setSelectedState(firstState)
}, [selectedRoute, modules, setSelectedState])
```

**Step 2: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(App): skip auto-select for region-based screens"
```

---

### Task 8: Migrate Remaining Screens with List Data to Regions

**Files:**
- Modify: `src/screens/PrescriptionList/scenarios.ts`
- Modify: `src/screens/PrescriptionConfirmation/scenarios.ts`
- Modify: `src/screens/PrescriptionLocation/scenarios.ts`
- Modify: `src/screens/BookingSearch/scenarios.ts`
- Modify: `src/screens/HelloWorld/scenarios.ts`

These screens currently export `hasListData = true`. Migrate them to regions so their list data is independently controllable. Each screen gets ONE region per distinct data section. Keep it faithful to each screen's existing data — don't invent regions that don't match the screen's actual content.

**Step 1: Migrate PrescriptionList**

Read `src/screens/PrescriptionList/scenarios.ts`. This screen has a `prescriptions` array. Create a single region for the prescription list, plus additional regions for other independent data sections if they exist. Remove `export const scenarios` and `export const hasListData`. Keep all types and mock data.

Example pattern — the screen has states (loading, empty, populated) and a `prescriptions` array:

```typescript
export const regions = {
  prescriptions: {
    label: 'Prescriptions',
    isList: true,
    mockItems: MOCK_PRESCRIPTIONS, // use whatever the existing mock array is named
    states: {
      loading: { /* data for loading state */ },
      empty: { /* data for empty state */ },
      populated: { /* data for populated state */ },
    },
    defaultState: 'populated',
  },
}
```

Map existing scenario data into region states. Each region state's data object should contain only the fields that region controls.

**Step 2: Migrate PrescriptionConfirmation**

This screen doesn't have natural list-like regions (it has `prescriptions` array but the screen is about confirmation, not list browsing). Create a single region representing the overall screen state:

```typescript
export const regions = {
  confirmation: {
    label: 'Confirmation',
    isList: true,
    mockItems: MOCK_PRESCRIPTIONS,
    states: {
      'review-pickup': { /* full data from existing scenario */ },
      'review-delivery': { /* full data from existing scenario */ },
      submitting: { /* full data from existing scenario */ },
      'success-pickup': { /* full data from existing scenario */ },
      'success-delivery': { /* full data from existing scenario */ },
    },
    defaultState: 'review-pickup',
  },
}
```

**Step 3: Migrate PrescriptionLocation**

This screen has `apotheken` array. Has multiple states by delivery method:

```typescript
export const regions = {
  location: {
    label: 'Location',
    isList: true,
    mockItems: MOCK_APOTHEKEN,
    states: {
      'delivery-prefilled': { /* existing scenario data */ },
      'delivery-empty': { /* existing scenario data */ },
      'pickup-loading': { /* existing scenario data */ },
      'pickup-list': { /* existing scenario data */ },
      'pickup-selected': { /* existing scenario data */ },
    },
    defaultState: 'delivery-prefilled',
  },
}
```

**Step 4: Migrate BookingSearch**

This screen has flags. Keep the `flags` export. Create a single region:

```typescript
export const regions = {
  search: {
    label: 'Search',
    states: {
      empty: { /* existing scenario data */ },
      partial: { /* existing scenario data */ },
      ready: { /* existing scenario data */ },
      loading: { /* existing scenario data */ },
    },
    defaultState: 'empty',
  },
}

// Keep this:
export const flags = { ... }
```

Remove `export const scenarios` and `export const hasListData`.

**Step 5: Migrate HelloWorld**

This screen has an `items` array:

```typescript
export const regions = {
  items: {
    label: 'Items',
    isList: true,
    mockItems: MOCK_ITEMS, // use existing mock array
    states: {
      loading: { /* existing loading data */ },
      populated: { /* existing populated data */ },
      empty: { /* existing empty data */ },
    },
    defaultState: 'populated',
  },
}
```

Remove `export const scenarios` and `export const hasListData`.

**Step 6: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 7: Test each screen manually**

Open app, navigate to each migrated screen. Verify:
- Regions section appears with correct region labels
- State buttons switch correctly
- List counters appear for `isList` regions and slice data
- Flags still work for BookingSearch

**Step 8: Commit**

```bash
git add src/screens/PrescriptionList/scenarios.ts src/screens/PrescriptionConfirmation/scenarios.ts src/screens/PrescriptionLocation/scenarios.ts src/screens/BookingSearch/scenarios.ts src/screens/HelloWorld/scenarios.ts
git commit -m "feat(screens): migrate 5 screens from flat scenarios to regions"
```

---

### Task 9: Clean Up — Remove Legacy `selectedState` and `listItemCount`

**Files:**
- Modify: `src/devtools/useDevToolsStore.ts`
- Modify: `src/devtools/InspectorPanel.tsx`
- Modify: `src/screens/ScreenRenderer.tsx`
- Modify: `src/App.tsx`
- Modify: `src/screens/types.ts`
- Modify: `src/screens/useScreenModules.ts`

**Important:** Only do this task after ALL screens with `hasListData` have been migrated to regions. Check first: are there any remaining screens that export `scenarios` (not `regions`)? If yes, keep the legacy path. If all screens that had `hasListData=true` are migrated, you can remove `hasListData` from the types and the glob.

**Step 1: Check remaining legacy screens**

Look at all `scenarios.ts` files. Any screen that still exports `scenarios` (not `regions`) needs the legacy path to remain functional. The legacy screens (Hello, LoginForm, BookingType, BookingDoctor, BookingPatient, BookingLocation, BookingTimeSlots, BookingConfirmation, BookingAppointments, PrescriptionDelivery, PrescriptionScan) still use flat scenarios. So **keep** the legacy `selectedState` / `setSelectedState` path in the store, InspectorPanel, ScreenRenderer, and App.tsx.

**Step 2: Remove `listItemCount` and `setListItemCount` from the store**

In `useDevToolsStore.ts`:
- Remove `listItemCount: number` from `DevToolsState`
- Remove `setListItemCount: (count: number) => void` from `DevToolsActions`
- Remove `listItemCount: 5` from `DEFAULT_STATE`
- Remove the `setListItemCount` action implementation

**Step 3: Remove `hasListData` from types and glob**

In `src/screens/types.ts`: Remove `hasListData?: boolean` from `ScreenEntry`.

In `src/screens/useScreenModules.ts`: Remove `hasListData?: boolean` from the glob type. Remove `hasListData: scenarioMod?.hasListData` from the return.

**Step 4: Remove legacy List Items section from InspectorPanel**

In `InspectorPanel.tsx`: Remove the selectors for `listItemCount` and `setListItemCount`. Remove the `hasListData` variable. Remove the entire legacy `{!hasRegions && hasListData && ( <Section title="List Items">...)}` block.

**Step 5: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: PASS

**Step 6: Test manually**

Navigate to Profile (regions) — should work. Navigate to LoginForm (legacy) — should show States section. No List Items section should appear anywhere.

**Step 7: Commit**

```bash
git add src/devtools/useDevToolsStore.ts src/devtools/InspectorPanel.tsx src/screens/types.ts src/screens/useScreenModules.ts
git commit -m "refactor: remove listItemCount and hasListData (replaced by regions)"
```

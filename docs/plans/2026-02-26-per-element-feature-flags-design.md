# Per-Element Feature Flags Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace centralized, prop-based feature flags with DOM-discovered `data-flag` attributes that hide elements via CSS `display:none`, letting flexbox/grid handle layout reflow automatically.

**Architecture:** Screen authors tag togglable elements with `data-flag="flag-name"`. A MutationObserver on DeviceFrame discovers flags at runtime and populates the InspectorPanel. Hidden flags inject a `<style>` tag with `display:none !important` rules. No config files, no props, no conditional rendering.

**Tech Stack:** React 19, Zustand, MutationObserver, CSS injection

---

## Current System (being replaced)

```
feature-flags.ts (static config per route)
  → useScreenModules merges into ScreenEntry.flags
  → ScreenRenderer.resolveFlags() merges defaults + store overrides
  → Screen component receives flags prop
  → Screen uses flags?.showXxx !== false && (...) for conditional rendering
```

**8 screens use flags prop:** profile, prescription/list, booking/{time-slots, patient, search, doctor, location, appointments}

**Problems:**
- Two places to maintain (config file + screen component)
- Conditional rendering is a React pattern, not a visual toggle
- New flags require editing config + screen + types

## New System

```
Screen author adds data-flag="flag-name" to element
  → Screen renders in DeviceFrame
  → useFlagDiscovery scans DOM for [data-flag] elements
  → InspectorPanel shows auto-discovered toggles (default: ON)
  → User toggles OFF → FlagStyleInjector injects CSS rule
  → [data-flag="flag-name"] { display: none !important }
  → Flexbox/grid reflows layout naturally
```

### data-flag Attribute

```tsx
// Before (props-based)
{flags?.showInsurance !== false && (
  <Card>
    <ListItem label={t('insurance')} ... />
  </Card>
)}

// After (attribute-based)
<Card data-flag="insurance-section">
  <ListItem label={t('insurance')} ... />
</Card>
```

All L2 components accept `...rest` HTML attributes, so `data-flag` passes through to the DOM.

**Naming convention:** kebab-case, descriptive. Examples: `insurance-section`, `recent-searches`, `slot-legend`, `consent-checkbox`.

### Discovery Hook: `useFlagDiscovery`

```typescript
// src/devtools/useFlagDiscovery.ts
function useFlagDiscovery(containerRef: RefObject<HTMLElement>): string[] {
  // 1. On mount + mutation, scan container for [data-flag] elements
  // 2. Extract unique flag names
  // 3. Return sorted array of discovered flag names
  // 4. MutationObserver watches for DOM changes (region/state switches)
}
```

### Style Injector: `FlagStyleInjector`

```tsx
// src/devtools/FlagStyleInjector.tsx
function FlagStyleInjector() {
  // Reads featureFlags from store
  // Injects <style> tag into DeviceFrame:
  //   [data-flag="xxx"] { display: none !important; }
  // for each flag where value === false
}
```

### Inspector UI

The "Feature Flags" section in InspectorPanel changes from static config to auto-discovered:

```
Before: reads currentModule.flags (from featureFlagConfig)
After:  reads useFlagDiscovery(deviceFrameRef) results
```

Shows a Switch toggle for each discovered flag. Label is humanized from the flag name: `insurance-section` → "Insurance Section".

### Store Changes

`featureFlags` key format changes from flat `showInsurance` to route-scoped `{route}:{flag}`:
- Before: `{ showInsurance: false }`
- After: `{ "/profile:insurance-section": false }`

This prevents flag state from one screen affecting another.

### Flag value semantics

- Flag **not in store** → visible (default ON)
- Flag **true** in store → visible
- Flag **false** in store → hidden (CSS display:none injected)

### Layout reflow

CSS `display:none` removes the element from flow. Parent containers using flexbox (`Stack gap="md"`) or grid automatically:
- **Shift left:** remaining items in a flex row fill the gap
- **Adjust width:** flex items expand to fill available space
- **Shift up:** items below the hidden element move up

No custom layout logic needed — this is standard CSS behavior.

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/devtools/useFlagDiscovery.ts` | Create | MutationObserver hook to discover `[data-flag]` elements |
| `src/devtools/FlagStyleInjector.tsx` | Create | Injects `<style>` into DeviceFrame for hidden flags |
| `src/devtools/InspectorPanel.tsx` | Edit | Replace static flag config with auto-discovered toggles |
| `src/devtools/useDevToolsStore.ts` | Edit | Route-scope flag keys, reset flags on route change |
| `src/screens/ScreenRenderer.tsx` | Edit | Remove resolveFlags + flags prop, add FlagStyleInjector |
| `src/screens/types.ts` | Edit | Remove FlagDefinition, FlagModule, flags from ScreenModule/ScreenEntry |
| `src/screens/useScreenModules.ts` | Edit | Remove featureFlagConfig import + flags merge |
| `src/config/feature-flags.ts` | Delete | No longer needed |
| 8 screen `index.tsx` files | Edit | Replace `flags?.showXxx !== false && (...)` with `data-flag="xxx"` |

### Screen Migration Map

| Screen | Current Flags | New data-flag Attributes |
|--------|--------------|--------------------------|
| booking/search | showRecentSearches, showSpecialties | recent-searches, specialties-filter |
| booking/appointments | showPastAppointments | past-appointments |
| booking/doctor | showFavorites | favorite-doctors |
| booking/location | showCurrentLocation, showRecentLocations | current-location, recent-locations |
| booking/patient | showInsurance | insurance-selection |
| booking/time-slots | showLegend | slot-legend |
| prescription/list | showSelectAll, showStatusBadges | select-all, status-badges |
| profile | showInsurance, showFamilyMembers | insurance-section, family-members |

---

## Task Breakdown

### Task 1: Create useFlagDiscovery hook

**Files:**
- Create: `src/devtools/useFlagDiscovery.ts`

**Step 1: Write the hook**

```typescript
import { useEffect, useState, type RefObject } from 'react'

export function useFlagDiscovery(
  containerRef: RefObject<HTMLElement | null>
): string[] {
  const [flags, setFlags] = useState<string[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function scan() {
      const elements = container!.querySelectorAll('[data-flag]')
      const names = new Set<string>()
      elements.forEach((el) => {
        const flag = (el as HTMLElement).dataset.flag
        if (flag) names.add(flag)
      })
      const sorted = [...names].sort()
      setFlags((prev) =>
        prev.length === sorted.length && prev.every((f, i) => f === sorted[i])
          ? prev
          : sorted
      )
    }

    scan()

    const observer = new MutationObserver(scan)
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-flag'] })
    return () => observer.disconnect()
  }, [containerRef])

  return flags
}
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

### Task 2: Create FlagStyleInjector component

**Files:**
- Create: `src/devtools/FlagStyleInjector.tsx`

**Step 1: Write the component**

```tsx
import { useDevToolsStore } from '@/devtools/useDevToolsStore'

export function FlagStyleInjector({ route }: { route: string }) {
  const featureFlags = useDevToolsStore((s) => s.featureFlags)

  const rules = Object.entries(featureFlags)
    .filter(([key, visible]) => key.startsWith(`${route}:`) && visible === false)
    .map(([key]) => {
      const flagName = key.slice(route.length + 1)
      return `[data-flag="${flagName}"] { display: none !important; }`
    })

  if (rules.length === 0) return null

  return <style>{rules.join('\n')}</style>
}
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

### Task 3: Update useDevToolsStore — route-scoped flags

**Files:**
- Modify: `src/devtools/useDevToolsStore.ts`

**Step 1: Update setFeatureFlag to use route-scoped keys**

The store already uses flat `Record<string, boolean>`. The key format changes from `showInsurance` to `/profile:insurance-section`. No type changes needed — just the callers pass different keys.

**Step 2: Reset flags on route change**

In `setSelectedRoute`, also reset `featureFlags: {}`.

**Step 3: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

### Task 4: Update InspectorPanel — auto-discovered flags

**Files:**
- Modify: `src/devtools/InspectorPanel.tsx`

**Step 1: Replace static flag section with discovered flags**

Remove `currentFlags` from `currentModule?.flags`. Instead, receive discovered flags via a new prop or use a ref passed to `useFlagDiscovery`.

The InspectorPanel needs a ref to the DeviceFrame content. Two approaches:
- **Option A:** Pass discovered flags as a prop from App.tsx (which owns the DeviceFrame ref)
- **Option B:** Use a shared ref via Zustand or context

**Option A is simpler:** App.tsx creates a ref, passes it to both DeviceFrame and InspectorPanel.

Update the Feature Flags section:
```tsx
{discoveredFlags.length > 0 && (
  <Section title="Feature Flags">
    <div className="flex flex-col gap-2">
      {discoveredFlags.map((flag) => {
        const storeKey = `${selectedRoute}:${flag}`
        const visible = featureFlags[storeKey] !== false
        return (
          <div key={flag} className="flex items-center justify-between">
            <Label htmlFor={`flag-${flag}`} className="text-xs text-neutral-600">
              {humanize(flag)}
            </Label>
            <Switch
              id={`flag-${flag}`}
              checked={visible}
              onCheckedChange={(checked) => setFeatureFlag(storeKey, checked)}
            />
          </div>
        )
      })}
    </div>
  </Section>
)}
```

**Step 2: Add humanize helper**

```typescript
function humanize(flag: string): string {
  return flag
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
```

**Step 3: Remove `currentModule?.flags` usage**

**Step 4: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

### Task 5: Update ScreenRenderer — remove flags, add FlagStyleInjector

**Files:**
- Modify: `src/screens/ScreenRenderer.tsx`

**Step 1: Remove resolveFlags function (lines 8-18)**

**Step 2: Remove `flags={resolvedFlags}` from Component render (line 131)**

Change:
```tsx
<Component data={data} flags={resolvedFlags} />
```
To:
```tsx
<>
  <FlagStyleInjector route={route} />
  <Component data={data} />
</>
```

**Step 3: Remove featureFlags from store subscription**

**Step 4: Remove FlagDefinition import**

**Step 5: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

### Task 6: Clean up types and useScreenModules

**Files:**
- Modify: `src/screens/types.ts`
- Modify: `src/screens/useScreenModules.ts`

**Step 1: Remove from types.ts:**
- `FlagDefinition` interface
- `FlagModule` interface
- `flags?` from `ScreenModule` component type signature
- `flags?` from `ScreenEntry`

**Step 2: Remove from useScreenModules.ts:**
- `import { featureFlagConfig }` line
- `flags: featureFlagConfig[route] ?? scenarioMod?.flags` from the return object

**Step 3: Delete `src/config/feature-flags.ts`**

**Step 4: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

### Task 7: Migrate 8 screens — replace flags prop with data-flag

**Files:**
- Modify: 8 screen `index.tsx` files

For each screen, the pattern is:

**Before:**
```tsx
export default function XScreen({ data, flags }: { data: XData; flags?: Record<string, boolean> }) {
  // ...
  {flags?.showInsurance !== false && (
    <Card>...</Card>
  )}
}
```

**After:**
```tsx
export default function XScreen({ data }: { data: XData }) {
  // ...
  <Card data-flag="insurance-section">...</Card>
}
```

Changes per screen:

1. **booking/search** — Remove `flags` prop, add `data-flag="recent-searches"` and `data-flag="specialties-filter"`
2. **booking/appointments** — Remove `flags` prop, add `data-flag="past-appointments"`
3. **booking/doctor** — Remove `flags` prop, add `data-flag="favorite-doctors"` (used in 2 places)
4. **booking/location** — Remove `flags` prop, add `data-flag="current-location"` and `data-flag="recent-locations"` (current-location used in 2 places)
5. **booking/patient** — Remove `flags` prop, add `data-flag="insurance-selection"`
6. **booking/time-slots** — Remove `flags` prop, add `data-flag="slot-legend"`
7. **prescription/list** — Remove `flags` prop, add `data-flag="select-all"` and `data-flag="status-badges"`
8. **profile** — Remove `flags` prop, add `data-flag="insurance-section"` and `data-flag="family-members"`

**Step: Verify TypeScript compiles after all 8**

```bash
pnpm exec tsc --noEmit
```

### Task 8: Wire discovery ref from App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Create a ref and pass to DeviceFrame + InspectorPanel**

The DeviceFrame's content area needs a ref so useFlagDiscovery can observe it. The ref goes from App.tsx → DeviceFrame (attaches to content div) and App.tsx → InspectorPanel (passed as prop for useFlagDiscovery).

Alternatively, use `document.querySelector('[data-testid="device-frame"]')` in useFlagDiscovery — simpler, no ref threading needed. Since `data-testid="device-frame"` already exists, this avoids touching App.tsx entirely.

**Updated useFlagDiscovery:**
```typescript
export function useFlagDiscovery(route: string | null): string[] {
  const [flags, setFlags] = useState<string[]>([])

  useEffect(() => {
    if (!route) { setFlags([]); return }

    const container = document.querySelector('[data-testid="device-frame"]')
    if (!container) return

    // ... same scan + MutationObserver logic
  }, [route])

  return flags
}
```

This removes the need to thread a ref and keeps App.tsx untouched.

**Step 2: Use in InspectorPanel:**
```typescript
const discoveredFlags = useFlagDiscovery(selectedRoute)
```

**Step 3: Verify TypeScript compiles + build**

```bash
pnpm exec tsc --noEmit
pnpm build
```

### Task 9: Verify everything works

**Step 1: Run Playwright tests**

```bash
pnpm test:e2e
```

All 57 tests should still pass — screens render identically because all flags default to visible (no `display:none` injected).

**Step 2: Manual verification**

Open the dev tool, select a screen with data-flag attributes (e.g., booking/search). Verify:
- Feature Flags section shows discovered flags
- Toggling OFF hides the element
- Layout reflows (siblings shift, blocks below move up)
- Toggling ON restores the element
- Switching screens resets flags and discovers new ones

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(devtools): replace prop-based flags with DOM-discovered data-flag system"
```

---

## Edge Cases

- **No data-flag elements:** Feature Flags section hidden (same as today when screen has no flags)
- **Dynamic flags** (inside conditional regions): MutationObserver catches additions/removals as state changes
- **Nested flags:** If a parent has `data-flag` and a child also has `data-flag`, hiding the parent hides both (correct — child is inside hidden parent)
- **Same flag name, multiple elements:** All elements with `data-flag="xxx"` hide/show together (intentional — allows flagging a concept, not just a DOM node)

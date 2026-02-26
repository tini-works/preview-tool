# Per-Screen Flow Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single `flow.yaml` with per-screen `flow.ts` files, removing the YAML dependency entirely.

**Architecture:** Each screen folder gets an optional `flow.ts` exporting `FlowAction[]`. A rewritten `useFlowActions` hook globs these TS files via `import.meta.glob` and maps folder names to routes. FlowProvider switches from `FlowConfig` + `findAction` to inline `actions?.find()`.

**Tech Stack:** TypeScript, React, Vite `import.meta.glob`

**Design doc:** `docs/plans/2026-02-26-per-screen-flow-design.md`

---

### Task 1: Create FlowAction type file

**Files:**
- Create: `src/flow/types.ts`

**Step 1: Create the types file**

```typescript
// src/flow/types.ts
export interface FlowAction {
  trigger: string
  setState?: string
  navigate?: string
  navigateState?: string
}
```

**Step 2: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: No new errors (existing code still imports from FlowEngine — that's fine for now)

**Step 3: Commit**

```bash
git add src/flow/types.ts
git commit -m "feat: add FlowAction type file"
```

---

### Task 2: Create per-screen flow.ts files

Split the 8 route sections from `src/screens/flow.yaml` into individual `flow.ts` files in each screen folder. Every file imports `FlowAction` from `@/flow/types`.

**Files:**
- Create: `src/screens/BookingSearch/flow.ts`
- Create: `src/screens/BookingType/flow.ts`
- Create: `src/screens/BookingDoctor/flow.ts`
- Create: `src/screens/BookingPatient/flow.ts`
- Create: `src/screens/BookingLocation/flow.ts`
- Create: `src/screens/BookingTimeSlots/flow.ts`
- Create: `src/screens/BookingConfirmation/flow.ts`
- Create: `src/screens/BookingAppointments/flow.ts`

**Step 1: Create all 8 flow.ts files**

```typescript
// src/screens/BookingSearch/flow.ts
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ListItem:Booking type', navigate: '/booking-type', navigateState: 'acute' },
  { trigger: 'ListItem:Book appointment for', navigate: '/booking-patient', navigateState: 'self' },
  { trigger: 'ListItem:Time slots', navigate: '/booking-time-slots', navigateState: 'all-selected' },
  { trigger: 'ListItem:Location', navigate: '/booking-location', navigateState: 'initial' },
  { trigger: 'Button:Search', navigate: '/booking-confirmation', navigateState: 'searching' },
]
```

```typescript
// src/screens/BookingType/flow.ts
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'RadioCard:Acute', setState: 'acute' },
  { trigger: 'RadioCard:Prevention', setState: 'prevention' },
  { trigger: 'RadioCard:Follow-up', setState: 'follow-up' },
  { trigger: 'Button:Save', navigate: '/booking-search', navigateState: 'partial' },
  { trigger: 'ScreenHeader:Booking type', navigate: '/booking-search', navigateState: 'empty' },
  { trigger: 'ListItem:Specialty & Doctor', navigate: '/booking-doctor', navigateState: 'browsing' },
]
```

Note: The last action (`ListItem:Specialty & Doctor`) is **new** — it fixes the BookingDoctor reachability gap identified in the design.

```typescript
// src/screens/BookingDoctor/flow.ts
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Avatar:AS', setState: 'selected' },
  { trigger: 'Avatar:TW', setState: 'selected' },
  { trigger: 'ListItem:Specialty', setState: 'specialty-drawer' },
  { trigger: 'ScreenHeader:Specialty & Doctor', navigate: '/booking-type', navigateState: 'prevention' },
]
```

```typescript
// src/screens/BookingPatient/flow.ts
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Book appointment for', navigate: '/booking-search', navigateState: 'partial' },
  { trigger: 'Avatar:MM', setState: 'family' },
  { trigger: 'Avatar:SM', setState: 'self' },
]
```

```typescript
// src/screens/BookingLocation/flow.ts
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Choose location', navigate: '/booking-search', navigateState: 'partial' },
  { trigger: 'Button:Use current location', setState: 'selected' },
]
```

```typescript
// src/screens/BookingTimeSlots/flow.ts
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Time slots', navigate: '/booking-search', navigateState: 'partial' },
]
```

```typescript
// src/screens/BookingConfirmation/flow.ts
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Button:Confirm Appointment', navigate: '/booking-appointments', navigateState: 'loaded' },
  { trigger: 'Button:Back to Home', navigate: '/booking-search', navigateState: 'empty' },
  { trigger: 'Button:Allow Notifications', setState: 'found' },
]
```

```typescript
// src/screens/BookingAppointments/flow.ts
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Button:Book New Appointment', navigate: '/booking-search', navigateState: 'empty' },
]
```

**Step 2: Verify no TypeScript errors**

Run: `pnpm tsc --noEmit`
Expected: Pass (files are self-contained, not imported by anything yet)

**Step 3: Commit**

```bash
git add src/screens/BookingSearch/flow.ts src/screens/BookingType/flow.ts src/screens/BookingDoctor/flow.ts src/screens/BookingPatient/flow.ts src/screens/BookingLocation/flow.ts src/screens/BookingTimeSlots/flow.ts src/screens/BookingConfirmation/flow.ts src/screens/BookingAppointments/flow.ts
git commit -m "feat: add per-screen flow.ts files for all booking screens"
```

---

### Task 3: Rewrite useFlowConfig to useFlowActions

Replace the YAML-based loader with a TS glob loader. The hook is renamed from `useFlowConfig` to `useFlowActions`.

**Files:**
- Modify: `src/flow/useFlowConfig.ts`

**Step 1: Rewrite the file**

Replace the entire contents of `src/flow/useFlowConfig.ts` with:

```typescript
import { useMemo } from 'react'
import type { FlowAction } from '@/flow/types'

interface FlowModule {
  actions: FlowAction[]
}

const flowModules = import.meta.glob<FlowModule>(
  '/src/screens/*/flow.ts',
  { eager: true }
)

function filePathToRoute(filePath: string): string {
  const match = filePath.match(/\/src\/screens\/([^/]+)\/flow\.ts$/)
  if (!match) return filePath
  return '/' + match[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export function useFlowActions(route: string | null): FlowAction[] | null {
  const routeMap = useMemo(() => {
    const map = new Map<string, FlowAction[]>()
    for (const [filePath, mod] of Object.entries(flowModules)) {
      map.set(filePathToRoute(filePath), mod.actions)
    }
    return map
  }, [])

  if (!route) return null
  return routeMap.get(route) ?? null
}
```

**Step 2: Verify TypeScript (expect errors in FlowProvider — that's Task 4)**

Run: `pnpm tsc --noEmit`
Expected: Errors in `FlowProvider.tsx` because it still imports `useFlowConfig` and `findAction`. This is expected and will be fixed in Task 4.

---

### Task 4: Update FlowProvider to use useFlowActions

Switch FlowProvider from `FlowConfig` + `findAction` to `FlowAction[]` + inline find.

**Files:**
- Modify: `src/flow/FlowProvider.tsx`

**Step 1: Update FlowProvider**

Replace the entire contents of `src/flow/FlowProvider.tsx` with:

```typescript
import { useCallback, useRef, type ReactNode } from 'react'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { useFlowActions } from '@/flow/useFlowConfig'
import { resolveTrigger } from '@/flow/trigger-matcher'

interface FlowProviderProps {
  children: ReactNode
}

export function FlowProvider({ children }: FlowProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const playMode = useDevToolsStore((s) => s.playMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const setSelectedState = useDevToolsStore((s) => s.setSelectedState)
  const pushFlowHistory = useDevToolsStore((s) => s.pushFlowHistory)
  const navigateFlow = useDevToolsStore((s) => s.navigateFlow)

  const actions = useFlowActions(selectedRoute)

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!playMode || !actions || !selectedRoute) return
      if (!containerRef.current) return

      const trigger = resolveTrigger(e.target, containerRef.current)
      if (!trigger) return

      const action = actions.find((a) => a.trigger === trigger)
      if (!action) return

      e.preventDefault()
      e.stopPropagation()

      const currentState = useDevToolsStore.getState().selectedState

      if (action.setState && !action.navigate) {
        pushFlowHistory(selectedRoute, currentState)
        setSelectedState(action.setState)
      }

      if (action.navigate) {
        pushFlowHistory(selectedRoute, currentState)
        navigateFlow(action.navigate, action.navigateState ?? null)
      }
    },
    [playMode, actions, selectedRoute, setSelectedState, pushFlowHistory, navigateFlow]
  )

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={playMode && actions ? 'cursor-pointer' : undefined}
    >
      {children}
    </div>
  )
}
```

Changes from the original:
- Import `useFlowActions` instead of `useFlowConfig`
- Import removed: `findAction` from `FlowEngine`
- `flowConfig` renamed to `actions`
- `findAction(flowConfig, selectedRoute, trigger)` replaced with `actions.find((a) => a.trigger === trigger)`
- Dependency array uses `actions` instead of `flowConfig`

**Step 2: Verify TypeScript**

Run: `pnpm tsc --noEmit`
Expected: Pass. No more references to `FlowEngine.ts` exports.

**Step 3: Commit**

```bash
git add src/flow/useFlowConfig.ts src/flow/FlowProvider.tsx
git commit -m "refactor: switch FlowProvider to per-screen useFlowActions"
```

---

### Task 5: Fix BookingDoctor reachability

Add `data-flow-target` to the "Specialty & Doctor" ListItem in BookingType so that clicking it navigates to `/booking-doctor`.

**Files:**
- Modify: `src/screens/BookingType/index.tsx:49-54`

**Step 1: Add data-flow-target attribute**

In `src/screens/BookingType/index.tsx`, find the ListItem inside the prevention block:

```typescript
            <ListItem
              icon="🩺"
              label="Specialty & Doctor"
              description="Select..."
              required
            />
```

Replace with:

```typescript
            <ListItem
              icon="🩺"
              label="Specialty & Doctor"
              description="Select..."
              required
              data-flow-target="ListItem:Specialty & Doctor"
            />
```

**Step 2: Verify TypeScript**

Run: `pnpm tsc --noEmit`
Expected: Pass

**Step 3: Commit**

```bash
git add src/screens/BookingType/index.tsx
git commit -m "feat: add flow target to BookingType for BookingDoctor reachability"
```

---

### Task 6: Remove old flow infrastructure

Delete `FlowEngine.ts`, `flow.yaml`, and the `yaml` npm dependency.

**Files:**
- Delete: `src/flow/FlowEngine.ts`
- Delete: `src/screens/flow.yaml`
- Modify: `package.json` (remove `yaml` dependency)

**Step 1: Delete FlowEngine.ts**

```bash
rm src/flow/FlowEngine.ts
```

**Step 2: Delete flow.yaml**

```bash
rm src/screens/flow.yaml
```

**Step 3: Remove yaml dependency**

```bash
pnpm remove yaml
```

**Step 4: Verify TypeScript and build**

Run: `pnpm tsc --noEmit`
Expected: Pass — no file imports from `FlowEngine` or uses YAML anymore

Run: `pnpm build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove FlowEngine, flow.yaml, and yaml dependency"
```

---

### Task 7: Build verification and smoke test

Final verification that everything works end-to-end.

**Files:** None (verification only)

**Step 1: Clean build**

```bash
rm -rf dist && pnpm build
```

Expected: Build succeeds with no warnings related to flow

**Step 2: Verify no remaining references to removed files**

```bash
grep -r "FlowEngine" src/ --include="*.ts" --include="*.tsx"
grep -r "flow.yaml" src/ --include="*.ts" --include="*.tsx"
grep -r "FlowConfig" src/ --include="*.ts" --include="*.tsx"
grep -r "parseFlowConfig" src/ --include="*.ts" --include="*.tsx"
grep -r "findAction" src/ --include="*.ts" --include="*.tsx"
```

Expected: All return empty (no matches)

**Step 3: Verify flow.ts files are picked up by glob**

Check that `import.meta.glob('/src/screens/*/flow.ts')` will match the 8 created files:

```bash
ls src/screens/*/flow.ts
```

Expected: 8 files listed — BookingSearch, BookingType, BookingDoctor, BookingPatient, BookingLocation, BookingTimeSlots, BookingConfirmation, BookingAppointments

**Step 4: Start dev server and verify no runtime errors**

```bash
pnpm dev
```

Expected: Dev server starts without errors. Open in browser, verify Play mode works by navigating through booking flow screens.

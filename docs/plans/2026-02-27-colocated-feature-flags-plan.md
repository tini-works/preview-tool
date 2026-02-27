# Co-located Feature Flags Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace centralized `src/config/feature-flags.ts` with co-located `flags.ts` files in each screen folder so flag maintenance only touches the screen folder.

**Architecture:** Each screen that needs feature flags gets a `flags.ts` file exporting a `flags` record. `useScreenModules.ts` discovers these via `import.meta.glob` instead of importing a central config. ScreenRenderer, InspectorPanel, store, and screen components remain unchanged.

**Tech Stack:** React 19, TypeScript, Vite `import.meta.glob`, Zustand

---

### Task 1: Create 10 co-located flags.ts files

**Files:**
- Create: `src/screens/booking/search/flags.ts`
- Create: `src/screens/booking/appointments/flags.ts`
- Create: `src/screens/booking/doctor/flags.ts`
- Create: `src/screens/booking/location/flags.ts`
- Create: `src/screens/booking/patient/flags.ts`
- Create: `src/screens/booking/time-slots/flags.ts`
- Create: `src/screens/prescription/confirmation/flags.ts`
- Create: `src/screens/prescription/list/flags.ts`
- Create: `src/screens/prescription/delivery/flags.ts`
- Create: `src/screens/profile/flags.ts`

**Note:** The central config had an entry for `/prescription/location` but the actual screen folder is `prescription/delivery`. Map those flags to `delivery/flags.ts`.

**Step 1: Create `src/screens/booking/search/flags.ts`**

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showRecentSearches: { label: 'Recent Searches', default: true },
  showSpecialties: { label: 'Specialties Filter', default: true },
}
```

**Step 2: Create `src/screens/booking/appointments/flags.ts`**

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showPastAppointments: { label: 'Past Appointments', default: true },
}
```

**Step 3: Create `src/screens/booking/doctor/flags.ts`**

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showFavorites: { label: 'Favorite Doctors', default: true },
}
```

**Step 4: Create `src/screens/booking/location/flags.ts`**

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showCurrentLocation: { label: 'Use Current Location', default: true },
  showRecentLocations: { label: 'Recent Locations', default: true },
}
```

**Step 5: Create `src/screens/booking/patient/flags.ts`**

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showInsurance: { label: 'Insurance Selection', default: true },
}
```

**Step 6: Create `src/screens/booking/time-slots/flags.ts`**

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showLegend: { label: 'Slot Legend', default: true },
}
```

**Step 7: Create `src/screens/prescription/confirmation/flags.ts`**

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showInsurance: { label: 'Insurance Section', default: true },
  showConsent: { label: 'Consent Checkbox', default: true },
}
```

**Step 8: Create `src/screens/prescription/list/flags.ts`**

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showSelectAll: { label: 'Select All', default: true },
  showStatusBadges: { label: 'Status Badges', default: true },
}
```

**Step 9: Create `src/screens/prescription/delivery/flags.ts`**

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showDeliveryNote: { label: 'Delivery Note', default: true },
  showMap: { label: 'Map View', default: true },
}
```

**Step 10: Create `src/screens/profile/flags.ts`**

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showInsurance: { label: 'Insurance Section', default: true },
  showFamilyMembers: { label: 'Family Members', default: true },
}
```

**Step 11: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No new errors. The files are valid TypeScript but not yet imported anywhere.

**Step 12: Commit**

```bash
git add src/screens/booking/search/flags.ts src/screens/booking/appointments/flags.ts src/screens/booking/doctor/flags.ts src/screens/booking/location/flags.ts src/screens/booking/patient/flags.ts src/screens/booking/time-slots/flags.ts src/screens/prescription/confirmation/flags.ts src/screens/prescription/list/flags.ts src/screens/prescription/delivery/flags.ts src/screens/profile/flags.ts
git commit -m "feat(flags): create co-located flags.ts for all 10 screens"
```

---

### Task 2: Update useScreenModules to discover flags.ts via glob

**Files:**
- Modify: `src/screens/useScreenModules.ts`

**Step 1: Replace featureFlagConfig import with flags.ts glob**

Replace the entire file with:

```typescript
import { useMemo } from 'react'
import type { ScreenEntry, ScreenModule, ScenarioModule, RegionsMap, FlagDefinition } from '@/screens/types'

const screenModules = import.meta.glob<ScreenModule>(
  '/src/screens/**/index.tsx'
)

const scenarioModules = import.meta.glob<ScenarioModule & { flags?: Record<string, FlagDefinition>; regions?: RegionsMap }>(
  '/src/screens/**/scenarios.ts',
  { eager: true }
)

const flagModules = import.meta.glob<{ flags: Record<string, FlagDefinition> }>(
  '/src/screens/**/flags.ts',
  { eager: true }
)

function filePathToRoute(filePath: string): string {
  const match = filePath.match(/\/src\/screens\/(.+)\/index\.tsx$/)
  if (!match) return filePath
  return `/${match[1]}`
}

function toCompanionPath(screenPath: string, filename: string): string {
  return screenPath.replace(/\/index\.tsx$/, `/${filename}`)
}

export function useScreenModules(): ScreenEntry[] {
  return useMemo(() => {
    return Object.entries(screenModules)
      .filter(([filePath]) => !filePath.includes('/_shared/'))
      .map(([filePath, loader]) => {
        const scenariosPath = toCompanionPath(filePath, 'scenarios.ts')
        const flagsPath = toCompanionPath(filePath, 'flags.ts')
        const scenarioMod = scenarioModules[scenariosPath]
        const flagMod = flagModules[flagsPath]
        const route = filePathToRoute(filePath)

        return {
          route,
          module: loader,
          scenarios: scenarioMod?.scenarios ?? {},
          flags: flagMod?.flags ?? scenarioMod?.flags,
          regions: scenarioMod?.regions,
        }
      })
  }, [])
}

export function useScreenRoutes(): string[] {
  const modules = useScreenModules()
  return useMemo(() => modules.map((m) => m.route), [modules])
}
```

Key changes:
- Removed: `import { featureFlagConfig } from '@/config/feature-flags'`
- Added: `flagModules` glob for `/src/screens/**/flags.ts` (eager)
- Added: `FlagDefinition` to the type import
- Changed: `flags: featureFlagConfig[route] ?? scenarioMod?.flags` → `flags: flagMod?.flags ?? scenarioMod?.flags`
- Renamed: `toScenariosPath` → `toCompanionPath` (now reused for both scenarios and flags)

**Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No errors.

**Step 3: Verify build succeeds**

```bash
pnpm build
```

Expected: Successful build. All screens should have identical flags as before — same keys, same labels, same defaults.

**Step 4: Commit**

```bash
git add src/screens/useScreenModules.ts
git commit -m "refactor(useScreenModules): discover flags from co-located flags.ts via glob"
```

---

### Task 3: Delete centralized feature-flags.ts

**Files:**
- Delete: `src/config/feature-flags.ts`

**Step 1: Delete the file**

```bash
rm src/config/feature-flags.ts
```

**Step 2: Check if src/config/ directory has other files**

```bash
ls src/config/
```

If empty, delete the directory too:

```bash
rmdir src/config/
```

**Step 3: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: No errors. Nothing imports `feature-flags.ts` anymore (useScreenModules was updated in Task 2).

**Step 4: Verify build succeeds**

```bash
pnpm build
```

Expected: Successful build.

**Step 5: Commit**

```bash
git add -u
git commit -m "refactor(flags): delete centralized feature-flags.ts config"
```

---

### Task 4: Verify everything works end-to-end

**Step 1: Run dev server**

```bash
pnpm dev
```

Open the app, select a screen with flags (e.g., booking/search). Verify:
- InspectorPanel shows Feature Flags section with correct toggles
- Toggling a flag OFF hides the section
- Toggling a flag ON restores the section
- Switching to a different screen shows that screen's flags

**Step 2: Run Playwright tests (if available)**

```bash
pnpm test:e2e
```

Expected: All existing tests pass — behavior is identical.

**Step 3: Final type check + build**

```bash
pnpm exec tsc --noEmit && pnpm build
```

Expected: Clean.

**Step 4: Commit (if any fixes were needed)**

Only if fixes were required during verification.

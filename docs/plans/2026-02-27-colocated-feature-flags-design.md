# Co-located Per-Screen Feature Flags Design

**Goal:** Replace centralized `src/config/feature-flags.ts` with co-located `flags.ts` files in each screen folder. Adding or editing flags only touches the screen folder.

**Tech Stack:** React, TypeScript, Vite `import.meta.glob`

---

## Current System

```
src/config/feature-flags.ts (central config, 15 flags across 10 routes)
  → useScreenModules merges into ScreenEntry.flags
  → ScreenRenderer resolves defaults + store overrides
  → Screen receives flags prop
  → Screen uses flags?.showXxx !== false && (...) for conditional rendering
```

**Problem:** Two places to maintain — central config file + screen component. Adding a flag requires editing a file outside the screen folder.

## New System

```
src/screens/{section}/{screen}/flags.ts (co-located, per-screen)
  → useScreenModules discovers via import.meta.glob
  → ScreenRenderer resolves defaults + store overrides (unchanged)
  → Screen receives flags prop (unchanged)
  → Screen uses flags?.showXxx !== false && (...) (unchanged)
```

### flags.ts Format

```typescript
import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showRecentSearches: { label: 'Recent Searches', default: true },
  showSpecialties: { label: 'Specialties Filter', default: true },
}
```

### Discovery in useScreenModules.ts

```typescript
// Before:
import { featureFlagConfig } from '@/config/feature-flags'
flags: featureFlagConfig[route] ?? scenarioMod?.flags

// After:
const flagModules = import.meta.glob<{ flags: Record<string, FlagDefinition> }>(
  '/src/screens/**/flags.ts',
  { eager: true }
)
flags: flagMod?.flags ?? scenarioMod?.flags
```

The `scenarioMod?.flags` fallback is preserved for backward compatibility.

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/config/feature-flags.ts` | Delete | Central config no longer needed |
| `src/screens/useScreenModules.ts` | Edit | Replace config import with flags.ts glob |
| `src/screens/booking/search/flags.ts` | Create | showRecentSearches, showSpecialties |
| `src/screens/booking/appointments/flags.ts` | Create | showPastAppointments |
| `src/screens/booking/doctor/flags.ts` | Create | showFavorites |
| `src/screens/booking/location/flags.ts` | Create | showCurrentLocation, showRecentLocations |
| `src/screens/booking/patient/flags.ts` | Create | showInsurance |
| `src/screens/booking/time-slots/flags.ts` | Create | showLegend |
| `src/screens/prescription/confirmation/flags.ts` | Create | showInsurance, showConsent |
| `src/screens/prescription/list/flags.ts` | Create | showSelectAll, showStatusBadges |
| `src/screens/prescription/location/flags.ts` | Create | showDeliveryNote, showMap |
| `src/screens/profile/flags.ts` | Create | showInsurance, showFamilyMembers |

### Unchanged Files

- `src/screens/types.ts` — FlagDefinition type stays
- `src/screens/ScreenRenderer.tsx` — resolveFlags + flags prop unchanged
- `src/devtools/InspectorPanel.tsx` — toggle UI unchanged
- `src/devtools/useDevToolsStore.ts` — store unchanged
- All screen `index.tsx` files — no changes needed

---

## Non-Goals

- Changing the flag consumption pattern (flags prop + conditional rendering stays)
- Adding new flags (only migrating existing ones)
- Changing InspectorPanel or ScreenRenderer behavior
- Implementing the DOM-based data-flag approach (separate design)

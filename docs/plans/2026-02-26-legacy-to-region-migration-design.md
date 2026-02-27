# Legacy-to-Region Migration Design

**Goal:** Migrate all 10 legacy flat-scenario screens to the region-based state model.

## Approach

Mechanical rewrite — single region per screen, no behavior changes.

## Per-Screen Changes

### 1. `scenarios.ts` — Convert `scenarios` to `regions`

```ts
// Before (legacy)
export const scenarios = {
  idle: { label: '...', data: { state: 'idle' } },
}

// After (region)
export const regions = {
  login: {
    label: 'Login',
    states: {
      idle: { state: 'idle' },
    },
    defaultState: 'idle',
  },
}
```

### 2. `index.tsx` — No changes

Both patterns pass a flat `data` object via `ScreenRenderer.assembleRegionData()`.

### 3. `.spec.ts` — `switchState()` → `switchRegionState()`

```ts
// Before
await screen.switchState('idle')

// After
await screen.switchRegionState('Login', 'idle')
```

## Region Naming

| Screen | Region key | Region label |
|--------|-----------|-------------|
| login | `login` | Login |
| hello | `hello` | Hello |
| prescription/scan | `scan` | Scan |
| booking/appointments | `appointments` | Appointments |
| booking/confirmation | `confirmation` | Confirmation |
| booking/doctor | `doctor` | Doctor |
| booking/location | `location` | Location |
| booking/patient | `patient` | Patient |
| booking/time-slots | `timeSlots` | Time Slots |
| booking/type | `type` | Type |

## Default State

First state key becomes `defaultState`.

## Scope

- 10 screens, 2 files each (scenarios.ts + spec.ts), index.tsx untouched
- No scaffolding changes — `ScreenRenderer` legacy path becomes dead code (separate cleanup)

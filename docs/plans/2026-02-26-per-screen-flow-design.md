# Per-Screen Flow Config Design

**Date:** 2026-02-26
**Status:** Approved

## Problem

The flow system uses a single `src/screens/flow.yaml` with all routes in one file. This is hard to review and maintain — you must scroll through 80+ lines to find actions for a specific screen. It also creates disconnects: `/booking-doctor` has actions defined but is unreachable from any other screen.

## Decision

Replace the single YAML file with per-screen `flow.ts` files co-located in each screen folder. Remove the YAML dependency entirely.

## Screen Structure (updated)

```
src/screens/<ScreenName>/
├── index.tsx          # React component
├── scenarios.ts       # State config + mock data
└── flow.ts            # Optional: flow actions for this screen
```

### flow.ts

```typescript
import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'RadioCard:Acute', setState: 'acute' },
  { trigger: 'Button:Save', navigate: '/booking-search', navigateState: 'partial' },
]
```

Only screens that participate in interactive flows need a `flow.ts`.

## Flow Types

Move `FlowAction` to a standalone types file. Remove `FlowConfig`, `parseFlowConfig`, and `findAction` from `FlowEngine.ts`.

### `src/flow/types.ts` (new)

```typescript
export interface FlowAction {
  trigger: string
  setState?: string
  navigate?: string
  navigateState?: string
}
```

## Flow Loading

### `useFlowConfig.ts` (rewritten)

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

Key changes:
- Glob pattern: `/src/screens/*/flow.ts` (TS, not YAML)
- Returns `FlowAction[]` directly (not a `FlowConfig` wrapper)
- Route derived from folder name (same logic as `useScreenModules`)
- Hook renamed to `useFlowActions` (more descriptive)

## FlowProvider Changes

Minimal — just use `FlowAction[]` instead of `FlowConfig` + `findAction`:

```typescript
const actions = useFlowActions(selectedRoute)

// In click handler:
const match = actions?.find((a) => a.trigger === trigger)
```

## Reachability Fix

Add navigation from BookingType to BookingDoctor when prevention is selected:

- `BookingType/index.tsx`: add `data-flow-target="ListItem:Specialty & Doctor"` to the existing ListItem
- `BookingType/flow.ts`: add `{ trigger: 'ListItem:Specialty & Doctor', navigate: '/booking-doctor', navigateState: 'browsing' }`

## Files to Create

- `src/flow/types.ts` — FlowAction type
- `src/screens/BookingSearch/flow.ts`
- `src/screens/BookingType/flow.ts`
- `src/screens/BookingDoctor/flow.ts`
- `src/screens/BookingPatient/flow.ts`
- `src/screens/BookingLocation/flow.ts`
- `src/screens/BookingTimeSlots/flow.ts`
- `src/screens/BookingConfirmation/flow.ts`
- `src/screens/BookingAppointments/flow.ts`

## Files to Modify

- `src/flow/useFlowConfig.ts` — rewrite to glob TS files, rename hook
- `src/flow/FlowProvider.tsx` — use `useFlowActions` + inline find
- `src/screens/BookingType/index.tsx` — add missing `data-flow-target`

## Files to Remove

- `src/flow/FlowEngine.ts` — no more YAML parsing or FlowConfig
- `src/screens/flow.yaml` — replaced by per-screen flow.ts
- `yaml` npm dependency

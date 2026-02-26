# Feature Flags Design

## Problem

Feature flags infrastructure is half-built. The inspector panel shows toggle switches and the store tracks boolean state, but no screen component consumes the flag values. Toggling flags has zero effect on rendered screens.

## Current State

- **Store**: `featureFlags: Record<string, boolean>` with `setFeatureFlag` / `resetFeatureFlags`
- **Inspector**: Renders `Switch` toggles per flag when screen exports `flags`
- **Definitions**: Only `BookingSearch/scenarios.ts` exports flags (`showRecentSearches`, `showSpecialties`)
- **Missing**: ScreenRenderer does not pass flags to components; BookingSearch has no conditional UI

## Approach: Explicit `flags` Prop

Add optional `flags: Record<string, boolean>` as a second prop to screen components. ScreenRenderer resolves flag values (store overrides merged with definition defaults) and passes them down.

### Data Flow

```
scenarios.ts flags → InspectorPanel toggles → store.featureFlags
                                                     ↓
                     ScreenRenderer resolves defaults + overrides
                                                     ↓
                     <Component data={data} flags={flags} />
```

## Changes

### 1. `src/screens/types.ts`

Update `ScreenModule.default` to accept optional `flags` prop:
```typescript
export interface ScreenModule {
  default: ComponentType<{ data: unknown; flags?: Record<string, boolean> }>
}
```

### 2. `src/screens/ScreenRenderer.tsx`

- Read `featureFlags` from store
- Read flag definitions from current screen entry
- Resolve: for each defined flag, use store value if set, else definition default
- Pass `flags` prop to `<Component>`

### 3. `src/screens/BookingSearch/index.tsx`

- Accept `flags` prop
- Conditionally render "Recent Searches" section when `flags?.showRecentSearches`
- Conditionally render "Specialties Filter" section when `flags?.showSpecialties`

### 4. `src/screens/BookingSearch/scenarios.ts`

No changes — flag definitions already exist.

## Non-Goals

- Adding flags to every screen (only BookingSearch currently defines them)
- Global flags (flags are per-screen by design)
- Flag persistence (store already handles this)

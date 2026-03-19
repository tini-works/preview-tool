# Error Boundaries + Safe Defaults

**Date:** 2026-03-11
**Status:** Approved
**Motivation:** Specs don't always declare hooks clearly; preview-tool crashes instead of degrading gracefully

## Problem

When specs omit `data_deps` or the AST pipeline can't discover hooks, the preview-tool crashes from:
- Null `stateData` in generated mock functions
- Unhandled errors in mock hook bodies
- Provider initialization failures killing the entire screen
- Module loading hangs with no timeout
- Silent catch blocks hiding the root cause

## Principle

Hooks are implementation details, not requirements. Specs should remain optional hint sources for hook data. The **preview-tool must never crash** regardless of spec completeness. Missing hook info = safe defaults + visible warning, not a white screen.

## Design: 5 Targeted Fixes

### Fix 1: Null guard in `resolveStoreState`

**File:** `packages/cli/src/spec/spec-pipeline-orchestrator.ts` (generated code)

The generated `resolveStoreState` function crashes when `stateData` is null/undefined.

**Change:** Add null guard at top of generated function:
```typescript
const safe = (stateData && typeof stateData === 'object') ? stateData : {}
const result = { ...safe }
```

### Fix 2: Try-catch in generated mock hook functions

**File:** `packages/cli/src/spec/spec-pipeline-orchestrator.ts` (generated code)

Wrap each generated mock hook body in try-catch that returns safe defaults on failure.

**Change:** Generated hooks become:
```typescript
export function useXxx(...args) {
  try {
    // existing mock logic
    return state
  } catch (e) {
    console.warn('[preview-tool] Mock hook useXxx failed:', e)
    return { /* defaults from shape */ }
  }
}
```

### Fix 3: Error boundary around RegionDataProvider

**File:** `packages/runtime/src/ScreenRenderer.tsx`

Ensure the rendered component + RegionDataProvider is wrapped in ScreenErrorBoundary so provider init failures show error UI instead of a white screen.

### Fix 4: Timeout for screen module loading

**File:** `packages/runtime/src/ScreenRenderer.tsx`

Add 10-second timeout to dynamic imports via `Promise.race` so hanged imports show an error instead of spinning forever.

### Fix 5: Log instead of silent catch in Vite plugin

**File:** `packages/cli/src/server/vite-plugin-spec-preview.ts`

Replace silent `catch {}` blocks with `console.warn('[preview-tool] ...')` so developers see why enrichment failed.

## Files Changed

| File | Change |
|------|--------|
| `packages/cli/src/spec/spec-pipeline-orchestrator.ts` | Fix 1 (null guard), Fix 2 (try-catch in generated mocks) |
| `packages/runtime/src/ScreenRenderer.tsx` | Fix 3 (error boundary), Fix 4 (timeout) |
| `packages/cli/src/server/vite-plugin-spec-preview.ts` | Fix 5 (logging) |

## Backward Compatibility

- All fixes are additive guardrails, no behavior changes for working screens
- Existing mock generation produces same output, just wrapped in try-catch
- Error boundaries only activate on failure, invisible otherwise

## Test Plan

- [ ] Unit test: `resolveStoreState` with null/undefined/array input returns empty object
- [ ] Unit test: mock hook try-catch returns defaults when `useRegionDataForHook` throws
- [ ] Integration test: screen with missing hook declarations renders with error boundary message
- [ ] Manual test: import timeout triggers after 10s with error UI
- [ ] Manual test: Vite plugin logs pipeline failure to console

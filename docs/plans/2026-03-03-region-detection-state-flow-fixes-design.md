# Region Detection, State Switching & Flow Fixes

**Date:** 2026-03-03
**Status:** Approved
**Branch:** feature/template-1

## Problem Statement

Testing the preview tool against a real React app revealed three interconnected issues:

1. **Missing regions** -- hooks exist in source code but the analyzer doesn't generate regions for them
2. **State switching does nothing** -- clicking states in the inspector doesn't update the rendered component
3. **Flow clicks not captured** -- the FlowProvider click handler never fires

These issues stem from rigid regex-based detection, competing state systems, and an unintuitive playMode gate.

## Root Cause Analysis

### Issue 1: Hook Detection Failures

The analyzer (`analyze-hooks.ts`) uses a single regex to extract sectionId:

```regex
localName + `\s*\([\s\S]*?['"]([a-z][a-z0-9-]*)['"]\s*\)`
```

This only matches hooks where the last argument before `)` is a string literal.

| Pattern | Detected? | Why |
|---------|-----------|-----|
| `useQuery({ queryKey: ['users'] })` | No | Object arg with nested array, not string literal |
| `useAuthStore((s) => s.user)` | No | Zustand not in DATA_HOOK_PATTERNS allowlist |
| `useContext(AuthContext)` | No | useContext not tracked as data source |
| `useAppLiveQuery({ sectionId: 'grid' })` | No | sectionId inside object, not positional arg |
| `useAppLiveQuery(q, 'grid')` | Yes | String literal as last arg (only pattern that works) |

Additionally, `enrichModelWithHookMapping()` skips hooks without sectionId (`if (!hook.sectionId) continue`), so even detected hooks may not create regions.

### Issue 2: State Switching Pipeline

Two competing state systems exist:

- **System 1 (Primary):** `RegionDataContext` + `useRegionDataForHook()` -- intended but unused (context appears null)
- **System 2 (Fallback):** `modelRegistry` + direct Zustand store subscription -- currently active

The fallback masks System 1's failure. But since Issue 1 prevents region detection, there are no regions to switch states for regardless.

### Issue 3: Flow Click Capture

- `playMode` defaults to `false` in the Zustand store -- all clicks are silently ignored
- No visual indication that Play Mode must be toggled
- Controller.ts must export `flows` (optional field) -- silent failure when missing

## Design

### Fix 1: Expand Hook Detection (analyze-hooks.ts)

**A. Add multiple sectionId extraction strategies:**

```typescript
// Strategy 1: React Query queryKey array
// Matches: useQuery({ queryKey: ['users', ...] })
const queryKeyPattern = /queryKey\s*:\s*\[\s*['"]([a-z][a-z0-9-]*)['"]/

// Strategy 2: Object sectionId property
// Matches: useHook({ sectionId: 'my-section' })
const objectSectionIdPattern = /sectionId\s*:\s*['"]([a-z][a-z0-9-]*)['"]/

// Strategy 3: Positional string argument (existing)
// Matches: useHook(query, 'my-section')
const positionalPattern = /['"]([a-z][a-z0-9-]*)['"]\s*\)/

// Strategy 4: Derive from hook/import name (fallback)
// useAuthStore -> 'auth-store'
// useContext(UserContext) -> 'user-context'
```

**B. Expand hook detection beyond DATA_HOOK_PATTERNS:**

- Detect Zustand store hooks: imports matching `/store/` path or `useXxxStore` naming convention
- Detect Context hooks: `useContext(XxxContext)` calls
- Classify dynamically based on import path and naming patterns

**C. Always create a region for detected hooks:**

Remove the `if (!hook.sectionId) continue` guard in `enrichModelWithHookMapping()`. When sectionId is missing, generate a deterministic fallback from `hookName + importPath`.

### Fix 2: Unify State System (Remove Fallback)

**A. Remove modelRegistry fallback from mock hooks:**

Mock hooks will only use `useRegionDataForHook()` from RegionDataContext. No dual-path.

**B. Improve matching in useRegionDataForHook:**

Multi-strategy matching chain:
1. Match by `hookMapping.identifier` (exact)
2. Match by region key (direct lookup)
3. Match by hookName (when identifier is ambiguous)
4. Match queryKey array prefix (first element)

**C. Add dev-mode diagnostics:**

Console.warn when:
- RegionDataContext is null (provider not mounted)
- No matching region found for a hook call
- hookMapping is missing on a region

### Fix 3: Simplify Flow Click Capture

**A. Remove playMode entirely:**

- Remove `playMode` state and `togglePlayMode` from useDevToolsStore
- Remove `if (!playMode) return` guard from FlowProvider
- Always capture clicks; silently ignore when no matching trigger found

**B. Improve trigger matching resilience:**

- Add role-based matching: `[role="button"]`, `button`, `a[href]`
- Case-insensitive text matching with whitespace trimming
- Add `data-testid` as fallback selector

## Files Changed

| File | Changes |
|------|---------|
| `packages/cli/src/analyzer/analyze-hooks.ts` | Add queryKey, Zustand, Context, object sectionId detection; fallback sectionId generation |
| `packages/cli/src/generator/index.ts` | Remove sectionId guard in enrichModelWithHookMapping |
| `packages/cli/src/generator/generate-mock-hooks.ts` | Remove modelRegistry fallback; use context-only |
| `packages/runtime/src/RegionDataContext.tsx` | Multi-strategy matching; dev-mode logging |
| `packages/runtime/src/flow/FlowProvider.tsx` | Remove playMode gate |
| `packages/runtime/src/store/useDevToolsStore.ts` | Remove playMode state |
| `packages/runtime/src/flow/trigger-matcher.ts` | Add role-based matching, case-insensitive text, data-testid |

## Testing Strategy

1. Unit tests for each new regex pattern in analyze-hooks
2. Unit tests for multi-strategy matching in useRegionDataForHook
3. Integration test: generate against sample-app with varied hook patterns
4. Manual test: run against the real external app to verify all three fixes

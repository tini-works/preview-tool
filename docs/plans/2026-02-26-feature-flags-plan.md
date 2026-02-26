# Feature Flags Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire feature flags from store through ScreenRenderer to screen components so toggles actually affect rendering.

**Architecture:** ScreenRenderer resolves flag values (store overrides + definition defaults) and passes as `flags` prop. Screens conditionally render sections based on flags.

**Tech Stack:** React, TypeScript, Zustand

---

### Task 1: Update ScreenModule type

**Files:**
- Modify: `src/screens/types.ts:27-29`

**Step 1: Update ScreenModule interface**

Change `default` type to accept optional `flags` prop:

```typescript
export interface ScreenModule {
  default: ComponentType<{ data: unknown; flags?: Record<string, boolean> }>
}
```

**Step 2: Verify types compile**

Run: `pnpm tsc --noEmit`

**Step 3: Commit**

```bash
git add src/screens/types.ts
git commit -m "feat(types): add flags prop to ScreenModule interface"
```

---

### Task 2: Wire flags through ScreenRenderer

**Files:**
- Modify: `src/screens/ScreenRenderer.tsx`

**Step 1: Read featureFlags from store**

Add `featureFlags` selector alongside existing store selectors.

**Step 2: Create resolveFlags helper**

Given flag definitions and store overrides, produce resolved `Record<string, boolean>`:

```typescript
function resolveFlags(
  definitions: Record<string, FlagDefinition> | undefined,
  overrides: Record<string, boolean>
): Record<string, boolean> {
  if (!definitions) return {}
  const resolved: Record<string, boolean> = {}
  for (const [key, def] of Object.entries(definitions)) {
    resolved[key] = overrides[key] ?? def.default
  }
  return resolved
}
```

**Step 3: Pass flags to Component**

Replace `<Component data={data} />` with `<Component data={data} flags={resolvedFlags} />`.

**Step 4: Verify types compile**

Run: `pnpm tsc --noEmit`

**Step 5: Commit**

```bash
git add src/screens/ScreenRenderer.tsx
git commit -m "feat(ScreenRenderer): resolve and pass feature flags to screen components"
```

---

### Task 3: Add conditional UI to BookingSearch

**Files:**
- Modify: `src/screens/BookingSearch/index.tsx`
- Modify: `src/screens/BookingSearch/scenarios.ts` (only if data additions needed)

**Step 1: Accept flags prop**

Update component signature to accept `flags`:

```typescript
export default function BookingSearchScreen({
  data,
  flags,
}: {
  data: BookingSearchData
  flags?: Record<string, boolean>
})
```

**Step 2: Add "Recent Searches" section**

Conditionally render when `flags?.showRecentSearches !== false`:

```tsx
{flags?.showRecentSearches !== false && (
  <Card className="...">
    <div className="...">
      <span>Recent Searches</span>
    </div>
    {/* 2-3 mock recent search items */}
  </Card>
)}
```

**Step 3: Add "Specialties Filter" section**

Conditionally render when `flags?.showSpecialties !== false`:

```tsx
{flags?.showSpecialties !== false && (
  <Card className="...">
    <div className="...">
      <span>Specialties</span>
    </div>
    {/* 3-4 specialty chip/badge items */}
  </Card>
)}
```

**Step 4: Verify types compile and dev server renders**

Run: `pnpm tsc --noEmit`

**Step 5: Commit**

```bash
git add src/screens/BookingSearch/index.tsx
git commit -m "feat(BookingSearch): add conditional UI for feature flags"
```

---

### Task 4: Smoke test

**Step 1: Type check**

Run: `pnpm tsc --noEmit`
Expected: No new errors.

**Step 2: Build check**

Run: `pnpm build`
Expected: Successful build (ignoring pre-existing i18n.ts error if present).

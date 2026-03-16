# Type Extraction Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two type extraction breakdowns so auto-generated mockData correctly nulls fields in loading/error states and merges Zustand selector calls into a single HookFact.

**Architecture:** Fix 1 adds `nullableFields` tracking to `TypeShapeInfo`, populates it during `serializeType` when a property's type is a union with `null`/`undefined`, and consumes it in `state-distributor.ts` to classify those fields as `data-nullable`. Fix 2 relaxes `aggregateSelectorHooks` in `collect-facts.ts` so it merges `destructuredFields` across all same-name hook calls (not only when *all* calls match the selector regex).

**Tech Stack:** TypeScript, ts-morph, Vitest

---

### Task 1: Add `nullableFields` to `TypeShapeInfo`

**Files:**
- Modify: `packages/cli/src/analyzer/types.ts:176-184`
- Test: `packages/cli/src/analyzer/__tests__/extract-types.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/analyzer/__tests__/extract-types.test.ts`, inside the `extractHookReturnType` describe block:

```typescript
it('tracks nullable fields in nullableFields array', () => {
  const { call, typeChecker } = getFirstCallExpression(`
    interface Doctor { name: string; email: string }
    interface TimeSlot { start: string; end: string }
    function useStore(): { doctor: Doctor | null; timeSlot: TimeSlot | null; isLoading: boolean } {
      return { doctor: null, timeSlot: null, isLoading: false }
    }
    const result = useStore()
  `)
  const info = extractHookReturnType(call, typeChecker)
  expect(info).not.toBeNull()
  expect(info!.nullableFields).toBeDefined()
  expect(info!.nullableFields).toContain('doctor')
  expect(info!.nullableFields).toContain('timeSlot')
  expect(info!.nullableFields).not.toContain('isLoading')
})

it('returns empty nullableFields when no nullable properties exist', () => {
  const { call, typeChecker } = getFirstCallExpression(`
    function useStore(): { name: string; count: number } {
      return { name: '', count: 0 }
    }
    const result = useStore()
  `)
  const info = extractHookReturnType(call, typeChecker)
  expect(info).not.toBeNull()
  expect(info!.nullableFields).toEqual([])
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/extract-types.test.ts`
Expected: FAIL — `nullableFields` is `undefined`

**Step 3: Add `nullableFields` to `TypeShapeInfo` interface**

In `packages/cli/src/analyzer/types.ts`, add to the `TypeShapeInfo` interface:

```typescript
export interface TypeShapeInfo {
  /** The resolved type shape as a mock-ready object */
  shape: Record<string, unknown>
  /** Whether the type was fully resolved (vs partial/any) */
  confidence: 'full' | 'partial' | 'none'
  /** Field classifications from the type (methods vs properties) */
  methods: string[]
  properties: string[]
  /** Property names whose type includes null or undefined in a union */
  nullableFields: string[]
}
```

**Step 4: Update `serializeType` to track nullable fields**

In `packages/cli/src/analyzer/extract-types.ts`, modify the `serializeType` function.

Add a `nullableFields` array alongside `properties`, `methods`, `shape`. When iterating over `symbols`, check if the member type is a union containing `null` or `undefined`:

```typescript
// Inside serializeType, after the existing lines:
// const properties: string[] = []
// const methods: string[] = []
// const shape: Record<string, unknown> = {}
const nullableFields: string[] = []

// Inside the for (const sym of symbols) loop, after getting memberType:
// Check if the property type is a union containing null/undefined
if (memberType.isUnion()) {
  const hasNull = memberType.getUnionTypes().some(
    (t) => t.isNull() || t.isUndefined(),
  )
  if (hasNull) {
    nullableFields.push(name)
  }
}
```

Update ALL return statements in `serializeType` to include `nullableFields`:

- The early returns for no properties: `return { shape: {}, confidence: 'none', methods: [], properties: [], nullableFields: [] }`
- The methods-only return: `return { shape: {}, confidence: 'none', methods, properties: [], nullableFields: [] }`
- The final return: `return { shape, confidence, methods, properties, nullableFields }`

Also update the union-type branch that recurses (around line 157). When `serializeType` recurses into a union branch, the result won't have top-level nullable fields tracked. But since we only track nullable fields at the object property level, this is fine — the recursion into `bestType` will handle the inner properties.

**Step 5: Fix all other places that construct `TypeShapeInfo` objects**

Search for any test or code constructing `TypeShapeInfo` objects and add `nullableFields: []` to them:

- `packages/cli/src/spec/__tests__/state-distributor.test.ts` — the `resolvedType` and `typeWithIsError` fixtures
- `packages/cli/src/spec/spec-pipeline-orchestrator.ts` — if any inline `TypeShapeInfo` objects are constructed

**Step 6: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/extract-types.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/cli/src/analyzer/types.ts packages/cli/src/analyzer/extract-types.ts packages/cli/src/analyzer/__tests__/extract-types.test.ts packages/cli/src/spec/__tests__/state-distributor.test.ts
git commit -m "feat: track nullable fields in TypeShapeInfo during type extraction"
```

---

### Task 2: Use `nullableFields` in state-distributor

**Files:**
- Modify: `packages/cli/src/spec/state-distributor.ts:126-139` and `141-175`
- Test: `packages/cli/src/spec/__tests__/state-distributor.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/spec/__tests__/state-distributor.test.ts`:

```typescript
it('nulls nullable fields in loading/error/empty states', () => {
  const storeType: TypeShapeInfo = {
    shape: {
      doctor: { id: '1', name: 'Dr. Smith', email: 'dr@example.com' },
      timeSlot: { start: '09:00', end: '10:00' },
      isLoading: false,
    },
    confidence: 'full',
    methods: ['setDoctor', 'setTimeSlot'],
    properties: ['doctor', 'timeSlot', 'isLoading'],
    nullableFields: ['doctor', 'timeSlot'],
  }

  const result = distributeByState(
    ['loading', 'populated', 'error'],
    storeType,
  )

  // loading: nullable fields should be null
  expect(result.loading.doctor).toBeNull()
  expect(result.loading.timeSlot).toBeNull()
  expect(result.loading.isLoading).toBe(true)

  // populated: nullable fields should have data
  expect(result.populated.doctor).toEqual({ id: '1', name: 'Dr. Smith', email: 'dr@example.com' })
  expect(result.populated.timeSlot).toEqual({ start: '09:00', end: '10:00' })
  expect(result.populated.isLoading).toBe(false)

  // error: nullable fields should be null
  expect(result.error.doctor).toBeNull()
  expect(result.error.timeSlot).toBeNull()
  expect(result.error.isLoading).toBe(false)
})

it('does not null non-nullable fields in loading state', () => {
  const type: TypeShapeInfo = {
    shape: {
      title: 'Page Title',
      items: [{ id: '1' }],
      isLoading: false,
    },
    confidence: 'full',
    methods: [],
    properties: ['title', 'items', 'isLoading'],
    nullableFields: [],
  }

  const result = distributeByState(['loading'], type)
  // title is a data-value, not nullable — should keep its value even in loading
  expect(result.loading.title).toBe('Page Title')
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/spec/__tests__/state-distributor.test.ts`
Expected: FAIL — `doctor` will be `{ id: '1', name: 'Dr. Smith' }` instead of `null` in loading state

**Step 3: Modify `inferFieldKind` and `getFieldValueForState`**

In `packages/cli/src/spec/state-distributor.ts`:

**Option A (simplest):** Modify `distributeByState` to pass `nullableFields` down. Change `inferFieldKind` to accept `nullableFields` and append `-nullable` to the kind when the field is in the list:

```typescript
function inferFieldKind(
  fieldName: string,
  shapeValue: unknown,
  methods: string[],
  nullableFields: string[],
): string {
  if (methods.includes(fieldName)) return 'function'
  if (Array.isArray(shapeValue)) return 'array'
  // NEW: Check nullableFields from TypeShapeInfo
  if (nullableFields.includes(fieldName)) {
    if (typeof shapeValue === 'object' && shapeValue !== null) return 'object-nullable'
    if (typeof shapeValue === 'string') return 'string-nullable'
    if (typeof shapeValue === 'number') return 'number-nullable'
    return 'object-nullable'
  }
  if (shapeValue === null) return 'object-nullable'
  if (typeof shapeValue === 'boolean') return 'boolean'
  if (typeof shapeValue === 'string') return 'string'
  if (typeof shapeValue === 'number') return 'number'
  if (typeof shapeValue === 'object') return 'object'
  return 'unknown'
}
```

Update the call site in `distributeByState`:

```typescript
export function distributeByState(
  stateNames: string[],
  resolvedType: TypeShapeInfo,
  fieldKinds?: Record<string, string>,
): Record<string, Record<string, unknown>> {
  // ...existing code...
  for (const field of allFields) {
    const shapeValue = resolvedType.shape[field] ?? null
    const kind =
      fieldKinds?.[field] ??
      inferFieldKind(field, shapeValue, resolvedType.methods, resolvedType.nullableFields ?? [])
    const category = classifyField(field, kind)
    // ...rest unchanged...
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/spec/__tests__/state-distributor.test.ts`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `cd packages/cli && npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add packages/cli/src/spec/state-distributor.ts packages/cli/src/spec/__tests__/state-distributor.test.ts
git commit -m "feat: use nullableFields to null out fields in loading/error states"
```

---

### Task 3: Relax Zustand selector aggregation to merge partial groups

**Files:**
- Modify: `packages/cli/src/analyzer/collect-facts.ts:121-167`
- Test: `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`, inside or after the `extractHookFacts` describe block:

```typescript
describe('Zustand selector aggregation', () => {
  it('merges multiple selector calls for the same store into one fact', () => {
    const sf = createSourceFile(`
      import { useBookingStore } from '@/stores/booking'
      function Screen() {
        const doctor = useBookingStore((s) => s.doctor)
        const setTimeSlot = useBookingStore((s) => s.setTimeSlot)
        const selectedDate = useBookingStore((s) => s.selectedDate)
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    // Should be aggregated into a single fact
    expect(hooks).toHaveLength(1)
    expect(hooks[0].name).toBe('useBookingStore')
    expect(hooks[0].destructuredFields).toEqual(
      expect.arrayContaining(['doctor', 'setTimeSlot', 'selectedDate'])
    )
    expect(hooks[0].selectorPattern).toBe(true)
  })

  it('merges selector calls even when mixed with non-selector calls', () => {
    const sf = createSourceFile(`
      import { useBookingStore } from '@/stores/booking'
      function Screen() {
        const doctor = useBookingStore((s) => s.doctor)
        const { isLoading } = useBookingStore()
        const setDate = useBookingStore((s) => s.setDate)
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    // Should merge into one fact with all fields combined
    expect(hooks).toHaveLength(1)
    expect(hooks[0].destructuredFields).toEqual(
      expect.arrayContaining(['doctor', 'isLoading', 'setDate'])
    )
  })

  it('does not merge hooks with different importPaths', () => {
    const sf = createSourceFile(`
      import { useStore as useStoreA } from '@/stores/a'
      import { useStore as useStoreB } from '@/stores/b'
      function Screen() {
        const x = useStoreA((s) => s.x)
        const y = useStoreB((s) => s.y)
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    // Different import paths — should NOT merge
    expect(hooks).toHaveLength(2)
  })

  it('preserves single calls unchanged', () => {
    const sf = createSourceFile(`
      import { useAuthStore } from '@/stores/auth'
      function Screen() {
        const user = useAuthStore(s => s.user)
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].destructuredFields).toBeUndefined()
    expect(hooks[0].selectorPattern).toBeUndefined()
  })
})
```

**Step 2: Run test to verify the "mixed" test fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts`
Expected: The "merges selector calls even when mixed with non-selector calls" test FAILS — current code only aggregates when ALL calls match the selector regex. When one call uses destructuring `const { isLoading } = useBookingStore()`, the current code falls through and treats all as independent.

**Step 3: Rewrite `aggregateSelectorHooks` to merge partial groups**

Replace the function in `packages/cli/src/analyzer/collect-facts.ts`:

```typescript
/**
 * Detects when the same store hook is called multiple times and aggregates
 * their destructured/selector fields into a single HookFact.
 *
 * Handles three patterns:
 *   1. Selector: `const field = useStore((s) => s.field)` → extracts 'field'
 *   2. Destructured: `const { a, b } = useStore()` → extracts ['a', 'b']
 *   3. Simple variable: `const store = useStore()` → no fields to merge
 *
 * When a group has 2+ calls AND at least one yields fields, they're merged.
 * Single calls or groups where no fields are extractable pass through unchanged.
 */
function aggregateSelectorHooks(hooks: HookFact[]): HookFact[] {
  // Group hooks by name+importPath
  const groups = new Map<string, HookFact[]>()
  for (const h of hooks) {
    const key = `${h.name}::${h.importPath}`
    const group = groups.get(key) ?? []
    group.push(h)
    groups.set(key, group)
  }

  const result: HookFact[] = []

  for (const [, group] of groups) {
    if (group.length < 2) {
      // Single call — pass through unchanged
      for (const h of group) result.push(h)
      continue
    }

    // Try to collect fields from all calls in the group
    const allFields: string[] = []
    let hasSelectorPattern = false

    for (const h of group) {
      // Try selector pattern first: (s) => s.field
      const selectorField = extractSelectorField(h)
      if (selectorField) {
        allFields.push(selectorField)
        hasSelectorPattern = true
        continue
      }

      // Try destructured fields: const { a, b } = useStore()
      if (h.destructuredFields && h.destructuredFields.length > 0) {
        allFields.push(...h.destructuredFields)
        continue
      }

      // Simple variable assignment: const store = useStore()
      // No fields to extract — skip but don't prevent merging
    }

    if (allFields.length > 0) {
      // Deduplicate fields while preserving order
      const uniqueFields = [...new Set(allFields)]
      result.push({
        name: group[0].name,
        importPath: group[0].importPath,
        arguments: group[0].arguments,
        returnVariable: `{ ${uniqueFields.join(', ')} }`,
        destructuredFields: uniqueFields,
        selectorPattern: hasSelectorPattern,
      })
    } else {
      // No fields extractable from any call — pass all through unchanged
      for (const h of group) result.push(h)
    }
  }

  return result
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `cd packages/cli && npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add packages/cli/src/analyzer/collect-facts.ts packages/cli/src/analyzer/__tests__/collect-facts.test.ts
git commit -m "feat: merge Zustand selector calls into single HookFact even with mixed patterns"
```

---

### Task 4: Build verification and integration test

**Files:**
- Test: (no new files — verify existing)

**Step 1: Build the CLI**

Run: `pnpm build`
Expected: Exit 0, no type errors

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS, 0 failures

**Step 3: Verify nullable field tracking against booking app types**

Create a temporary test to validate the booking store pattern resolves correctly:

```bash
cd packages/cli && npx vitest run src/analyzer/__tests__/extract-types.test.ts
cd packages/cli && npx vitest run src/spec/__tests__/state-distributor.test.ts
cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts
```

Expected: All three test files pass.

**Step 4: Commit (only if any fixes were needed)**

```bash
git add -A
git commit -m "fix: address integration issues from type extraction fixes"
```

---

## Summary of Changes

| File | Fix | Change |
|------|-----|--------|
| `packages/cli/src/analyzer/types.ts` | 1 | Add `nullableFields: string[]` to `TypeShapeInfo` |
| `packages/cli/src/analyzer/extract-types.ts` | 1 | Track nullable properties during `serializeType` |
| `packages/cli/src/spec/state-distributor.ts` | 1 | Use `nullableFields` in `inferFieldKind` to classify fields as `*-nullable` |
| `packages/cli/src/analyzer/collect-facts.ts` | 2 | Rewrite `aggregateSelectorHooks` to merge fields from mixed patterns |
| Test files | Both | New test cases for each change |

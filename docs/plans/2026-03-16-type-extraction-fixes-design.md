# Type Extraction Fixes for Auto-MockData Generation

**Date:** 2026-03-16
**Status:** Approved

## Problem

The type extraction pipeline works for simple hooks with explicit return types but breaks on two patterns common in real-world apps (verified against the booking app):

1. **Nullable fields always resolve to non-null** — `Doctor | null` always generates a populated Doctor object, even for loading/error states where it should be `null`.
2. **Zustand selector calls aren't aggregated** — `useStore((s) => s.doctor)` and `useStore((s) => s.setTimeSlot)` are treated as independent hooks instead of merged into one fact with both fields.

These breakdowns mean 19 of 20 booking app screens get incorrect or empty auto-generated mockData when specs don't include explicit `mockData`.

## Fix 1: Track Nullable Fields in TypeShapeInfo

### Current behavior

`serializeType` in `extract-types.ts` strips `null` from union types and always uses the non-null branch:

```typescript
if (type.isUnion()) {
  const nonNullTypes = type.getUnionTypes().filter(
    (t) => !t.isNull() && !t.isUndefined(),
  )
  // picks first non-null type
}
```

This means for a store like:
```typescript
interface BookingStore {
  doctor: Doctor | null
  timeSlot: TimeSlot | null
}
```

The generated shape always contains populated objects:
```json
{ "doctor": { "id": "1", "name": "Sample Name" }, "timeSlot": { "start": "..." } }
```

### Proposed change

Add `nullableFields: string[]` to `TypeShapeInfo`. When `serializeType` encounters a property whose type is a union with `null`/`undefined`, record the field name.

Then in `state-distributor.ts` `getFieldValueForState()`, when the state is `loading`, `error`, or `empty` AND the field is in `nullableFields`, return `null` instead of the populated shape.

### Files to modify

| File | Change |
|------|--------|
| `packages/cli/src/analyzer/types.ts` | Add `nullableFields?: string[]` to `TypeShapeInfo` |
| `packages/cli/src/analyzer/extract-types.ts` | Track nullable fields during `serializeType` |
| `packages/cli/src/spec/state-distributor.ts` | Use `nullableFields` in `getFieldValueForState` |

### Expected result

```
loading state:   { doctor: null, timeSlot: null }
populated state: { doctor: { id: "1", name: "Dr. Smith" }, timeSlot: { ... } }
error state:     { doctor: null, timeSlot: null }
```

## Fix 2: Aggregate Zustand Selector Calls

### Current behavior

`collect-facts.ts` discovers each `useBookingStore((s) => s.field)` call as a separate `HookFact`. The aggregation logic (line 150-159) tries to merge them but uses an "all or nothing" approach — if any call in the group doesn't match the selector regex, the entire group is treated as independent calls.

For the booking app pattern:
```typescript
const doctor = useBookingStore((s) => s.doctor)
const setTimeSlot = useBookingStore((s) => s.setTimeSlot)
```

These produce two separate `HookFact` entries for `useBookingStore`, each with a single `destructuredFields` entry.

### Proposed change

In the hook facts post-processing, when multiple facts share the same `name` and `importPath`, merge their `destructuredFields` arrays. This turns two facts `[{name: 'useBookingStore', fields: ['doctor']}, {name: 'useBookingStore', fields: ['setTimeSlot']}]` into one fact `{name: 'useBookingStore', fields: ['doctor', 'setTimeSlot']}`.

This aggregation should happen AFTER individual hook extraction, as a simple deduplication pass.

### Files to modify

| File | Change |
|------|--------|
| `packages/cli/src/analyzer/collect-facts.ts` | Add post-extraction aggregation for same-name hooks |

### Expected result

One merged `HookFact` for `useBookingStore` with `destructuredFields: ['doctor', 'setTimeSlot', ...]` regardless of whether they use selectors, destructuring, or mixed patterns.

## Out of Scope

- **API response envelope unwrapping** — Deferred to fetch interceptor coverage improvement. The fetch interceptor already handles the `{ success, data }` envelope; the gap is endpoint coverage, not type extraction.
- **Route param injection** — Separate concern (wrapper.tsx / MemoryRouter configuration).
- **Adding mockData to spec files** — These fixes make the auto-generation good enough that explicit mockData is only needed for non-trivial values.

## Success Criteria

1. Running the pipeline against the booking app's `scr-time-slot` screen produces correct mockData for loading/populated/error states with nullable fields properly set to `null` in non-populated states.
2. Store hooks discovered via multiple selector calls are merged into a single dependency with all fields.
3. All existing tests continue to pass.

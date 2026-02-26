# Mock Data Conventions & DataTable Block

**Date:** 2026-02-26
**Status:** Approved

## Problem

Mock data in list screens is too small (3 items) to realistically preview scrolling, selection patterns, or pagination. There's no table/pagination component. Dev tools have no convention for default visible item counts.

## Decisions

| Decision | Choice |
|----------|--------|
| Approach | Add `defaultCount` to `RegionDefinition` |
| List mock items | 10 items minimum, `defaultCount: 3` |
| Table mock items | 100 items (10 pages × 10 rows), `defaultCount: 10` |
| Table block layer | L3 (`src/blocks/data-table/`) — first L3 block |
| Dev tool controls | Inspector slider only (existing +/- UI) |
| Page size | 10 rows per page |

## Design

### 1. RegionDefinition Change

Add `defaultCount?: number` to `RegionDefinition` in `src/screens/types.ts`:

```ts
export interface RegionDefinition {
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  defaultCount?: number  // initial item count in inspector (falls back to mockItems.length)
}
```

**Inspector behavior:** `const currentCount = listCount ?? region.defaultCount ?? maxItems`

**ScreenRenderer behavior:** When `regionListCounts[key]` is unset, slice `mockItems` to `defaultCount` instead of showing all items.

### 2. Mock Data Conventions

**Lists (card-based):**
- `mockItems` ≥ 10 items with realistic, varied data
- `defaultCount: 3`
- Inspector slider range: 0 to `mockItems.length`

**Tables (paginated):**
- `mockItems` ≥ 100 items (use `Array.from({ length: 100 }, ...)` patterns)
- `defaultCount: 10` (1 page)
- Inspector slider range: 0 to `mockItems.length`

**Both:**
- Every region with `isList: true` must set `defaultCount`
- Inspector +/- is the only mechanism for count adjustment

### 3. DataTable L3 Block

**Location:** `src/blocks/data-table/`

**API:**
```tsx
type Column<T> = {
  key: keyof T & string
  header: string
  render?: (value: T[keyof T], row: T) => React.ReactNode
  className?: string
}

type DataTableProps<T> = {
  columns: Column<T>[]
  data: T[]
  pageSize?: number       // default 10
  emptyMessage?: string
  loading?: boolean
}
```

**Behavior:**
- Receives full data array, paginates internally via `useState`
- `<table>` with `<thead>/<tbody>`, brand token styling
- Pagination: `< 1 2 3 ... 8 9 10 >` with ellipsis
- Loading: skeleton rows; Empty: centered message
- All text via props (screen passes translated strings)

**Sub-components:**
- `src/blocks/data-table/index.tsx` — DataTable
- `src/blocks/data-table/pagination.tsx` — Pagination controls

### 4. Existing Screen Updates

| Screen | Current | After |
|--------|:---:|:---:|
| `prescription/list` | 3 prescriptions | 10 items, `defaultCount: 3` |
| `prescription/delivery` | 3 apotheken | 10 items, `defaultCount: 3` |
| `prescription/confirmation` | mirrors delivery | 10 items, `defaultCount: 3` |

Only `scenarios.ts` changes — `index.tsx` already maps dynamically.

### 5. CLAUDE.md Updates

Add to Rules section:
- List regions: ≥ 10 `mockItems`, `defaultCount: 3`
- Table regions: ≥ 100 `mockItems`, `defaultCount: 10`
- Every `isList: true` region must set `defaultCount`

Add to Architecture table:
- Update L3 Blocks status from "Planned" to "Active"

# Mock Data Conventions & DataTable Block — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce minimum mock data sizes for lists (10 items) and tables (100 rows), add `defaultCount` to control initial display count, and build a reusable DataTable L3 block with pagination.

**Architecture:** Extend `RegionDefinition` with `defaultCount`, update ScreenRenderer and InspectorPanel to respect it, create first L3 block at `src/blocks/data-table/`, expand existing screen mock data, and codify conventions in CLAUDE.md.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS v4 (brand tokens only), Zustand (dev tools store)

---

### Task 1: Add `defaultCount` to `RegionDefinition`

**Files:**
- Modify: `src/screens/types.ts:17-23`

**Step 1: Add the field**

In `src/screens/types.ts`, add `defaultCount` to `RegionDefinition`:

```ts
export interface RegionDefinition {
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  defaultCount?: number
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (new optional field is additive, no breakage)

**Step 3: Commit**

```bash
git add src/screens/types.ts
git commit -m "feat(types): add defaultCount to RegionDefinition for initial list item count"
```

---

### Task 2: Update ScreenRenderer to use `defaultCount`

**Files:**
- Modify: `src/screens/ScreenRenderer.tsx:20-43`

**Step 1: Update `assembleRegionData`**

The current condition at line 32 only slices when `regionListCounts[key] != null` (i.e., user has interacted with the slider). Change it to also apply `defaultCount` when no user override exists.

Replace the function body (lines 20-43) with:

```ts
function assembleRegionData(
  regions: RegionsMap,
  regionStates: Record<string, string>,
  regionListCounts: Record<string, number>
): Record<string, unknown> {
  let data: Record<string, unknown> = {}

  for (const [key, region] of Object.entries(regions)) {
    const activeState = regionStates[key] ?? region.defaultState
    const stateData = region.states[activeState] ?? region.states[region.defaultState] ?? {}
    data = { ...data, ...stateData }

    if (region.isList && region.mockItems) {
      const listField = Object.keys(stateData).find(
        (k) => Array.isArray(stateData[k])
      )
      if (listField) {
        const count = regionListCounts[key] ?? region.defaultCount ?? region.mockItems.length
        data = { ...data, [listField]: region.mockItems.slice(0, count) }
      }
    }
  }

  return data
}
```

Key change: `regionListCounts[key] != null` guard removed. Now always slices — using user override → `defaultCount` → `mockItems.length` fallback chain.

**Step 2: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/screens/ScreenRenderer.tsx
git commit -m "feat(renderer): respect defaultCount when slicing region list data"
```

---

### Task 3: Update InspectorPanel to use `defaultCount`

**Files:**
- Modify: `src/devtools/InspectorPanel.tsx:142-155` (RegionGroup props) and `src/devtools/InspectorPanel.tsx:279-304` (RegionGroup component)

**Step 1: Pass `defaultCount` to `RegionGroup`**

In the `RegionGroup` render call (around line 143), add the `defaultCount` prop:

```tsx
<RegionGroup
  key={key}
  regionKey={key}
  label={region.label}
  states={region.states}
  defaultState={region.defaultState}
  isList={region.isList}
  mockItems={region.mockItems}
  defaultCount={region.defaultCount}
  activeState={regionStates[key] ?? region.defaultState}
  listCount={regionListCounts[key]}
  onStateChange={(state) => setRegionState(key, state)}
  onListCountChange={(count) => setRegionListCount(key, count)}
/>
```

**Step 2: Update `RegionGroup` to accept and use `defaultCount`**

Update the `RegionGroup` component props type and the `currentCount` calculation. The current line is:

```ts
const currentCount = listCount ?? maxItems
```

Change the props type to include `defaultCount?: number` and update the calculation:

```ts
const currentCount = listCount ?? defaultCount ?? maxItems
```

Full updated props type:

```ts
function RegionGroup({
  regionKey,
  label,
  states,
  defaultState,
  isList,
  mockItems,
  defaultCount,
  activeState,
  listCount,
  onStateChange,
  onListCountChange,
}: {
  regionKey: string
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  defaultCount?: number
  activeState: string
  listCount?: number
  onStateChange: (state: string) => void
  onListCountChange: (count: number) => void
}) {
  const stateKeys = Object.keys(states)
  const maxItems = mockItems?.length ?? 0
  const currentCount = listCount ?? defaultCount ?? maxItems

  // Suppress unused variable warnings for props used only for keying
  void regionKey
  void defaultState
  // ... rest unchanged
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/devtools/InspectorPanel.tsx
git commit -m "feat(inspector): use defaultCount as initial value for list item slider"
```

---

### Task 4: Expand prescription/list mock data to 10 items

**Files:**
- Modify: `src/screens/prescription/list/scenarios.ts`

**Step 1: Expand `MOCK_PRESCRIPTIONS` to 10 items and add `defaultCount: 3`**

Replace the current `MOCK_PRESCRIPTIONS` array and add `defaultCount` to the region:

```ts
const MOCK_PRESCRIPTIONS: Prescription[] = [
  { id: 'rx-001', medication: 'Ibuprofen 400mg', dosage: '1 tablet, 3× daily', doctor: 'Dr. Schmidt', date: '20 Feb 2026', status: 'ready' },
  { id: 'rx-002', medication: 'Amoxicillin 500mg', dosage: '1 capsule, 2× daily', doctor: 'Dr. Weber', date: '18 Feb 2026', status: 'ready' },
  { id: 'rx-003', medication: 'Metformin 850mg', dosage: '1 tablet, 2× daily', doctor: 'Dr. Fischer', date: '25 Feb 2026', status: 'pending' },
  { id: 'rx-004', medication: 'Omeprazol 20mg', dosage: '1 capsule, 1× daily', doctor: 'Dr. Müller', date: '15 Feb 2026', status: 'ready' },
  { id: 'rx-005', medication: 'Bisoprolol 5mg', dosage: '1 tablet, 1× morning', doctor: 'Dr. Hoffmann', date: '12 Feb 2026', status: 'ready' },
  { id: 'rx-006', medication: 'Pantoprazol 40mg', dosage: '1 tablet, 1× daily', doctor: 'Dr. Becker', date: '10 Feb 2026', status: 'expired' },
  { id: 'rx-007', medication: 'Ramipril 5mg', dosage: '1 tablet, 1× morning', doctor: 'Dr. Wagner', date: '8 Feb 2026', status: 'ready' },
  { id: 'rx-008', medication: 'Simvastatin 20mg', dosage: '1 tablet, 1× evening', doctor: 'Dr. Braun', date: '5 Feb 2026', status: 'pending' },
  { id: 'rx-009', medication: 'Levothyroxin 75µg', dosage: '1 tablet, 1× morning', doctor: 'Dr. Zimmermann', date: '3 Feb 2026', status: 'ready' },
  { id: 'rx-010', medication: 'Diclofenac 75mg', dosage: '1 tablet, 2× daily', doctor: 'Dr. Hartmann', date: '1 Feb 2026', status: 'expired' },
]
```

Add `defaultCount: 3` to the region definition, after `mockItems: MOCK_PRESCRIPTIONS`:

```ts
export const regions = {
  prescriptions: {
    label: 'Prescriptions',
    isList: true,
    mockItems: MOCK_PRESCRIPTIONS,
    defaultCount: 3,
    states: {
      // ... states unchanged
    },
    defaultState: 'populated',
  },
}
```

Also update the `populated` state's `selectedIds` to only reference the first 2 (which are still `rx-001`, `rx-002` — no change needed there).

**Step 2: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/screens/prescription/list/scenarios.ts
git commit -m "feat(prescription-list): expand mock data to 10 items with defaultCount 3"
```

---

### Task 5: Expand prescription/delivery mock data to 10 items

**Files:**
- Modify: `src/screens/prescription/delivery/scenarios.ts`

**Step 1: Expand `MOCK_APOTHEKEN` to 10 items and add `defaultCount: 3`**

Replace the current `MOCK_APOTHEKEN` array:

```ts
const MOCK_APOTHEKEN: Apotheke[] = [
  { id: 'apo-001', name: 'APO Apotheke Marienplatz', address: 'Marienplatz 1, 80331 München', distance: '0.3 km', openUntil: '20:00', availability: 'available' },
  { id: 'apo-002', name: 'APO Apotheke Sendlinger Tor', address: 'Sendlinger Str. 5, 80331 München', distance: '0.8 km', openUntil: '18:30', availability: 'available' },
  { id: 'apo-003', name: 'APO Apotheke Stachus', address: 'Karlsplatz 3, 80335 München', distance: '1.2 km', openUntil: '19:00', availability: 'limited' },
  { id: 'apo-004', name: 'Rosen Apotheke', address: 'Rosenstraße 8, 80331 München', distance: '1.5 km', openUntil: '18:00', availability: 'available' },
  { id: 'apo-005', name: 'Viktualienmarkt Apotheke', address: 'Viktualienmarkt 2, 80331 München', distance: '1.8 km', openUntil: '19:30', availability: 'available' },
  { id: 'apo-006', name: 'Isartor Apotheke', address: 'Isartorplatz 6, 80331 München', distance: '2.1 km', openUntil: '17:30', availability: 'limited' },
  { id: 'apo-007', name: 'Maximilians Apotheke', address: 'Maximilianstr. 15, 80539 München', distance: '2.4 km', openUntil: '20:00', availability: 'available' },
  { id: 'apo-008', name: 'Gärtnerplatz Apotheke', address: 'Gärtnerplatz 1, 80469 München', distance: '2.7 km', openUntil: '18:00', availability: 'available' },
  { id: 'apo-009', name: 'Fraunhofer Apotheke', address: 'Fraunhoferstr. 22, 80469 München', distance: '3.0 km', openUntil: '19:00', availability: 'limited' },
  { id: 'apo-010', name: 'Schwabing Apotheke', address: 'Leopoldstr. 44, 80802 München', distance: '3.5 km', openUntil: '20:00', availability: 'available' },
]
```

Add `defaultCount: 3` to the region definition, after `mockItems: MOCK_APOTHEKEN`:

```ts
export const regions = {
  delivery: {
    label: 'Delivery',
    isList: true,
    mockItems: MOCK_APOTHEKEN,
    defaultCount: 3,
    states: {
      // ... states unchanged
    },
    defaultState: 'none-selected',
  },
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/screens/prescription/delivery/scenarios.ts
git commit -m "feat(prescription-delivery): expand mock data to 10 items with defaultCount 3"
```

---

### Task 6: Expand prescription/confirmation mock data to 10 items

**Files:**
- Modify: `src/screens/prescription/confirmation/scenarios.ts`

**Step 1: Expand `MOCK_PRESCRIPTIONS` to 10 items and add `defaultCount: 3`**

Replace the current `MOCK_PRESCRIPTIONS` array:

```ts
const MOCK_PRESCRIPTIONS: ConfirmationPrescription[] = [
  { medication: 'Ibuprofen 400mg', dosage: '1 tablet, 3× daily' },
  { medication: 'Amoxicillin 500mg', dosage: '1 capsule, 2× daily' },
  { medication: 'Metformin 850mg', dosage: '1 tablet, 2× daily' },
  { medication: 'Omeprazol 20mg', dosage: '1 capsule, 1× daily' },
  { medication: 'Bisoprolol 5mg', dosage: '1 tablet, 1× morning' },
  { medication: 'Pantoprazol 40mg', dosage: '1 tablet, 1× daily' },
  { medication: 'Ramipril 5mg', dosage: '1 tablet, 1× morning' },
  { medication: 'Simvastatin 20mg', dosage: '1 tablet, 1× evening' },
  { medication: 'Levothyroxin 75µg', dosage: '1 tablet, 1× morning' },
  { medication: 'Diclofenac 75mg', dosage: '1 tablet, 2× daily' },
]
```

Add `defaultCount: 3` to the region definition, after `mockItems: MOCK_PRESCRIPTIONS`:

```ts
export const regions = {
  confirmation: {
    label: 'Confirmation',
    isList: true,
    mockItems: MOCK_PRESCRIPTIONS,
    defaultCount: 3,
    states: {
      // ... states unchanged
    },
    defaultState: 'review-pickup',
  },
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/screens/prescription/confirmation/scenarios.ts
git commit -m "feat(prescription-confirmation): expand mock data to 10 items with defaultCount 3"
```

---

### Task 7: Create DataTable L3 block — Pagination sub-component

**Files:**
- Create: `src/blocks/data-table/pagination.tsx`

**Step 1: Create `src/blocks/` directory structure**

```bash
mkdir -p src/blocks/data-table
```

**Step 2: Write the Pagination component**

Create `src/blocks/data-table/pagination.tsx`:

```tsx
import { cn } from '@/lib/utils'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  pageLabel?: string
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageLabel = 'Page',
}: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = getPageNumbers(currentPage, totalPages)

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <span className="text-xs text-slate-500">
        {pageLabel} {currentPage} / {totalPages}
      </span>

      <div className="flex items-center gap-1">
        {/* Previous */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="flex size-8 items-center justify-center rounded-md text-sm text-charcoal-400 hover:bg-cream-200 disabled:opacity-40"
          aria-label="Previous page"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>

        {/* Page numbers */}
        {pages.map((page, i) =>
          page === '...' ? (
            <span key={`ellipsis-${i}`} className="flex size-8 items-center justify-center text-xs text-slate-400">
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page as number)}
              className={cn(
                'flex size-8 items-center justify-center rounded-md text-xs font-medium transition-colors',
                page === currentPage
                  ? 'bg-teal-500 text-white'
                  : 'text-charcoal-400 hover:bg-cream-200'
              )}
            >
              {page}
            </button>
          )
        )}

        {/* Next */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="flex size-8 items-center justify-center rounded-md text-sm text-charcoal-400 hover:bg-cream-200 disabled:opacity-40"
          aria-label="Next page"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    </div>
  )
}

/**
 * Generate page numbers with ellipsis for large page counts.
 * Always shows first, last, and 1 page on each side of current.
 * Example: [1, '...', 4, 5, 6, '...', 10]
 */
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = [1]

  if (current > 3) {
    pages.push('...')
  }

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (current < total - 2) {
    pages.push('...')
  }

  pages.push(total)

  return pages
}
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/blocks/data-table/pagination.tsx
git commit -m "feat(blocks): add Pagination sub-component for DataTable"
```

---

### Task 8: Create DataTable L3 block — Main component

**Files:**
- Create: `src/blocks/data-table/index.tsx`

**Step 1: Write the DataTable component**

Create `src/blocks/data-table/index.tsx`:

```tsx
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Pagination } from './pagination'

export interface Column<T> {
  key: keyof T & string
  header: string
  render?: (value: T[keyof T], row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  pageSize?: number
  emptyMessage?: string
  loading?: boolean
  pageLabel?: string
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  pageSize = 10,
  emptyMessage = 'No data',
  loading = false,
  pageLabel,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))

  // Clamp page if data shrinks (e.g., inspector slider changes)
  const safePage = Math.min(currentPage, totalPages)
  if (safePage !== currentPage) {
    setCurrentPage(safePage)
  }

  const startIdx = (safePage - 1) * pageSize
  const pageData = data.slice(startIdx, startIdx + pageSize)

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-cream-400">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cream-400 bg-cream-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-2.5 text-left text-xs font-semibold text-charcoal-400',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: pageSize }, (_, i) => (
              <tr key={i} className="border-b border-cream-300 last:border-b-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-cream-300" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-cream-400 py-12">
        <span className="text-sm text-slate-500">{emptyMessage}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-cream-400">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cream-400 bg-cream-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-2.5 text-left text-xs font-semibold text-charcoal-400',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-cream-50">
            {pageData.map((row, rowIdx) => (
              <tr
                key={startIdx + rowIdx}
                className="border-b border-cream-300 last:border-b-0 hover:bg-cream-100"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-sm text-charcoal-500',
                      col.className
                    )}
                  >
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        pageLabel={pageLabel}
      />
    </div>
  )
}

export type { Column as DataTableColumn }
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/blocks/data-table/index.tsx
git commit -m "feat(blocks): add DataTable L3 block with pagination"
```

---

### Task 9: Update CLAUDE.md with mock data conventions and L3 status

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update L3 Blocks status from "Planned" to "Active"**

In the Layers & File Boundaries table (line 19), change:

```
| L3 Blocks | `src/blocks/` | Read-only | Planned | ...
```

to:

```
| L3 Blocks | `src/blocks/` | Read-only | Active | ...
```

**Step 2: Add mock data rules to Rules section**

After the existing bullet about `data-flow-target` attributes (line 52), add:

```markdown
- List regions must have ≥ 10 `mockItems` and set `defaultCount: 3` — inspector loads showing 3, user can slide up to full set
- Table regions must have ≥ 100 `mockItems` (10 pages × 10 rows) and set `defaultCount: 10`
- Every region with `isList: true` must set `defaultCount`
```

**Step 3: Add L3 blocks path to Scaffolding table**

After the `src/screens/_test-helpers/` row (line 33), add:

```
| `src/blocks/` | L3 composed blocks (DataTable, etc.) — do not modify |
```

**Step 4: Verify the file reads cleanly**

Read the full CLAUDE.md and verify formatting, bullet counts, and table alignment.

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add mock data conventions and update L3 blocks status to active"
```

---

### Task 10: Run E2E smoke tests to verify nothing broke

**Files:**
- None (verification only)

**Step 1: Run TypeScript check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS — zero errors

**Step 2: Run E2E smoke tests**

Run: `pnpm test:e2e`
Expected: All existing screen tests PASS. The `defaultCount: 3` means screens now load with 3 items instead of all items — tests should still pass since they assert "frame not empty", not specific item counts.

**Step 3: Manually verify in dev server**

Run: `pnpm dev`

Check:
1. Navigate to `prescription/list` — should show 3 prescription cards (not 10)
2. Open inspector → Regions → Prescriptions → slider shows "3 items"
3. Slide to 10 — all 10 cards appear
4. Slide to 0 — empty list behavior
5. Navigate to `prescription/delivery` → Apotheke list state → 3 apotheken shown
6. Navigate to `prescription/confirmation` → 3 prescriptions in summary

**Step 4: Final commit if any fixes needed**

Only commit if tests required adjustments. Otherwise, no action.

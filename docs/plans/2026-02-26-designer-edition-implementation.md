# Designer Edition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve preview-tool into a Figma replacement for designers by improving the spec pipeline, adding play mode, and laying the L3 block foundation.

**Architecture:** Two parallel tracks. Track A improves the spec-to-screen pipeline (design decision log, Claude-suggested specs in screen-spec skill, self-correction in CLAUDE.md verification section, play mode UI). Track C establishes the L3 block framework with one reference block (DataList) alongside the existing DataTable. All changes respect the existing `tokens → ui → blocks → screens` dependency flow.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, Zustand, react-i18next, Playwright

---

### Task 1: Create Design Decision Log

The design decision log captures visual conventions that persist across Claude sessions. It's a plain markdown file referenced from CLAUDE.md.

**Files:**
- Create: `docs/design-decisions.md`
- Modify: `CLAUDE.md` (add reference to design decisions doc)

**Step 1: Create the design decisions file**

Create `docs/design-decisions.md` with starter structure and initial decisions extracted from codebase conventions:

```markdown
# Design Decisions

> Visual conventions for screen layouts. Claude reads this before building any screen.
> Append new decisions as the designer approves patterns.

## Layout Conventions

- All form screens use single-column layout with sticky footer containing the primary CTA
- Screen headers use `ScreenHeader` component with back navigation via `data-flow-target="ScreenHeader:Title"`
- Card-based content uses `p-4` padding, `gap-3` between cards

## Component Preferences

- Single selection: use `RadioCard` (not `RadioGroup`) — each card shows title + description
- Multi-select lists: use checkboxes embedded in list items, with a "Select all" toggle
- Status indicators: use `Badge` component with colors: `ready`=teal, `pending`=amber, `expired`=coral
- Stepper/progress: reserved for multi-step flows with 3+ screens

## Spacing Patterns

- Screen vertical padding: `py-4 px-4` (mobile)
- Section gap: `gap-6` between major sections
- Card padding: `p-4`
- List item padding: `py-3 px-4`
- Footer padding: `p-4` with `border-t border-cream-400`

## Typography

- Screen title: `text-lg font-semibold text-charcoal-500`
- Section heading: `text-sm font-medium text-charcoal-400`
- Body text: `text-sm text-charcoal-500`
- Muted/help text: `text-xs text-slate-500`
- Badge text: `text-xs font-medium`
```

**Step 2: Reference from CLAUDE.md**

Add the following line to CLAUDE.md under the `## Brand` section, after the design tokens reference:

```markdown
Visual conventions and component preferences are documented in [docs/design-decisions.md](docs/design-decisions.md). Read this before building any screen.
```

**Step 3: Commit**

```bash
git add docs/design-decisions.md CLAUDE.md
git commit -m "docs: add design decision log for cross-session consistency"
```

---

### Task 2: Enhance Screen-Spec Skill with Claude-Suggested Specs

Update the screen-spec skill so Claude proposes layout, components, state matrix, and flow map after reading the high-level spec — designer only reviews and approves.

**Files:**
- Modify: `.claude/skills/screen-spec/SKILL.md`

**Step 1: Add a new Phase 2.5 to the skill workflow**

After Phase 2 (Ask Clarifying Questions), insert a new phase called "Phase 2.5: Propose Spec Details". Update the workflow diagram at the top of the skill to include this phase:

```
User says route or screen name
  → Phase 0: Discover project context
  → Phase 1: Gather screen context
  → Phase 2: Ask clarifying questions (AskUserQuestion)
  → Phase 2.5: Propose spec details (Claude suggests, designer approves)
  → Phase 3: Draft spec with ASCII layout
  → Phase 4: Present for approval
  → Phase 5: Save spec file
```

**Step 2: Write the Phase 2.5 content**

Add after the Phase 2 section:

```markdown
## Phase 2.5: Propose Spec Details

After gathering context, Claude proposes the full spec details for designer approval. Read `docs/design-decisions.md` first to align with established conventions.

**Present a single structured proposal using AskUserQuestion for approval:**

1. **Layout hint** — Recommend one of: single-column, two-column, list, form-wizard, dashboard, detail-view. Reference the matching layout pattern (LP-N) from `references/layout-patterns.md`.

2. **Component preferences** — List the specific L2/L3 components to use:
   - Header: `ScreenHeader` with back nav? Title text?
   - Body: which blocks (DataList, DataTable, FormWizard, etc.) or L2 primitives?
   - Footer: sticky CTA? Multiple actions?
   - Reference `docs/design-decisions.md` for established choices.

3. **State matrix** — Propose the full scenario/region structure:
   - Flat scenarios or regions?
   - List each state with a one-line description of what's visible
   - For lists: propose mockItems count and defaultCount

4. **Flow map** — Propose all flow actions:
   - Which buttons navigate where?
   - Which elements change state?
   - Back navigation target?

**Format:** Present as a concise summary, then ask:
> "Here's what I'd suggest for this screen. Approve, or tell me what to change?"

Only proceed to Phase 3 after the designer approves or adjusts the proposal.
```

**Step 3: Commit**

```bash
git add .claude/skills/screen-spec/SKILL.md
git commit -m "feat(skill): add Claude-suggested spec phase to screen-spec workflow"
```

---

### Task 3: Add Self-Correction Instructions to CLAUDE.md

Document the self-correction loop so Claude automatically validates after generating screens.

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add self-correction section**

Add after the existing `## Verification` section in CLAUDE.md:

```markdown
## Self-Correction Loop

After generating or modifying screen files, automatically run the verification pipeline and fix issues before presenting the result to the designer:

1. `pnpm exec tsc --noEmit` — fix any TypeScript errors
2. `bash .claude/skills/screen-spec/references/verify-screen.sh {section}/{screen}` — fix i18n gaps, forbidden colors, missing flow triggers
3. `pnpm exec playwright test src/screens/{section}/{screen}/` — fix any runtime/rendering errors

Repeat until all three pass with zero errors. Only then tell the designer the screen is ready for review.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add self-correction loop to CLAUDE.md verification workflow"
```

---

### Task 4: Implement Play Mode — Flow-Only Navigation

Add play mode that hides catalog and inspector, showing only the device frame with clickable flow targets. This is the client-facing presentation mode.

**Files:**
- Modify: `src/App.tsx` (conditionally hide panels in play mode)
- Modify: `src/devtools/InspectorPanel.tsx` (add play mode toggle button)

**Step 1: Read the current App.tsx and InspectorPanel.tsx**

Read both files to understand current layout. (Already read above — `App.tsx:48-69` renders CatalogPanel + DeviceFrame + InspectorPanel in a flex row.)

**Step 2: Modify App.tsx to hide panels in play mode**

In `src/App.tsx`, add `playMode` to the store selectors (after line 17):

```typescript
const playMode = useDevToolsStore((s) => s.playMode)
```

Then wrap CatalogPanel and InspectorPanel in conditional rendering. Replace lines 48-69 with:

```tsx
return (
  <div className="flex h-svh bg-neutral-100">
    {!playMode && <CatalogPanel />}

    <div className="flex flex-1 flex-col overflow-hidden">
      <DeviceFrame
        device={device}
        osMode={osMode}
        responsiveWidth={responsiveWidth}
        responsiveHeight={responsiveHeight}
        onResponsiveResize={setResponsiveSize}
      >
        <ScreenRenderer
          route={selectedRoute}
          activeState={selectedState}
        />
      </DeviceFrame>
    </div>

    {!playMode && <InspectorPanel />}
  </div>
)
```

**Step 3: Add play mode toggle to InspectorPanel**

In `src/devtools/InspectorPanel.tsx`, add the play mode toggle. Import `Play` icon from lucide-react. Add `playMode` and `togglePlayMode` to the store selectors.

Add a button in the inspector header (between the "INSPECTOR" label and the collapse button):

```tsx
<button
  onClick={togglePlayMode}
  className="text-neutral-400 hover:text-neutral-600"
  title="Enter play mode"
>
  <Play className="size-4" />
</button>
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors

**Step 5: Commit**

```bash
git add src/App.tsx src/devtools/InspectorPanel.tsx
git commit -m "feat: hide catalog and inspector panels in play mode"
```

---

### Task 5: Implement Play Mode — State Reset Button

Add a floating "reset" button visible only in play mode that resets all screens to default state and exits play mode.

**Files:**
- Create: `src/devtools/PlayModeOverlay.tsx`
- Modify: `src/App.tsx` (render overlay in play mode)

**Step 1: Create PlayModeOverlay component**

Create `src/devtools/PlayModeOverlay.tsx`:

```tsx
import { RotateCcw, X } from 'lucide-react'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'

export function PlayModeOverlay() {
  const togglePlayMode = useDevToolsStore((s) => s.togglePlayMode)
  const resetRegions = useDevToolsStore((s) => s.resetRegions)
  const resetFlowHistory = useDevToolsStore((s) => s.resetFlowHistory)
  const setSelectedState = useDevToolsStore((s) => s.setSelectedState)

  const handleReset = () => {
    resetRegions()
    resetFlowHistory()
    setSelectedState(null)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex gap-2">
      <button
        onClick={handleReset}
        className="flex items-center gap-1.5 rounded-full bg-charcoal-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-charcoal-400"
        title="Reset all screens to default state"
      >
        <RotateCcw className="size-3.5" />
        Reset
      </button>
      <button
        onClick={togglePlayMode}
        className="flex items-center justify-center rounded-full bg-charcoal-500 p-1.5 text-white shadow-lg hover:bg-charcoal-400"
        title="Exit play mode"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
```

**Step 2: Render PlayModeOverlay in App.tsx**

Import `PlayModeOverlay` at the top of `src/App.tsx`:

```typescript
import { PlayModeOverlay } from '@/devtools/PlayModeOverlay'
```

Add inside the return, after the `{!playMode && <InspectorPanel />}` line:

```tsx
{playMode && <PlayModeOverlay />}
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors

**Step 4: Manually verify play mode works**

Run: `pnpm dev`
1. Open the app, select any screen
2. Click the play button in the inspector header → catalog and inspector should hide
3. Click flow targets → navigation should work
4. Click "Reset" → state should reset
5. Click "X" → exit play mode, panels return

**Step 5: Commit**

```bash
git add src/devtools/PlayModeOverlay.tsx src/App.tsx
git commit -m "feat: add play mode overlay with state reset and exit controls"
```

---

### Task 6: Run E2E Tests to Verify No Regressions

Verify that all existing tests still pass after the play mode changes.

**Files:** None (test-only)

**Step 1: Run full E2E test suite**

Run: `pnpm test:e2e`
Expected: All existing tests pass

**Step 2: Fix any failures**

If tests fail, investigate and fix. The play mode changes should not affect test behavior since tests don't activate play mode.

**Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve test regressions from play mode changes"
```

---

### Task 7: Establish L3 Block Framework with DataList

Create the DataList block — a scrollable list with built-in loading/empty/populated states, optional search, and filter support. This establishes the pattern for all future L3 blocks.

**Files:**
- Create: `src/blocks/data-list/index.tsx`

**Step 1: Study the existing DataTable block for conventions**

Read `src/blocks/data-table/index.tsx` (already read above). Key conventions to follow:
- TypeScript generics for data type
- Props interface with all config (no children)
- Internal state management (pagination → search/filter for DataList)
- Three render paths: loading skeleton, empty message, populated list
- Brand tokens only (cream, charcoal, teal, slate, coral)
- Imports from L2 only (`@/lib/utils`, no block imports)

**Step 2: Create the DataList component**

Create `src/blocks/data-list/index.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'

export interface DataListProps<T> {
  data: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  keyExtractor: (item: T) => string
  loading?: boolean
  loadingCount?: number
  emptyIcon?: React.ReactNode
  emptyMessage?: string
  emptyDescription?: string
  searchable?: boolean
  searchPlaceholder?: string
  searchFn?: (item: T, query: string) => boolean
  className?: string
}

export function DataList<T>({
  data,
  renderItem,
  keyExtractor,
  loading = false,
  loadingCount = 3,
  emptyIcon,
  emptyMessage = 'No items',
  emptyDescription,
  searchable = false,
  searchPlaceholder = 'Search...',
  searchFn,
  className,
}: DataListProps<T>) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredData = useMemo(() => {
    if (!searchable || !searchQuery.trim() || !searchFn) return data
    return data.filter((item) => searchFn(item, searchQuery))
  }, [data, searchQuery, searchable, searchFn])

  if (loading) {
    return (
      <div className={cn('flex flex-col', className)}>
        {searchable && (
          <div className="px-4 pb-3">
            <div className="h-9 w-full animate-pulse rounded-md bg-cream-300" />
          </div>
        )}
        <div className="flex flex-col divide-y divide-cream-300">
          {Array.from({ length: loadingCount }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-cream-300" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-4 w-3/4 animate-pulse rounded bg-cream-300" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-cream-300" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const isEmpty = filteredData.length === 0

  return (
    <div className={cn('flex flex-col', className)}>
      {searchable && (
        <div className="px-4 pb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border border-cream-400 bg-cream-50 px-3 text-sm text-charcoal-500 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12">
          {emptyIcon && <div className="mb-3 text-slate-400">{emptyIcon}</div>}
          <span className="text-sm font-medium text-slate-500">{emptyMessage}</span>
          {emptyDescription && (
            <span className="mt-1 text-xs text-slate-400">{emptyDescription}</span>
          )}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-cream-300">
          {filteredData.map((item, index) => (
            <div key={keyExtractor(item)}>
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/blocks/data-list/index.tsx
git commit -m "feat(blocks): add DataList block with loading/empty/search states"
```

---

### Task 8: Update CLAUDE.md with L3 Block Catalog

Document the available L3 blocks in CLAUDE.md so Claude knows what's available when building screens.

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add block catalog section**

Add after the existing Layers & File Boundaries table in CLAUDE.md, under a new subsection:

```markdown
### Available L3 Blocks

| Block | Path | Props API | Use When |
|-------|------|-----------|----------|
| DataTable | `src/blocks/data-table/` | `columns`, `data`, `pageSize`, `loading`, `emptyMessage` | Tabular data with pagination (≥10 rows) |
| DataList | `src/blocks/data-list/` | `data`, `renderItem`, `keyExtractor`, `loading`, `searchable`, `emptyMessage` | Scrollable item lists with optional search |

When a screen spec calls for a pattern not covered by existing blocks, build the block first in `src/blocks/{block-name}/index.tsx`, then use it in the screen. Follow existing block conventions:
- Generic TypeScript props (no domain types in block interface)
- Handle loading/empty/populated states internally
- Import only from L1 (tokens) and L2 (ui)
- No block-to-block imports
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add L3 block catalog to CLAUDE.md"
```

---

### Task 9: Final Verification

Run the full verification suite to confirm everything works together.

**Files:** None (verification only)

**Step 1: TypeScript compilation**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors

**Step 2: Full E2E test suite**

Run: `pnpm test:e2e`
Expected: All tests pass

**Step 3: Manual play mode verification**

Run: `pnpm dev`
1. Select a screen with flow actions (e.g., `/prescription/list`)
2. Enter play mode → panels hidden
3. Click flow target → navigates to next screen
4. Click Reset → state resets
5. Click X → exits play mode

**Step 4: Verify design decisions doc is referenced**

Run: `grep -q 'design-decisions' CLAUDE.md && echo "OK" || echo "MISSING"`
Expected: OK

**Step 5: Verify self-correction loop is documented**

Run: `grep -q 'Self-Correction' CLAUDE.md && echo "OK" || echo "MISSING"`
Expected: OK

---

## Task Summary

| Task | Track | What it does | Files touched |
|------|-------|-------------|---------------|
| 1 | A | Design decision log | `docs/design-decisions.md`, `CLAUDE.md` |
| 2 | A | Claude-suggested specs in screen-spec skill | `.claude/skills/screen-spec/SKILL.md` |
| 3 | A | Self-correction loop in CLAUDE.md | `CLAUDE.md` |
| 4 | A | Play mode — hide panels | `src/App.tsx`, `src/devtools/InspectorPanel.tsx` |
| 5 | A | Play mode — reset overlay | `src/devtools/PlayModeOverlay.tsx`, `src/App.tsx` |
| 6 | — | E2E regression check | none |
| 7 | C | DataList L3 block | `src/blocks/data-list/index.tsx` |
| 8 | C | Block catalog in CLAUDE.md | `CLAUDE.md` |
| 9 | — | Final verification | none |

**Estimated commits:** 8 (one per implementation task, none for verification-only tasks)

# Apply Design Tokens to Screens — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace every non-brand Tailwind color class in screen files with brand-token equivalents, and add `leading-tight` to headings.

**Architecture:** Direct class replacement in screen `index.tsx` files. Brand colors (`teal-*`, `charcoal-*`, `cream-*`, `slate-*`, `coral-*`) are already registered as Tailwind CSS variables in `src/index.css`. No infrastructure changes needed.

**Tech Stack:** React, Tailwind CSS v4, existing brand token CSS variables

**Design doc:** `docs/plans/2026-02-26-token-application-design.md`

---

## Replacement Reference

Use `replace_all: true` per class pattern within each file.

| Pattern | Replacement |
|---|---|
| `text-neutral-900` | `text-charcoal-500` |
| `text-neutral-700` | `text-charcoal-400` |
| `text-neutral-500` | `text-slate-500` |
| `text-neutral-400` | `text-slate-400` |
| `text-neutral-300` | `text-cream-500` |
| `text-red-400` | `text-coral-500` |
| `bg-neutral-100` | `bg-cream-200` |
| `bg-neutral-50` | `bg-cream-100` |
| `bg-neutral-300` | `bg-cream-500` |
| `bg-white` (inline, not Tailwind `bg-background`) | `bg-cream-50` |
| `bg-green-100` | `bg-teal-100` |
| `bg-black/40` | `bg-charcoal-900/40` |
| `border-neutral-100` | `border-cream-300` |
| `border-neutral-200` | `border-cream-400` |
| `border-neutral-300` | `border-cream-500` |
| `border-neutral-400` | `border-slate-300` |
| `hover:bg-neutral-50` | `hover:bg-cream-100` |

---

### Task 1: BookingType — replace text color

**Files:**
- Modify: `src/screens/BookingType/index.tsx:24`

**Step 1: Replace class**

Line 24 — replace `text-neutral-700` with `text-charcoal-400`:
```tsx
// Before
<p className="text-sm font-medium text-neutral-700">Select booking type</p>
// After
<p className="text-sm font-medium text-charcoal-400">Select booking type</p>
```

**Step 2: Verify visually**

Run: `pnpm dev`
Open BookingType screen. "Select booking type" label should render in brand charcoal-400 (#4E5D64) instead of Tailwind neutral-700.

**Step 3: Commit**

```bash
git add src/screens/BookingType/index.tsx
git commit -m "refactor(BookingType): replace neutral colors with brand tokens"
```

---

### Task 2: BookingDoctor — replace all non-brand colors

**Files:**
- Modify: `src/screens/BookingDoctor/index.tsx`

This screen has the most replacements. Apply each as `replace_all` within the file:

**Step 1: Replace text colors**

| Find (replace_all) | Replace with |
|---|---|
| `text-neutral-900` | `text-charcoal-500` |
| `text-neutral-500` | `text-slate-500` |
| `text-neutral-400` | `text-slate-400` |
| `text-neutral-300` | `text-cream-500` |
| `text-red-400` | `text-coral-500` |

Affected lines: 35, 40, 41, 43, 48, 49, 51, 57, 61, 63, 68, 69, 71, 74, 75, 79, 99, 104, 105, 107, 130, 134, 137, 140

**Step 2: Replace border colors**

| Find (replace_all) | Replace with |
|---|---|
| `border-neutral-100` | `border-cream-300` |
| `border-neutral-300` | `border-cream-500` |

Affected lines: 37, 59, 65, 60

**Step 3: Replace background and hover colors**

| Find (replace_all) | Replace with |
|---|---|
| `bg-black/40` | `bg-charcoal-900/40` |
| `bg-white` | `bg-cream-50` |
| `bg-neutral-300` | `bg-cream-500` |
| `hover:bg-neutral-50` | `hover:bg-cream-100` |

Affected lines: 124, 125, 126, 129, 133, 136, 139

**Step 4: Verify visually**

Run: `pnpm dev`
Check all 3 BookingDoctor views (browsing, selected, specialty-drawer):
- Doctor names in charcoal-500, specialties in slate-500
- Section labels (FAVORITED, ALL DOCTORS) in slate-400
- Filled hearts in coral-500, empty hearts in cream-500
- Drawer overlay uses charcoal-900/40, drawer background uses cream-50
- Drawer handle uses cream-500
- Hover on specialty items uses cream-100

**Step 5: Commit**

```bash
git add src/screens/BookingDoctor/index.tsx
git commit -m "refactor(BookingDoctor): replace neutral colors with brand tokens"
```

---

### Task 3: BookingPatient — replace text and border colors

**Files:**
- Modify: `src/screens/BookingPatient/index.tsx`

**Step 1: Replace text colors**

| Find (replace_all) | Replace with |
|---|---|
| `text-neutral-900` | `text-charcoal-500` |
| `text-neutral-700` | `text-charcoal-400` |
| `text-neutral-500` | `text-slate-500` |
| `text-neutral-400` | `text-slate-400` |

Affected lines: 27, 33, 39, 43, 45, 50, 61, 62, 71, 72, 85, 86

**Step 2: Replace border colors**

| Find (replace_all) | Replace with |
|---|---|
| `border-neutral-200` | `border-cream-400` |
| `border-neutral-300` | `border-cream-500` |
| `border-neutral-400` | `border-slate-300` |

Affected lines: 24, 30, 36, 42, 68

**Step 3: Verify visually**

Run: `pnpm dev`
Check BookingPatient for both "self" and "dependent" scenarios:
- Patient names in charcoal-500, insurance numbers in slate-500
- "Insurance card" label in charcoal-400
- Unselected avatar borders in cream-400
- Add button dashed border in cream-500
- "+" and "Add" text in slate-400
- Unselected radio border in slate-300

**Step 4: Commit**

```bash
git add src/screens/BookingPatient/index.tsx
git commit -m "refactor(BookingPatient): replace neutral colors with brand tokens"
```

---

### Task 4: BookingLocation — replace text, border, background, hover colors

**Files:**
- Modify: `src/screens/BookingLocation/index.tsx`

**Step 1: Replace text colors**

| Find (replace_all) | Replace with |
|---|---|
| `text-neutral-900` | `text-charcoal-500` |
| `text-neutral-500` | `text-slate-500` |
| `text-neutral-400` | `text-slate-400` |

Affected lines: 36, 39, 40, 43, 44, 67, 68, 83, 84

**Step 2: Replace border and background colors**

| Find (replace_all) | Replace with |
|---|---|
| `border-neutral-100` | `border-cream-300` |
| `hover:bg-neutral-50` | `hover:bg-cream-100` |

Affected lines: 38, 66

**Step 3: Verify visually**

Run: `pnpm dev`
Check all 3 BookingLocation views (initial, search-results, selected):
- Address text in charcoal-500
- "RECENT LOCATIONS" label in slate-400
- Pin icons in slate-400
- List dividers in cream-300
- Hover on search results uses cream-100
- Selected location subtitle in slate-500

**Step 4: Commit**

```bash
git add src/screens/BookingLocation/index.tsx
git commit -m "refactor(BookingLocation): replace neutral colors with brand tokens"
```

---

### Task 5: BookingTimeSlots — replace text and background colors

**Files:**
- Modify: `src/screens/BookingTimeSlots/index.tsx`

**Step 1: Replace colors**

| Find (replace_all) | Replace with |
|---|---|
| `text-neutral-500` | `text-slate-500` |
| `bg-neutral-100` | `bg-cream-200` |

Affected lines: 15, 29, 34, 39, 47, 49

**Step 2: Verify visually**

Run: `pnpm dev`
Check BookingTimeSlots screen:
- "Tap to toggle preferred times" in slate-500
- Day headers (Mon–Fri) in slate-500
- Time labels (08–12, etc.) in slate-500
- Unselected slot cells in cream-200
- Legend "Available" swatch in cream-200

**Step 3: Commit**

```bash
git add src/screens/BookingTimeSlots/index.tsx
git commit -m "refactor(BookingTimeSlots): replace neutral colors with brand tokens"
```

---

### Task 6: BookingConfirmation — replace text and background colors, add leading-tight

**Files:**
- Modify: `src/screens/BookingConfirmation/index.tsx`

**Step 1: Replace text colors**

| Find (replace_all) | Replace with |
|---|---|
| `text-neutral-900` | `text-charcoal-500` |
| `text-neutral-500` | `text-slate-500` |

Affected lines: 24, 25, 34, 35, 42, 43

**Step 2: Replace background color**

Line 31 — replace `bg-green-100` with `bg-teal-100`:
```tsx
// Before
<div className="mb-6 flex size-20 items-center justify-center rounded-full bg-green-100">
// After
<div className="mb-6 flex size-20 items-center justify-center rounded-full bg-teal-100">
```

**Step 3: Add leading-tight to headings**

Lines 24 and 34 — add `leading-tight` to h2 elements:
```tsx
// Before
<h2 className="mb-2 text-xl font-semibold text-charcoal-500">Finding Your Match...</h2>
// After
<h2 className="mb-2 text-xl font-semibold leading-tight text-charcoal-500">Finding Your Match...</h2>
```
```tsx
// Before
<h2 className="mb-2 text-xl font-semibold text-charcoal-500">Match Found!</h2>
// After
<h2 className="mb-2 text-xl font-semibold leading-tight text-charcoal-500">Match Found!</h2>
```

**Step 4: Verify visually**

Run: `pnpm dev`
Check both BookingConfirmation states (searching, found):
- Headings in charcoal-500 with tighter line-height
- Descriptions in slate-500
- "Match Found" success icon background in teal-100 (matching brand)
- Doctor name in charcoal-500, specialty in slate-500

**Step 5: Commit**

```bash
git add src/screens/BookingConfirmation/index.tsx
git commit -m "refactor(BookingConfirmation): replace neutral colors with brand tokens"
```

---

### Task 7: BookingAppointments — replace text colors

**Files:**
- Modify: `src/screens/BookingAppointments/index.tsx`

**Step 1: Replace text colors**

| Find (replace_all) | Replace with |
|---|---|
| `text-neutral-400` | `text-slate-400` |
| `text-neutral-500` | `text-slate-500` |

Affected lines: 24, 42, 95

**Step 2: Verify visually**

Run: `pnpm dev`
Check all 3 BookingAppointments views (loaded, empty, loading):
- Section labels (UPCOMING, PAST) in slate-400
- Loading text in slate-500

**Step 3: Commit**

```bash
git add src/screens/BookingAppointments/index.tsx
git commit -m "refactor(BookingAppointments): replace neutral colors with brand tokens"
```

---

### Task 8: LoginForm — replace text colors and add leading-tight

**Files:**
- Modify: `src/screens/LoginForm/index.tsx`

**Step 1: Replace text color**

Line 29 — replace `text-neutral-500` with `text-slate-500`:
```tsx
// Before
<p className="mt-2 text-sm text-neutral-500">Typing...</p>
// After
<p className="mt-2 text-sm text-slate-500">Typing...</p>
```

**Step 2: Add leading-tight to headings**

Lines 8 and 18 — add `leading-tight` to both h1 elements:
```tsx
// Before
<h1 className="mb-4 text-2xl font-bold">Login</h1>
// After
<h1 className="mb-4 text-2xl font-bold leading-tight">Login</h1>
```

**Step 3: Verify visually**

Run: `pnpm dev`
Check LoginForm in all states (idle, filling, error, success):
- "Login" heading has tighter line-height
- "Typing..." text in slate-500

**Step 4: Commit**

```bash
git add src/screens/LoginForm/index.tsx
git commit -m "refactor(LoginForm): replace neutral colors with brand tokens"
```

---

### Task 9: Final verification — grep for remaining non-brand classes

**Step 1: Search for leftover neutral classes**

```bash
grep -rn "neutral-" src/screens/
```

Expected: zero matches across all screen files.

**Step 2: Search for other non-brand colors**

```bash
grep -rn "text-red-\|bg-green-\|bg-black/" src/screens/
```

Expected: zero matches.

**Step 3: Run TypeScript check**

```bash
pnpm tsc --noEmit
```

Expected: no type errors (class replacements don't affect types).

**Step 4: Run dev server and spot-check all screens**

```bash
pnpm dev
```

Walk through every screen scenario in the browser to confirm no visual regressions.

**Step 5: Final commit if any cleanup needed**

If clean, no commit needed. If any fixes were required, commit them:
```bash
git commit -m "refactor: final cleanup for token application"
```

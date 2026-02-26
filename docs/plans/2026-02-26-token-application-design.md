# Design: Apply Design Tokens to Screens

## Goal

Replace all non-brand Tailwind color classes in screen files with brand-token equivalents from `src/tokens/`. Add heading line-heights where missing.

## Approach

Direct class replacement in screen files. No infrastructure changes. Brand colors are already registered in `src/index.css` as Tailwind CSS variables.

## Color Mapping

### Text Colors

| Current | Replacement | Role |
|---|---|---|
| `text-neutral-900` | `text-charcoal-500` | Primary text |
| `text-neutral-700` | `text-charcoal-400` | Strong secondary text |
| `text-neutral-500` | `text-slate-500` | Muted/secondary text |
| `text-neutral-400` | `text-slate-400` | Disabled/placeholder text |
| `text-red-400` | `text-coral-500` | Accent (favorite hearts) |
| `text-white` | `text-white` | Neutral — no change |

### Background Colors

| Current | Replacement | Role |
|---|---|---|
| `bg-neutral-100` | `bg-cream-200` | Subtle fill |
| `bg-neutral-50` | `bg-cream-100` | Hover backgrounds |
| `bg-white` | `bg-cream-50` | Surface/card inline backgrounds |
| `bg-green-100` | `bg-teal-100` | Success indicator |
| `bg-black/40` | `bg-charcoal-900/40` | Overlay backdrop |

### Border Colors

| Current | Replacement | Role |
|---|---|---|
| `border-neutral-100` | `border-cream-300` | Subtle dividers |
| `border-neutral-200` | `border-cream-400` | Default borders |
| `border-neutral-300` | `border-cream-500` | Dashed borders |
| `border-neutral-400` | `border-slate-300` | Unselected indicators |

### Hover States

| Current | Replacement |
|---|---|
| `hover:bg-neutral-50` | `hover:bg-cream-100` |

## Typography

- Font sizes and weights already match the token scale — no changes.
- Add `leading-tight` to heading elements (`h1`, `h2`) for token-aligned line-height (1.25).
- Font family (DM Sans) is a global concern — out of scope.

## Spacing

All screen spacing values fall on the Tailwind 4px grid, which matches the token scale. No changes needed.

## Affected Screens

| Screen | Scope |
|---|---|
| BookingType | 1 text color |
| BookingDoctor | Text, background, border, overlay, hover colors |
| BookingPatient | Text and border colors |
| BookingLocation | Text, border, background, hover colors |
| BookingTimeSlots | Text and background colors |
| BookingConfirmation | Text and background colors |
| BookingAppointments | Text colors |
| LoginForm | Text colors |

## Unaffected Screens

- HelloWorld — already uses semantic classes (`text-muted-foreground`, `bg-background`)
- Hello — no color-specific classes

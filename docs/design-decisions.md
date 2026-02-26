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

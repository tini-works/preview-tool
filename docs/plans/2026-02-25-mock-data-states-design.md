# Mock Data State Switcher — Design Document

**Date:** 2026-02-25
**Status:** Approved

## Goal

Enhance the Mock Data Convention so each screen defines a list of possible states (scenarios) with corresponding data, and provides a floating UI panel to switch between them instantly.

## Decisions

| Decision | Choice |
|---|---|
| Visibility | Dev-only (`import.meta.env.DEV`) |
| Placement | Floating bottom-right panel, collapsible |
| State definitions | Standard base (loading, empty, populated) + custom extras per screen |
| Transitions | Instant swap — loading is a dedicated selectable state |
| Mechanism | `useScenarios` hook + `<ScenarioSwitcher>` component |

## Architecture

### `useScenarios<T>` hook — `src/hooks/use-scenarios.ts`

- Generic over `T` — each screen defines its own data shape
- Accepts `scenarios: Record<string, Scenario<T>>` and optional `defaultKey`
- Returns `{ activeKey, setActiveKey, active, scenarios }`
- `Scenario<T>` = `{ label: string; data: T }`

### `<ScenarioSwitcher>` component — `src/components/dev/scenario-switcher.tsx`

- Conditionally rendered: only when `import.meta.env.DEV` is true
- Floating bottom-right: `fixed bottom-4 right-4 z-50`
- Collapsible: toggle button (beaker icon from lucide-react) expands to show state list
- State list: clickable items showing each scenario's `label`, active state highlighted
- Clicking instantly swaps via `setActiveKey` — no transition delay
- Uses shadcn/ui: `Button`, `Card`

### Required base scenarios

Every screen must define at least these three:

- `loading` — `{ isLoading: true, items: [] }`
- `empty` — `{ isLoading: false, items: [] }`
- `populated` — `{ isLoading: false, items: [...full data...] }`

Custom extras are encouraged (e.g., `single-item`, `error`, `many-items`).

## Files to create/modify

- **Create:** `src/hooks/use-scenarios.ts`
- **Create:** `src/components/dev/scenario-switcher.tsx`
- **Modify:** `docs/ui-patterns.md` — replace `## Mock Data Convention` section

## No changes needed

- `docs/ui-rules.md` — existing List & Table States rule still applies
- `CLAUDE.md` — already links to ui-patterns.md

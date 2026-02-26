# DevTools Inspector Features Design

## Goal

Add 5 new inspector features to the preview-tool's InspectorPanel, porting key devtool capabilities from docliq-proto and adapting them to the simpler preview-tool architecture.

## Features

1. **Language Switcher** — Switch locale (EN / DE) live
2. **Per-Screen Feature Flags** — Toggle flags defined per-screen in `scenarios.ts`
3. **List Item Count** — Global numeric counter controlling how many items screens render in lists
4. **Network Simulation** — Online / Slow 3G / Offline modes with visual feedback
5. **Font Scale** — Slider (0.75x–2.0x) controlling OS-level font scale

## Architecture: Approach A — Extend Zustand Store + InspectorPanel Sections

All features live as new state slices in `useDevToolsStore.ts` and new collapsible `<Section>` blocks in `InspectorPanel.tsx`. No new providers, no plugin system.

## Store Extensions

New fields in `useDevToolsStore.ts`:

```typescript
// State
networkMode: 'online' | 'slow-3g' | 'offline'  // default: 'online'
fontScale: number                                 // default: 1 (range: 0.75–2.0)
language: string                                  // default: 'en'
listItemCount: number                             // default: 5 (range: 0–99)
featureFlags: Record<string, boolean>             // default: {} (populated per-screen)

// Actions
setNetworkMode: (mode) => void
setFontScale: (scale) => void
setLanguage: (lang) => void
setListItemCount: (count) => void
setFeatureFlag: (key, value) => void
resetFeatureFlags: () => void
```

**Persistence:** `fontScale`, `language`, `networkMode` persist to localStorage. `listItemCount` and `featureFlags` are ephemeral.

## InspectorPanel Sections

Five new `<Section>` blocks below the existing "States" section:

### 1. Language

- Select dropdown: EN / DE
- Calls `i18n.changeLanguage()` on change
- Reads initial value from `i18n.language`

### 2. Feature Flags (per-screen)

- Each screen's `scenarios.ts` can optionally export a `flags` object:

```typescript
export const flags = {
  showRecentSearches: { label: 'Recent Searches', default: true },
  enableVoiceSearch: { label: 'Voice Search', default: false },
}
```

- Auto-discovered via `import.meta.glob('/src/screens/*/scenarios.ts', { eager: true })`
- Inspector renders toggle switches for each flag
- Section hidden when no flags defined for current screen
- Flag state stored in `featureFlags` map in store
- Reset to defaults when switching screens

### 3. List Item Count

- Numeric input field with +/- stepper buttons
- Range: 0–99, default: 5
- Screens read `listItemCount` from the store and slice their mock data arrays
- Passed to screens via the `data` prop (added by ScreenRenderer) or read directly from store

### 4. Network Simulation

- Three-button toggle group: Online / Slow 3G / Offline
- New component: `src/devtools/NetworkSimulationLayer.tsx`
  - Wraps screen content in `ScreenRenderer.tsx`
  - `online`: pass-through, no modification
  - `slow-3g`: artificial 2s delay before showing content + "Slow connection" banner at top
  - `offline`: replaces content with full-screen offline error state
- Banner uses brand tokens (teal for info, coral for error)

### 5. Font Scale

- Slider input: range 0.75–2.0, step 0.05
- Numeric readout showing current value (e.g., "1.15x")
- Applied via wrapper `<div>` around screen content:

```tsx
<div style={{ fontSize: `${fontScale * 100}%` }}>
  {children}
</div>
```

- Since Tailwind uses `rem`-based typography, changing the container's font-size percentage scales all text proportionally

## Per-Screen Flags Convention

Screens opt into feature flags by exporting a `flags` object from their `scenarios.ts`:

```typescript
// src/screens/BookingSearch/scenarios.ts
export type BookingSearchData = { ... }

export const scenarios = { ... }

export const flags = {
  showRecentSearches: { label: 'Recent Searches', default: true },
  enableVoiceSearch: { label: 'Voice Search', default: false },
}
```

The `useScreenModules` hook is extended to also glob `flags` exports alongside scenarios. The `ScreenEntry` type gains an optional `flags` field.

## Files Modified

| File | Change |
|------|--------|
| `src/devtools/useDevToolsStore.ts` | Add 5 new state fields + actions |
| `src/devtools/InspectorPanel.tsx` | Add 5 new `<Section>` blocks |
| `src/devtools/NetworkSimulationLayer.tsx` | **New file** — network simulation wrapper |
| `src/screens/ScreenRenderer.tsx` | Wrap content with NetworkSimulationLayer + font scale div |
| `src/screens/useScreenModules.ts` | Extend glob to include `flags` exports |
| `src/screens/types.ts` | Add `FlagDefinition` type, optional `flags` to `ScreenEntry` |

## Files NOT Modified

- `src/App.tsx` — no changes needed
- `src/components/` — no changes to L2/L3 components
- `src/tokens/` — no new tokens needed
- `src/index.css` — no CSS changes
- Individual screen files — not modified in this design (screens consume new features opt-in)

## Data Flow

```
useDevToolsStore (Zustand)
  ├── networkMode ──→ NetworkSimulationLayer (wraps screen content)
  ├── fontScale ────→ fontSize wrapper div (in ScreenRenderer)
  ├── language ─────→ i18n.changeLanguage() (global effect)
  ├── listItemCount → screens read from store (or receive via data)
  └── featureFlags ─→ screens read from store (or receive via data)

InspectorPanel reads/writes all values via useDevToolsStore selectors
```

## Open Questions (resolved)

- **Feature flags approach:** Per-screen (chosen) vs global vs both
- **List count approach:** Global counter (chosen) vs scenario-based vs both
- **Font scale range:** Slider 0.75–2.0 (chosen) vs 3 presets vs 5 presets
- **UI placement:** InspectorPanel sections (chosen) vs separate panel vs toolbar

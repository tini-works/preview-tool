# Preview Tool v2 — Design Document

**Date:** 2026-03-02
**Status:** Approved
**Branch:** feature/template-1

## Problem

The current implementation (v1) uses AST analysis + LLM generation to produce view/model/controller files per screen. This approach:

- Breaks on real-world codebases with varied project structures
- Depends on LLM access for meaningful output
- Generates complex per-screen artifacts (view.ts, model.ts, controller.ts)
- Is non-deterministic — different LLM runs produce different results

## Goal

Build a **zero-config, plug-and-play preview tool** that:

1. Works reliably on any React codebase
2. Requires no manual configuration
3. Provides a Figma-like interactive preview — looks and behaves like the real app without a backend
4. Is usable by anyone on the team (developers, designers, PMs, QA)
5. Runs as `pnpm add -D @preview-tool/cli && pnpm preview`

## Approach

**Hook-boundary mocking** — instead of analyzing component internals, mock the data hooks (useQuery, useAuth, etc.) at the import boundary using Vite aliases. The real component code runs unchanged, but data comes from controllable mock hooks.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  pnpm preview                    │
│                                                  │
│  ┌──────────┐   ┌──────────┐   ┌─────────────┐ │
│  │ Analyzer  │──▶│Generator │──▶│  Dev Server  │ │
│  │           │   │          │   │  (Vite)      │ │
│  │ • Discover│   │ • Mocks  │   │  • Aliases   │ │
│  │ • Score   │   │ • Registry│  │  • HMR       │ │
│  │ • Hooks   │   │ • Alias  │   │  • Watcher   │ │
│  └──────────┘   └──────────┘   └──────┬───────┘ │
│                                        │         │
│  CLI Package (@preview-tool/cli)       │         │
└────────────────────────────────────────┼─────────┘
                                         │
                                    localhost:6100
                                         │
┌────────────────────────────────────────┼─────────┐
│  Runtime Package (@preview-tool/runtime)         │
│                                                   │
│  ┌──────────┬────────────────┬──────────────────┐│
│  │ Catalog  │  Device Frame  │    Inspector     ││
│  │ Panel    │                │    Panel         ││
│  └──────────┴────────────────┴──────────────────┘│
│                                                   │
│  Zustand Store (region states, device, flags)     │
└───────────────────────────────────────────────────┘
```

Dependencies flow: CLI → Runtime (unidirectional).

## 1. Screen Discovery — Multi-Signal Scoring

### Step 1: Find the router (highest confidence)

Scan for:
- `react-router` imports (`createBrowserRouter`, `Routes`, `Route`)
- Next.js `app/` or `pages/` directory
- Expo Router file conventions
- Any file importing from `*router*`

Parse router config to extract `path → component` mappings. Every component referenced in a route is a confirmed screen.

### Step 2: Score remaining `.tsx` files

For files NOT found via routes:

| Signal | Points | Detection |
|---|---|---|
| Route reference (from Step 1) | +50 | Router parsing |
| In `screens/`, `pages/`, `views/`, `routes/` dir | +30 | Path check |
| Named `*Page.tsx`, `*Screen.tsx`, `*View.tsx` | +20 | Filename regex |
| Default export with 0-2 props | +15 | ts-morph AST |
| Uses routing hooks (`useParams`, `useNavigate`) | +15 | Import scan |
| Uses data-fetch hooks (`useQuery`, etc.) | +10 | Import scan |
| >50 lines, renders >3 child components | +10 | AST size |
| Is `index.tsx` in a named folder | +10 | Path check |

**Threshold: >= 30 points = screen.**

### Step 3: Output screen registry

```ts
export const screens = [
  { name: 'Dashboard', path: '/dashboard', file: 'src/screens/Dashboard.tsx', score: 85 },
  { name: 'Settings', path: '/settings', file: 'src/screens/Settings/index.tsx', score: 65 },
]
```

## 2. Hook Analysis & Mock Generation

### Step 1: Extract hooks from each screen

ts-morph scans the screen file for all hook calls:
```
Dashboard.tsx:
  ├── useAuth()         → from '@/hooks/useAuth'
  ├── useQuery('tasks') → from '@tanstack/react-query'
  └── useTranslation()  → from 'react-i18next'
```

### Step 2: Classify each hook

| Category | Hooks | Mock strategy |
|---|---|---|
| Data fetching | `useQuery`, `useSWR`, `useFetch`, `useAppLiveQuery` | Return `{ data, isLoading, error }` controlled by inspector |
| Auth | `useAuth`, `useSession`, `useUser` | Return `{ user, isAuthenticated }` togglable |
| Navigation | `useNavigate`, `useRouter`, `useParams` | Mock route params, capture navigation calls |
| i18n | `useTranslation`, `useIntl` | Passthrough `t(key) → key` |
| State | `useState`, `useReducer` | No mock — let real hook run |
| Custom | Project-defined hooks | Trace to source, analyze return type |

### Step 3: Trace custom hook return types

1. Follow import to the hook file
2. ts-morph reads the return statement or return type
3. Extract shape: `{ user: User | null, isAuthenticated: boolean }`
4. Generate mock data matching the types

### Step 4: Generate mock modules

```ts
// .preview/mocks/useAuth.mock.ts
import { usePreviewRegion } from '@preview-tool/runtime'

export function useAuth() {
  const { state } = usePreviewRegion('auth')
  if (state === 'unauthenticated') {
    return { user: null, isAuthenticated: false }
  }
  return {
    user: { id: '1', name: 'Jane Doe', email: 'jane@example.com' },
    isAuthenticated: true,
  }
}
```

### Step 5: Generate alias manifest

```json
{
  "@/hooks/useAuth": ".preview/mocks/useAuth.mock.ts",
  "@tanstack/react-query": ".preview/mocks/react-query.mock.ts"
}
```

Vite redirects imports at build time. Real app code unchanged.

### Step 6: Infer regions and states per screen

Each hook → one region in the inspector:

```ts
{
  regions: {
    auth: {
      source: 'useAuth()',
      states: ['authenticated', 'unauthenticated'],
      defaultState: 'authenticated'
    },
    tasks: {
      source: 'useQuery("tasks")',
      states: ['loading', 'error', 'empty', 'populated'],
      defaultState: 'populated',
      isList: true
    }
  }
}
```

## 3. Runtime UI — Three-Panel Preview

### Left Panel: Screen Catalog

- Lists all discovered screens with route paths
- Click to load screen in center panel
- Search/filter by name
- Grouped by route hierarchy

### Center Panel: Device Preview

- Renders the actual React component inside a device frame
- Device frames: iPhone 15 Pro, iPhone SE, Pixel 8, iPad Mini, Desktop, Responsive
- Components are interactive — buttons click, inputs type, scrolling works
- Button clicks trigger flow navigation between screens

### Right Panel: Inspector

- Shows all regions (one per hook) for the current screen
- Each region lists possible states as radio buttons
- Click a state → mock hook returns that state's data → component re-renders instantly
- List regions get a count slider
- Device controls: dark mode, font scale, device selector

### Interaction Model

Clicking a state radio button:
1. Updates Zustand store (`regionStates.auth = 'unauthenticated'`)
2. Mock hook reads new state via `usePreviewRegion('auth')`
3. Mock hook returns corresponding data
4. React re-renders the component instantly

No regeneration, no delay.

## 4. Flow Navigation

When a user clicks a button/link inside the previewed screen:

1. Mocked `useNavigate`/`useRouter` captures the target route
2. Preview matches target route to a discovered screen
3. Center panel transitions to that screen
4. Inspector updates to show new screen's regions

## 5. Watch Mode

`pnpm preview` runs continuously with file watching:

| Event | Action | Delay |
|---|---|---|
| Edit a screen | Vite HMR hot-reloads component | ~50ms |
| Add new `.tsx` file | Re-score → if screen, generate mock + add to registry | ~1s |
| Delete a screen | Remove from registry, update preview | ~200ms |
| Change a hook | Re-analyze return type, regenerate mock | ~500ms |

Cold start: ~3-6 seconds. Hot reload: instant.

## 6. Performance Targets

| Metric | Target |
|---|---|
| Cold start (analysis + server) | < 6 seconds |
| Screen switch | < 100ms |
| State toggle | < 50ms |
| File change (HMR) | < 100ms |
| New screen detection | < 2 seconds |

## 7. File Structure

### CLI Package

```
packages/cli/src/
├── commands/
│   ├── preview.ts           # Main: analyze → generate → dev server
│   ├── generate.ts          # Analysis + generation only
│   └── init.ts              # Initialize config (optional)
├── analyzer/
│   ├── discover-screens.ts  # Multi-signal screen scoring
│   ├── parse-router.ts      # Extract routes from router configs
│   ├── score-file.ts        # Score a single .tsx file
│   ├── extract-hooks.ts     # Find all hook calls in a screen
│   ├── classify-hook.ts     # Map hook → category
│   ├── trace-hook-type.ts   # Follow custom hook, extract return type
│   ├── infer-regions.ts     # Hook calls → regions with states
│   └── types.ts             # Screen, Region, HookInfo types
├── generator/
│   ├── generate-mocks.ts    # Generate mock hook modules
│   ├── generate-registry.ts # Generate screen registry
│   ├── generate-alias.ts    # Generate Vite alias manifest
│   ├── generate-entry.ts    # Generate preview app entry point
│   ├── mock-data.ts         # Type-aware mock data generation
│   └── templates/           # String templates for generated files
├── server/
│   ├── create-vite-config.ts
│   ├── watcher.ts           # File watcher for incremental updates
│   └── start-server.ts      # Start Vite + open browser
└── lib/
    ├── config.ts
    ├── project.ts           # Detect project root, framework
    └── format.ts
```

### Runtime Package

```
packages/runtime/src/
├── PreviewShell.tsx
├── ScreenRenderer.tsx
├── ScreenRegistry.ts
├── catalog/
│   └── CatalogPanel.tsx
├── inspector/
│   ├── InspectorPanel.tsx
│   ├── RegionControl.tsx
│   └── DeviceControls.tsx
├── preview/
│   ├── DeviceFrame.tsx
│   ├── IPhoneFrame.tsx
│   ├── PixelFrame.tsx
│   ├── IPadFrame.tsx
│   ├── DesktopFrame.tsx
│   └── ResponsiveFrame.tsx
├── flow/
│   ├── FlowProvider.tsx
│   └── FlowContext.ts
├── store/
│   └── usePreviewStore.ts
├── hooks/
│   └── usePreviewRegion.ts
└── ui/
```

## 8. What Changes from v1

| Component | Action |
|---|---|
| Runtime 3-panel layout | Keep |
| Device frames | Keep |
| Zustand store | Rework — simplify to region states + device |
| Inspector panel | Rework — driven by hook analysis, not model.ts |
| Catalog panel | Keep — minor updates for new registry |
| Flow engine | Rework — simpler navigation capture |
| CLI analyzer | Rework — multi-signal discovery + hook extraction |
| CLI generator | Rework — mocks + registry instead of view/model/controller |
| LLM integration | Remove — not needed (type-based heuristic mocks) |
| Vite server | Keep — update alias loading |
| File watcher | New — incremental re-analysis |

## 9. Non-Goals (YAGNI)

- Static site export (local dev server only for now)
- Framework support beyond React
- Visual regression testing
- Collaborative editing
- Cloud hosting

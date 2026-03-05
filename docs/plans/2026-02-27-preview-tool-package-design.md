# Preview Tool as an Installable Package

**Date:** 2026-02-27
**Status:** Approved

## Vision

Transform the preview-tool from an internal project into a standalone, installable developer package (like Storybook but for screens). Any React project installs it, runs a CLI, and gets a full preview environment with region-based state switching, flow simulation, and device frames — without modifying any screen source code.

## Core Concept

The tool follows the same region-based model as the current preview-tool:

```
Screen → Regions → States per region → Mock data per state
```

The key difference: regions, states, mock data, and flows are **auto-generated** via TypeScript AST analysis instead of manually written in `scenarios.ts` and `flow.ts`.

## Architecture: Shadow Preview Layer

All preview configuration lives in a `.preview/` directory at the host project root. Host project code is never modified.

```
my-app/                          ← Host project (UNTOUCHED)
├── src/screens/booking/search.tsx
├── src/screens/profile/index.tsx
└── ...

.preview/                        ← Generated + managed by preview-tool CLI
├── preview.config.ts            ← User-editable config
├── adapters/                    ← Auto-generated wrappers per screen
│   ├── booking--search.tsx
│   └── profile.tsx
├── mocks/                       ← Auto-generated regions/states/flows
│   ├── booking--search.ts
│   └── profile.ts
├── interceptors/                ← Auto-generated hook replacements
│   └── booking--search/
│       └── useSearchData.ts
└── overrides/                   ← Manual overrides (optional, user-maintained)
    └── booking--search.ts
```

- `adapters/`, `mocks/`, `interceptors/` — fully regeneratable via `pnpm preview generate`
- `overrides/` — user-maintained, never overwritten

## Package Structure

```
@preview-tool/cli      → CLI commands (init, dev, generate)
@preview-tool/runtime  → React components (CatalogPanel, DeviceFrame, InspectorPanel)
```

## CLI Commands

```bash
# 1. Install
pnpm add -D @preview-tool/cli

# 2. Initialize
pnpm preview init
#   → Prompts: "Where are your screens?" (default: src/screens/**/index.tsx)
#   → Detects screen patterns (MVC, hooks, props-driven)
#   → Generates .preview/ folder with adapters, mocks, interceptors

# 3. Launch dev server
pnpm preview dev
#   → Starts Vite dev server on localhost:6100
#   → Opens preview UI (catalog + device frame + inspector)

# 4. Regenerate (after adding new screens)
pnpm preview generate
#   → Re-scans project, generates artifacts for new/changed screens
```

## Analysis Engine (Local, Offline)

Uses `ts-morph` (TypeScript compiler wrapper) for static analysis. No external AI API calls.

### What It Detects

| Source code pattern | Inference |
|---|---|
| `useState<boolean>(false)` named `isLoading` | Region state: loading true/false |
| `items.map(item => ...)` | List region with empty/populated states |
| `{isLoading && <Spinner/>}` | Conditional rendering → state variant |
| `onClick={() => navigate('/next')}` | Flow: click triggers navigation |
| `onClick={() => setIsLoading(true)}` | Flow: click transitions state |
| `interface Props { items: Item[], error: string \| null }` | Props → possible states |
| Form inputs with `onChange` | Interactive form region |

### Mock Data Generation (by type + field name heuristics)

| Type + name | Generated mock |
|---|---|
| `name: string` | "Anna Mueller" |
| `email: string` | "anna@example.de" |
| `items: Item[]` | 0, 3, or 20 items (empty/few/many) |
| `isLoading: boolean` | true, false |
| `error: string \| null` | null, "Connection failed" |
| `date: string` | "2026-03-15" |
| `price: number` | 29.99 |

### Generated Output (per screen)

```typescript
// .preview/mocks/booking--search.ts

export const meta = {
  label: 'Booking / Search',
  path: 'src/screens/booking/search/index.tsx',
}

export const regions = {
  searchForm: {
    label: 'Search Form',
    states: {
      empty: { query: '', specialty: null, canSearch: false },
      filled: { query: 'Headache', specialty: 'neurology', canSearch: true },
    },
    defaultState: 'empty',
  },
  resultsList: {
    label: 'Results List',
    isList: true,
    defaultCount: 3,
    states: {
      loading: { items: [], isLoading: true },
      empty: { items: [], isLoading: false },
      populated: { items: generateMockItems(20), isLoading: false },
    },
    defaultState: 'loading',
  },
}

export const flows = [
  {
    trigger: 'Button:Search',
    transition: { resultsList: 'loading' },
    delay: 1500,
    then: { resultsList: 'populated' },
  },
  { trigger: 'ListItem:*', navigate: '/booking/detail' },
  { trigger: 'Button:Back', navigate: '/booking' },
]
```

### Limitations

Local heuristics cannot catch every pattern (complex derived state, multi-step async flows, deeply abstracted logic). Developers add manual overrides in `.preview/overrides/` for these cases.

## Runtime: Adapter Pattern

For each screen, the tool generates an adapter that imports the screen and controls its data.

### Strategy per screen type

| Screen type | Detection | Strategy |
|---|---|---|
| **MVC** (view.tsx + model.ts) | Has `view.tsx` + `model.ts` files | Import View directly, pass mock props |
| **Props-driven** | Component has typed Props interface, no internal hooks | Pass mock props directly |
| **Hook-based** | Uses named custom hooks | Vite module aliasing → interceptors |
| **API-fetching** | Uses fetch/SWR/React Query | MSW request interception |

Detection is automatic during `pnpm preview generate`.

### Adapter example

```typescript
// .preview/adapters/booking--search.tsx (auto-generated)
import SearchScreen from '../../src/screens/booking/search'
import { regions, flows } from '../mocks/booking--search'

export default function Adapter({ regionStates, flags }) {
  const data = assembleData(regions, regionStates)
  return <SearchScreen {...data} />
}
```

### Hook interception (for monolithic screens)

Vite module aliasing replaces data-fetching hooks at build time:

```typescript
// Preview tool's internal Vite config
resolve: {
  alias: {
    './hooks/useSearchData': '.preview/interceptors/booking--search/useSearchData.ts'
  }
}
```

The interceptor returns mock data from the currently selected region state instead of making real API calls.

## Flow Simulation

Flows enable interactive previews — clicking buttons triggers state transitions and navigation, simulating the real app without a backend.

### Three levels

1. **State transitions** (within a screen) — Click "Search" → `ready` → `loading` → `results`
2. **Navigation** (between screens) — Click "Continue" → preview navigates to confirmation screen
3. **Form interaction** — Type in inputs, select radios → state updates in preview

### How flows are generated

The analysis engine traces `onClick`, `onChange`, `onSubmit` handlers to identify:
- `setState` calls → mapped to region state transitions
- `navigate` calls → mapped to screen navigation
- Async patterns (fetch then setState) → loading → result transitions with simulated delays

## Preview UI

```
┌──────────────────────────────────────────────────────────┐
│  @preview-tool                                           │
├──────────┬──────────────────────┬───────────────────────┤
│ CATALOG  │    DEVICE FRAME      │    INSPECTOR          │
│          │                      │                       │
│ booking/ │  ┌────────────────┐  │  Device: iPhone 15 ▾  │
│  search ◄│  │                │  │  Language: DE | EN    │
│  detail  │  │   [Rendered    │  │                       │
│  confirm │  │    Screen]     │  │  ── Regions ──        │
│          │  │                │  │  Search Form:         │
│ profile/ │  │                │  │   ○ empty ● filled    │
│  view    │  └────────────────┘  │  Results List:        │
│  edit    │                      │   ○ loading ○ empty   │
│          │  ◀ iPhone │ Android │  │   ● populated        │
│          │                      │                       │
│          │                      │  ── Flags ──          │
│          │                      │  ☑ showFilters        │
│          │                      │  ☐ showRecent         │
└──────────┴──────────────────────┴───────────────────────┘
```

Same UX as current preview-tool. Components extracted from current project into `@preview-tool/runtime`.

## Supported Screen Patterns

The tool works with both:
- **MVC-structured screens** (model.ts/controller.ts/view.tsx) — best experience, full type safety
- **Monolithic screens** (single file with mixed data + rendering) — works via hook/API interception

No refactoring of host project code required.

## Tech Stack

| Layer | Technology |
|---|---|
| CLI | Node.js CLI (commander or similar) |
| Analysis | ts-morph (TypeScript AST) |
| Dev server | Vite (separate instance) |
| Runtime UI | React 19 + TypeScript |
| Styling | Tailwind CSS (inherits host config) |
| State | Zustand (dev tools store) |
| API mocking | MSW (for fetch-based screens) |
| Device frames | Extracted from current preview-tool |

## Scope

- React + TypeScript only (for now)
- Framework-agnostic support (Vue, Svelte) deferred to future

## Decisions

1. **Shadow preview layer** — `.preview/` folder outside host code, no source modifications
2. **Local AST analysis** — no external AI API, fully offline, zero cost
3. **Auto-detect screen pattern** — MVC, hooks, props, API-fetching handled automatically
4. **Region-based model** — same as current preview-tool (regions → states → mock data)
5. **Overrides for edge cases** — `.preview/overrides/` for manual fine-tuning
6. **Separate Vite dev server** — independent from host project's dev server

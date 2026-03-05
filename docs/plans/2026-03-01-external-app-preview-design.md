# External App Preview — Design Document

**Date:** 2026-03-01
**Status:** Approved

## Problem

The preview-tool currently only supports screens built inside its own `src/screens/` directory. Users want to preview screens from external codebases (e.g., a booking app at `~/Desktop/booking/client`) using the same scenario-driven dev tools, device frames, and inspector panel — without modifying the external app's code.

## Solution

Extend the existing CLI MVC pipeline to scan external React apps, generate region/flow metadata, and render the external app's components directly in the preview-tool shell.

## User Flow

```bash
# Local directory
npx preview-tool ~/Desktop/booking/client

# GitHub URL
npx preview-tool https://github.com/user/booking --path client
```

**One command** handles everything:
1. Scan → detect framework, dependencies, pages
2. Init → create `.preview/` directory with config and wrapper
3. Generate → produce MVC files (model, view, controller, adapter) per screen
4. Dev → start preview server

**Output:**
```
Scanning ~/Desktop/booking/client...
  Framework:  React 19 + Vite
  Dependencies: @tanstack/react-query, react-router-dom, react-i18next

Discovering screens... 9 found
Generating MVC files... done

Preview ready at http://localhost:6100
```

## Architecture

### Existing Pipeline (unchanged)

```
discover.ts → analyze-view.ts → analyze-component.ts → generate-*.ts
     ↓              ↓                    ↓                    ↓
  Find pages    Build ViewTree     Extract regions      Write MVC files
```

### New: Source Resolution

The CLI accepts three input types:

| Input | Handling |
|-------|----------|
| Local path (`./app`, `~/Desktop/app`) | Use directly |
| GitHub URL (`github.com/user/repo`) | `git clone --depth 1` to temp dir |
| GitHub URL + `--path` | Clone + navigate to subdirectory |

**GitHub clone flow:**
1. Detect URL input (starts with `http`, `github.com`, or `git@`)
2. Clone with `--depth 1 --single-branch` to a temp directory
3. If `--path` specified, use that subdirectory
4. If not, auto-detect frontend directory (scan for `package.json` with React/Vue deps)
5. Install dependencies
6. Run pipeline
7. Clean up temp directory on exit (or keep with `--keep` flag)

### New: Wrapper Generation

External app components need providers to render. The CLI auto-generates `.preview/wrapper.tsx`:

**Detection strategy:**
1. Scan `package.json` dependencies for known provider packages
2. Scan source imports for provider usage patterns
3. Generate wrapper with detected providers

**Known provider patterns:**

| Dependency | Generated Wrapper |
|-----------|------------------|
| `@tanstack/react-query` | `QueryClientProvider` with new `QueryClient()` |
| `react-router-dom` | `MemoryRouter` (preview-tool handles routing) |
| `react-i18next` | `I18nextProvider` importing app's i18n config |
| `@chakra-ui/react` | `ChakraProvider` |
| `@mui/material` | `ThemeProvider` with default theme |
| `zustand` | No wrapper needed |

**Manual override:** Users can edit `wrapper.tsx` — it's not overwritten on re-generate.

### New: Framework Detection

```typescript
interface DetectedFramework {
  name: 'react' | 'vue' | 'svelte' | 'angular'
  bundler: 'vite' | 'webpack' | 'next' | 'nuxt'
  devCommand: string      // e.g., "npm run dev"
  port: number            // e.g., 5173
  pagePattern: string     // e.g., "src/pages/**/*.tsx"
}
```

**Detection logic:**
1. Check `package.json` dependencies for framework
2. Check for bundler config files (`vite.config.ts`, `next.config.js`, etc.)
3. Check for page directory patterns
4. Check `package.json` scripts for dev command and port

### MVP Scope (React + Vite only)

Phase 1 focuses on React apps using Vite. The scanning supports:
- File-based routing (`src/pages/`)
- React Router v6 config-based routing (parse `createBrowserRouter`)
- Component analysis via ts-morph AST parsing
- Region inference from data props, useState hooks, and type definitions

### Screen Discovery for External Apps

The existing `discover.ts` already supports custom `screenGlob`. For external apps:

| App Structure | screenGlob |
|--------------|------------|
| `src/pages/**/*.tsx` | `src/pages/**/*.tsx` |
| `src/app/**/page.tsx` | `src/app/**/page.tsx` |
| `pages/**/*.tsx` | `pages/**/*.tsx` |

Auto-detection scans these patterns in order, using the first that yields results.

### Generated File Structure

```
~/Desktop/booking/client/
├── src/                          # External app (untouched)
│   ├── pages/
│   │   ├── home.tsx
│   │   ├── login.tsx
│   │   └── admin/dashboard.tsx
│   └── ...
└── .preview/                     # Generated (gitignored)
    ├── preview.config.json
    ├── wrapper.tsx
    ├── main.tsx                  # Auto-generated entry
    ├── index.html
    └── screens/
        ├── home/
        │   ├── view.ts
        │   ├── model.ts          # regions: services (populated/empty/loading/error)
        │   ├── controller.ts     # flows: click service card → /book/:id
        │   └── adapter.ts        # imports from ../../src/pages/home.tsx
        ├── login/
        │   ├── view.ts
        │   ├── model.ts
        │   ├── controller.ts
        │   └── adapter.ts
        └── admin-dashboard/
            ├── view.ts
            ├── model.ts
            ├── controller.ts
            └── adapter.ts
```

## Preview UI

The existing `PreviewShell` renders the external app's components:

- **CatalogPanel (left):** Lists discovered screens grouped by section
- **DeviceFrame (center):** Renders external component with assembled region data
- **InspectorPanel (right):** Region state toggles, device picker, locale switcher, network sim

All existing preview-tool features work: device frames, font scaling, play mode, network simulation, flow navigation.

## Booking App Example

For `~/Desktop/booking/client`, the scanner produces:

| Screen | Route | Regions | Flows |
|--------|-------|---------|-------|
| Home | `/` | services (populated/empty/loading/error) | click service → /book/:id |
| Login | `/login` | form (populated/loading/error) | submit → / |
| Register | `/register` | form (populated/loading/error) | submit → / |
| Booking | `/book/:id` | service (populated/loading/error), slots (populated/empty/loading) | select slot → confirm |
| My Appointments | `/my-appointments` | appointments (populated/empty/loading/error) | cancel → refresh |
| Admin Dashboard | `/admin/dashboard` | stats (populated/loading), upcoming (populated/empty/loading) | — |
| Admin Services | `/admin/services` | services (populated/empty/loading/error) | add/edit/delete |
| Admin Availability | `/admin/availability` | schedule (populated/loading/error) | toggle days, save |
| Admin Appointments | `/admin/appointments` | appointments (populated/empty/loading/error) | confirm/cancel/complete |

## Phases

### Phase 1 (MVP)
- Single combined command: `npx preview-tool <local-path-or-github-url>`
- Source resolution: local paths + GitHub URLs
- Framework detection: React + Vite
- Page discovery: file-based routing + React Router config
- MVC generation: regions, flows, mock data
- Wrapper generation: auto-detect providers
- Preview server with full InspectorPanel

### Phase 2
- Additional frameworks: Next.js, Vue + Nuxt, Svelte
- Deployed web app (`preview-tool.app`)
- Per-region state control improvements
- LLM-enhanced region/flow detection

## Non-Goals

- Modifying the external app's source code
- Running the external app's backend/API server
- Supporting non-JavaScript frameworks
- Real API integration (all data is mocked)

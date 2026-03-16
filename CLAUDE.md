# Preview Tool

## Monorepo Structure

This is a pnpm workspace monorepo containing a CLI tool and its runtime library.

| Directory | Purpose |
|-----------|---------|
| `packages/cli/` | CLI tool (`@preview-tool/cli`) — analyzes React apps and generates preview wrappers |
| `packages/runtime/` | Runtime library (`@preview-tool/runtime`) — React components for the preview shell |
| `docs/plans/` | Design documents and implementation plans |
| `.claude/` | Claude configuration and skills |

Workspace commands from the repo root:
- `pnpm build` — build the CLI
- `pnpm test` — build CLI + run it against the sample-app test fixture

## Purpose

The CLI analyzes external React applications, discovers their screens/pages, analyzes their hooks and data dependencies, and generates isolated preview wrappers with mock data — so screens can be rendered in a device-frame preview environment without running the full app.

## Package Architecture

```
packages/cli/          → Code generation tool (Node.js CLI)
  src/
    commands/          → CLI commands (init, dev, generate, preview)
    analyzer/          → AST analysis (discover pages, analyze hooks/components)
    generator/         → Code generators (model, view, controller, mock hooks, mock stores)
    resolver/          → Source resolution (framework detection, wrapper generation, deps)
    server/            → Dev server setup (Vite config, entry point generation)
    llm/               → LLM integration (Anthropic, OpenAI, Ollama providers)
    lib/               → Shared utilities (config, formatting)

packages/runtime/      → Preview shell React components
  src/
    PreviewShell.tsx   → Main shell layout with device frames
    ScreenRenderer.tsx → Renders screens inside preview
    ScreenRegistry.ts  → Screen discovery and registration
    devtools/          → Inspector panel, scenario switcher
    flow/              → Flow engine (screen-to-screen navigation)
    preview/           → Device frames (iPhone, Pixel, iPad, Desktop)
    store/             → Zustand state management
    ui/                → Shared UI primitives
```

Dependencies flow: `CLI → Runtime` (unidirectional). Runtime has no CLI dependency.

## CLI Commands

| Command | Purpose |
|---------|---------|
| `preview init` | Initialize preview config in a React project |
| `preview dev` | Start the preview dev server |
| `preview generate` | Analyze screens and generate preview wrappers |
| `preview` | Combined: generate + dev in one step |

## Tech Stack

- **TypeScript** (strict mode) — compiled with `tsc`
- **Commander** — CLI argument parsing
- **ts-morph** — AST analysis and code generation
- **Zod** — schema validation
- **pnpm** — package manager (not npm, not yarn)

## Testing

- Unit tests co-located as `__tests__/*.test.ts` within each module
- Integration tests in `src/__tests__/integration/`
- Test fixture: `packages/cli/test-fixtures/sample-app/` (self-contained React app)
- Run tests: `pnpm test` (builds CLI, then runs `generate` against sample-app)

## Rules

- Do NOT install or add any npm package without explicit user approval
- Keep the CLI as a Node.js tool — no browser dependencies in `packages/cli/`
- Runtime is a React library — browser-only, consumed by generated preview apps
- Test fixtures must be self-contained (no imports from CLI or runtime)
- **Do NOT guess.** When something doesn't work, trace the actual data flow end-to-end before proposing a fix. Read the real target app code (API clients, components, stores) to understand exact formats, patterns, and assumptions. Never assume a response format, URL shape, or data structure — verify it first.

## Debugging: Verified Root Causes

Lessons from past bugs — always check these before writing fixes:

1. **React Rules of Hooks:** Never place `useEffect`/`useState`/any hook after conditional `return` statements. All hooks must be called unconditionally on every render. Trace the full function to verify no early returns precede new hooks.

2. **useEffect timing (parent vs child):** React fires child effects BEFORE parent effects. If a parent's `useEffect` sets data that a child's `useEffect` reads, the child will read stale data. Solution: set shared data synchronously during render, not in `useEffect`.

3. **API response format:** Target apps wrap API responses differently (`{ success: true, data: [...] }` vs raw arrays vs other envelopes). The fetch interceptor MUST return data in the format the app's API client expects. Always read the actual API client code (`lib/api.ts` or equivalent) before generating interceptors.

4. **URL matching:** Target apps prepend baseURLs to API paths (e.g., `fetch('/specialties')` becomes `fetch('http://localhost:3001/api/specialties')`). Interceptors must match by suffix, not exact string.

5. **Mock data completeness:** mockData must include ALL fields the component uses (including `id` for React keys). Read the component's JSX to verify which fields are accessed before writing mockData.

# Specs

This project uses `.specs/` for requirement tracking.
For spec questions, changes, verification → `/spec`.
Operations: onboard, add, query, verify, map, confirm, audit.

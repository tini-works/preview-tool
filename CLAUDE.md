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

# Specs

This project uses `.specs/` for requirement tracking.
For spec questions, changes, verification → `/spec`.
Operations: onboard, add, query, verify, map, confirm, audit.

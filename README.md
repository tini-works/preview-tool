# Preview Tool

A CLI that analyzes React applications and generates isolated screen previews with mock data, rendered inside device frames.

## What It Does

1. **Discovers** screens/pages in your React project
2. **Analyzes** hooks and data dependencies via AST
3. **Generates** preview wrappers with mock data (module aliasing redirects real hooks to mocks)
4. **Serves** screens in a device-frame preview shell (iPhone, Pixel, iPad, Desktop)

## Quick Start

```bash
pnpm install
pnpm build
```

### Run against a React project

```bash
node packages/cli/dist/index.js preview --cwd /path/to/your/react-app
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `preview init` | Initialize preview config in a React project |
| `preview generate` | Analyze screens and generate preview wrappers |
| `preview dev` | Start the preview dev server |
| `preview` | Combined: generate + dev |

## Packages

| Package | Description |
|---------|-------------|
| `@preview-tool/cli` | CLI tool — screen discovery, hook analysis, code generation |
| `@preview-tool/runtime` | Preview shell — device frames, inspector, flow engine |

## Tech Stack

- **TypeScript** (strict mode)
- **ts-morph** — AST analysis
- **Commander** — CLI framework
- **Zod** — validation
- **React 19** — runtime preview shell
- **pnpm** workspaces

## Development

```bash
# Build the CLI
pnpm build

# Build + run against test fixture
pnpm test
```

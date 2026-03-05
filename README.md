# Preview Tool

Preview any React app's screens in an isolated device-frame environment — without running the full app or backend.

Point it at a React codebase. It discovers pages/screens, identifies UI regions and their state machines, detects navigation flows, and generates mock wrappers so you can preview each screen in different states (loading, populated, empty, error) from a right-panel control surface.

## Quick Start

```bash
# Preview a local React project
preview /path/to/your-react-app

# Preview a GitHub repo
preview https://github.com/user/repo

# For monorepos, specify the frontend subdirectory
preview https://github.com/user/repo --path packages/web
```

This single command will:
1. Detect your framework (React, Next.js, Remix, etc.)
2. Discover all screens/pages
3. Analyze hooks, components, and navigation patterns
4. Generate preview wrappers with mock data
5. Start a dev server at `http://localhost:6100`

## Installation

```bash
# Clone and install
git clone https://github.com/user/preview-tool.git
cd preview-tool
pnpm install
pnpm build

# Link the CLI globally
cd packages/cli && pnpm link --global
```

Requires: Node.js 18+, pnpm

## Commands

### `preview <source>`

All-in-one command — resolves source, detects framework, generates artifacts, starts dev server.

```bash
preview /path/to/app                                          # Local project
preview https://github.com/user/repo                          # GitHub repo
preview /path/to/app --no-llm                                 # Skip LLM, use template fallback
preview /path/to/app --port 3000                              # Custom port
preview https://github.com/user/repo --path packages/web --keep  # Monorepo, keep temp clone
```

| Flag | Description |
|------|-------------|
| `--path <subdir>` | Subdirectory within a monorepo |
| `--keep` | Keep cloned temp directory on exit |
| `--no-llm` | Skip LLM analysis, use template-based fallback |
| `-p, --port <port>` | Dev server port (default: 6100) |

### `preview init`

Initialize the `.preview/` directory in an existing project.

```bash
preview init          # Interactive prompts
preview init --yes    # Accept defaults
```

Creates:
```
.preview/
  screens/              # Generated preview wrappers (auto-generated)
  overrides/            # Your custom overrides (user-maintained)
  mocks/                # Generated mock modules (auto-generated)
  wrapper.tsx           # App providers wrapper (user-maintained)
  preview.config.json   # Configuration
```

### `preview generate`

Discover screens and generate preview artifacts.

```bash
preview generate              # From current directory
preview generate --cwd /path  # Specify project directory
preview generate --no-llm     # Template fallback only
```

### `preview dev`

Start the preview dev server (assumes artifacts already generated).

```bash
preview dev                   # Use config defaults
preview dev --port 3000       # Custom port
```

**Requires:** Vite installed in the target project:
```bash
pnpm add -D vite @vitejs/plugin-react
```

## How It Works

### Per-Screen Data Flow

```mermaid
flowchart TD
    subgraph S1["1 &mdash; Discovery"]
        A1[/"Glob pattern<br/><code>src/screens/**/index.tsx</code>"/]
        A2["<b>discoverScreens()</b><br/><i>analyzer/discover.ts</i>"]
        A3[/"DiscoveredScreen[]<br/>route &bull; filePath &bull; exportName"/]
        A1 --> A2 --> A3
    end

    subgraph S2["2 &mdash; AST Fact Collection"]
        B1["<b>collectAllFacts()</b><br/><i>analyzer/collect-facts.ts</i>"]
        B2[/"ScreenFacts[]"/]
        B1 --> B2
    end

    subgraph S2D[" "]
        direction LR
        BH["hooks<br/><i>name, importPath, args</i>"]
        BC["components<br/><i>name, props</i>"]
        BN["navigation<br/><i>target, trigger</i>"]
        BX["conditionals<br/><i>ternary, &&</i>"]
    end

    subgraph S3["3 &mdash; Semantic Analysis"]
        C1{"LLM<br/>configured?"}
        C2["<b>understandScreens()</b><br/><i>Anthropic / OpenAI / Ollama</i>"]
        C3["<b>buildFromTemplates()</b><br/><i>template-fallback.ts</i>"]
        C4[/"ScreenAnalysisOutput[]<br/>regions &bull; flows"/]
        C1 -->|yes| C2
        C1 -->|no| C3
        C2 -->|parse fail| C3
        C2 --> C4
        C3 --> C4
    end

    subgraph S3D[" "]
        direction LR
        RK["key: <code>users</code>"]
        RT["type: <code>list&thinsp;|&thinsp;auth&thinsp;|&thinsp;status</code>"]
        RS["states: <code>populated, loading, error</code>"]
        RH["hookBindings: <code>useQuery:users</code>"]
    end

    subgraph S4["4 &mdash; Code Generation"]
        D1["<b>analysisToModel()</b>"] --> F1[/"model.ts"/]
        D2["<b>analysisToController()</b>"] --> F2[/"controller.ts"/]
        D3["<b>analyzeViewTree()</b>"] --> F3[/"view.ts"/]
        D4["<b>generateMockModules()</b>"] --> F4[/"mocks/*.ts"/]
        D5["<b>buildAdapterContent()</b>"] --> F5[/"adapter.tsx"/]
    end

    subgraph S4H["Hook Classification"]
        HC1["<b>classifyHook()</b><br/><i>lib/hook-classifier.ts</i>"]
        HC2["<code>data</code> &rarr; mock with region data"]
        HC3["<code>provider</code> &rarr; skip, use real provider"]
        HC1 --> HC2
        HC1 --> HC3
    end

    subgraph S5["5 &mdash; Dev Server"]
        E1["<b>generateEntryFiles()</b>"] --> E2[/"main.tsx<br/>import.meta.glob adapters"/]
        E3["<b>createViteConfig()</b>"] --> E4[/"Alias chain<br/>__real: &rarr; mocks &rarr; dedup"/]
    end

    subgraph S6["6 &mdash; Runtime Rendering"]
        R1["<b>PreviewShell</b>"]
        R2["<b>ScreenRenderer</b><br/>dynamic import adapter"]
        R3["<b>RegionDataProvider</b><br/>inject mock data via context"]
        R4["<b>Original Component</b><br/>calls hooks normally"]
        R5["<b>Mock hook</b><br/><code>useRegionDataForHook('users')</code>"]
        R6(["Screen renders in device frame"])
        R1 --> R2 --> R3 --> R4 --> R5 --> R6
    end

    S1 --> S2
    B1 -.- S2D
    S2 --> S3
    C4 -.- S3D
    S3 --> S4
    D4 -.- S4H
    S4 --> S5
    S5 --> S6

    style S1 fill:#e8f5e9,stroke:#4caf50
    style S2 fill:#e3f2fd,stroke:#2196f3
    style S3 fill:#fff3e0,stroke:#ff9800
    style S4 fill:#fce4ec,stroke:#e91e63
    style S5 fill:#f3e5f5,stroke:#9c27b0
    style S6 fill:#e0f2f1,stroke:#009688
    style S4H fill:#fff9c4,stroke:#fbc02d
```

### Hook Lifecycle in Preview

```mermaid
sequenceDiagram
    participant S as Screen Component
    participant M as Mock Module
    participant R as RegionDataProvider
    participant Z as Zustand Store

    S->>M: useQuery({ queryKey: ['users'] })
    M->>R: useRegionDataForHook('users')
    R->>Z: read regionData['users']
    Z-->>R: { data: [...], isLoading: false }
    R-->>M: region state
    M-->>S: { data, isLoading, isError, isReady }
    Note over S: Renders with mock data
```

### Pipeline Summary

| Stage | Function | Input | Output | Artifacts |
|-------|----------|-------|--------|-----------|
| 1. Discovery | `discoverScreens()` | glob pattern | `DiscoveredScreen[]` | -- |
| 2. Facts | `collectAllFacts()` | screens | `ScreenFacts[]` | -- |
| 3. Analysis | `understandScreens()` | facts | `ScreenAnalysisOutput[]` | -- |
| 4. Codegen | `analysisToModel()` | analysis | model + controller + view | `model.ts`, `controller.ts`, `view.ts` |
| 4. Mocks | `generateMockModules()` | facts + analysis | mock files + manifest | `mocks/*.ts`, `alias-manifest.json` |
| 5. Server | `createViteConfig()` | manifest | Vite config with aliases | `main.tsx`, `index.html` |
| 6. Runtime | `PreviewShell` | screen entries | rendered preview | browser |

### Detailed Stages

**Stage 1 — Screen Discovery:** Finds pages/screens via glob patterns (e.g., `src/screens/**/index.tsx`).

**Stage 2 — AST Fact Collection:** Extracts raw facts from each screen using TypeScript AST analysis:
- Hooks called (name, import path, arguments)
- Components rendered (name, props, children)
- Conditional rendering patterns (loading/error/empty branches)
- Navigation patterns (navigate calls, Link components, router.push)

**Stage 3 — LLM Understanding:** Sends facts + source code to an LLM which identifies:
- **Regions** — distinct UI sections (e.g., "Service List", "Booking Form")
- **States** — what each region can look like (loading, populated, empty, error)
- **Flows** — what happens when users click buttons (navigate, change region state)
- **Mock data** — realistic domain-specific data for each state

Falls back to a template library when no LLM is available.

**Stage 4 — Code Generation:** Produces per-screen artifacts:
- `model.ts` — regions with state machines and mock data
- `controller.ts` — flows (navigation + state transitions)
- `view.ts` — component tree metadata
- `adapter.tsx` — React wrapper connecting screen to mock data
- Mock modules replacing data-fetching hooks with region-aware mocks

**Hook Classification:** During mock generation, each hook is classified as `data` (needs mocking) or `provider` (skip mocking). Data hooks like `useQuery` and `useAuthStore` get mock replacements. Provider hooks like `useNavigate`, `useForm`, and `useTranslation` are left untouched and run via real providers in `wrapper.tsx`.

### LLM Providers

The tool uses an LLM to understand screen semantics. Configure via `.preview/preview.config.json`:

| Provider | Setup |
|----------|-------|
| `auto` (default) | Tries providers in order: claude-code, anthropic, openai, ollama |
| `claude-code` | Requires [Claude Code](https://claude.ai/code) installed |
| `anthropic` | Requires `ANTHROPIC_API_KEY` env var |
| `openai` | Requires `OPENAI_API_KEY` env var |
| `ollama` | Requires local [Ollama](https://ollama.ai) running |
| `none` | No LLM — uses template-based fallback only |

Without an LLM, the tool still works using pattern-matching templates (e.g., `useQuery` hooks get list regions with loading/populated/empty/error states).

## Configuration

`.preview/preview.config.json`:

```json
{
  "screenGlob": "src/screens/**/index.tsx",
  "port": 6100,
  "title": "Preview Tool",
  "llm": {
    "provider": "auto",
    "ollamaModel": "llama3.2",
    "ollamaUrl": "http://localhost:11434"
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `screenGlob` | `src/**/*.tsx` | Glob pattern to find screen files |
| `port` | `6100` | Dev server port |
| `title` | `Preview Tool` | Preview app title |
| `llm.provider` | `auto` | LLM provider selection |
| `llm.ollamaModel` | `llama3.2` | Ollama model name |
| `llm.ollamaUrl` | `http://localhost:11434` | Ollama server URL |

## Overrides

Generated models and controllers can be customized. Place override files in `.preview/overrides/<screen-name>/`:

```
.preview/overrides/
  dashboard/
    model.ts        # Custom regions/states for dashboard
    controller.ts   # Custom flows for dashboard
```

Override files are never overwritten by `preview generate`.

## Project Structure

```
packages/
  cli/              # @preview-tool/cli — Node.js CLI tool
    src/
      commands/     # CLI commands (init, dev, generate, preview)
      analyzer/     # AST analysis (screen discovery, fact collection)
      generator/    # Code generators (model, view, controller, mocks)
      resolver/     # Source resolution (framework detection, wrappers)
      server/       # Dev server (Vite config, entry point generation)
      llm/          # LLM integration (providers, prompts, schemas)
      lib/          # Shared utilities

  runtime/          # @preview-tool/runtime — React preview shell
    src/
      PreviewShell  # Main shell layout with device frames
      ScreenRenderer # Renders screens inside preview
      devtools/     # Inspector panel, scenario switcher
      flow/         # Flow engine (navigation simulation)
      preview/      # Device frames (iPhone, Pixel, iPad, Desktop)
      store/        # Zustand state management
```

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build the CLI
pnpm test             # Build + run integration test against sample-app
```

Unit tests:
```bash
cd packages/cli
npx vitest run        # Run all unit tests
npx vitest --watch    # Watch mode
```

## Tech Stack

- **TypeScript** (strict mode) — compiled with `tsc`
- **ts-morph** — AST analysis and code generation
- **Commander** — CLI argument parsing
- **Zod** — schema validation
- **React 19 + Zustand** — runtime preview shell
- **Vite** — dev server
- **pnpm** workspaces — monorepo management

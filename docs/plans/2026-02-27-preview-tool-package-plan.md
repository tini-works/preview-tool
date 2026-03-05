# Preview Tool Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the preview-tool from an internal project into two installable npm packages (`@preview-tool/cli` and `@preview-tool/runtime`) that any React project can install to get region-based screen previews without modifying host code.

**Architecture:** pnpm monorepo with three workspaces: `packages/cli` (CLI + AST analysis engine), `packages/runtime` (React UI: catalog, device frames, inspector, flow system, store), and `apps/preview` (the existing app, now consuming the packages as a dogfood/demo).

**Tech Stack:** pnpm workspaces, ts-morph (AST analysis), commander.js (CLI), Vite programmatic API (dev server), Zustand (state), React 19, Tailwind CSS v4, MSW (API interception).

---

## Phase 1: Monorepo Setup

### Task 1: Initialize pnpm workspace structure

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `packages/runtime/package.json`
- Create: `packages/runtime/tsconfig.json`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Modify: `package.json` (root — add workspace config)

**Step 1: Create workspace config**

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

**Step 2: Move existing app to `apps/preview/`**

Move all existing source files (src/, public/, vite.config.ts, tsconfig*.json, index.html, tailwind config, playwright config) into `apps/preview/`. Update root package.json to reference workspace.

```bash
mkdir -p apps/preview
# Move app files — see detailed list below
```

Files to move:
- `src/` → `apps/preview/src/`
- `public/` → `apps/preview/public/`
- `index.html` → `apps/preview/index.html`
- `vite.config.ts` → `apps/preview/vite.config.ts`
- `tsconfig.json` → `apps/preview/tsconfig.json`
- `tsconfig.app.json` → `apps/preview/tsconfig.app.json`
- `tsconfig.node.json` → `apps/preview/tsconfig.node.json`
- `playwright.config.ts` → `apps/preview/playwright.config.ts`
- `components.json` → `apps/preview/components.json`
- `postcss.config.js` → `apps/preview/postcss.config.js` (if exists)

**Step 3: Create `apps/preview/package.json`**

```json
{
  "name": "@preview-tool/demo",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@preview-tool/runtime": "workspace:*",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-i18next": "^16.5.4",
    "i18next": "^25.2.1",
    "zustand": "^5.0.11",
    "lucide-react": "^0.575.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.52.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^4.5.2",
    "@tailwindcss/vite": "^4.2.1",
    "tailwindcss": "^4.2.1",
    "typescript": "^5.9.3",
    "vite": "^7.3.1"
  }
}
```

**Step 4: Create root `package.json`**

```json
{
  "name": "preview-tool-monorepo",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @preview-tool/demo dev",
    "build": "pnpm -r build",
    "test:e2e": "pnpm --filter @preview-tool/demo test:e2e"
  }
}
```

**Step 5: Verify monorepo structure**

Run: `pnpm install`
Expected: Clean install, no errors.

Run: `pnpm --filter @preview-tool/demo dev`
Expected: Existing app starts without errors (nothing extracted yet — still using local imports).

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: convert to pnpm monorepo with apps/preview"
```

---

## Phase 2: Extract @preview-tool/runtime

### Task 2: Create runtime package scaffold

**Files:**
- Create: `packages/runtime/package.json`
- Create: `packages/runtime/tsconfig.json`
- Create: `packages/runtime/src/index.ts` (barrel export)

**Step 1: Create `packages/runtime/package.json`**

```json
{
  "name": "@preview-tool/runtime",
  "version": "0.0.1",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts",
    "./store": "./src/store/index.ts",
    "./devtools": "./src/devtools/index.ts",
    "./preview": "./src/preview/index.ts",
    "./flow": "./src/flow/index.ts"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "dependencies": {
    "lucide-react": "^0.575.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.3.1"
  }
}
```

**Step 2: Create `packages/runtime/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "paths": {
      "@preview-tool/runtime/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

**Step 3: Create initial barrel export**

```typescript
// packages/runtime/src/index.ts
export * from './types'
```

**Step 4: Commit**

```bash
git add packages/runtime/
git commit -m "feat(runtime): scaffold @preview-tool/runtime package"
```

---

### Task 3: Extract type contracts

**Files:**
- Create: `packages/runtime/src/types.ts` (from `apps/preview/src/screens/types.ts`)
- Modify: `apps/preview/src/screens/types.ts` (re-export from package)

**Step 1: Copy and generalize types**

```typescript
// packages/runtime/src/types.ts
import type { ComponentType } from 'react'

export interface FlagDefinition {
  label: string
  default: boolean
}

export interface RegionDefinition {
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  defaultCount?: number
}

export type RegionsMap = Record<string, RegionDefinition>

export interface ScreenModule {
  default: ComponentType<{ data: unknown; flags?: Record<string, boolean> }>
}

export interface ScreenEntry {
  route: string
  module: () => Promise<ScreenModule>
  flags?: Record<string, FlagDefinition>
  regions?: RegionsMap
}

export interface FlowAction {
  trigger: string
  setState?: string
  setRegionState?: { region: string; state: string }
  navigate?: string
  navigateState?: string
}

// New types for the package system
export interface PreviewConfig {
  screenGlob: string
  port: number
  title?: string
}

export interface GeneratedMock {
  meta: { label: string; path: string }
  regions: RegionsMap
  flows: FlowAction[]
}
```

**Step 2: Update `apps/preview/src/screens/types.ts`**

```typescript
// Re-export everything from the package
export type {
  FlagDefinition,
  RegionDefinition,
  RegionsMap,
  ScreenModule,
  ScreenEntry,
} from '@preview-tool/runtime/types'
```

**Step 3: Update `apps/preview/src/flow/types.ts`**

```typescript
export type { FlowAction } from '@preview-tool/runtime/types'
```

**Step 4: Verify**

Run: `cd apps/preview && pnpm exec tsc --noEmit`
Expected: No type errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(types): extract shared types to @preview-tool/runtime"
```

---

### Task 4: Extract device frame system

**Files:**
- Create: `packages/runtime/src/preview/device-frames.ts`
- Create: `packages/runtime/src/preview/DeviceFrame.tsx`
- Create: `packages/runtime/src/preview/MobileFrame.tsx`
- Create: `packages/runtime/src/preview/BrowserFrame.tsx`
- Create: `packages/runtime/src/preview/ResizableFrame.tsx`
- Create: `packages/runtime/src/preview/StatusBar.tsx`
- Create: `packages/runtime/src/preview/HomeIndicator.tsx`
- Create: `packages/runtime/src/preview/index.ts`

**Step 1: Copy all preview files**

Copy these files from `apps/preview/src/preview/` to `packages/runtime/src/preview/`, updating any `@/` path aliases to relative imports within the package.

Key changes during copy:
- Replace `import { cn } from '@/lib/utils'` with a local `cn` utility in packages/runtime
- Create `packages/runtime/src/lib/utils.ts` with the `cn` function

**Step 2: Create barrel export**

```typescript
// packages/runtime/src/preview/index.ts
export { DeviceFrame } from './DeviceFrame'
export { MobileFrame } from './MobileFrame'
export { BrowserFrame } from './BrowserFrame'
export { ResizableFrame } from './ResizableFrame'
export { StatusBar } from './StatusBar'
export { HomeIndicator } from './HomeIndicator'
export {
  DEVICE_DEFINITIONS,
  getDevice,
  getAllDevices,
  type DeviceType,
  type DeviceDefinition,
} from './device-frames'
```

**Step 3: Update `apps/preview/src/preview/` to re-export from package**

Replace each file's contents with a re-export, or update `apps/preview/src/App.tsx` to import from `@preview-tool/runtime/preview`.

**Step 4: Verify**

Run: `cd apps/preview && pnpm exec tsc --noEmit`
Expected: No type errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(preview): extract device frame components to @preview-tool/runtime"
```

---

### Task 5: Extract Zustand store

**Files:**
- Create: `packages/runtime/src/store/useDevToolsStore.ts`
- Create: `packages/runtime/src/store/index.ts`

**Step 1: Copy store**

Copy `apps/preview/src/devtools/useDevToolsStore.ts` to `packages/runtime/src/store/useDevToolsStore.ts`. Update imports (replace `@/` aliases with relative or package imports).

**Step 2: Create barrel**

```typescript
// packages/runtime/src/store/index.ts
export { useDevToolsStore, type DeviceType } from './useDevToolsStore'
```

**Step 3: Update app to import from package**

Update all files in `apps/preview/` that import `useDevToolsStore` to use `@preview-tool/runtime/store`.

**Step 4: Verify**

Run: `cd apps/preview && pnpm exec tsc --noEmit`
Expected: No type errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(store): extract Zustand devtools store to @preview-tool/runtime"
```

---

### Task 6: Extract flow system

**Files:**
- Create: `packages/runtime/src/flow/FlowProvider.tsx`
- Create: `packages/runtime/src/flow/trigger-matcher.ts`
- Create: `packages/runtime/src/flow/useFlowConfig.ts`
- Create: `packages/runtime/src/flow/index.ts`

**Step 1: Copy flow files**

Copy from `apps/preview/src/flow/` to `packages/runtime/src/flow/`. The flow types are already in `packages/runtime/src/types.ts`.

Key changes:
- `useFlowConfig.ts` uses `import.meta.glob` — this must be abstracted. The runtime package should accept flow actions as data rather than discovering them via glob. Add a `FlowRegistry` concept:

```typescript
// packages/runtime/src/flow/FlowRegistry.ts
import type { FlowAction } from '../types'

let flowRegistry: Record<string, FlowAction[]> = {}

export function registerFlows(route: string, actions: FlowAction[]): void {
  flowRegistry = { ...flowRegistry, [route]: actions }
}

export function getFlowActions(route: string): FlowAction[] | null {
  return flowRegistry[route] ?? null
}

export function clearFlowRegistry(): void {
  flowRegistry = {}
}
```

Update `FlowProvider.tsx` to use `getFlowActions()` instead of `useFlowActions()` (which was glob-based).

**Step 2: Create barrel**

```typescript
// packages/runtime/src/flow/index.ts
export { FlowProvider } from './FlowProvider'
export { resolveTrigger } from './trigger-matcher'
export { registerFlows, getFlowActions, clearFlowRegistry } from './FlowRegistry'
```

**Step 3: Update app**

Update `apps/preview/` to register flows at startup using `registerFlows()`, keeping the glob-based discovery in the app layer.

**Step 4: Verify**

Run: `cd apps/preview && pnpm exec tsc --noEmit`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(flow): extract flow system to @preview-tool/runtime with registry API"
```

---

### Task 7: Extract devtools UI components

**Files:**
- Create: `packages/runtime/src/devtools/CatalogPanel.tsx`
- Create: `packages/runtime/src/devtools/InspectorPanel.tsx`
- Create: `packages/runtime/src/devtools/DevToolsBar.tsx`
- Create: `packages/runtime/src/devtools/NetworkSimulationLayer.tsx`
- Create: `packages/runtime/src/devtools/PlayModeOverlay.tsx`
- Create: `packages/runtime/src/devtools/index.ts`

**Step 1: Copy devtools components**

Copy from `apps/preview/src/devtools/` to `packages/runtime/src/devtools/`. Update imports to use package-internal paths.

These components import from the store, flow system, and preview — all already extracted. Update those imports.

**Step 2: Handle shadcn/ui dependencies**

The devtools components use shadcn/ui primitives (Button, Input, Label, Select, Slider, etc.). Two options:

**Option A (chosen):** Copy the needed shadcn/ui components into `packages/runtime/src/ui/`. This makes the package self-contained.

Create: `packages/runtime/src/ui/button.tsx`, `packages/runtime/src/ui/input.tsx`, `packages/runtime/src/ui/label.tsx`, `packages/runtime/src/ui/select.tsx`, `packages/runtime/src/ui/slider.tsx`, `packages/runtime/src/ui/scroll-area.tsx`, `packages/runtime/src/ui/separator.tsx`, `packages/runtime/src/ui/badge.tsx`, `packages/runtime/src/ui/card.tsx`

Copy from `apps/preview/src/components/ui/` to `packages/runtime/src/ui/`.

**Step 3: Create barrel**

```typescript
// packages/runtime/src/devtools/index.ts
export { CatalogPanel } from './CatalogPanel'
export { InspectorPanel } from './InspectorPanel'
export { DevToolsBar } from './DevToolsBar'
export { NetworkSimulationLayer } from './NetworkSimulationLayer'
export { PlayModeOverlay } from './PlayModeOverlay'
```

**Step 4: Verify**

Run: `cd apps/preview && pnpm exec tsc --noEmit`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(devtools): extract UI components to @preview-tool/runtime"
```

---

### Task 8: Extract ScreenRenderer and create PreviewShell

**Files:**
- Create: `packages/runtime/src/ScreenRenderer.tsx`
- Create: `packages/runtime/src/ScreenRegistry.ts`
- Create: `packages/runtime/src/PreviewShell.tsx`

**Step 1: Create ScreenRegistry (replaces glob-based discovery)**

```typescript
// packages/runtime/src/ScreenRegistry.ts
import type { ScreenEntry } from './types'

let screenRegistry: ScreenEntry[] = []

export function registerScreens(entries: ScreenEntry[]): void {
  screenRegistry = [...entries]
}

export function getScreenEntries(): ScreenEntry[] {
  return screenRegistry
}

export function getScreenEntry(route: string): ScreenEntry | undefined {
  return screenRegistry.find(e => e.route === route)
}
```

**Step 2: Extract ScreenRenderer**

Copy `apps/preview/src/screens/ScreenRenderer.tsx` to `packages/runtime/src/ScreenRenderer.tsx`. Update to use `getScreenEntry()` instead of the glob-based hook.

Export the key functions:
- `assembleRegionData(regions, regionStates, regionListCounts)`
- `resolveFlags(definitions, overrides)`
- `ScreenRenderer` component

**Step 3: Create PreviewShell (full app layout)**

```typescript
// packages/runtime/src/PreviewShell.tsx
// This is the App.tsx equivalent — the complete preview layout
// Accepts screenEntries as prop, registers them, renders the three-panel UI

import { useEffect } from 'react'
import { registerScreens } from './ScreenRegistry'
import { useDevToolsStore } from './store'
import { CatalogPanel } from './devtools/CatalogPanel'
import { InspectorPanel } from './devtools/InspectorPanel'
import { DeviceFrame } from './preview/DeviceFrame'
import { PlayModeOverlay } from './devtools/PlayModeOverlay'
import { ScreenRenderer } from './ScreenRenderer'
import type { ScreenEntry } from './types'

interface PreviewShellProps {
  screens: ScreenEntry[]
  title?: string
}

export function PreviewShell({ screens, title }: PreviewShellProps) {
  useEffect(() => { registerScreens(screens) }, [screens])

  const { playMode, selectedRoute } = useDevToolsStore()

  return (
    <div className="flex h-svh">
      {!playMode && <CatalogPanel />}
      <div className="flex flex-1 flex-col">
        <DeviceFrame>
          <ScreenRenderer route={selectedRoute} />
        </DeviceFrame>
      </div>
      {!playMode && <InspectorPanel />}
      {playMode && <PlayModeOverlay />}
    </div>
  )
}
```

**Step 4: Update barrel export**

```typescript
// packages/runtime/src/index.ts
export * from './types'
export { PreviewShell } from './PreviewShell'
export { ScreenRenderer, assembleRegionData, resolveFlags } from './ScreenRenderer'
export { registerScreens, getScreenEntries, getScreenEntry } from './ScreenRegistry'
export { registerFlows, getFlowActions } from './flow'
export { useDevToolsStore } from './store'
```

**Step 5: Update `apps/preview/src/App.tsx` to use PreviewShell**

```typescript
import { PreviewShell } from '@preview-tool/runtime'
import { useScreenModules } from './screens/useScreenModules'

export default function App() {
  const screens = useScreenModules()
  return <PreviewShell screens={screens} title="Preview Tool" />
}
```

**Step 6: Verify**

Run: `cd apps/preview && pnpm exec tsc --noEmit`
Run: `cd apps/preview && pnpm dev` — verify app works identically.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(runtime): add PreviewShell, ScreenRegistry, and ScreenRenderer"
```

---

### Task 9: Verify existing app still works end-to-end

**Step 1: Run TypeScript check**

Run: `cd apps/preview && pnpm exec tsc --noEmit`
Expected: Zero errors.

**Step 2: Run dev server**

Run: `cd apps/preview && pnpm dev`
Expected: App loads, catalog shows all screens, switching states works, flows work.

**Step 3: Run E2E tests**

Run: `cd apps/preview && pnpm test:e2e`
Expected: All tests pass.

**Step 4: Fix any issues found**

If anything broke during extraction, fix it before proceeding.

**Step 5: Commit (if fixes needed)**

```bash
git add -A
git commit -m "fix: resolve extraction issues for runtime package"
```

---

## Phase 3: Build @preview-tool/cli

### Task 10: Scaffold CLI package

**Files:**
- Modify: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/dev.ts`
- Create: `packages/cli/src/commands/generate.ts`

**Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "@preview-tool/cli",
  "version": "0.0.1",
  "type": "module",
  "bin": {
    "preview": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@preview-tool/runtime": "workspace:*",
    "commander": "^13.1.0",
    "ts-morph": "^25.0.0",
    "vite": "^7.3.1",
    "@vitejs/plugin-react": "^4.5.2",
    "chalk": "^5.4.1",
    "prompts": "^2.4.2"
  },
  "devDependencies": {
    "@types/prompts": "^2.4.9",
    "typescript": "^5.9.3"
  }
}
```

**Step 2: Create CLI entry point**

```typescript
// packages/cli/src/index.ts
#!/usr/bin/env node
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { devCommand } from './commands/dev.js'
import { generateCommand } from './commands/generate.js'

const program = new Command()

program
  .name('preview')
  .description('Screen preview tool for React projects')
  .version('0.0.1')

program.addCommand(initCommand)
program.addCommand(devCommand)
program.addCommand(generateCommand)

program.parse()
```

**Step 3: Create stub commands**

```typescript
// packages/cli/src/commands/init.ts
import { Command } from 'commander'

export const initCommand = new Command('init')
  .description('Initialize preview tool in current project')
  .action(async () => {
    console.log('TODO: init command')
  })
```

```typescript
// packages/cli/src/commands/dev.ts
import { Command } from 'commander'

export const devCommand = new Command('dev')
  .description('Start preview dev server')
  .option('-p, --port <port>', 'Port number', '6100')
  .action(async (options) => {
    console.log('TODO: dev command on port', options.port)
  })
```

```typescript
// packages/cli/src/commands/generate.ts
import { Command } from 'commander'

export const generateCommand = new Command('generate')
  .description('Generate preview artifacts for discovered screens')
  .action(async () => {
    console.log('TODO: generate command')
  })
```

**Step 4: Verify CLI builds**

Run: `cd packages/cli && pnpm install && pnpm build`
Expected: Compiles to dist/.

Run: `node packages/cli/dist/index.js --help`
Expected: Shows help with init, dev, generate commands.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(cli): scaffold @preview-tool/cli with commander"
```

---

### Task 11: Implement `init` command

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/lib/config.ts`
- Create: `packages/cli/src/templates/preview-config.ts`

**Step 1: Create config types**

```typescript
// packages/cli/src/lib/config.ts
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export interface PreviewConfig {
  screenGlob: string
  port: number
  title: string
}

export const DEFAULT_CONFIG: PreviewConfig = {
  screenGlob: 'src/**/*.tsx',
  port: 6100,
  title: 'Preview Tool',
}

export const PREVIEW_DIR = '.preview'

export async function readConfig(cwd: string): Promise<PreviewConfig> {
  const configPath = join(cwd, PREVIEW_DIR, 'preview.config.json')
  if (!existsSync(configPath)) return DEFAULT_CONFIG
  const raw = await readFile(configPath, 'utf-8')
  return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
}

export async function writeConfig(cwd: string, config: PreviewConfig): Promise<void> {
  const dir = join(cwd, PREVIEW_DIR)
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'preview.config.json'),
    JSON.stringify(config, null, 2)
  )
}
```

**Step 2: Implement init command**

```typescript
// packages/cli/src/commands/init.ts
import { Command } from 'commander'
import prompts from 'prompts'
import chalk from 'chalk'
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { writeConfig, DEFAULT_CONFIG, PREVIEW_DIR } from '../lib/config.js'

export const initCommand = new Command('init')
  .description('Initialize preview tool in current project')
  .action(async () => {
    const cwd = process.cwd()
    console.log(chalk.bold('\n  @preview-tool/cli init\n'))

    // Check if already initialized
    if (existsSync(join(cwd, PREVIEW_DIR, 'preview.config.json'))) {
      console.log(chalk.yellow('  Already initialized. Run `preview generate` to regenerate.\n'))
      return
    }

    // Prompt for screen glob
    const response = await prompts([
      {
        type: 'text',
        name: 'screenGlob',
        message: 'Where are your screens?',
        initial: DEFAULT_CONFIG.screenGlob,
      },
      {
        type: 'number',
        name: 'port',
        message: 'Dev server port?',
        initial: DEFAULT_CONFIG.port,
      },
    ])

    if (!response.screenGlob) {
      console.log(chalk.red('  Cancelled.\n'))
      return
    }

    const config = {
      ...DEFAULT_CONFIG,
      screenGlob: response.screenGlob,
      port: response.port ?? DEFAULT_CONFIG.port,
    }

    // Create .preview/ directory structure
    const previewDir = join(cwd, PREVIEW_DIR)
    await mkdir(join(previewDir, 'adapters'), { recursive: true })
    await mkdir(join(previewDir, 'mocks'), { recursive: true })
    await mkdir(join(previewDir, 'interceptors'), { recursive: true })
    await mkdir(join(previewDir, 'overrides'), { recursive: true })
    await writeConfig(cwd, config)

    console.log(chalk.green('\n  Initialized .preview/ directory.'))
    console.log(chalk.dim('  Next: run `preview generate` to analyze screens.\n'))
  })
```

**Step 3: Build and test**

Run: `cd packages/cli && pnpm build`
Run: `cd /tmp && mkdir test-project && cd test-project && node /path/to/packages/cli/dist/index.js init`
Expected: Prompts for config, creates .preview/ directory.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(cli): implement init command with prompts"
```

---

### Task 12: Build AST analysis engine — screen discovery

**Files:**
- Create: `packages/cli/src/analyzer/discover.ts`
- Create: `packages/cli/src/analyzer/types.ts`

**Step 1: Create analyzer types**

```typescript
// packages/cli/src/analyzer/types.ts
export interface DiscoveredScreen {
  filePath: string           // absolute path to screen file
  route: string              // derived route (e.g., '/booking/search')
  pattern: 'mvc' | 'props' | 'hooks' | 'monolithic'
  viewFile?: string          // for MVC: path to view.tsx
  modelFile?: string         // for MVC: path to model.ts
  controllerFile?: string    // for MVC: path to controller.ts
  hookExports?: string[]     // for hooks pattern: names of exported hooks
}

export interface AnalyzedRegion {
  key: string
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  defaultCount?: number
  mockItems?: unknown[]
}

export interface AnalyzedFlow {
  trigger: string
  transition?: Record<string, string>
  delay?: number
  then?: Record<string, string>
  navigate?: string
}

export interface ScreenAnalysis {
  screen: DiscoveredScreen
  regions: Record<string, AnalyzedRegion>
  flows: AnalyzedFlow[]
}
```

**Step 2: Implement screen discovery**

```typescript
// packages/cli/src/analyzer/discover.ts
import { glob } from 'fs/promises'
import { join, dirname, basename, relative, sep } from 'path'
import { existsSync } from 'fs'
import type { DiscoveredScreen } from './types.js'

export async function discoverScreens(
  cwd: string,
  screenGlob: string
): Promise<DiscoveredScreen[]> {
  const files = await Array.fromAsync(
    glob(screenGlob, { cwd })
  )

  const screens: DiscoveredScreen[] = []

  for (const file of files) {
    const absPath = join(cwd, file)
    const dir = dirname(absPath)

    // Skip _shared, _test-helpers, node_modules
    if (file.includes('_shared') || file.includes('_test-helpers') || file.includes('node_modules')) {
      continue
    }

    // Derive route from path
    const route = deriveRoute(file, screenGlob)

    // Detect pattern
    const pattern = detectPattern(dir)

    screens.push({
      filePath: absPath,
      route,
      pattern: pattern.type,
      viewFile: pattern.viewFile,
      modelFile: pattern.modelFile,
      controllerFile: pattern.controllerFile,
    })
  }

  return screens
}

function deriveRoute(filePath: string, glob: string): string {
  // Extract the meaningful path segment
  // e.g., 'src/screens/booking/search/index.tsx' → '/booking/search'
  const parts = filePath.replace(/\\/g, '/').split('/')
  const srcIdx = parts.indexOf('screens')
  if (srcIdx === -1) {
    // Fallback: use directory name
    const dir = dirname(filePath)
    return '/' + basename(dir)
  }
  const meaningful = parts.slice(srcIdx + 1)
  // Remove filename
  if (meaningful[meaningful.length - 1].includes('.')) {
    meaningful.pop()
  }
  return '/' + meaningful.join('/')
}

function detectPattern(dir: string): {
  type: 'mvc' | 'props' | 'hooks' | 'monolithic'
  viewFile?: string
  modelFile?: string
  controllerFile?: string
} {
  const hasView = existsSync(join(dir, 'view.tsx'))
  const hasModel = existsSync(join(dir, 'model.ts'))
  const hasController = existsSync(join(dir, 'controller.ts'))

  if (hasView && hasModel) {
    return {
      type: 'mvc',
      viewFile: join(dir, 'view.tsx'),
      modelFile: join(dir, 'model.ts'),
      controllerFile: hasController ? join(dir, 'controller.ts') : undefined,
    }
  }

  // Further detection (hooks vs props vs monolithic) happens in the analyzer
  return { type: 'monolithic' }
}
```

**Step 3: Test discovery**

Write a quick test or run manually against apps/preview:

Run: `cd packages/cli && pnpm build`
Then create a test script that calls `discoverScreens('/path/to/apps/preview', 'src/screens/**/index.tsx')` and logs the output.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(cli): add screen discovery via glob + pattern detection"
```

---

### Task 13: Build AST analysis engine — component analyzer

**Files:**
- Create: `packages/cli/src/analyzer/analyze-component.ts`
- Create: `packages/cli/src/analyzer/mock-generator.ts`

**Step 1: Implement component analyzer with ts-morph**

```typescript
// packages/cli/src/analyzer/analyze-component.ts
import { Project, SyntaxKind, type SourceFile, type Node } from 'ts-morph'
import type { AnalyzedRegion, AnalyzedFlow, DiscoveredScreen, ScreenAnalysis } from './types.js'
import { generateMockValue } from './mock-generator.js'

export function analyzeScreen(screen: DiscoveredScreen): ScreenAnalysis {
  const project = new Project({ tsConfigFilePath: undefined })

  // For MVC: analyze model.ts for types, view.tsx for JSX
  // For monolithic: analyze the main file
  const targetFile = screen.modelFile ?? screen.filePath
  const sourceFile = project.addSourceFileAtPath(targetFile)

  const regions = extractRegions(sourceFile, screen)
  const flows = extractFlows(sourceFile, screen, project)

  return { screen, regions, flows }
}

function extractRegions(
  sourceFile: SourceFile,
  screen: DiscoveredScreen
): Record<string, AnalyzedRegion> {
  const regions: Record<string, AnalyzedRegion> = {}

  // Strategy 1: Analyze exported interfaces (MVC model.ts or Props interface)
  const interfaces = sourceFile.getInterfaces()
  for (const iface of interfaces) {
    const props = iface.getProperties()
    for (const prop of props) {
      const name = prop.getName()
      const type = prop.getType()
      const typeText = type.getText()

      // Boolean state → create a region with true/false states
      if (typeText === 'boolean') {
        const regionKey = name
        regions[regionKey] = {
          key: regionKey,
          label: camelToLabel(name),
          states: {
            [name + '_true']: { [name]: true },
            [name + '_false']: { [name]: false },
          },
          defaultState: name + '_false',
        }
      }

      // Array type → create a list region
      if (type.isArray()) {
        const regionKey = name
        const elementType = type.getArrayElementType()
        const mockItems = generateMockArray(name, elementType?.getText() ?? 'unknown', 20)
        regions[regionKey] = {
          key: regionKey,
          label: camelToLabel(name),
          isList: true,
          defaultCount: 3,
          mockItems,
          states: {
            empty: { [name]: [] },
            populated: { [name]: mockItems.slice(0, 3) },
            full: { [name]: mockItems },
          },
          defaultState: 'empty',
        }
      }

      // Nullable type → create region with null/present states
      if (typeText.includes('null')) {
        const regionKey = name
        regions[regionKey] = {
          key: regionKey,
          label: camelToLabel(name),
          states: {
            absent: { [name]: null },
            present: { [name]: generateMockValue(name, typeText.replace('| null', '').trim()) },
          },
          defaultState: 'absent',
        }
      }
    }
  }

  // Strategy 2: Analyze useState calls (monolithic)
  if (Object.keys(regions).length === 0) {
    const viewFile = screen.viewFile
      ? sourceFile.getProject().addSourceFileAtPath(screen.viewFile)
      : sourceFile

    const useStateCalls = viewFile.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => call.getExpression().getText() === 'useState')

    for (const call of useStateCalls) {
      const parent = call.getParent()
      if (!parent) continue

      // Try to extract variable name: const [xxx, setXxx] = useState(...)
      const text = parent.getText()
      const match = text.match(/\[\s*(\w+)\s*,/)
      if (!match) continue

      const name = match[1]
      const initialValue = call.getArguments()[0]?.getText() ?? 'undefined'

      if (initialValue === 'false' || initialValue === 'true') {
        regions[name] = {
          key: name,
          label: camelToLabel(name),
          states: {
            [name + '_true']: { [name]: true },
            [name + '_false']: { [name]: false },
          },
          defaultState: initialValue === 'false' ? name + '_false' : name + '_true',
        }
      } else if (initialValue === '[]') {
        regions[name] = {
          key: name,
          label: camelToLabel(name),
          isList: true,
          defaultCount: 3,
          states: {
            empty: { [name]: [] },
            populated: { [name]: [{ id: '1' }, { id: '2' }, { id: '3' }] },
          },
          defaultState: 'empty',
        }
      }
    }
  }

  // If no regions found at all, create a single default region
  if (Object.keys(regions).length === 0) {
    regions['default'] = {
      key: 'default',
      label: 'Screen',
      states: { default: {} },
      defaultState: 'default',
    }
  }

  return regions
}

function extractFlows(
  sourceFile: SourceFile,
  screen: DiscoveredScreen,
  project: Project
): AnalyzedFlow[] {
  const flows: AnalyzedFlow[] = []
  const viewFile = screen.viewFile
    ? project.addSourceFileAtPath(screen.viewFile)
    : sourceFile

  // Find onClick handlers that call navigate()
  const jsxAttributes = viewFile.getDescendantsOfKind(SyntaxKind.JsxAttribute)
  for (const attr of jsxAttributes) {
    if (attr.getName() !== 'onClick') continue
    const initializer = attr.getInitializer()
    if (!initializer) continue
    const text = initializer.getText()

    // Detect navigate('...')
    const navMatch = text.match(/navigate\(['"]([^'"]+)['"]\)/)
    if (navMatch) {
      // Try to infer trigger from surrounding JSX element
      const parent = attr.getParent()
      const trigger = inferTrigger(parent)
      flows.push({ trigger, navigate: navMatch[1] })
    }
  }

  return flows
}

function inferTrigger(jsxElement: Node | undefined): string {
  if (!jsxElement) return 'Unknown:click'
  const text = jsxElement.getText()
  // Try to find component name and text content
  const tagMatch = text.match(/<(\w+)/)
  const tag = tagMatch?.[1] ?? 'Element'
  return `${tag}:click`
}

function camelToLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}

function generateMockArray(name: string, elementType: string, count: number): unknown[] {
  // Simple mock array generation
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `${camelToLabel(name)} Item ${i + 1}`,
  }))
}
```

**Step 2: Implement mock value generator**

```typescript
// packages/cli/src/analyzer/mock-generator.ts

const FIELD_MOCKS: Record<string, unknown> = {
  name: 'Anna Mueller',
  firstName: 'Anna',
  lastName: 'Mueller',
  email: 'anna@example.de',
  phone: '+49 170 1234567',
  address: 'Berliner Str. 42, 10115 Berlin',
  title: 'Sample Title',
  description: 'A brief description of this item.',
  date: '2026-03-15',
  time: '14:30',
  price: 29.99,
  amount: 42.50,
  count: 5,
  total: 150.00,
  id: 'abc-123',
  url: 'https://example.com',
  image: 'https://picsum.photos/200',
  avatar: 'https://picsum.photos/40',
  status: 'active',
  type: 'standard',
  reason: 'Routine checkup',
  specialty: 'General Medicine',
  doctor: 'Dr. Sarah Weber',
  patient: 'Max Mustermann',
  location: 'Praxis Berlin Mitte',
}

export function generateMockValue(fieldName: string, typeText: string): unknown {
  // Check field name heuristics first
  const lowerName = fieldName.toLowerCase()
  for (const [key, value] of Object.entries(FIELD_MOCKS)) {
    if (lowerName.includes(key.toLowerCase())) {
      return value
    }
  }

  // Fall back to type-based generation
  if (typeText === 'string') return `Sample ${fieldName}`
  if (typeText === 'number') return 42
  if (typeText === 'boolean') return true
  if (typeText === 'Date') return '2026-03-15T14:30:00Z'

  return null
}
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(cli): add AST-based component analyzer and mock generator"
```

---

### Task 14: Build artifact generator (adapters + mocks)

**Files:**
- Create: `packages/cli/src/generator/generate-mock.ts`
- Create: `packages/cli/src/generator/generate-adapter.ts`
- Create: `packages/cli/src/generator/index.ts`

**Step 1: Implement mock file generator**

```typescript
// packages/cli/src/generator/generate-mock.ts
import type { ScreenAnalysis } from '../analyzer/types.js'

export function generateMockFile(analysis: ScreenAnalysis): string {
  const { screen, regions, flows } = analysis
  const routeParts = screen.route.split('/').filter(Boolean)
  const label = routeParts.map(p => capitalize(p)).join(' / ')

  let output = `// Auto-generated by @preview-tool/cli — do not edit\n`
  output += `// Regenerate with: pnpm preview generate\n\n`

  // Meta
  output += `export const meta = {\n`
  output += `  label: '${label}',\n`
  output += `  path: '${screen.filePath}',\n`
  output += `}\n\n`

  // Regions
  output += `export const regions = ${JSON.stringify(regions, null, 2)}\n\n`

  // Flows
  if (flows.length > 0) {
    output += `export const flows = ${JSON.stringify(flows, null, 2)}\n`
  } else {
    output += `export const flows = []\n`
  }

  return output
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
```

**Step 2: Implement adapter generator**

```typescript
// packages/cli/src/generator/generate-adapter.ts
import { relative, dirname } from 'path'
import type { DiscoveredScreen } from '../analyzer/types.js'

export function generateAdapterFile(
  screen: DiscoveredScreen,
  previewDir: string
): string {
  const mockId = screen.route.replace(/\//g, '--').replace(/^--/, '')
  const adapterDir = `${previewDir}/adapters`

  // Compute relative paths
  const screenImportPath = relative(adapterDir, screen.viewFile ?? screen.filePath)
    .replace(/\.tsx?$/, '')
    .replace(/\\/g, '/')
  const mockImportPath = `../mocks/${mockId}`

  let output = `// Auto-generated by @preview-tool/cli — do not edit\n`
  output += `import Screen from '${screenImportPath}'\n`
  output += `import { regions, flows } from '${mockImportPath}'\n\n`
  output += `export { regions, flows }\n\n`
  output += `export default Screen\n`

  return output
}
```

**Step 3: Create orchestrator**

```typescript
// packages/cli/src/generator/index.ts
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { discoverScreens } from '../analyzer/discover.js'
import { analyzeScreen } from '../analyzer/analyze-component.js'
import { generateMockFile } from './generate-mock.js'
import { generateAdapterFile } from './generate-adapter.js'
import type { PreviewConfig } from '../lib/config.js'

export async function generateAll(cwd: string, config: PreviewConfig): Promise<void> {
  const previewDir = join(cwd, '.preview')

  // 1. Discover screens
  const screens = await discoverScreens(cwd, config.screenGlob)
  console.log(`  Found ${screens.length} screens`)

  for (const screen of screens) {
    const mockId = screen.route.replace(/\//g, '--').replace(/^--/, '')

    // 2. Analyze
    const analysis = analyzeScreen(screen)

    // 3. Generate mock file
    const mockContent = generateMockFile(analysis)
    await mkdir(join(previewDir, 'mocks'), { recursive: true })
    await writeFile(join(previewDir, 'mocks', `${mockId}.ts`), mockContent)

    // 4. Generate adapter file
    const adapterContent = generateAdapterFile(screen, previewDir)
    await mkdir(join(previewDir, 'adapters'), { recursive: true })
    await writeFile(join(previewDir, 'adapters', `${mockId}.tsx`), adapterContent)

    console.log(`  Generated: ${screen.route}`)
  }
}
```

**Step 4: Wire into `generate` command**

```typescript
// packages/cli/src/commands/generate.ts
import { Command } from 'commander'
import chalk from 'chalk'
import { readConfig } from '../lib/config.js'
import { generateAll } from '../generator/index.js'

export const generateCommand = new Command('generate')
  .description('Generate preview artifacts for discovered screens')
  .action(async () => {
    const cwd = process.cwd()
    console.log(chalk.bold('\n  @preview-tool generate\n'))

    const config = await readConfig(cwd)
    await generateAll(cwd, config)

    console.log(chalk.green('\n  Done! Run `preview dev` to launch.\n'))
  })
```

**Step 5: Build and test**

Run: `cd packages/cli && pnpm build`
Run: `cd apps/preview && node ../cli/dist/index.js generate`
Expected: Generates .preview/mocks/ and .preview/adapters/ for all screens.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(cli): implement generate command with AST analysis and artifact generation"
```

---

### Task 15: Implement `dev` command — Vite dev server

**Files:**
- Modify: `packages/cli/src/commands/dev.ts`
- Create: `packages/cli/src/server/create-vite-config.ts`
- Create: `packages/cli/src/server/preview-entry.tsx` (template)

**Step 1: Create Vite config builder**

```typescript
// packages/cli/src/server/create-vite-config.ts
import { join, resolve } from 'path'
import type { InlineConfig } from 'vite'
import type { PreviewConfig } from '../lib/config.js'

export function createViteConfig(cwd: string, config: PreviewConfig): InlineConfig {
  const previewDir = join(cwd, '.preview')

  return {
    root: previewDir,
    server: {
      port: config.port,
      open: true,
    },
    resolve: {
      alias: {
        '@host': resolve(cwd, 'src'),
        '@preview': resolve(previewDir),
      },
    },
    plugins: [
      // React plugin will be imported
    ],
  }
}
```

**Step 2: Create preview entry template**

During `generate`, also create `.preview/index.html` and `.preview/main.tsx`:

```typescript
// Template: .preview/main.tsx
import { PreviewShell } from '@preview-tool/runtime'
import type { ScreenEntry } from '@preview-tool/runtime/types'

// Auto-import all generated adapters
const adapterModules = import.meta.glob('./adapters/*.tsx')
const mockModules = import.meta.glob('./mocks/*.ts', { eager: true })

// Build screen entries from generated files
const screens: ScreenEntry[] = Object.entries(adapterModules).map(([path, loader]) => {
  const id = path.match(/\.\/adapters\/(.+)\.tsx/)?.[1] ?? ''
  const route = '/' + id.replace(/--/g, '/')
  const mockPath = `./mocks/${id}.ts`
  const mock = mockModules[mockPath] as any

  return {
    route,
    module: loader as () => Promise<any>,
    regions: mock?.regions,
  }
})

// Render
import { createRoot } from 'react-dom/client'
createRoot(document.getElementById('root')!).render(
  <PreviewShell screens={screens} />
)
```

**Step 3: Implement dev command**

```typescript
// packages/cli/src/commands/dev.ts
import { Command } from 'commander'
import chalk from 'chalk'
import { createServer } from 'vite'
import { readConfig } from '../lib/config.js'
import { createViteConfig } from '../server/create-vite-config.js'

export const devCommand = new Command('dev')
  .description('Start preview dev server')
  .option('-p, --port <port>', 'Port number')
  .action(async (options) => {
    const cwd = process.cwd()
    const config = await readConfig(cwd)
    if (options.port) config.port = Number(options.port)

    console.log(chalk.bold(`\n  @preview-tool dev → http://localhost:${config.port}\n`))

    const viteConfig = createViteConfig(cwd, config)
    const server = await createServer(viteConfig)
    await server.listen()
    server.printUrls()
  })
```

**Step 4: Build and test**

Run: `cd packages/cli && pnpm build`
Run: `cd apps/preview && node ../cli/dist/index.js dev`
Expected: Vite dev server starts, opens browser, shows preview UI.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(cli): implement dev command with Vite dev server"
```

---

## Phase 4: Integration & Polish

### Task 16: Test against current preview-tool screens

**Step 1: Run the full flow on apps/preview**

```bash
cd apps/preview
node ../../packages/cli/dist/index.js init
node ../../packages/cli/dist/index.js generate
node ../../packages/cli/dist/index.js dev
```

**Step 2: Verify**

- Catalog lists all screens (booking/*, prescription/*, standalone)
- Clicking a screen renders it in the device frame
- Region state buttons work in the inspector
- Switching states changes the rendered content
- Device switching works (iPhone, Android, responsive)

**Step 3: Fix any issues**

Iterate on bugs discovered during integration.

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: integration fixes for preview-tool running against demo app"
```

---

### Task 17: Test against a fresh "host project"

**Step 1: Create a minimal host project**

```bash
mkdir /tmp/test-host-app
cd /tmp/test-host-app
pnpm init
pnpm add react react-dom
pnpm add -D typescript vite @vitejs/plugin-react
```

Create a few simple screen components (mix of props-driven and hook-based):

```typescript
// src/screens/dashboard/index.tsx
import { useState, useEffect } from 'react'

interface DashboardProps {
  userName?: string
}

export default function Dashboard({ userName }: DashboardProps) {
  const [items, setItems] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => {
      setItems(['Task 1', 'Task 2', 'Task 3'])
      setIsLoading(false)
    }, 1000)
  }, [])

  return (
    <div>
      <h1>Welcome, {userName ?? 'Guest'}</h1>
      {isLoading ? <p>Loading...</p> : (
        <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
      )}
    </div>
  )
}
```

**Step 2: Run preview-tool against it**

```bash
cd /tmp/test-host-app
pnpm add -D @preview-tool/cli
pnpm preview init
pnpm preview generate
pnpm preview dev
```

**Step 3: Verify**

- Dashboard screen appears in catalog
- Auto-generated regions detected (isLoading boolean, items array)
- State switching works
- No errors in console

**Step 4: Document any issues for follow-up**

---

### Task 18: Add `.preview/` to `.gitignore` template

**Files:**
- Modify: `packages/cli/src/commands/init.ts`

**Step 1: During init, suggest adding to .gitignore**

After creating .preview/, check if `.gitignore` exists and if `.preview/` is already in it. If not, prompt to add it.

```typescript
// In init command, after creating directories:
const gitignorePath = join(cwd, '.gitignore')
if (existsSync(gitignorePath)) {
  const content = await readFile(gitignorePath, 'utf-8')
  if (!content.includes('.preview')) {
    await appendFile(gitignorePath, '\n# Preview tool (auto-generated)\n.preview/adapters/\n.preview/mocks/\n.preview/interceptors/\n')
    console.log(chalk.dim('  Added .preview/ to .gitignore'))
  }
}
```

Note: Only gitignore auto-generated dirs. Keep `preview.config.json` and `overrides/` tracked.

**Step 2: Commit**

```bash
git add -A
git commit -m "feat(cli): auto-add generated dirs to .gitignore during init"
```

---

## Phase 5: Override System

### Task 19: Implement override merging

**Files:**
- Modify: `packages/cli/src/generator/index.ts`
- Create: `packages/cli/src/generator/merge-overrides.ts`

**Step 1: Implement override merger**

```typescript
// packages/cli/src/generator/merge-overrides.ts
import { existsSync } from 'fs'
import { join } from 'path'

export async function loadOverrides(
  previewDir: string,
  mockId: string
): Promise<{ regions?: Record<string, unknown>; flows?: unknown[] } | null> {
  const overridePath = join(previewDir, 'overrides', `${mockId}.ts`)
  if (!existsSync(overridePath)) return null

  // Dynamic import the override file
  try {
    const mod = await import(overridePath)
    return {
      regions: mod.regions,
      flows: mod.flows,
    }
  } catch {
    return null
  }
}

export function mergeRegions(
  generated: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  // Override regions replace generated ones by key; unmatched keys kept from generated
  return { ...generated, ...overrides }
}
```

**Step 2: Wire into generation**

In `generateAll()`, after generating mocks, check for overrides and merge.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(cli): support .preview/overrides/ for manual mock refinement"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| **Phase 1** | Tasks 1 | Monorepo structure, existing app preserved |
| **Phase 2** | Tasks 2–9 | `@preview-tool/runtime` package with all UI components |
| **Phase 3** | Tasks 10–15 | `@preview-tool/cli` with init, generate, dev commands |
| **Phase 4** | Tasks 16–18 | Integration testing, .gitignore, polish |
| **Phase 5** | Task 19 | Override system for manual mock refinement |

**Total: 19 tasks across 5 phases.**

After completing all phases, any React project can:
```bash
pnpm add -D @preview-tool/cli
pnpm preview init
pnpm preview generate
pnpm preview dev
```
And get a full preview environment with auto-detected regions, states, and flows — without touching a single line of their screen code.

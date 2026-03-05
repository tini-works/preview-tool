# Preview Tool v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the CLI analyzer and generator to use hook-boundary mocking with multi-signal screen discovery, producing a zero-config Figma-like preview that works on any React codebase.

**Architecture:** CLI scans the target project for screens (via router parsing + file scoring), extracts hooks from each screen, classifies them, generates mock modules that read from a Zustand-powered `usePreviewRegion` hook, and wires everything through Vite aliases. The runtime inspector renders region controls derived from hook analysis.

**Tech Stack:** TypeScript, ts-morph (AST), Commander (CLI), Zod (validation), Zustand (state), Vite (dev server), React 19, pnpm workspace monorepo.

---

## Phase 1: Foundation — Types & Cleanup

### Task 1: Define v2 type system

**Files:**
- Create: `packages/cli/src/analyzer/types.ts` (overwrite existing)

**Step 1: Write the type definitions**

```ts
// packages/cli/src/analyzer/types.ts

// ─── Screen Discovery ───

export interface DiscoveredScreen {
  readonly name: string
  readonly path: string        // route path, e.g. '/dashboard'
  readonly file: string        // relative file path, e.g. 'src/screens/Dashboard.tsx'
  readonly score: number       // discovery confidence score
  readonly source: 'router' | 'convention' | 'heuristic'
}

export interface RouterRoute {
  readonly path: string
  readonly componentFile: string   // resolved file path
  readonly componentName: string   // import name
}

// ─── Hook Analysis ───

export type HookCategory =
  | 'data-fetching'
  | 'auth'
  | 'navigation'
  | 'i18n'
  | 'state'
  | 'custom'
  | 'unknown'

export interface ExtractedHook {
  readonly hookName: string        // e.g. 'useQuery', 'useAuth'
  readonly importPath: string      // e.g. '@tanstack/react-query', '@/hooks/useAuth'
  readonly callArgs: string[]      // e.g. ['tasks'] for useQuery('tasks')
  readonly isProjectLocal: boolean // true if imported from project, not node_modules
}

export interface ClassifiedHook extends ExtractedHook {
  readonly category: HookCategory
  readonly regionName: string      // derived name for the inspector region
  readonly states: readonly string[]         // inferred states
  readonly defaultState: string
  readonly isList: boolean         // true if hook data rendered as list
  readonly returnShape: HookReturnShape | null
}

export interface HookReturnShape {
  readonly fields: readonly HookReturnField[]
}

export interface HookReturnField {
  readonly name: string
  readonly type: string            // 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown'
  readonly nullable: boolean
}

// ─── Regions (derived from hooks) ───

export interface ScreenRegion {
  readonly name: string
  readonly label: string           // human-readable label for inspector
  readonly source: string          // e.g. 'useQuery("tasks")'
  readonly states: readonly string[]
  readonly defaultState: string
  readonly isList: boolean
  readonly mockData: Record<string, Record<string, unknown>>  // state → mock data
}

// ─── Screen Analysis Result ───

export interface ScreenAnalysisResult {
  readonly screen: DiscoveredScreen
  readonly hooks: readonly ClassifiedHook[]
  readonly regions: readonly ScreenRegion[]
}

// ─── Generation Output ───

export interface GenerationManifest {
  readonly screens: readonly ScreenManifestEntry[]
  readonly aliases: Record<string, string>     // import path → mock path
  readonly mocksDir: string
}

export interface ScreenManifestEntry {
  readonly name: string
  readonly path: string
  readonly file: string
  readonly regions: readonly ScreenRegion[]
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/analyzer/types.ts
git commit -m "feat(cli): define v2 type system for hook-boundary mocking"
```

---

### Task 2: Clean up v1 analyzer and generator files

**Files:**
- Delete: `packages/cli/src/analyzer/analyze-component.ts`
- Delete: `packages/cli/src/analyzer/analyze-view.ts`
- Delete: `packages/cli/src/analyzer/analyze-hooks.ts`
- Delete: `packages/cli/src/generator/generate-view.ts`
- Delete: `packages/cli/src/generator/generate-model.ts`
- Delete: `packages/cli/src/generator/generate-controller.ts`
- Delete: `packages/cli/src/generator/generate-mock.ts`
- Delete: `packages/cli/src/generator/format-utils.ts`
- Delete: `packages/cli/src/generator/merge-overrides.ts`
- Delete: `packages/cli/src/generator/generate-mock-hooks.ts`
- Delete: `packages/cli/src/generator/generate-mock-stores.ts`
- Delete: `packages/cli/src/generator/index.ts`
- Delete: `packages/cli/src/llm/` (entire directory)

**Step 1: Remove old files**

```bash
rm packages/cli/src/analyzer/analyze-component.ts
rm packages/cli/src/analyzer/analyze-view.ts
rm packages/cli/src/analyzer/analyze-hooks.ts
rm packages/cli/src/generator/generate-view.ts
rm packages/cli/src/generator/generate-model.ts
rm packages/cli/src/generator/generate-controller.ts
rm packages/cli/src/generator/generate-mock.ts
rm packages/cli/src/generator/format-utils.ts
rm packages/cli/src/generator/merge-overrides.ts
rm packages/cli/src/generator/generate-mock-hooks.ts
rm packages/cli/src/generator/generate-mock-stores.ts
rm packages/cli/src/generator/index.ts
rm -rf packages/cli/src/llm/
```

**Step 2: Keep useful files**

Keep these files — they are still needed:
- `packages/cli/src/analyzer/discover.ts` (will be reworked in Task 3-5)
- `packages/cli/src/analyzer/mock-generator.ts` (field heuristics are useful)
- `packages/cli/src/generator/generate-entry.ts` (will be updated)
- `packages/cli/src/generator/generate-alias.ts` (will be reworked — create if doesn't exist)

**Step 3: Commit**

```bash
git add -A
git commit -m "chore(cli): remove v1 analyzer, generator, and LLM integration"
```

---

## Phase 2: Screen Discovery

### Task 3: Router parser — extract routes from react-router config

**Files:**
- Create: `packages/cli/src/analyzer/parse-router.ts`
- Create: `packages/cli/src/analyzer/__tests__/parse-router.test.ts`

**Step 1: Write the failing test**

```ts
// packages/cli/src/analyzer/__tests__/parse-router.test.ts
import { describe, it, expect } from 'vitest'
import { parseRouterRoutes } from '../parse-router.ts'
import path from 'node:path'

describe('parseRouterRoutes', () => {
  it('returns empty array when no router file found', async () => {
    const routes = await parseRouterRoutes('/nonexistent/path')
    expect(routes).toEqual([])
  })

  it('extracts routes from createBrowserRouter', async () => {
    const fixturePath = path.resolve(__dirname, '../../test-fixtures/router-app')
    const routes = await parseRouterRoutes(fixturePath)
    expect(routes.length).toBeGreaterThan(0)
    expect(routes[0]).toHaveProperty('path')
    expect(routes[0]).toHaveProperty('componentFile')
    expect(routes[0]).toHaveProperty('componentName')
  })

  it('extracts routes from JSX Route elements', async () => {
    const fixturePath = path.resolve(__dirname, '../../test-fixtures/jsx-router-app')
    const routes = await parseRouterRoutes(fixturePath)
    expect(routes.length).toBeGreaterThan(0)
  })
})
```

**Step 2: Create test fixtures**

Create `packages/cli/test-fixtures/router-app/src/router.tsx`:
```tsx
import { createBrowserRouter } from 'react-router-dom'
import Dashboard from './screens/Dashboard'
import Settings from './screens/Settings'
import Login from './screens/Login'

export const router = createBrowserRouter([
  { path: '/', element: <Dashboard /> },
  { path: '/settings', element: <Settings /> },
  { path: '/login', element: <Login /> },
])
```

Create `packages/cli/test-fixtures/jsx-router-app/src/App.tsx`:
```tsx
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Profile from './pages/Profile'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/profile" element={<Profile />} />
    </Routes>
  )
}
```

Create minimal screen components for each fixture (empty React components).

**Step 3: Run test to verify it fails**

```bash
cd packages/cli && npx vitest run src/analyzer/__tests__/parse-router.test.ts
```

Expected: FAIL — `parseRouterRoutes` not defined

**Step 4: Implement parse-router.ts**

```ts
// packages/cli/src/analyzer/parse-router.ts
import { Project, SyntaxKind, type SourceFile, type Node } from 'ts-morph'
import { glob } from 'glob'
import path from 'node:path'
import fs from 'node:fs'
import type { RouterRoute } from './types.ts'

export async function parseRouterRoutes(cwd: string): Promise<RouterRoute[]> {
  const routerFiles = await findRouterFiles(cwd)
  if (routerFiles.length === 0) return []

  const project = new Project({ compilerOptions: { allowJs: true } })
  const routes: RouterRoute[] = []

  for (const file of routerFiles) {
    const sourceFile = project.addSourceFileAtPath(file)
    const fileRoutes = extractRoutes(sourceFile, cwd)
    routes.push(...fileRoutes)
  }

  return routes
}

async function findRouterFiles(cwd: string): Promise<string[]> {
  const candidates = await glob('src/**/*.{tsx,ts,jsx,js}', {
    cwd,
    absolute: true,
    ignore: ['**/node_modules/**', '**/__tests__/**'],
  })

  const routerFiles: string[] = []
  for (const file of candidates) {
    const content = fs.readFileSync(file, 'utf-8')
    if (
      content.includes('createBrowserRouter') ||
      content.includes('createHashRouter') ||
      content.includes('<Route') ||
      content.includes('<Routes')
    ) {
      routerFiles.push(file)
    }
  }
  return routerFiles
}

function extractRoutes(sourceFile: SourceFile, cwd: string): RouterRoute[] {
  const routes: RouterRoute[] = []
  const importMap = buildImportMap(sourceFile)

  // Strategy 1: createBrowserRouter([...])
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
  for (const call of callExpressions) {
    const name = call.getExpression().getText()
    if (name === 'createBrowserRouter' || name === 'createHashRouter') {
      const args = call.getArguments()
      if (args.length > 0) {
        extractFromArrayLiteral(args[0], routes, importMap, cwd, sourceFile)
      }
    }
  }

  // Strategy 2: <Route path="..." element={<Component />} />
  const jsxElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
  for (const jsx of jsxElements) {
    const tagName = jsx.getTagNameNode().getText()
    if (tagName === 'Route') {
      const route = extractFromJsxRoute(jsx, importMap, cwd, sourceFile)
      if (route) routes.push(route)
    }
  }

  return routes
}

function buildImportMap(sourceFile: SourceFile): Map<string, string> {
  const map = new Map<string, string>()
  for (const imp of sourceFile.getImportDeclarations()) {
    const modulePath = imp.getModuleSpecifierValue()
    const defaultImport = imp.getDefaultImport()
    if (defaultImport) {
      map.set(defaultImport.getText(), modulePath)
    }
    for (const named of imp.getNamedImports()) {
      map.set(named.getName(), modulePath)
    }
  }
  return map
}

function extractFromArrayLiteral(
  node: Node,
  routes: RouterRoute[],
  importMap: Map<string, string>,
  cwd: string,
  sourceFile: SourceFile,
): void {
  if (node.getKind() !== SyntaxKind.ArrayLiteralExpression) return

  for (const element of node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements()) {
    if (element.getKind() !== SyntaxKind.ObjectLiteralExpression) continue
    const obj = element.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)

    let routePath: string | null = null
    let componentName: string | null = null

    for (const prop of obj.getProperties()) {
      if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue
      const assignment = prop.asKindOrThrow(SyntaxKind.PropertyAssignment)
      const propName = assignment.getName()

      if (propName === 'path') {
        routePath = assignment.getInitializer()?.getText().replace(/['"]/g, '') ?? null
      }
      if (propName === 'element') {
        const init = assignment.getInitializer()
        if (init) {
          componentName = extractComponentNameFromJsx(init)
        }
      }
    }

    if (routePath && componentName) {
      const importPath = importMap.get(componentName)
      if (importPath) {
        const resolved = resolveImportToFile(importPath, sourceFile.getFilePath(), cwd)
        if (resolved) {
          routes.push({
            path: routePath,
            componentFile: path.relative(cwd, resolved),
            componentName,
          })
        }
      }
    }
  }
}

function extractFromJsxRoute(
  jsx: Node,
  importMap: Map<string, string>,
  cwd: string,
  sourceFile: SourceFile,
): RouterRoute | null {
  let routePath: string | null = null
  let componentName: string | null = null

  for (const attr of jsx.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    const name = attr.getNameNode().getText()
    const value = attr.getInitializer()

    if (name === 'path' && value) {
      routePath = value.getText().replace(/['"{}]/g, '')
    }
    if (name === 'element' && value) {
      componentName = extractComponentNameFromJsx(value)
    }
  }

  if (routePath && componentName) {
    const importPath = importMap.get(componentName)
    if (importPath) {
      const resolved = resolveImportToFile(importPath, sourceFile.getFilePath(), cwd)
      if (resolved) {
        return {
          path: routePath,
          componentFile: path.relative(cwd, resolved),
          componentName,
        }
      }
    }
  }
  return null
}

function extractComponentNameFromJsx(node: Node): string | null {
  const text = node.getText()
  const match = text.match(/<(\w+)/)
  return match ? match[1] : null
}

function resolveImportToFile(
  importPath: string,
  fromFile: string,
  cwd: string,
): string | null {
  if (!importPath.startsWith('.')) {
    // Absolute import like '@/screens/Dashboard' — resolve via common aliases
    const aliasResolutions = [
      importPath.replace(/^@\//, 'src/'),
      importPath.replace(/^~\//, 'src/'),
    ]
    for (const resolved of aliasResolutions) {
      const candidates = [
        path.join(cwd, resolved + '.tsx'),
        path.join(cwd, resolved + '.ts'),
        path.join(cwd, resolved + '/index.tsx'),
        path.join(cwd, resolved + '/index.ts'),
      ]
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate
      }
    }
    return null
  }

  const dir = path.dirname(fromFile)
  const candidates = [
    path.resolve(dir, importPath + '.tsx'),
    path.resolve(dir, importPath + '.ts'),
    path.resolve(dir, importPath + '/index.tsx'),
    path.resolve(dir, importPath + '/index.ts'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}
```

**Step 5: Run test to verify it passes**

```bash
cd packages/cli && npx vitest run src/analyzer/__tests__/parse-router.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/cli/src/analyzer/parse-router.ts packages/cli/src/analyzer/__tests__/parse-router.test.ts packages/cli/test-fixtures/router-app/ packages/cli/test-fixtures/jsx-router-app/
git commit -m "feat(cli): add router parser for react-router route extraction"
```

---

### Task 4: File scorer — score individual .tsx files

**Files:**
- Create: `packages/cli/src/analyzer/score-file.ts`
- Create: `packages/cli/src/analyzer/__tests__/score-file.test.ts`

**Step 1: Write the failing test**

```ts
// packages/cli/src/analyzer/__tests__/score-file.test.ts
import { describe, it, expect } from 'vitest'
import { scoreFile } from '../score-file.ts'

describe('scoreFile', () => {
  it('scores high for file in screens/ directory', () => {
    const score = scoreFile('src/screens/Dashboard/index.tsx', '', [])
    expect(score).toBeGreaterThanOrEqual(30)
  })

  it('scores high for file named *Page.tsx', () => {
    const score = scoreFile('src/components/HomePage.tsx', '', [])
    expect(score).toBeGreaterThanOrEqual(20)
  })

  it('scores low for utility files', () => {
    const score = scoreFile('src/utils/format.ts', '', [])
    expect(score).toBeLessThan(30)
  })

  it('scores high for file with routing hooks', () => {
    const content = `
      import { useParams, useNavigate } from 'react-router-dom'
      export default function Screen() { return <div /> }
    `
    const score = scoreFile('src/components/Detail.tsx', content, [])
    expect(score).toBeGreaterThanOrEqual(30)
  })

  it('scores 50+ for route-referenced components', () => {
    const score = scoreFile('src/screens/Login.tsx', '', ['/login'])
    expect(score).toBeGreaterThanOrEqual(50)
  })

  it('gives bonus for data-fetching hooks', () => {
    const content = `
      import { useQuery } from '@tanstack/react-query'
      export default function Dashboard() { return <div /> }
    `
    const withHook = scoreFile('src/components/Dashboard.tsx', content, [])
    const without = scoreFile('src/components/Dashboard.tsx', '', [])
    expect(withHook).toBeGreaterThan(without)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd packages/cli && npx vitest run src/analyzer/__tests__/score-file.test.ts
```

**Step 3: Implement score-file.ts**

```ts
// packages/cli/src/analyzer/score-file.ts
import path from 'node:path'

const SCREEN_DIRS = /\/(screens|pages|views|routes)\//i
const SCREEN_NAMES = /(?:Page|Screen|View)\.tsx$/i
const ROUTING_HOOKS = /\buse(?:Params|Navigate|Router|Location|SearchParams|Match)\b/
const DATA_HOOKS = /\buse(?:Query|SWR|Fetch|AppLiveQuery|LiveQuery)\b/
const DEFAULT_EXPORT = /export\s+default\s+(?:function|class|const)\s/
const INDEX_IN_FOLDER = /\/[A-Z][a-zA-Z]+\/index\.tsx$/

export function scoreFile(
  filePath: string,
  content: string,
  routeReferencedFiles: string[],
): number {
  let score = 0

  // +50: Referenced in router config
  const normalizedPath = filePath.replace(/\\/g, '/')
  if (routeReferencedFiles.some(r => normalizedPath.includes(r))) {
    score += 50
  }

  // +30: In conventional screen directory
  if (SCREEN_DIRS.test(normalizedPath)) {
    score += 30
  }

  // +20: Named *Page.tsx, *Screen.tsx, *View.tsx
  const fileName = path.basename(filePath)
  if (SCREEN_NAMES.test(fileName)) {
    score += 20
  }

  // +15: Uses routing hooks
  if (ROUTING_HOOKS.test(content)) {
    score += 15
  }

  // +15: Has default export (screens are typically default exports)
  if (DEFAULT_EXPORT.test(content)) {
    score += 15
  }

  // +10: Uses data-fetching hooks
  if (DATA_HOOKS.test(content)) {
    score += 10
  }

  // +10: Is index.tsx in a named folder
  if (INDEX_IN_FOLDER.test(normalizedPath)) {
    score += 10
  }

  return score
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/cli && npx vitest run src/analyzer/__tests__/score-file.test.ts
```

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/score-file.ts packages/cli/src/analyzer/__tests__/score-file.test.ts
git commit -m "feat(cli): add file scorer for multi-signal screen detection"
```

---

### Task 5: Screen discovery orchestrator

**Files:**
- Create: `packages/cli/src/analyzer/discover-screens.ts` (replaces old discover.ts)
- Create: `packages/cli/src/analyzer/__tests__/discover-screens.test.ts`

**Step 1: Write the failing test**

```ts
// packages/cli/src/analyzer/__tests__/discover-screens.test.ts
import { describe, it, expect } from 'vitest'
import { discoverScreens } from '../discover-screens.ts'
import path from 'node:path'

describe('discoverScreens', () => {
  const sampleApp = path.resolve(__dirname, '../../../test-fixtures/sample-app')

  it('discovers screens from sample app', async () => {
    const screens = await discoverScreens(sampleApp)
    expect(screens.length).toBeGreaterThan(0)
  })

  it('returns screens with required fields', async () => {
    const screens = await discoverScreens(sampleApp)
    for (const screen of screens) {
      expect(screen).toHaveProperty('name')
      expect(screen).toHaveProperty('path')
      expect(screen).toHaveProperty('file')
      expect(screen).toHaveProperty('score')
      expect(screen).toHaveProperty('source')
      expect(screen.score).toBeGreaterThanOrEqual(30)
    }
  })

  it('finds Dashboard and Settings screens', async () => {
    const screens = await discoverScreens(sampleApp)
    const names = screens.map(s => s.name)
    expect(names).toContain('Dashboard')
    expect(names).toContain('Settings')
  })

  it('excludes utility files and components', async () => {
    const screens = await discoverScreens(sampleApp)
    const files = screens.map(s => s.file)
    for (const file of files) {
      expect(file).not.toMatch(/\/(components|utils|hooks|lib)\//i)
    }
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd packages/cli && npx vitest run src/analyzer/__tests__/discover-screens.test.ts
```

**Step 3: Implement discover-screens.ts**

```ts
// packages/cli/src/analyzer/discover-screens.ts
import { glob } from 'glob'
import path from 'node:path'
import fs from 'node:fs'
import type { DiscoveredScreen } from './types.ts'
import { parseRouterRoutes } from './parse-router.ts'
import { scoreFile } from './score-file.ts'

const EXCLUDE_DIRS = [
  'node_modules', '__tests__', '__mocks__', '.preview',
  'components', 'ui', 'hooks', 'lib', 'utils', 'stores',
  'types', 'styles', 'assets', 'constants', 'config',
]

const SCREEN_THRESHOLD = 30

export async function discoverScreens(cwd: string): Promise<DiscoveredScreen[]> {
  // Step 1: Parse router for route → component mappings
  const routerRoutes = await parseRouterRoutes(cwd)
  const routeReferencedFiles = routerRoutes.map(r => r.componentFile)

  // Step 2: Build screens from router (highest confidence)
  const routerScreens: DiscoveredScreen[] = routerRoutes.map(route => ({
    name: deriveScreenName(route.componentName),
    path: route.path,
    file: route.componentFile,
    score: 100,
    source: 'router' as const,
  }))

  // Step 3: Find all .tsx files and score them
  const allFiles = await glob('src/**/*.{tsx,jsx}', {
    cwd,
    ignore: EXCLUDE_DIRS.map(d => `**/${d}/**`),
  })

  const routerFileSet = new Set(routerRoutes.map(r => r.componentFile))
  const scoredScreens: DiscoveredScreen[] = []

  for (const file of allFiles) {
    // Skip files already found via router
    if (routerFileSet.has(file)) continue

    // Skip test files
    if (file.includes('.test.') || file.includes('.spec.')) continue

    const fullPath = path.join(cwd, file)
    const content = fs.readFileSync(fullPath, 'utf-8')
    const score = scoreFile(file, content, routeReferencedFiles)

    if (score >= SCREEN_THRESHOLD) {
      scoredScreens.push({
        name: deriveScreenName(file),
        path: deriveRoutePath(file),
        file,
        score,
        source: score >= 50 ? 'convention' : 'heuristic',
      })
    }
  }

  // Step 4: Deduplicate by file path and sort by score
  const allScreens = [...routerScreens, ...scoredScreens]
  const seen = new Set<string>()
  const deduped = allScreens.filter(s => {
    if (seen.has(s.file)) return false
    seen.add(s.file)
    return true
  })

  return deduped.sort((a, b) => b.score - a.score)
}

function deriveScreenName(fileOrName: string): string {
  // If it's a component name (no slashes), return as-is
  if (!fileOrName.includes('/')) return fileOrName

  // Extract name from file path
  const parsed = path.parse(fileOrName)
  if (parsed.name === 'index') {
    // Use parent directory name
    return formatName(path.basename(parsed.dir))
  }
  return formatName(parsed.name)
}

function formatName(raw: string): string {
  return raw
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, '')
}

function deriveRoutePath(filePath: string): string {
  let route = filePath
    .replace(/^src\/(screens|pages|views|routes)\//, '/')
    .replace(/\/(index)\.(tsx|jsx|ts|js)$/, '')
    .replace(/\.(tsx|jsx|ts|js)$/, '')

  if (!route.startsWith('/')) route = '/' + route
  // Clean up: src/screens/dashboard/index.tsx → /dashboard
  route = route
    .replace(/^\/src\//, '/')
    .replace(/\/+/g, '/')

  if (route === '/') return '/'
  return route.replace(/\/$/, '')
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/cli && npx vitest run src/analyzer/__tests__/discover-screens.test.ts
```

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/discover-screens.ts packages/cli/src/analyzer/__tests__/discover-screens.test.ts
git commit -m "feat(cli): add multi-signal screen discovery orchestrator"
```

---

## Phase 3: Hook Analysis

### Task 6: Hook extractor — find all hooks in a screen file

**Files:**
- Create: `packages/cli/src/analyzer/extract-hooks.ts`
- Create: `packages/cli/src/analyzer/__tests__/extract-hooks.test.ts`

**Step 1: Write the failing test**

```ts
// packages/cli/src/analyzer/__tests__/extract-hooks.test.ts
import { describe, it, expect } from 'vitest'
import { extractHooks } from '../extract-hooks.ts'

describe('extractHooks', () => {
  it('extracts useQuery hook with args', () => {
    const source = `
      import { useQuery } from '@tanstack/react-query'
      export default function Dashboard() {
        const { data } = useQuery({ queryKey: ['tasks'] })
        return <div>{data}</div>
      }
    `
    const hooks = extractHooks(source, 'Dashboard.tsx')
    expect(hooks).toContainEqual(expect.objectContaining({
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
    }))
  })

  it('extracts custom hooks from project', () => {
    const source = `
      import { useAuth } from '@/hooks/useAuth'
      export default function Screen() {
        const { user } = useAuth()
        return <div>{user.name}</div>
      }
    `
    const hooks = extractHooks(source, 'Screen.tsx')
    expect(hooks).toContainEqual(expect.objectContaining({
      hookName: 'useAuth',
      importPath: '@/hooks/useAuth',
      isProjectLocal: true,
    }))
  })

  it('ignores React built-in hooks', () => {
    const source = `
      import { useState, useEffect } from 'react'
      export default function Screen() {
        const [count, setCount] = useState(0)
        useEffect(() => {}, [])
        return <div>{count}</div>
      }
    `
    const hooks = extractHooks(source, 'Screen.tsx')
    const hookNames = hooks.map(h => h.hookName)
    expect(hookNames).not.toContain('useState')
    expect(hookNames).not.toContain('useEffect')
  })

  it('extracts useTranslation', () => {
    const source = `
      import { useTranslation } from 'react-i18next'
      export default function Screen() {
        const { t } = useTranslation()
        return <div>{t('hello')}</div>
      }
    `
    const hooks = extractHooks(source, 'Screen.tsx')
    expect(hooks).toContainEqual(expect.objectContaining({
      hookName: 'useTranslation',
      importPath: 'react-i18next',
    }))
  })
})
```

**Step 2: Run test, verify fails. Step 3: Implement.**

```ts
// packages/cli/src/analyzer/extract-hooks.ts
import { Project, SyntaxKind } from 'ts-morph'
import type { ExtractedHook } from './types.ts'

const REACT_BUILTIN_HOOKS = new Set([
  'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef',
  'useReducer', 'useContext', 'useLayoutEffect', 'useImperativeHandle',
  'useDebugValue', 'useDeferredValue', 'useTransition', 'useId',
  'useSyncExternalStore', 'useInsertionEffect', 'useOptimistic',
  'useActionState', 'useFormStatus',
])

const PROJECT_LOCAL_PATTERNS = [
  /^@\//,      // @/hooks/useAuth
  /^~\//,      // ~/hooks/useAuth
  /^\.\//,     // ./hooks/useAuth
  /^\.\.\//,   // ../hooks/useAuth
  /^src\//,    // src/hooks/useAuth
]

export function extractHooks(source: string, filePath: string): ExtractedHook[] {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, source)

  // Build import map: identifier → module path
  const importMap = new Map<string, string>()
  for (const imp of sourceFile.getImportDeclarations()) {
    const modulePath = imp.getModuleSpecifierValue()
    const defaultImport = imp.getDefaultImport()
    if (defaultImport) {
      importMap.set(defaultImport.getText(), modulePath)
    }
    for (const named of imp.getNamedImports()) {
      importMap.set(named.getName(), modulePath)
    }
  }

  // Find all hook calls (functions starting with 'use')
  const hooks: ExtractedHook[] = []
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

  for (const call of callExpressions) {
    const callee = call.getExpression().getText()

    // Must start with 'use' (React hook convention)
    if (!callee.startsWith('use')) continue

    // Skip React built-in hooks
    if (REACT_BUILTIN_HOOKS.has(callee)) continue

    const importPath = importMap.get(callee) ?? 'unknown'
    const callArgs = call.getArguments().map(a => {
      const text = a.getText()
      return text.replace(/['"]/g, '')
    })

    const isProjectLocal = PROJECT_LOCAL_PATTERNS.some(p => p.test(importPath))

    hooks.push({
      hookName: callee,
      importPath,
      callArgs,
      isProjectLocal,
    })
  }

  return hooks
}
```

**Step 4: Run test, verify passes. Step 5: Commit.**

```bash
git add packages/cli/src/analyzer/extract-hooks.ts packages/cli/src/analyzer/__tests__/extract-hooks.test.ts
git commit -m "feat(cli): add hook extractor for screen analysis"
```

---

### Task 7: Hook classifier — categorize hooks and infer states

**Files:**
- Create: `packages/cli/src/analyzer/classify-hook.ts`
- Create: `packages/cli/src/analyzer/__tests__/classify-hook.test.ts`

**Step 1: Write the failing test**

```ts
// packages/cli/src/analyzer/__tests__/classify-hook.test.ts
import { describe, it, expect } from 'vitest'
import { classifyHook } from '../classify-hook.ts'
import type { ExtractedHook } from '../types.ts'

describe('classifyHook', () => {
  it('classifies useQuery as data-fetching with 4 states', () => {
    const hook: ExtractedHook = {
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      callArgs: ['tasks'],
      isProjectLocal: false,
    }
    const result = classifyHook(hook)
    expect(result.category).toBe('data-fetching')
    expect(result.states).toEqual(['loading', 'error', 'empty', 'populated'])
    expect(result.defaultState).toBe('populated')
  })

  it('classifies useAuth as auth with 2 states', () => {
    const hook: ExtractedHook = {
      hookName: 'useAuth',
      importPath: '@/hooks/useAuth',
      callArgs: [],
      isProjectLocal: true,
    }
    const result = classifyHook(hook)
    expect(result.category).toBe('auth')
    expect(result.states).toEqual(['authenticated', 'unauthenticated'])
  })

  it('classifies useNavigate as navigation', () => {
    const hook: ExtractedHook = {
      hookName: 'useNavigate',
      importPath: 'react-router-dom',
      callArgs: [],
      isProjectLocal: false,
    }
    const result = classifyHook(hook)
    expect(result.category).toBe('navigation')
  })

  it('classifies useTranslation as i18n', () => {
    const hook: ExtractedHook = {
      hookName: 'useTranslation',
      importPath: 'react-i18next',
      callArgs: [],
      isProjectLocal: false,
    }
    const result = classifyHook(hook)
    expect(result.category).toBe('i18n')
  })

  it('classifies unknown project hooks as custom', () => {
    const hook: ExtractedHook = {
      hookName: 'useBookings',
      importPath: '@/hooks/useBookings',
      callArgs: [],
      isProjectLocal: true,
    }
    const result = classifyHook(hook)
    expect(result.category).toBe('custom')
  })
})
```

**Step 2: Run test, verify fails. Step 3: Implement.**

```ts
// packages/cli/src/analyzer/classify-hook.ts
import type { ExtractedHook, ClassifiedHook, HookCategory } from './types.ts'

interface HookPattern {
  readonly match: (hook: ExtractedHook) => boolean
  readonly category: HookCategory
  readonly states: readonly string[]
  readonly defaultState: string
  readonly isList: boolean
}

const HOOK_PATTERNS: readonly HookPattern[] = [
  // Data fetching hooks
  {
    match: h => /^use(Query|SWR|Fetch|AppLiveQuery|LiveQuery)$/.test(h.hookName),
    category: 'data-fetching',
    states: ['loading', 'error', 'empty', 'populated'],
    defaultState: 'populated',
    isList: true,
  },
  // Auth hooks
  {
    match: h => /^use(Auth|Session|User|CurrentUser)$/i.test(h.hookName),
    category: 'auth',
    states: ['authenticated', 'unauthenticated'],
    defaultState: 'authenticated',
    isList: false,
  },
  // Navigation hooks
  {
    match: h => /^use(Navigate|Router|Location|Params|SearchParams|Match|History)$/.test(h.hookName),
    category: 'navigation',
    states: [],
    defaultState: '',
    isList: false,
  },
  // i18n hooks
  {
    match: h => /^use(Translation|Intl|Locale|I18n|FormatMessage)$/i.test(h.hookName),
    category: 'i18n',
    states: [],
    defaultState: '',
    isList: false,
  },
]

export function classifyHook(hook: ExtractedHook): ClassifiedHook {
  for (const pattern of HOOK_PATTERNS) {
    if (pattern.match(hook)) {
      return {
        ...hook,
        category: pattern.category,
        regionName: deriveRegionName(hook),
        states: pattern.states,
        defaultState: pattern.defaultState,
        isList: pattern.isList,
        returnShape: null,
      }
    }
  }

  // Custom project hook — needs type tracing for full analysis
  if (hook.isProjectLocal) {
    return {
      ...hook,
      category: 'custom',
      regionName: deriveRegionName(hook),
      states: ['loading', 'error', 'empty', 'populated'],
      defaultState: 'populated',
      isList: false,
      returnShape: null,
    }
  }

  return {
    ...hook,
    category: 'unknown',
    regionName: deriveRegionName(hook),
    states: [],
    defaultState: '',
    isList: false,
    returnShape: null,
  }
}

function deriveRegionName(hook: ExtractedHook): string {
  // useQuery('tasks') → 'tasks'
  if (hook.callArgs.length > 0) {
    const firstArg = hook.callArgs[0]
    // Skip object args like { queryKey: ... }
    if (!firstArg.startsWith('{') && !firstArg.startsWith('[')) {
      return firstArg.replace(/[^a-zA-Z0-9]/g, '')
    }
  }
  // useAuth → 'auth'
  return hook.hookName
    .replace(/^use/, '')
    .replace(/^[A-Z]/, c => c.toLowerCase())
}
```

**Step 4: Run test, verify passes. Step 5: Commit.**

```bash
git add packages/cli/src/analyzer/classify-hook.ts packages/cli/src/analyzer/__tests__/classify-hook.test.ts
git commit -m "feat(cli): add hook classifier with pattern-based categorization"
```

---

### Task 8: Region inferrer — convert classified hooks to screen regions

**Files:**
- Create: `packages/cli/src/analyzer/infer-regions.ts`
- Create: `packages/cli/src/analyzer/__tests__/infer-regions.test.ts`

**Step 1: Write the failing test**

```ts
// packages/cli/src/analyzer/__tests__/infer-regions.test.ts
import { describe, it, expect } from 'vitest'
import { inferRegions } from '../infer-regions.ts'
import type { ClassifiedHook } from '../types.ts'

describe('inferRegions', () => {
  it('creates a region for data-fetching hooks', () => {
    const hooks: ClassifiedHook[] = [{
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      callArgs: ['tasks'],
      isProjectLocal: false,
      category: 'data-fetching',
      regionName: 'tasks',
      states: ['loading', 'error', 'empty', 'populated'],
      defaultState: 'populated',
      isList: true,
      returnShape: null,
    }]

    const regions = inferRegions(hooks)
    expect(regions).toHaveLength(1)
    expect(regions[0].name).toBe('tasks')
    expect(regions[0].states).toEqual(['loading', 'error', 'empty', 'populated'])
    expect(regions[0].isList).toBe(true)
    expect(regions[0].mockData).toHaveProperty('loading')
    expect(regions[0].mockData).toHaveProperty('populated')
  })

  it('creates a region for auth hooks', () => {
    const hooks: ClassifiedHook[] = [{
      hookName: 'useAuth',
      importPath: '@/hooks/useAuth',
      callArgs: [],
      isProjectLocal: true,
      category: 'auth',
      regionName: 'auth',
      states: ['authenticated', 'unauthenticated'],
      defaultState: 'authenticated',
      isList: false,
      returnShape: null,
    }]

    const regions = inferRegions(hooks)
    expect(regions).toHaveLength(1)
    expect(regions[0].name).toBe('auth')
    expect(regions[0].mockData.authenticated).toHaveProperty('user')
    expect(regions[0].mockData.unauthenticated).toHaveProperty('user')
  })

  it('skips navigation and i18n hooks (no region needed)', () => {
    const hooks: ClassifiedHook[] = [
      {
        hookName: 'useNavigate', importPath: 'react-router-dom', callArgs: [],
        isProjectLocal: false, category: 'navigation', regionName: 'navigate',
        states: [], defaultState: '', isList: false, returnShape: null,
      },
      {
        hookName: 'useTranslation', importPath: 'react-i18next', callArgs: [],
        isProjectLocal: false, category: 'i18n', regionName: 'translation',
        states: [], defaultState: '', isList: false, returnShape: null,
      },
    ]

    const regions = inferRegions(hooks)
    expect(regions).toHaveLength(0)
  })
})
```

**Step 2: Run test, verify fails. Step 3: Implement.**

```ts
// packages/cli/src/analyzer/infer-regions.ts
import type { ClassifiedHook, ScreenRegion } from './types.ts'

const SKIP_CATEGORIES = new Set(['navigation', 'i18n', 'state', 'unknown'])

export function inferRegions(hooks: readonly ClassifiedHook[]): ScreenRegion[] {
  const regions: ScreenRegion[] = []

  for (const hook of hooks) {
    if (SKIP_CATEGORIES.has(hook.category)) continue
    if (hook.states.length === 0) continue

    const mockData = buildMockData(hook)

    regions.push({
      name: hook.regionName,
      label: formatLabel(hook.regionName),
      source: formatSource(hook),
      states: hook.states,
      defaultState: hook.defaultState,
      isList: hook.isList,
      mockData,
    })
  }

  return regions
}

function buildMockData(
  hook: ClassifiedHook,
): Record<string, Record<string, unknown>> {
  const mockData: Record<string, Record<string, unknown>> = {}

  if (hook.category === 'data-fetching') {
    mockData.loading = { data: null, isLoading: true, error: null }
    mockData.error = { data: null, isLoading: false, error: { message: 'Something went wrong' } }
    mockData.empty = { data: [], isLoading: false, error: null }
    mockData.populated = {
      data: generateSampleList(hook.regionName, 5),
      isLoading: false,
      error: null,
    }
  }

  if (hook.category === 'auth') {
    mockData.authenticated = {
      user: { id: '1', name: 'Jane Doe', email: 'jane@example.com', avatar: 'https://i.pravatar.cc/150?u=1' },
      isAuthenticated: true,
    }
    mockData.unauthenticated = {
      user: null,
      isAuthenticated: false,
    }
  }

  if (hook.category === 'custom') {
    mockData.loading = { data: null, isLoading: true, error: null }
    mockData.error = { data: null, isLoading: false, error: { message: 'Failed to load' } }
    mockData.empty = { data: null, isLoading: false, error: null }
    mockData.populated = {
      data: { id: '1', name: 'Sample Item', status: 'active' },
      isLoading: false,
      error: null,
    }
  }

  return mockData
}

function generateSampleList(name: string, count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `${formatLabel(name)} ${i + 1}`,
    status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'pending' : 'completed',
    createdAt: new Date(2026, 0, i + 1).toISOString(),
  }))
}

function formatLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/^\s/, '')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

function formatSource(hook: ClassifiedHook): string {
  const args = hook.callArgs.length > 0
    ? `(${hook.callArgs.map(a => `"${a}"`).join(', ')})`
    : '()'
  return `${hook.hookName}${args}`
}
```

**Step 4: Run test, verify passes. Step 5: Commit.**

```bash
git add packages/cli/src/analyzer/infer-regions.ts packages/cli/src/analyzer/__tests__/infer-regions.test.ts
git commit -m "feat(cli): add region inferrer from classified hooks"
```

---

## Phase 4: Mock Generation

### Task 9: Mock hook module generator

**Files:**
- Create: `packages/cli/src/generator/generate-mocks.ts`
- Create: `packages/cli/src/generator/__tests__/generate-mocks.test.ts`

**Step 1: Write the failing test**

```ts
// packages/cli/src/generator/__tests__/generate-mocks.test.ts
import { describe, it, expect } from 'vitest'
import { generateMockModule } from '../generate-mocks.ts'
import type { ClassifiedHook, ScreenRegion } from '../../analyzer/types.ts'

describe('generateMockModule', () => {
  it('generates a mock for useQuery', () => {
    const hook: ClassifiedHook = {
      hookName: 'useQuery',
      importPath: '@tanstack/react-query',
      callArgs: ['tasks'],
      isProjectLocal: false,
      category: 'data-fetching',
      regionName: 'tasks',
      states: ['loading', 'error', 'empty', 'populated'],
      defaultState: 'populated',
      isList: true,
      returnShape: null,
    }

    const region: ScreenRegion = {
      name: 'tasks',
      label: 'Tasks',
      source: 'useQuery("tasks")',
      states: ['loading', 'error', 'empty', 'populated'],
      defaultState: 'populated',
      isList: true,
      mockData: {
        loading: { data: null, isLoading: true, error: null },
        populated: { data: [{ id: '1' }], isLoading: false, error: null },
        error: { data: null, isLoading: false, error: { message: 'Error' } },
        empty: { data: [], isLoading: false, error: null },
      },
    }

    const code = generateMockModule(hook, [region])
    expect(code).toContain('useQuery')
    expect(code).toContain('usePreviewRegion')
    expect(code).toContain('export')
  })

  it('generates a mock for useAuth', () => {
    const hook: ClassifiedHook = {
      hookName: 'useAuth',
      importPath: '@/hooks/useAuth',
      callArgs: [],
      isProjectLocal: true,
      category: 'auth',
      regionName: 'auth',
      states: ['authenticated', 'unauthenticated'],
      defaultState: 'authenticated',
      isList: false,
      returnShape: null,
    }

    const region: ScreenRegion = {
      name: 'auth',
      label: 'Auth',
      source: 'useAuth()',
      states: ['authenticated', 'unauthenticated'],
      defaultState: 'authenticated',
      isList: false,
      mockData: {
        authenticated: { user: { name: 'Jane' }, isAuthenticated: true },
        unauthenticated: { user: null, isAuthenticated: false },
      },
    }

    const code = generateMockModule(hook, [region])
    expect(code).toContain('useAuth')
    expect(code).toContain('usePreviewRegion')
  })

  it('generates passthrough for useTranslation', () => {
    const hook: ClassifiedHook = {
      hookName: 'useTranslation',
      importPath: 'react-i18next',
      callArgs: [],
      isProjectLocal: false,
      category: 'i18n',
      regionName: 'translation',
      states: [],
      defaultState: '',
      isList: false,
      returnShape: null,
    }

    const code = generateMockModule(hook, [])
    expect(code).toContain('useTranslation')
    expect(code).toContain('(key) => key')
  })
})
```

**Step 2: Run test, verify fails. Step 3: Implement.**

```ts
// packages/cli/src/generator/generate-mocks.ts
import type { ClassifiedHook, ScreenRegion } from '../analyzer/types.ts'

export function generateMockModule(
  hook: ClassifiedHook,
  regions: readonly ScreenRegion[],
): string {
  switch (hook.category) {
    case 'data-fetching':
      return generateDataFetchingMock(hook, regions)
    case 'auth':
      return generateAuthMock(hook, regions)
    case 'navigation':
      return generateNavigationMock(hook)
    case 'i18n':
      return generateI18nMock(hook)
    case 'custom':
      return generateCustomMock(hook, regions)
    default:
      return generatePassthroughMock(hook)
  }
}

function generateDataFetchingMock(
  hook: ClassifiedHook,
  regions: readonly ScreenRegion[],
): string {
  const region = regions.find(r => r.name === hook.regionName)
  const mockDataStr = region
    ? JSON.stringify(region.mockData, null, 2)
    : '{}'

  if (hook.hookName === 'useQuery') {
    return `// Auto-generated mock for ${hook.importPath}
import { usePreviewRegion } from '@preview-tool/runtime'

const MOCK_DATA = ${mockDataStr}

export function useQuery(options) {
  const queryKey = typeof options === 'string' ? options : options?.queryKey?.[0] ?? 'default'
  const { state } = usePreviewRegion(queryKey)
  const stateData = MOCK_DATA[state] ?? MOCK_DATA.populated ?? { data: null, isLoading: false, error: null }
  return {
    ...stateData,
    refetch: () => Promise.resolve(stateData),
    isRefetching: false,
    isFetching: stateData.isLoading ?? false,
    isSuccess: !stateData.isLoading && !stateData.error,
    isError: !!stateData.error,
    status: stateData.isLoading ? 'loading' : stateData.error ? 'error' : 'success',
  }
}

export function useQueryClient() {
  return {
    invalidateQueries: () => Promise.resolve(),
    prefetchQuery: () => Promise.resolve(),
    setQueryData: () => {},
    getQueryData: () => null,
  }
}

export function QueryClientProvider({ children }) { return children }
export class QueryClient { constructor() {} }
export function useMutation(options) {
  return {
    mutate: () => {},
    mutateAsync: () => Promise.resolve(),
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    data: null,
  }
}
`
  }

  // Generic data-fetching mock (useSWR, etc.)
  return `// Auto-generated mock for ${hook.importPath}
import { usePreviewRegion } from '@preview-tool/runtime'

const MOCK_DATA = ${mockDataStr}

export function ${hook.hookName}(...args) {
  const regionName = typeof args[0] === 'string' ? args[0] : '${hook.regionName}'
  const { state } = usePreviewRegion(regionName)
  return MOCK_DATA[state] ?? MOCK_DATA.populated ?? { data: null, isLoading: false, error: null }
}

export default ${hook.hookName}
`
}

function generateAuthMock(
  hook: ClassifiedHook,
  regions: readonly ScreenRegion[],
): string {
  const region = regions.find(r => r.name === hook.regionName)
  const mockDataStr = region
    ? JSON.stringify(region.mockData, null, 2)
    : '{ authenticated: { user: { id: "1", name: "User" }, isAuthenticated: true }, unauthenticated: { user: null, isAuthenticated: false } }'

  return `// Auto-generated mock for ${hook.importPath}
import { usePreviewRegion } from '@preview-tool/runtime'

const MOCK_DATA = ${mockDataStr}

export function ${hook.hookName}() {
  const { state } = usePreviewRegion('${hook.regionName}')
  return MOCK_DATA[state] ?? MOCK_DATA.authenticated
}

export default ${hook.hookName}
`
}

function generateNavigationMock(hook: ClassifiedHook): string {
  return `// Auto-generated mock for ${hook.importPath}
export function useNavigate() {
  return (to) => {
    window.dispatchEvent(new CustomEvent('preview-navigate', { detail: { to } }))
  }
}

export function useLocation() {
  return { pathname: '/', search: '', hash: '', state: null }
}

export function useParams() {
  return {}
}

export function useSearchParams() {
  return [new URLSearchParams(), () => {}]
}

export function MemoryRouter({ children }) { return children }
export function BrowserRouter({ children }) { return children }
export function Routes({ children }) { return children }
export function Route() { return null }
export function Link({ children, to, ...props }) {
  return children
}
export function Outlet() { return null }
`
}

function generateI18nMock(hook: ClassifiedHook): string {
  return `// Auto-generated mock for ${hook.importPath}
export function useTranslation() {
  return {
    t: (key) => key,
    i18n: {
      language: 'en',
      changeLanguage: () => Promise.resolve(),
    },
    ready: true,
  }
}

export function Trans({ children }) { return children }
export function I18nextProvider({ children }) { return children }
export function initReactI18next() { return { type: '3rdParty', init: () => {} } }
export default { use: () => ({ init: () => {} }) }
`
}

function generateCustomMock(
  hook: ClassifiedHook,
  regions: readonly ScreenRegion[],
): string {
  const region = regions.find(r => r.name === hook.regionName)
  const mockDataStr = region
    ? JSON.stringify(region.mockData, null, 2)
    : '{ populated: {} }'

  return `// Auto-generated mock for ${hook.importPath}
import { usePreviewRegion } from '@preview-tool/runtime'

const MOCK_DATA = ${mockDataStr}

export function ${hook.hookName}(...args) {
  const { state } = usePreviewRegion('${hook.regionName}')
  return MOCK_DATA[state] ?? MOCK_DATA.populated ?? {}
}

export default ${hook.hookName}
`
}

function generatePassthroughMock(hook: ClassifiedHook): string {
  return `// Auto-generated passthrough mock for ${hook.importPath}
export function ${hook.hookName}(...args) {
  return {}
}

export default ${hook.hookName}
`
}
```

**Step 4: Run test, verify passes. Step 5: Commit.**

```bash
git add packages/cli/src/generator/generate-mocks.ts packages/cli/src/generator/__tests__/generate-mocks.test.ts
git commit -m "feat(cli): add mock hook module generator"
```

---

### Task 10: Screen registry and alias manifest generators

**Files:**
- Create: `packages/cli/src/generator/generate-registry.ts`
- Create: `packages/cli/src/generator/generate-alias.ts`

**Step 1: Implement generate-registry.ts**

```ts
// packages/cli/src/generator/generate-registry.ts
import type { ScreenManifestEntry } from '../analyzer/types.ts'

export function generateScreenRegistry(screens: readonly ScreenManifestEntry[]): string {
  const imports = screens.map((s, i) =>
    `const screen${i} = () => import('${s.file}')`
  ).join('\n')

  const entries = screens.map((s, i) => `  {
    route: '${s.path}',
    module: screen${i},
    regions: ${JSON.stringify(
      Object.fromEntries(s.regions.map(r => [r.name, {
        label: r.label,
        states: Object.fromEntries(r.states.map(st => [st, r.mockData[st] ?? {}])),
        defaultState: r.defaultState,
        isList: r.isList,
      }])),
      null, 4,
    ).replace(/\n/g, '\n    ')},
  }`).join(',\n')

  return `// Auto-generated screen registry — do not edit
${imports}

export const screens = [
${entries}
]
`
}
```

**Step 2: Implement generate-alias.ts**

```ts
// packages/cli/src/generator/generate-alias.ts
import type { ClassifiedHook } from '../analyzer/types.ts'
import path from 'node:path'

export function generateAliasManifest(
  hooks: readonly ClassifiedHook[],
  mocksDir: string,
): Record<string, string> {
  const aliases: Record<string, string> = {}
  const seen = new Set<string>()

  for (const hook of hooks) {
    if (hook.importPath === 'unknown') continue
    if (seen.has(hook.importPath)) continue
    seen.add(hook.importPath)

    // Skip React built-ins and state management (let real hooks run)
    if (hook.category === 'state') continue

    const mockFileName = sanitizeFileName(hook.importPath) + '.mock.js'
    aliases[hook.importPath] = path.join(mocksDir, mockFileName)
  }

  return aliases
}

function sanitizeFileName(importPath: string): string {
  return importPath
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
```

**Step 3: Commit**

```bash
git add packages/cli/src/generator/generate-registry.ts packages/cli/src/generator/generate-alias.ts
git commit -m "feat(cli): add screen registry and alias manifest generators"
```

---

### Task 11: Generation orchestrator — wire analysis → generation pipeline

**Files:**
- Create: `packages/cli/src/generator/index.ts`

**Step 1: Implement the orchestrator**

```ts
// packages/cli/src/generator/index.ts
import path from 'node:path'
import fs from 'node:fs'
import { discoverScreens } from '../analyzer/discover-screens.ts'
import { extractHooks } from '../analyzer/extract-hooks.ts'
import { classifyHook } from '../analyzer/classify-hook.ts'
import { inferRegions } from '../analyzer/infer-regions.ts'
import { generateMockModule } from './generate-mocks.ts'
import { generateScreenRegistry } from './generate-registry.ts'
import { generateAliasManifest } from './generate-alias.ts'
import type { PreviewConfig } from '../lib/config.ts'
import type {
  ScreenAnalysisResult,
  ClassifiedHook,
  ScreenManifestEntry,
  GenerationManifest,
} from '../analyzer/types.ts'

export interface GenerateResult {
  readonly screensFound: number
  readonly regionsInferred: number
  readonly mocksGenerated: number
}

export async function generateAll(
  cwd: string,
  _config: PreviewConfig,
): Promise<GenerateResult> {
  const previewDir = path.join(cwd, '.preview')
  const mocksDir = path.join(previewDir, 'mocks')

  // Ensure directories
  fs.mkdirSync(previewDir, { recursive: true })
  fs.mkdirSync(mocksDir, { recursive: true })

  // Phase 1: Discover screens
  const screens = await discoverScreens(cwd)

  // Phase 2: Analyze each screen
  const allHooks: ClassifiedHook[] = []
  const analysisResults: ScreenAnalysisResult[] = []

  for (const screen of screens) {
    const fullPath = path.join(cwd, screen.file)
    const content = fs.readFileSync(fullPath, 'utf-8')
    const extracted = extractHooks(content, screen.file)
    const classified = extracted.map(h => classifyHook(h))
    const regions = inferRegions(classified)

    allHooks.push(...classified)
    analysisResults.push({ screen, hooks: classified, regions })
  }

  // Phase 3: Generate mock modules (one per unique import path)
  const generatedMocks = new Set<string>()
  const seenImports = new Set<string>()

  for (const result of analysisResults) {
    for (const hook of result.hooks) {
      if (hook.importPath === 'unknown') continue
      if (hook.category === 'state') continue
      if (seenImports.has(hook.importPath)) continue
      seenImports.add(hook.importPath)

      const mockCode = generateMockModule(hook, result.regions)
      const fileName = sanitizeFileName(hook.importPath) + '.mock.js'
      const mockPath = path.join(mocksDir, fileName)
      fs.writeFileSync(mockPath, mockCode, 'utf-8')
      generatedMocks.add(fileName)
    }
  }

  // Phase 4: Generate alias manifest
  const aliases = generateAliasManifest(allHooks, mocksDir)
  fs.writeFileSync(
    path.join(previewDir, 'alias-manifest.json'),
    JSON.stringify(aliases, null, 2),
    'utf-8',
  )

  // Phase 5: Generate screen registry
  const manifestEntries: ScreenManifestEntry[] = analysisResults.map(r => ({
    name: r.screen.name,
    path: r.screen.path,
    file: r.screen.file,
    regions: r.regions,
  }))

  const registryCode = generateScreenRegistry(manifestEntries)
  fs.writeFileSync(
    path.join(previewDir, 'screens.ts'),
    registryCode,
    'utf-8',
  )

  // Phase 6: Write manifest
  const manifest: GenerationManifest = {
    screens: manifestEntries,
    aliases,
    mocksDir,
  }
  fs.writeFileSync(
    path.join(previewDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  )

  const totalRegions = analysisResults.reduce(
    (sum, r) => sum + r.regions.length, 0,
  )

  return {
    screensFound: screens.length,
    regionsInferred: totalRegions,
    mocksGenerated: generatedMocks.size,
  }
}

function sanitizeFileName(importPath: string): string {
  return importPath
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/generator/index.ts
git commit -m "feat(cli): add generation orchestrator wiring analysis to mock output"
```

---

## Phase 5: Runtime Updates

### Task 12: Create usePreviewRegion hook

**Files:**
- Create: `packages/runtime/src/hooks/usePreviewRegion.ts`

**Step 1: Implement the hook**

```ts
// packages/runtime/src/hooks/usePreviewRegion.ts
import { useDevToolsStore } from '../store/index.ts'

interface PreviewRegionState {
  readonly state: string
  readonly listCount: number
}

export function usePreviewRegion(regionName: string): PreviewRegionState {
  const regionStates = useDevToolsStore(s => s.regionStates)
  const regionListCounts = useDevToolsStore(s => s.regionListCounts)

  return {
    state: regionStates[regionName] ?? 'populated',
    listCount: regionListCounts[regionName] ?? 3,
  }
}
```

**Step 2: Export from runtime index.ts**

Add to `packages/runtime/src/index.ts`:
```ts
export { usePreviewRegion } from './hooks/usePreviewRegion.ts'
```

**Step 3: Commit**

```bash
git add packages/runtime/src/hooks/usePreviewRegion.ts packages/runtime/src/index.ts
git commit -m "feat(runtime): add usePreviewRegion hook for mock modules"
```

---

### Task 13: Update InspectorPanel for hook-based regions

**Files:**
- Modify: `packages/runtime/src/devtools/InspectorPanel.tsx`

The current InspectorPanel reads regions from `ScreenEntry.regions` which uses the v1 `RegionsMap` type. For v2, the regions come from the generation manifest and are stored in the same `ScreenEntry.regions` shape — so the InspectorPanel mostly works as-is.

**Key change:** Ensure the inspector reads regions from the screen entry and displays them with the `RegionGroup` component. The current implementation already does this. Verify it works with the new region format by:

1. Checking that `RegionGroup` renders state radio buttons (already does)
2. Checking that clicking a state calls `setRegionState` (already does)
3. Checking that list count slider works (already does)

**The InspectorPanel may need minimal updates if the region data shape changes. Test with the new format and fix any mismatches.**

**Step 1: Review and update if needed. Step 2: Commit if changes made.**

---

### Task 14: Update ScreenRenderer for v2 data flow

**Files:**
- Modify: `packages/runtime/src/ScreenRenderer.tsx`

The v2 ScreenRenderer is simpler — screens are regular React components that use hooks internally. The mock hooks handle state management. The ScreenRenderer just needs to:

1. Load the screen component from the registry
2. Render it inside error boundary + flow provider
3. No longer needs to pass `regionData` or `flags` as props — the mock hooks handle data

**Step 1: Simplify ScreenRenderer**

Update to remove regionData/flags prop passing. The component now renders screens as-is since mock hooks are intercepted at the Vite alias level.

**Step 2: Commit**

```bash
git add packages/runtime/src/ScreenRenderer.tsx
git commit -m "refactor(runtime): simplify ScreenRenderer for hook-boundary mocking"
```

---

### Task 15: Update FlowProvider for navigation capture

**Files:**
- Modify: `packages/runtime/src/flow/FlowProvider.tsx`

Add a listener for the `preview-navigate` custom event dispatched by the navigation mock:

```ts
useEffect(() => {
  const handler = (e: CustomEvent) => {
    const { to } = e.detail
    if (typeof to === 'string') {
      navigateFlow(to)
    }
  }
  window.addEventListener('preview-navigate', handler as EventListener)
  return () => window.removeEventListener('preview-navigate', handler as EventListener)
}, [navigateFlow])
```

**Step 1: Add event listener. Step 2: Commit.**

```bash
git add packages/runtime/src/flow/FlowProvider.tsx
git commit -m "feat(runtime): add preview-navigate event listener for flow navigation"
```

---

## Phase 6: Server & Entry

### Task 16: Update Vite config for v2 alias loading

**Files:**
- Modify: `packages/cli/src/server/create-vite-config.ts`

The current Vite config already reads `alias-manifest.json`. Verify it works with the new format. The alias manifest now maps import paths → mock file paths. The Vite `resolve.alias` config should consume this directly.

**Step 1: Verify and fix if needed. Step 2: Commit.**

---

### Task 17: Update entry point generation

**Files:**
- Modify: `packages/cli/src/generator/generate-entry.ts`

Update `generateMainTsx()` to import from the new `screens.ts` registry instead of the old per-screen import.meta.glob pattern.

```ts
function generateMainTsx(): string {
  return `import React from 'react'
import { createRoot } from 'react-dom/client'
import { PreviewShell } from '@preview-tool/runtime'
import { screens } from './screens.ts'
import './preview.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <PreviewShell screens={screens} title="Preview Tool" />
  </React.StrictMode>
)
`
}
```

**Step 1: Update. Step 2: Commit.**

```bash
git add packages/cli/src/generator/generate-entry.ts
git commit -m "feat(cli): update entry point to use v2 screen registry"
```

---

### Task 18: File watcher for incremental re-analysis

**Files:**
- Create: `packages/cli/src/server/watcher.ts`

**Step 1: Implement watcher**

```ts
// packages/cli/src/server/watcher.ts
import fs from 'node:fs'
import path from 'node:path'
import type { PreviewConfig } from '../lib/config.ts'
import { generateAll } from '../generator/index.ts'

export function createWatcher(
  cwd: string,
  config: PreviewConfig,
  onChange: () => void,
): { close: () => void } {
  const srcDir = path.join(cwd, 'src')

  const watcher = fs.watch(srcDir, { recursive: true }, async (eventType, filename) => {
    if (!filename) return
    if (!filename.endsWith('.tsx') && !filename.endsWith('.ts')) return
    if (filename.includes('node_modules')) return
    if (filename.includes('.preview')) return

    // Re-run full analysis (fast enough at ~2-5s)
    try {
      await generateAll(cwd, config)
      onChange()
    } catch (error) {
      console.error('Watch re-analysis failed:', error)
    }
  })

  return {
    close: () => watcher.close(),
  }
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/server/watcher.ts
git commit -m "feat(cli): add file watcher for incremental re-analysis"
```

---

## Phase 7: Command Wiring

### Task 19: Wire generate command

**Files:**
- Modify: `packages/cli/src/commands/generate.ts`

Update to use the new `generateAll` from `../generator/index.ts`. Remove `--no-llm` flag (no longer needed).

**Step 1: Update. Step 2: Commit.**

---

### Task 20: Wire preview command

**Files:**
- Modify: `packages/cli/src/commands/preview.ts`

Update to use the new pipeline:
1. Resolve source
2. Detect framework
3. Install deps if needed
4. Run `generateAll`
5. Generate entry files
6. Create Vite config
7. Start dev server with watcher

Remove `--no-llm` flag.

**Step 1: Update. Step 2: Commit.**

---

### Task 21: Wire dev command

**Files:**
- Modify: `packages/cli/src/commands/dev.ts`

Update to:
1. Read config
2. Generate entry files
3. Create Vite config
4. Start Vite dev server
5. Start file watcher

**Step 1: Update. Step 2: Commit.**

---

## Phase 8: Integration Testing

### Task 22: Update sample-app test fixture

**Files:**
- Modify: `packages/cli/test-fixtures/sample-app/`

Add data-fetching hooks to the dashboard screen so it exercises the v2 pipeline:

```tsx
// Add to dashboard/index.tsx
import { useQuery } from '@tanstack/react-query'

export default function Dashboard() {
  const { data: tasks, isLoading, error } = useQuery({ queryKey: ['tasks'] })
  // ... render
}
```

**Step 1: Update fixture. Step 2: Commit.**

---

### Task 23: Integration test — full pipeline

**Files:**
- Create: `packages/cli/src/__tests__/integration/v2-pipeline.test.ts`

**Step 1: Write integration test**

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import { generateAll } from '../../generator/index.ts'
import { DEFAULT_CONFIG } from '../../lib/config.ts'

describe('v2 pipeline integration', () => {
  const sampleApp = path.resolve(__dirname, '../../../test-fixtures/sample-app')

  it('discovers screens, generates mocks and registry', async () => {
    const result = await generateAll(sampleApp, DEFAULT_CONFIG)

    expect(result.screensFound).toBeGreaterThan(0)

    // Check .preview directory was created
    const previewDir = path.join(sampleApp, '.preview')
    expect(fs.existsSync(previewDir)).toBe(true)

    // Check manifest was written
    const manifest = JSON.parse(
      fs.readFileSync(path.join(previewDir, 'manifest.json'), 'utf-8')
    )
    expect(manifest.screens.length).toBeGreaterThan(0)

    // Check alias manifest
    expect(fs.existsSync(path.join(previewDir, 'alias-manifest.json'))).toBe(true)

    // Check screen registry
    expect(fs.existsSync(path.join(previewDir, 'screens.ts'))).toBe(true)
  })
})
```

**Step 2: Run test, verify passes. Step 3: Commit.**

```bash
git add packages/cli/src/__tests__/integration/v2-pipeline.test.ts
git commit -m "test(cli): add v2 pipeline integration test"
```

---

## Task Dependency Graph

```
Phase 1: Foundation
  Task 1 (types) ─────────────────────┐
  Task 2 (cleanup) ───────────────────┤
                                      │
Phase 2: Screen Discovery             │
  Task 3 (router parser) ◄────────────┤
  Task 4 (file scorer) ◄──────────────┤
  Task 5 (discover orchestrator) ◄──── Tasks 3, 4
                                      │
Phase 3: Hook Analysis                │
  Task 6 (extract hooks) ◄────────────┤
  Task 7 (classify hooks) ◄─── Task 6 │
  Task 8 (infer regions) ◄──── Task 7 │
                                      │
Phase 4: Mock Generation              │
  Task 9 (mock modules) ◄──── Task 8  │
  Task 10 (registry + alias) ◄─ Task 9│
  Task 11 (orchestrator) ◄──── Task 10│
                                      │
Phase 5: Runtime Updates              │
  Task 12 (usePreviewRegion) ──────── (independent)
  Task 13 (InspectorPanel) ◄── Task 12│
  Task 14 (ScreenRenderer) ◄── Task 12│
  Task 15 (FlowProvider) ──────────── (independent)
                                      │
Phase 6: Server                       │
  Task 16 (Vite config) ◄──── Task 11 │
  Task 17 (entry point) ◄──── Task 11 │
  Task 18 (watcher) ◄──────── Task 11 │
                                      │
Phase 7: Commands                     │
  Tasks 19-21 (commands) ◄──── All above
                                      │
Phase 8: Integration                  │
  Tasks 22-23 (testing) ◄──── All above
```

## Parallelization Opportunities

These tasks can run in parallel:
- **Task 3 + Task 4** (router parser + file scorer — independent)
- **Task 6** can start as soon as Task 1 is done
- **Task 12 + Task 15** (runtime hooks — independent of CLI tasks)
- **Tasks 16 + 17 + 18** (server files — independent of each other)
- **Tasks 19 + 20 + 21** (commands — independent of each other)

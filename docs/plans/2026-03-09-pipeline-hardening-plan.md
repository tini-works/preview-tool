# Pipeline Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the preview pipeline crash-proof and framework-agnostic by classifying hooks by behavior, not library.

**Architecture:** Three layers of change: (1) wrap all crash-prone operations in try/catch, (2) extend the LLM analysis prompt + schema to classify hooks by role, (3) generate role-aware mocks. Validate against roomio and booking codebases.

**Tech Stack:** TypeScript, Zod schemas, LLM prompts, ts-morph AST analysis.

---

### Task 1: Harden claude-code.ts — wrap JSON.parse calls

**Files:**
- Modify: `packages/cli/src/llm/providers/claude-code.ts:40-46`

**Step 1: Write the fix**

Replace lines 40-46 in the `generate` method with safe parsing:

```typescript
    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      const timeout = options.timeoutMs ?? CLAUDE_CODE_BATCH_TIMEOUT_MS

      const fullPrompt = options.systemPrompt
        ? `${options.systemPrompt}\n\n${prompt}`
        : prompt

      // Unset CLAUDECODE to allow spawning from within a Claude Code session
      const env = { ...process.env }
      delete env.CLAUDECODE

      const { stdout } = await execFileAsync(
        'claude',
        ['-p', fullPrompt, '--output-format', 'json', '--max-turns', '30'],
        { timeout, maxBuffer: 10 * 1024 * 1024, env },
      )

      // Parse the CLI envelope — may be non-JSON on timeout/error
      let envelope: { result?: string }
      try {
        envelope = JSON.parse(stdout) as { result?: string }
      } catch {
        throw new Error(`claude CLI returned non-JSON output (${stdout.length} bytes)`)
      }

      const text = envelope.result
      if (typeof text !== 'string') {
        throw new Error(`claude CLI envelope missing "result" field: ${JSON.stringify(Object.keys(envelope))}`)
      }

      // Parse the LLM's JSON response from within the result text
      try {
        return JSON.parse(extractJson(text)) as unknown
      } catch {
        throw new Error(`LLM response is not valid JSON: ${text.slice(0, 200)}...`)
      }
    },
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add packages/cli/src/llm/providers/claude-code.ts
git commit -m "fix: wrap JSON.parse calls in claude-code provider with try/catch"
```

---

### Task 2: Harden discover-llm.ts — safe file reads

**Files:**
- Modify: `packages/cli/src/analyzer/discover-llm.ts:34-53`

**Step 1: Write the fix**

Wrap `readFileSync` inside `validateDiscoveredScreens` in a try/catch:

```typescript
  for (const screen of screens) {
    const absPath = join(cwd, screen.filePath)
    if (!existsSync(absPath)) continue

    const basename = screen.filePath.split('/').pop() ?? ''
    if (/\.(test|spec|stories|story)\./.test(basename)) continue

    try {
      const source = readFileSync(absPath, 'utf-8')
      const hasJSX = source.includes('return') && (source.includes('<') || source.includes('jsx'))
      const hasExport = source.includes('export')

      if (hasJSX && hasExport) {
        validated.push({
          filePath: screen.filePath,
          route: screen.route,
          pattern: 'monolithic',
          exportName: undefined,
        })
      }
    } catch {
      // File unreadable (permissions, race) — skip silently
    }
  }
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add packages/cli/src/analyzer/discover-llm.ts
git commit -m "fix: wrap file reads in discover-llm with try/catch"
```

---

### Task 3: Harden detect-framework.ts — safe JSON.parse

**Files:**
- Modify: `packages/cli/src/resolver/detect-framework.ts:58-63`

**Step 1: Write the fix**

Wrap `JSON.parse` with a user-friendly error:

```typescript
  const raw = await readFile(pkgPath, 'utf-8')
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> }
  try {
    pkg = JSON.parse(raw)
  } catch {
    throw new Error(`Failed to parse package.json in ${cwd} — file may be malformed`)
  }
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add packages/cli/src/resolver/detect-framework.ts
git commit -m "fix: wrap package.json parsing with user-friendly error"
```

---

### Task 4: Harden create-vite-config.ts — per-file try/catch in screen loop

**Files:**
- Modify: `packages/cli/src/server/create-vite-config.ts:62-78`

**Step 1: Write the fix**

Move `readFileSync` inside a per-file try/catch so one bad file doesn't abort all:

```typescript
  // Load screen file paths for useState transform plugin
  const screenFilePaths: string[] = []
  try {
    const screensDir = join(previewDir, 'screens')
    const screenDirs = readdirSync(screensDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    for (const screenDir of screenDirs) {
      try {
        const modelPath = join(screensDir, screenDir, 'model.ts')
        const modelContent = readFileSync(modelPath, 'utf-8')
        const filePathMatch = modelContent.match(/filePath:\s*["']([^"']+)["']/)
        if (filePathMatch) {
          screenFilePaths.push(join(cwd, filePathMatch[1]))
        }
      } catch {
        // Individual model file unreadable — skip this screen
      }
    }
  } catch {
    // No screens directory — skip plugin
  }
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add packages/cli/src/server/create-vite-config.ts
git commit -m "fix: per-file try/catch in vite config screen loader"
```

---

### Task 5: Harden collect-facts.ts — replace non-null assertions

**Files:**
- Modify: `packages/cli/src/analyzer/collect-facts.ts:56,470,490`

**Step 1: Write the fix**

Replace three `importMap.get(...)!` calls with safe access:

Line 56 — inside `extractHookFacts`:
```typescript
    const importPath = importMap.get(localName)
    if (!importPath) continue
```
(Remove the `!` and add the guard. The existing `importMap.has(localName)` check on line 54 makes this functionally identical, but the explicit guard is safer.)

Line 470 — inside `extractComponentFacts` (JsxOpeningElement loop):
```typescript
    const importPath = importMap.get(tagName)
    if (!importPath) continue

    components.push({
      name: tagName,
      importPath,
      props,
      children,
    })
```

Line 490 — inside `extractComponentFacts` (JsxSelfClosingElement loop):
```typescript
    const importPath = importMap.get(tagName)
    if (!importPath) continue

    components.push({
      name: tagName,
      importPath,
      props,
      children: [],
    })
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add packages/cli/src/analyzer/collect-facts.ts
git commit -m "fix: replace non-null assertions with safe Map access in collect-facts"
```

---

### Task 6: Harden generator/index.ts — safe alias and facts lookup

**Files:**
- Modify: `packages/cli/src/generator/index.ts:155-159,121`

**Step 1: Write the fix**

Line 155-159 — validate alias before writing mock file:
```typescript
  for (const [importPath, code] of mockFiles) {
    const mockRelPath = aliasManifest[importPath]
    if (!mockRelPath) {
      console.log(chalk.yellow(`  Warning: No alias for mock ${importPath}, skipping`))
      continue
    }
    const mockFileName = mockRelPath.replace(/^\.\/mocks\//, '').replace(/\.ts$/, '')
    await writeFile(join(mocksDir, `${mockFileName}.ts`), code, 'utf-8')
    console.log(chalk.dim(`  Mock: ${importPath} → mocks/${mockFileName}.ts`))
  }
```

Line 121 — guard facts lookup:
```typescript
    if (!hasModelOverride && analysis) {
      const facts = factsMap.get(screen.route)
      const model = analysisToModel(analysis, facts?.hooks ?? [])
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add packages/cli/src/generator/index.ts
git commit -m "fix: safe alias and facts lookup in generator"
```

---

### Task 7: Add `role` field to hook schema

**Files:**
- Modify: `packages/cli/src/llm/schemas/screen-analysis-v2.ts`

**Step 1: Write the change**

Add a `role` field to `MockModuleSchema`:

```typescript
const HookRoleEnum = z.enum([
  'data_fetcher',
  'mutation',
  'realtime',
  'state_store',
  'side_effect',
  'ui_utility',
  'context',
])

const MockModuleSchema = z.object({
  hookName: z.string().min(1),
  importPath: z.string().min(1),
  role: HookRoleEnum,
  defaultState: z.string().min(1),
  stateMap: z.record(z.string(), z.unknown()),
})
```

Export the role type:
```typescript
export type HookRole = z.infer<typeof HookRoleEnum>
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add packages/cli/src/llm/schemas/screen-analysis-v2.ts
git commit -m "feat: add role field to MockModule schema"
```

---

### Task 8: Update LLM prompt to request role classification

**Files:**
- Modify: `packages/cli/src/llm/prompts/analyze-screen.ts`

**Step 1: Write the change**

Update the Mock Modules section of the prompt to request role classification:

```typescript
### 3. Mock Modules
For each imported hook that needs mocking:
- **hookName**: the hook function name
- **importPath**: the import path
- **role**: classify the hook by what it DOES (read the source code to determine this):
  - "data_fetcher" — returns async data (useQuery, useSWR, fetch+useEffect, any data loading hook)
  - "mutation" — triggers writes (useMutation, useSubmit, any hook that POSTs/PUTs/DELETEs)
  - "realtime" — subscribes to live updates (useSocket, useSubscription, WebSocket hooks)
  - "state_store" — reads/writes shared state (useStore, useAtom, useSelector, Zustand/Redux/Jotai)
  - "side_effect" — does something outside React (useNavigate, useAnalytics, useClipboard)
  - "ui_utility" — pure UI logic (useDebounce, useLongPress, useMediaQuery, useLocalStorage)
  - "context" — consumes React Context (useAuth, useTheme, useToast via useContext)
- **defaultState**: which region state to use by default
- **stateMap**: object where each key is a state name, and the value is the complete return object

IMPORTANT for stateMap values based on role:
- data_fetcher: include { data: <realistic data>, isLoading: false, error: null } shape. Also include a "loading" state with { data: null/undefined, isLoading: true, error: null } and "error" state.
- mutation: include { mutate: "__fn__", mutateAsync: "__fn__", isPending: false, isSuccess: false, error: null } shape
- realtime: same as data_fetcher but with connection status fields if applicable
- state_store: include all state fields with realistic initial values, setters as "__fn__"
- side_effect: all function returns as "__fn__"
- ui_utility: return the sensible default value (true for boolean hooks, etc.)
- context: include all context value fields with realistic defaults
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add packages/cli/src/llm/prompts/analyze-screen.ts
git commit -m "feat: update LLM prompt to request role-based hook classification"
```

---

### Task 9: Update mock code generation to be role-aware

**Files:**
- Modify: `packages/cli/src/generator/generate-all-v2.ts` (the `buildMockModuleCode` function)

**Step 1: Write the change**

Update `buildMockModuleCode` to add a role comment and ensure the mock structure matches the role:

```typescript
export function buildMockModuleCode(mock: MockModuleV2): string {
  const replaced = replaceFnPlaceholders(mock.stateMap) as Record<string, Record<string, unknown>>

  const lines: string[] = [
    `// Auto-generated mock by @preview-tool/cli (V2) — role: ${mock.role}`,
    "import { useRegionDataForHook } from '@preview-tool/runtime'",
    '',
    `const states = ${serializeValue(replaced, 0)}`,
    '',
    `export function ${mock.hookName}(..._args: any[]) {`,
    `  const regionData = useRegionDataForHook('${mock.hookName}')`,
    '  if (regionData) return regionData',
    `  return states[${JSON.stringify(mock.defaultState)}]`,
    '}',
    '',
  ]

  return lines.join('\n')
}
```

The role-awareness is primarily driven by the LLM prompt (Task 8) which tells the LLM how to structure the stateMap per role. The code generator just needs to pass it through. The `role` field in the schema is metadata for debugging and future use (e.g. devtools could show "this hook is a data_fetcher").

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add packages/cli/src/generator/generate-all-v2.ts
git commit -m "feat: add role comment to generated mock modules"
```

---

### Task 10: Add TanStack Router route detection to detect-framework.ts

**Files:**
- Modify: `packages/cli/src/resolver/detect-framework.ts:44-50`

**Step 1: Write the change**

Add TanStack Router file-based routing pattern to `PAGE_PATTERNS`:

```typescript
const PAGE_PATTERNS = [
  { dir: 'src/routes', glob: 'src/routes/**/*.tsx' },
  { dir: 'src/pages', glob: 'src/pages/**/*.tsx' },
  { dir: 'src/screens', glob: 'src/screens/**/index.tsx' },
  { dir: 'src/app', glob: 'src/app/**/page.tsx' },
  { dir: 'pages', glob: 'pages/**/*.tsx' },
  { dir: 'app', glob: 'app/**/page.tsx' },
] as const
```

This ensures TanStack Start apps (like roomio with `src/routes/`) are detected before falling back to the broad `src/**/*.tsx` glob.

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean compile

**Step 3: Commit**

```bash
git add packages/cli/src/resolver/detect-framework.ts
git commit -m "feat: detect TanStack Router file-based routing pattern"
```

---

### Task 11: Build, bump version, commit all

**Step 1: Build the full project**

Run: `pnpm build`
Expected: Clean compile, no errors

**Step 2: Bump CLI version**

Update version in `packages/cli/package.json` to `0.1.13`.

**Step 3: Commit**

```bash
git add packages/cli/package.json
git commit -m "chore: bump cli to 0.1.13"
```

---

### Task 12: Validate against roomio

**Step 1: Run preview on roomio**

```bash
node packages/cli/dist/index.js preview ~/Desktop/roomio
```

**Step 2: Check for crashes**

Expected: No crashes. All screens discovered. LLM analysis completes for each screen.

**Step 3: Inspect generated output**

Check `~/Desktop/roomio/.preview/`:
- `screens/` has screen directories
- `mocks/` has mock files with role comments
- `wrapper.tsx` has QueryClientProvider injected
- Mock files have realistic data (room names, booking objects, not "string1")

**Step 4: Spot-check hook role classification**

Look at a few mock files:
- `useRooms` → should be `role: data_fetcher`
- `useBookMutation` → should be `role: mutation`
- `useRoomSocket` → should be `role: realtime`
- `useServerClock` → should be `role: ui_utility`
- `useToast` → should be `role: context`

---

### Task 13: Validate against booking

**Step 1: Run preview on booking**

```bash
node packages/cli/dist/index.js preview ~/Desktop/booking
```

**Step 2: Same checks as Task 12**

- No crashes
- Screens discovered
- Mocks have correct roles
- Different tech stack produces same quality output

---

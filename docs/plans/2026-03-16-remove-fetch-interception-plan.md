# Remove Fetch Interception Layer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the redundant fetch interception layer so the preview-tool uses only hook mocking for data delivery (no backend, no `window.fetch` override).

**Architecture:** The hook-mocking layer (Vite aliases → `.preview/mocks/*.ts` → `useRegionDataForHook` → `RegionDataContext`) already handles all data delivery. The fetch interception layer (`generate-fetch-interceptor.ts`, `fetch-mock-mapper.ts`, `discover-fetch.ts`, `window.__previewMockData`) is dead infrastructure. We delete 8 files and surgically remove fetch-related code from 5 files.

**Tech Stack:** TypeScript, ts-morph, Vitest, pnpm

---

### Task 1: Delete fetch infrastructure files

**Files:**
- Delete: `packages/cli/src/spec/generate-fetch-interceptor.ts`
- Delete: `packages/cli/src/spec/fetch-mock-mapper.ts`
- Delete: `packages/cli/src/analyzer/discover-fetch.ts`
- Delete: `packages/cli/src/spec/__tests__/generate-fetch-interceptor.test.ts`
- Delete: `packages/cli/src/spec/__tests__/fetch-mock-mapper.test.ts`
- Delete: `packages/cli/src/analyzer/__tests__/discover-fetch.test.ts`
- Delete: `packages/runtime/src/globals.d.ts`
- Delete: `packages/cli/src/spec/__tests__/fixtures/src/pages/FetchPage.tsx`

**Step 1: Delete all 8 files**

```bash
rm packages/cli/src/spec/generate-fetch-interceptor.ts
rm packages/cli/src/spec/fetch-mock-mapper.ts
rm packages/cli/src/analyzer/discover-fetch.ts
rm packages/cli/src/spec/__tests__/generate-fetch-interceptor.test.ts
rm packages/cli/src/spec/__tests__/fetch-mock-mapper.test.ts
rm packages/cli/src/analyzer/__tests__/discover-fetch.test.ts
rm packages/runtime/src/globals.d.ts
rm packages/cli/src/spec/__tests__/fixtures/src/pages/FetchPage.tsx
```

**Step 2: Verify no other files import from the deleted modules**

```bash
grep -r "discover-fetch" packages/ --include="*.ts" --include="*.tsx" -l
grep -r "fetch-mock-mapper" packages/ --include="*.ts" --include="*.tsx" -l
grep -r "generate-fetch-interceptor" packages/ --include="*.ts" --include="*.tsx" -l
grep -r "globals\.d" packages/ --include="*.ts" --include="*.tsx" -l
```

Expected: Only the files we'll modify in Tasks 2-5 should appear. No surprises.

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete fetch interception infrastructure (8 files)"
```

---

### Task 2: Remove fetch code from spec-pipeline-orchestrator.ts

**File:** `packages/cli/src/spec/spec-pipeline-orchestrator.ts`

**Step 1: Remove imports (lines 12-14)**

Remove these three import lines:
```typescript
import { discoverFetchCalls, type FetchCallInfo } from '../analyzer/discover-fetch.js'
import { mapFetchToMockData } from './fetch-mock-mapper.js'
import { generateFetchInterceptor } from './generate-fetch-interceptor.js'
```

**Step 2: Remove `fetchInterceptorCode` from `SpecPipelineResult` (line 38)**

Change the interface from:
```typescript
export interface SpecPipelineResult {
  enrichedScreens: EnrichedScreen[]
  mockFiles: Map<string, string>
  aliasManifest: Record<string, string>
  fetchInterceptorCode: string
  screenSourcePaths: string[]
}
```

To:
```typescript
export interface SpecPipelineResult {
  enrichedScreens: EnrichedScreen[]
  mockFiles: Map<string, string>
  aliasManifest: Record<string, string>
  screenSourcePaths: string[]
}
```

**Step 3: Remove the fetch discovery block at end of `runSpecPipeline` (lines 1003-1023)**

Remove this entire block:
```typescript
  // Discover fetch calls and generate interceptor
  const allFetchCalls: FetchCallInfo[] = []
  for (const { absPath } of screensWithSource) {
    const sf = sourceFileMap.get(absPath)
    if (sf) {
      allFetchCalls.push(...discoverFetchCalls(sf))
    }
  }

  // Collect all mockData keys across all screens
  const allMockDataKeys = new Set<string>()
  for (const screen of screens) {
    for (const data of Object.values(screen.stateData)) {
      for (const key of Object.keys(data)) {
        allMockDataKeys.add(key)
      }
    }
  }

  const fetchMappings = mapFetchToMockData(allFetchCalls, [...allMockDataKeys])
  const fetchInterceptorCode = generateFetchInterceptor(fetchMappings)
```

**Step 4: Remove `fetchInterceptorCode` from return statement (line 1027)**

Change from:
```typescript
  return { enrichedScreens, mockFiles, aliasManifest, fetchInterceptorCode, screenSourcePaths }
```

To:
```typescript
  return { enrichedScreens, mockFiles, aliasManifest, screenSourcePaths }
```

**Step 5: Verify build compiles (expect type errors in downstream files — that's OK for now)**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: Errors in `dev.ts` and `generate-entry.ts` about `fetchInterceptorCode` — we fix those in Tasks 3-4.

**Step 6: Commit**

```bash
git add packages/cli/src/spec/spec-pipeline-orchestrator.ts
git commit -m "refactor: remove fetch discovery and interceptor generation from spec pipeline"
```

---

### Task 3: Remove fetch code from generate-entry.ts

**File:** `packages/cli/src/server/generate-entry.ts`

**Step 1: Remove `fetchInterceptorCode` from `generateEntryFiles` options parameter (line 135)**

Change from:
```typescript
export async function generateEntryFiles(
  cwd: string,
  config: PreviewConfig,
  options?: { fetchInterceptorCode?: string }
): Promise<void> {
```

To:
```typescript
export async function generateEntryFiles(
  cwd: string,
  config: PreviewConfig,
): Promise<void> {
```

**Step 2: Remove the `options?.fetchInterceptorCode` usage in the `generateSpecMainTsx` call (line 186)**

Change from:
```typescript
    await writeFile(join(previewDir, 'main.tsx'), generateSpecMainTsx(screens, options?.fetchInterceptorCode), 'utf-8')
```

To:
```typescript
    await writeFile(join(previewDir, 'main.tsx'), generateSpecMainTsx(screens), 'utf-8')
```

**Step 3: Remove `fetchInterceptorCode` parameter from `generateSpecMainTsx` (line 325)**

Change from:
```typescript
export function generateSpecMainTsx(screens: SpecScreenImport[], fetchInterceptorCode?: string): string {
```

To:
```typescript
export function generateSpecMainTsx(screens: SpecScreenImport[]): string {
```

**Step 4: Remove the `fetchBlock` variable and its injection (lines 342-354)**

Remove:
```typescript
  const fetchBlock = fetchInterceptorCode
    ? `\n// Fetch interceptor for mock data delivery\n${fetchInterceptorCode}\n`
    : ''
```

And change the template string to remove `${fetchBlock}`:

Replace:
```typescript
import './preview.css'
${fetchBlock}
// Static import map
```

With:
```typescript
import './preview.css'

// Static import map
```

**Step 5: Update tests in `generate-entry.test.ts`**

In `packages/cli/src/server/__tests__/generate-entry.test.ts`:

Remove the test "includes fetch interceptor when fetchInterceptorCode is provided" (lines 187-196):
```typescript
  it('includes fetch interceptor when fetchInterceptorCode is provided', () => {
    const screens: SpecScreenImport[] = [
      { id: 'scr-search', sourceFile: 'src/pages/Search.tsx', exportType: 'default' },
    ]
    const fetchInterceptorCode = `window.__previewFetchHandlers = { 'GET /api/specialties': 'specialties' }`

    const output = generateSpecMainTsx(screens, fetchInterceptorCode)
    expect(output).toContain('__previewFetchHandlers')
    expect(output).toContain('Fetch interceptor for mock data delivery')
  })
```

Remove the test "omits fetch block when no fetchInterceptorCode" (lines 198-201):
```typescript
  it('omits fetch block when no fetchInterceptorCode', () => {
    const output = generateSpecMainTsx(MOCK_SCREENS)
    expect(output).not.toContain('Fetch interceptor')
  })
```

**Step 6: Run tests**

```bash
npx vitest run packages/cli/src/server/__tests__/generate-entry.test.ts
```

Expected: All remaining tests pass.

**Step 7: Commit**

```bash
git add packages/cli/src/server/generate-entry.ts packages/cli/src/server/__tests__/generate-entry.test.ts
git commit -m "refactor: remove fetchInterceptorCode from entry file generation"
```

---

### Task 4: Remove fetch code from dev.ts

**File:** `packages/cli/src/commands/dev.ts`

**Step 1: Remove `fetchInterceptorCode` variable declaration (line 63)**

Remove:
```typescript
    let fetchInterceptorCode: string | undefined
```

**Step 2: Remove `fetchInterceptorCode` assignment (line 68)**

Remove:
```typescript
      fetchInterceptorCode = pipelineResult.fetchInterceptorCode || undefined
```

**Step 3: Remove fetch count from the log message (lines 98-99)**

Change from:
```typescript
      const fetchCount = pipelineResult.fetchInterceptorCode ? 1 : 0
      console.log(chalk.dim(`  Generated ${hookCount} mock modules, ${regionCount} regions${fetchCount ? ', fetch interceptor' : ''}`))
```

To:
```typescript
      console.log(chalk.dim(`  Generated ${hookCount} mock modules, ${regionCount} regions`))
```

**Step 4: Remove `fetchInterceptorCode` from `generateEntryFiles` call (line 104)**

Change from:
```typescript
    await generateEntryFiles(cwd, config, { fetchInterceptorCode })
```

To:
```typescript
    await generateEntryFiles(cwd, config)
```

**Step 5: Verify build**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

**Step 6: Commit**

```bash
git add packages/cli/src/commands/dev.ts
git commit -m "refactor: remove fetchInterceptorCode from dev command"
```

---

### Task 5: Remove `window.__previewMockData` sync from ScreenRenderer.tsx

**File:** `packages/runtime/src/ScreenRenderer.tsx`

**Step 1: Remove the sync block (lines 91-109)**

Remove this entire block:
```typescript
  // Sync region data to window.__previewMockData for fetch interceptor
  // MUST be synchronous (not useEffect) so data is ready before child
  // components mount and their useEffect fetch calls fire
  const currentEntry = modules.find((m) => m.route === route)
  const currentRegions = currentEntry?.regions
  if (currentRegions) {
    try {
      const rd = computeRegionData(currentRegions, regionStates, regionListCounts)
      const flatData: Record<string, unknown> = {}
      for (const [, regionEntry] of Object.entries(rd)) {
        if (regionEntry?.stateData) {
          Object.assign(flatData, regionEntry.stateData)
        }
      }
      ;(window as any).__previewMockData = flatData
    } catch {
      // Ignore — sync is best-effort
    }
  }
```

**Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

**Step 3: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add packages/runtime/src/ScreenRenderer.tsx
git commit -m "refactor: remove window.__previewMockData sync from ScreenRenderer"
```

---

### Task 6: Final verification — no fetch interception references remain

**Step 1: Search for any remaining fetch interception references**

```bash
grep -r "__previewMockData" packages/ --include="*.ts" --include="*.tsx" -l
grep -r "__previewFetchHandlers" packages/ --include="*.ts" --include="*.tsx" -l
grep -r "fetchInterceptorCode" packages/ --include="*.ts" --include="*.tsx" -l
grep -r "fetch-mock-mapper" packages/ --include="*.ts" --include="*.tsx" -l
grep -r "generate-fetch-interceptor" packages/ --include="*.ts" --include="*.tsx" -l
grep -r "discover-fetch" packages/ --include="*.ts" --include="*.tsx" -l
```

Expected: Zero results for all.

**Step 2: Full build**

```bash
pnpm build
```

Expected: Clean build, zero errors.

**Step 3: Full test suite**

```bash
pnpm test
```

Expected: All tests pass.

**Step 4: Verify deleted files are gone**

```bash
ls packages/cli/src/spec/generate-fetch-interceptor.ts 2>&1
ls packages/cli/src/spec/fetch-mock-mapper.ts 2>&1
ls packages/cli/src/analyzer/discover-fetch.ts 2>&1
ls packages/runtime/src/globals.d.ts 2>&1
```

Expected: "No such file or directory" for all four.

# Priority 1 Quick Wins Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the 5 highest-impact, lowest-effort issues identified in the multi-perspective review — controller override loading, dead region merge, mock fallback value, ARIA landmarks, and Dynamic Island dark mode.

**Architecture:** All fixes are surgical edits to existing files. No new modules, no new dependencies. Each fix is independent and can be committed separately.

**Tech Stack:** TypeScript, React, Tailwind CSS, Vitest

---

### Task 1: Controller Override Glob (Issue #1)

Controllers in `.preview/overrides/{screen}/controller.ts` are never loaded because `main.tsx` only globs from `./screens/*/controller.ts`. Add an override controller glob and merge it, mirroring the existing model override pattern.

**Files:**
- Modify: `packages/cli/src/server/generate-entry.ts:163-246` (the `generateMainTsx()` function)
- Test: `packages/cli/src/server/__tests__/generate-entry.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/server/__tests__/generate-entry.test.ts`:

```typescript
import { generateEntryFiles } from '../generate-entry.js'
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

describe('generateMainTsx', () => {
  const TMP = join(import.meta.dirname, '__tmp_main_tsx__')

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('includes override controller glob in generated main.tsx', async () => {
    const dir = join(TMP, `proj-${Date.now()}`)
    mkdirSync(join(dir, '.preview'), { recursive: true })
    writeFileSync(join(dir, '.preview', 'wrapper.tsx'), 'export const Wrapper = ({ children }: any) => children', 'utf-8')

    await generateEntryFiles(dir, {
      screenGlob: 'src/screens/**/page.tsx',
      port: 6100,
      title: 'Test',
    })

    const mainTsx = readFileSync(join(dir, '.preview', 'main.tsx'), 'utf-8')
    expect(mainTsx).toContain("import.meta.glob('./overrides/*/controller.ts'")
    expect(mainTsx).toContain('overrideControllerModules')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/server/__tests__/generate-entry.test.ts`
Expected: FAIL — `main.tsx` does not contain override controller glob.

**Step 3: Implement the fix**

In `packages/cli/src/server/generate-entry.ts`, inside `generateMainTsx()`, add the override controller glob and merge logic. The generated `main.tsx` string needs three changes:

1. Add override controller glob declaration (after the existing `overrideModelModules` glob, around the string at line 184):

```typescript
// Add this glob declaration in the generated code string
const overrideControllerModules = import.meta.glob('./overrides/*/controller.ts', { eager: true }) as Record<
  string,
  { flows?: readonly AnyFlowAction[] }
>
```

2. In the entry-building loop, resolve the override controller path and prefer it over base:

```typescript
  const overrideControllerPath = \`./overrides/\${folderName}/controller.ts\`

  // Prefer override controller if present
  const controller = overrideControllerModules[overrideControllerPath] ?? controllerModules[controllerPath]
```

The full updated `generateMainTsx()` return string should change these specific sections:

**After line 187** (`overrideModelModules` declaration), add:
```
const overrideControllerModules = import.meta.glob('./overrides/*/controller.ts', { eager: true }) as Record<
  string,
  { flows?: readonly AnyFlowAction[] }
>
```

**Replace lines 229-232** (the controller lookup):
```
  const overrideControllerPath = \`./overrides/\${folderName}/controller.ts\`
  const controller = overrideControllerModules[overrideControllerPath] ?? controllerModules[controllerPath]
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/server/__tests__/generate-entry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/server/generate-entry.ts packages/cli/src/server/__tests__/generate-entry.test.ts
git commit -m "fix: load controller overrides from overrides/ directory (issue #1)"
```

---

### Task 2: Replace-Semantics for Region Merge (Issue #2)

`mergeOverrides()` uses additive spread (`{ ...base.regions, ...override.regions }`), keeping dead auto-generated regions alive. When an override provides regions, use replacement semantics.

**Files:**
- Modify: `packages/cli/src/server/generate-entry.ts:193-201` (the `mergeOverrides` function in the generated string)
- Test: `packages/cli/src/server/__tests__/generate-entry.test.ts`

**Step 1: Write the failing test**

Add to the `generateMainTsx` describe block in the test file:

```typescript
it('mergeOverrides uses replacement semantics when override has regions', async () => {
  const dir = join(TMP, `proj-merge-${Date.now()}`)
  mkdirSync(join(dir, '.preview'), { recursive: true })
  writeFileSync(join(dir, '.preview', 'wrapper.tsx'), 'export const Wrapper = ({ children }: any) => children', 'utf-8')

  await generateEntryFiles(dir, {
    screenGlob: 'src/screens/**/page.tsx',
    port: 6100,
    title: 'Test',
  })

  const mainTsx = readFileSync(join(dir, '.preview', 'main.tsx'), 'utf-8')
  // Should use replacement: override.regions takes over entirely, not shallow merge
  expect(mainTsx).toContain('override.regions ?? base.regions')
  expect(mainTsx).not.toContain('...base.regions, ...(override.regions')
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/server/__tests__/generate-entry.test.ts`
Expected: FAIL — still contains `...base.regions, ...(override.regions`.

**Step 3: Implement the fix**

In `packages/cli/src/server/generate-entry.ts`, in the `generateMainTsx()` function, change the `mergeOverrides` function in the generated string from:

```typescript
  return {
    regions: { ...base.regions, ...(override.regions ?? {}) },
  }
```

To:

```typescript
  return {
    regions: override.regions ?? base.regions,
  }
```

Also update the JSDoc comment from "Override regions are shallow-merged by key" to "Override regions replace base regions entirely".

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/server/__tests__/generate-entry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/server/generate-entry.ts packages/cli/src/server/__tests__/generate-entry.test.ts
git commit -m "fix: use replacement semantics for override region merge (issue #2)"
```

---

### Task 3: Mock Fallback `{}` → `null` (Issue #4)

Generated mocks for store/custom hooks return `{}` (truthy) when no region data exists. Components checking `!== null` pass the check, then crash on empty object. Two locations need fixing.

**Files:**
- Modify: `packages/cli/src/generator/generate-mock-from-analysis.ts:223,246`
- Test: `packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts`:

```typescript
it('store hook without field info falls back to null, not empty object', () => {
  const storeFacts: ScreenFacts[] = [{
    route: '/profile',
    filePath: '/profile.tsx',
    sourceCode: '',
    hooks: [
      { name: 'useProfileStore', importPath: '@/stores/profile', arguments: [] },
    ],
    components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [], propertyChains: [],
  }]
  const storeAnalyses: ScreenAnalysisOutput[] = [{
    route: '/profile',
    regions: [
      { key: 'profile', label: 'Profile', type: 'data', hookBindings: ['useProfileStore:profile'], states: { loaded: { label: 'Loaded', mockData: {} } }, defaultState: 'loaded' },
    ],
    flows: [],
  }]
  const result = generateMockModules(storeFacts, storeAnalyses)
  const code = result.mockFiles.get('@/stores/profile')!
  // When no region data, should return null (falsy) not {} (truthy)
  expect(code).toContain('data ? resolveStoreState(data as Record<string, any>) : null')
  expect(code).not.toContain(': {}')
})

it('unmapped custom hooks return null, not empty object', () => {
  const customFacts: ScreenFacts[] = [{
    route: '/test',
    filePath: '/test.tsx',
    sourceCode: '',
    hooks: [
      { name: 'useCustomThing', importPath: '@/hooks/custom', arguments: [] },
    ],
    components: [], conditionals: [], navigation: [], localState: [], derivedVars: [], functions: [], propertyChains: [],
  }]
  const result = generateMockModules(customFacts, [{ route: '/test', regions: [], flows: [] }])
  const code = result.mockFiles.get('@/hooks/custom')!
  expect(code).toContain('return null')
  expect(code).not.toContain('return {}')
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-mock-from-analysis.test.ts`
Expected: FAIL — code contains `{}` not `null`.

**Step 3: Implement the fix**

In `packages/cli/src/generator/generate-mock-from-analysis.ts`, make two changes:

**Line 223** — Change the fallback for store hooks with region mapping but no field info:
```typescript
// Before:
'  const state = data ? resolveStoreState(data as Record<string, any>) : {}',
// After:
'  const state = data ? resolveStoreState(data as Record<string, any>) : null',
```

**Line 246** — Change the fallback for unmapped custom/store hooks:
```typescript
// Before:
const defaultReturn = isDirectReturn ? '{}' : 'DEFAULT_STATE'
// After:
const defaultReturn = isDirectReturn ? 'null' : 'DEFAULT_STATE'
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-mock-from-analysis.test.ts`
Expected: PASS (all tests including existing ones)

**Step 5: Commit**

```bash
git add packages/cli/src/generator/generate-mock-from-analysis.ts packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts
git commit -m "fix: mock fallback returns null instead of {} (issue #4)"
```

---

### Task 4: ARIA Landmarks in PreviewShell

The PreviewShell layout uses only `<div>` elements with no semantic HTML landmarks. Screen readers can't navigate between panels.

**Files:**
- Modify: `packages/runtime/src/PreviewShell.tsx`

**Step 1: Add semantic landmarks**

In `packages/runtime/src/PreviewShell.tsx`, change the JSX structure to use semantic HTML:

Replace the outer `<div>` with no role change (it's a flex container, fine as div). Change the inner elements:

```tsx
return (
  <div className="flex h-svh bg-neutral-100">
    <aside aria-label="Screen catalog">
      <CatalogPanel />
    </aside>

    <main className="flex flex-1 flex-col overflow-hidden">
      <DeviceFrame
        device={device}
        osMode={osMode}
        responsiveWidth={responsiveWidth}
        responsiveHeight={responsiveHeight}
        onResponsiveResize={setResponsiveSize}
      >
        <ScreenRenderer route={selectedRoute} />
      </DeviceFrame>
    </main>

    <aside aria-label="Inspector">
      <InspectorPanel onLanguageChange={onLanguageChange} />
    </aside>
  </div>
)
```

Note: `CatalogPanel` and `InspectorPanel` render their own root divs with sizing classes, so wrapping in `<aside>` should not break layout. Verify that CatalogPanel's root div doesn't set width on a parent assumption — check its classes.

**Step 2: Verify CatalogPanel and InspectorPanel root elements**

Read `CatalogPanel.tsx` and `InspectorPanel.tsx` to confirm their root elements include width/height classes. If the `<aside>` wrapper breaks flexbox, add `className="contents"` to the `<aside>` to make it transparent to flex layout, or move the `aria-label` directly onto the panel's root div via a prop.

**Simpler alternative if wrapper breaks layout:** Instead of wrapping, add `role="complementary"` and `aria-label` directly to the existing panel root divs inside `CatalogPanel.tsx` and `InspectorPanel.tsx`, and add `role="main"` to the center viewport div.

**Step 3: Build and verify**

Run: `cd packages/runtime && npx tsc --noEmit`
Expected: No type errors.

**Step 4: Commit**

```bash
git add packages/runtime/src/PreviewShell.tsx
git commit -m "fix: add ARIA landmarks to PreviewShell for screen reader navigation"
```

---

### Task 5: Dynamic Island Dark Mode Awareness

The Dynamic Island in `StatusBar.tsx` is hardcoded `bg-black`. In dark mode, it should blend with the dark status bar background rather than standing out.

**Files:**
- Modify: `packages/runtime/src/preview/StatusBar.tsx:63-64`

**Step 1: Implement the fix**

In `packages/runtime/src/preview/StatusBar.tsx`, line 64, change the Dynamic Island `<div>`:

```tsx
// Before:
<div className="absolute left-1/2 top-3 -translate-x-1/2 h-[37px] w-[126px] rounded-full bg-black" />

// After:
<div
  className={cn(
    'absolute left-1/2 top-3 -translate-x-1/2 h-[37px] w-[126px] rounded-full',
    isDark ? 'bg-neutral-950' : 'bg-black'
  )}
  aria-hidden="true"
/>
```

This requires the `isDark` variable to be available in the `StatusBar` component. Currently `StatusBar` receives `osMode` as a prop and the `isDark` derivation is done in `MobileFrame`. Add the derivation to `StatusBar`:

The component already has `osMode` prop. Add at the top of the function body:

```typescript
const isDark = osMode === 'dark'
```

Also add `aria-hidden="true"` to the decorative status bar icons container (line 67):

```tsx
<div className="flex items-center gap-1.5" aria-hidden="true">
```

**Step 2: Build and verify**

Run: `cd packages/runtime && npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add packages/runtime/src/preview/StatusBar.tsx
git commit -m "fix: make Dynamic Island dark-mode-aware and add aria-hidden to decorative elements"
```

---

## Verification

After all 5 tasks are complete:

1. Run full test suite: `pnpm test`
2. Run CLI unit tests: `cd packages/cli && npx vitest run`
3. Run runtime type check: `cd packages/runtime && npx tsc --noEmit`
4. Manual smoke test: run `preview` against a test project and verify:
   - Override controllers load (check browser console for flow registrations)
   - Override regions fully replace base regions (no dead region keys)
   - Mock hooks return `null` when no region data (not `{}`)
   - Screen reader can navigate between panels
   - Dynamic Island adapts to dark mode toggle

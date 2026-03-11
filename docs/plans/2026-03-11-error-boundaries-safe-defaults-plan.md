# Error Boundaries + Safe Defaults Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent all HIGH severity crashes when specs don't declare hooks, by adding null guards, try-catch wrappers, import timeouts, and visible logging.

**Architecture:** 5 surgical edits to 3 files. Generated mock code gets null guard + try-catch. ScreenRenderer gets import timeout. Vite plugin gets console.warn. No new dependencies, no API changes.

**Tech Stack:** TypeScript, React (ScreenErrorBoundary), Vite plugin API

---

### Task 1: Add null guard to generated `resolveStoreState`

**Files:**
- Modify: `packages/cli/src/spec/spec-pipeline-orchestrator.ts:271-276`

**Step 1: Edit the generated `resolveStoreState` function**

Find the lines that generate `resolveStoreState` (around line 271). Change:

```typescript
'function resolveStoreState(stateData: Record<string, any>, fnFields?: string[], dataFields?: string[]) {',
'  const result: Record<string, any> = { ...stateData }',
```

To:

```typescript
'function resolveStoreState(stateData: Record<string, any>, fnFields?: string[], dataFields?: string[]) {',
'  const safe = (stateData && typeof stateData === "object" && !Array.isArray(stateData)) ? stateData : {}',
'  const result: Record<string, any> = { ...safe }',
```

**Step 2: Verify the build compiles**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/cli build`
Expected: PASS (this is generated code as strings, so TypeScript doesn't check the generated output)

**Step 3: Commit**

```bash
cd /Users/loclam/Desktop/preview-tool
git add packages/cli/src/spec/spec-pipeline-orchestrator.ts
git commit -m "fix: add null guard to generated resolveStoreState"
```

---

### Task 2: Wrap generated mock hooks in try-catch

**Files:**
- Modify: `packages/cli/src/spec/spec-pipeline-orchestrator.ts:303-315`

**Step 1: Edit the generated hook function**

Find the `for (const dep of hooks)` loop that generates each mock hook (around line 303). Change the `lines.push(...)` block from:

```typescript
    lines.push(
      `// eslint-disable-next-line @typescript-eslint/no-explicit-any`,
      `export function ${dep.hook}(..._args: any[]) {`,
      `  const data = useRegionDataForHook('${regionKey}')`,
      `  const defaults = ${defaultShapeJson}`,
      `  const merged = data ? { ...defaults, ...(data as Record<string, any>) } : defaults`,
      `  const state = resolveStoreState(merged, [${fnList}], [${dataList}])`,
      `  // Support Zustand selector pattern: useStore((s) => s.field)`,
      `  if (typeof _args[0] === 'function') { try { return _args[0](state) } catch { return state } }`,
      `  return state`,
      `}`,
      '',
    )
```

To:

```typescript
    lines.push(
      `// eslint-disable-next-line @typescript-eslint/no-explicit-any`,
      `export function ${dep.hook}(..._args: any[]) {`,
      `  try {`,
      `    const data = useRegionDataForHook('${regionKey}')`,
      `    const defaults = ${defaultShapeJson}`,
      `    const merged = data ? { ...defaults, ...(data as Record<string, any>) } : defaults`,
      `    const state = resolveStoreState(merged, [${fnList}], [${dataList}])`,
      `    // Support Zustand selector pattern: useStore((s) => s.field)`,
      `    if (typeof _args[0] === 'function') { try { return _args[0](state) } catch { return state } }`,
      `    return state`,
      `  } catch (e) {`,
      `    console.warn('[preview-tool] Mock hook ${dep.hook} failed:', e)`,
      `    return ${defaultShapeJson}`,
      `  }`,
      `}`,
      '',
    )
```

**Step 2: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/cli build`
Expected: PASS

**Step 3: Commit**

```bash
cd /Users/loclam/Desktop/preview-tool
git add packages/cli/src/spec/spec-pipeline-orchestrator.ts
git commit -m "fix: wrap generated mock hooks in try-catch with safe defaults"
```

---

### Task 3: Add timeout to screen module loading

**Files:**
- Modify: `packages/runtime/src/ScreenRenderer.tsx:96-112`

**Step 1: Edit the module loading effect**

Find the `useEffect` that loads screen modules (around line 90). Change:

```typescript
    entry.module()
      .then((mod: ScreenModule) => {
        if (!cancelled) {
          if (!mod.default) {
            setLoadError(new Error(`Screen "${route}" has no default export`))
            return
          }
          setLoaded({ route, Component: mod.default })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err : new Error(String(err)))
        }
      })
```

To:

```typescript
    const LOAD_TIMEOUT_MS = 10_000
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout loading screen "${route}" after ${LOAD_TIMEOUT_MS / 1000}s`)), LOAD_TIMEOUT_MS)
    )

    Promise.race([entry.module(), timeout])
      .then((mod: ScreenModule) => {
        if (!cancelled) {
          if (!mod.default) {
            setLoadError(new Error(`Screen "${route}" has no default export`))
            return
          }
          setLoaded({ route, Component: mod.default })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err : new Error(String(err)))
        }
      })
```

**Step 2: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/runtime build`
Expected: PASS

**Step 3: Commit**

```bash
cd /Users/loclam/Desktop/preview-tool
git add packages/runtime/src/ScreenRenderer.tsx
git commit -m "fix: add 10s timeout to screen module loading"
```

---

### Task 4: Verify error boundary wraps RegionDataProvider

**Files:**
- Read: `packages/runtime/src/ScreenRenderer.tsx:160-170`

**Step 1: Verify current wrapping**

The current render tree at line 160-170 is:

```tsx
<NetworkSimulationLayer key={route}>
  <div style={{ zoom: fontScale }} className="h-full">
    <ScreenErrorBoundary key={route}>
      <FlowProvider>
        <Component regionData={regionData} flags={resolvedFlags} />
      </FlowProvider>
    </ScreenErrorBoundary>
  </div>
</NetworkSimulationLayer>
```

`ScreenErrorBoundary` already wraps `<Component>` and `<FlowProvider>`, but `regionData` is computed **outside** the boundary (line 156-158). If `computeRegionData` throws, it escapes the boundary.

**Step 2: Move region computation inside a safe wrapper**

Change the render section from:

```tsx
  const { Component } = loaded
  const regions = entry.regions
  const resolvedFlags = resolveFlags(entry.flags, featureFlags)
  const regionData = regions
    ? computeRegionData(regions, regionStates, regionListCounts)
    : {}

  return (
    <NetworkSimulationLayer key={route}>
      <div style={{ zoom: fontScale }} className="h-full">
        <ScreenErrorBoundary key={route}>
          <FlowProvider>
            <Component regionData={regionData} flags={resolvedFlags} />
          </FlowProvider>
        </ScreenErrorBoundary>
      </div>
    </NetworkSimulationLayer>
  )
```

To:

```tsx
  const { Component } = loaded
  const regions = entry.regions
  const resolvedFlags = resolveFlags(entry.flags, featureFlags)

  let regionData: Record<string, unknown> = {}
  try {
    regionData = regions
      ? computeRegionData(regions, regionStates, regionListCounts)
      : {}
  } catch (e) {
    console.warn('[preview-tool] Failed to compute region data:', e)
  }

  return (
    <NetworkSimulationLayer key={route}>
      <div style={{ zoom: fontScale }} className="h-full">
        <ScreenErrorBoundary key={route}>
          <FlowProvider>
            <Component regionData={regionData} flags={resolvedFlags} />
          </FlowProvider>
        </ScreenErrorBoundary>
      </div>
    </NetworkSimulationLayer>
  )
```

**Step 3: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/runtime build`
Expected: PASS

**Step 4: Commit**

```bash
cd /Users/loclam/Desktop/preview-tool
git add packages/runtime/src/ScreenRenderer.tsx
git commit -m "fix: wrap computeRegionData in try-catch to prevent error boundary escape"
```

---

### Task 5: Replace silent catches with console.warn in Vite plugin

**Files:**
- Modify: `packages/cli/src/server/vite-plugin-spec-preview.ts:90-95` and `124-129`

**Step 1: Edit buildStart catch block**

Find the `buildStart` method (line 86). Change:

```typescript
      try {
        const result = await runSpecPipeline(manifest.screens, options.cwd, options.specsDir)
        enrichedScreens = result.enrichedScreens
      } catch {
        enrichedScreens = []
      }
```

To:

```typescript
      try {
        const result = await runSpecPipeline(manifest.screens, options.cwd, options.specsDir)
        enrichedScreens = result.enrichedScreens
      } catch (err) {
        console.warn('[preview-tool] Spec pipeline failed during build, falling back to basic mode:', err)
        enrichedScreens = []
      }
```

**Step 2: Edit configureServer catch block**

Find the `configureServer` watcher handler (line 118). Change:

```typescript
          try {
            const result = await runSpecPipeline(manifest.screens, options.cwd, options.specsDir)
            enrichedScreens = result.enrichedScreens
          } catch {
            enrichedScreens = []
          }
```

To:

```typescript
          try {
            const result = await runSpecPipeline(manifest.screens, options.cwd, options.specsDir)
            enrichedScreens = result.enrichedScreens
          } catch (err) {
            console.warn('[preview-tool] Spec pipeline failed during reload, falling back to basic mode:', err)
            enrichedScreens = []
          }
```

**Step 3: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/cli build`
Expected: PASS

**Step 4: Commit**

```bash
cd /Users/loclam/Desktop/preview-tool
git add packages/cli/src/server/vite-plugin-spec-preview.ts
git commit -m "fix: log spec pipeline failures instead of silently swallowing"
```

---

### Task 6: Full build verification and smoke test

**Step 1: Build both packages**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: PASS for both @preview-tool/cli and @preview-tool/runtime

**Step 2: Verify TypeScript types**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm typecheck`
Expected: PASS (or run `pnpm --filter @preview-tool/cli exec tsc --noEmit && pnpm --filter @preview-tool/runtime exec tsc --noEmit`)

**Step 3: Manual smoke test against Roomio**

Run the preview tool against the Roomio project to verify:
1. Screens with well-declared hooks still render correctly (no regression)
2. Screens with missing hooks show error boundary message instead of crash
3. Console shows `[preview-tool]` warnings for any fallback paths hit
4. Module loading timeout doesn't trigger for normal imports (10s is generous)

**Step 4: Final commit if any fixups needed**

```bash
cd /Users/loclam/Desktop/preview-tool
git add -A
git commit -m "chore: fixups from smoke test"
```

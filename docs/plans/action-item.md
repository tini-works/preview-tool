# Preview Tool — Enhancement Proposals

Action items for the preview-tool repo (`@preview-tool/cli` + `@preview-tool/runtime`).
Discovered while wiring sidebar state switching for the Jelvo booking app.

## Priority Matrix

| # | Title | Type | Severity | Effort | Eliminates Workaround |
|---|-------|------|----------|--------|-----------------------|
| 1 | Controller overrides have no runtime effect | Bug | High | Low | Manual flow restore; blocks navigate (e.g. Dashboard → Add Song) |
| 2 | Shallow region merge leaks dead auto-generated regions | Bug | High | Low | Manual region clearing after restart |
| 3 | TypeChecker can't resolve path-aliased imports | Enhancement | Medium | Medium | Override models for every screen |
| 4 | Mock fallback returns `{}` instead of `null` | Bug | Medium | Trivial | `'loading' in regionData` guard |
| 5 | No HMR invalidation for eager glob modules | DX | Low | Medium | Full restart on model/controller edit |
| 6 | Post-restart manual cleanup required | Symptom | — | — | Fixed by 1 + 2 |

---

## Issue 1: Controller overrides have no runtime effect

### Problem

Users create `.preview/overrides/{screen}/controller.ts` with custom flows (e.g. "Add Song" button navigates to add-song screen). The generator correctly skips writing `screens/{screen}/controller.ts` when an override exists — but the controller is never loaded at runtime. The override is invisible: the screen has **no controller at all**.

### Root Cause

**`packages/cli/src/server/generate-entry.ts` ~line 178** — the generated `main.tsx` only globs controllers from `screens/`:

```ts
const controllerModules = import.meta.glob('./screens/*/controller.ts', { eager: true })
```

No corresponding glob exists for `./overrides/*/controller.ts`.

Meanwhile, **`packages/cli/src/generator/index.ts` lines 136–144** skips generation when an override exists:

```ts
const hasControllerOverride = existsSync(join(overrideScreenDir, 'controller.ts'))
// if override exists → skip writing screens/{screen}/controller.ts
```

Net effect: override exists → base file not generated → glob finds nothing → no controller.

### Proposed Fix

Add an override controller glob in `generate-entry.ts` and merge it into the entry, mirroring the existing model override pattern:

```ts
// generate-entry.ts — add alongside existing controller glob
const overrideControllerModules = import.meta.glob('./overrides/*/controller.ts', { eager: true })

// Merge: override wins if present
for (const [path, mod] of Object.entries(overrideControllerModules)) {
  const safeName = path.split('/')[2]
  controllerModules[`./screens/${safeName}/controller.ts`] = mod
}
```

Alternative: when `hasControllerOverride` is true in `generator/index.ts`, **copy** it to `screens/` during generation instead of skipping. Simpler but couples generation to override content.

### Impact

- Enables cross-screen navigation in preview (e.g. Dashboard "Add Song" button → Add Song screen) — currently broken because the flow definition in `overrides/dashboard--dashboard-page/controller.ts` is never loaded
- Eliminates manual flow restoration after every `npm run preview` restart
- Makes controller overrides a first-class feature (matching model overrides)

---

## Issue 2: Shallow region merge leaks dead regions

### Problem

Auto-generated `screens/{screen}/model.ts` contains regions with wrong keys (e.g. `"songs"`, `"quota"`) and null/boolean values derived from `useState` heuristics. User's override provides correct regions (e.g. `"preview-region"` with full mock data). The merge keeps **both** — dead auto-generated regions survive and crash components at runtime.

Example: auto-generated model has `"songs": { states: { default: { songs: null } } }`. Override adds `"preview-region": { ... }`. After merge, **both** exist. The adapter passes `songs: null` to the component, which crashes on `.length`.

### Root Cause

**`packages/cli/src/server/generate-entry.ts` ~line 196** — `mergeOverrides()` uses additive shallow spread:

```ts
function mergeOverrides(base, override) {
  if (!override) return base
  return {
    regions: { ...base.regions, ...(override.regions ?? {}) },
  }
}
```

Override **adds** new keys but never **removes** base keys. Dead regions from the auto-generated model persist.

### Proposed Fix

When override provides any regions, use **replacement** semantics instead of merge:

```ts
function mergeOverrides(base, override) {
  if (!override) return base
  return {
    regions: override.regions ?? base.regions,  // replace, not merge
  }
}
```

Or: in `generator/index.ts`, when a model override exists, write `regions = {}` to the base `screens/{screen}/model.ts` instead of skipping generation entirely. This way the shallow merge still works — `{} + override = override`.

### Impact

- Eliminates manual clearing of dead regions after every restart
- Prevents null-value crashes from auto-generated stubs
- Combined with Issue 1, eliminates all post-restart cleanup

---

## Issue 3: TypeChecker can't resolve path-aliased imports

### Problem

Heuristic fallback produces `null` for hook return fields whose types are imported via `@/` path aliases (e.g. `PlaylistQuota` from `@/types/music`). Components crash on `null.used`, `null.length`, etc.

Example: `useAddSong()` returns `{ quota: PlaylistQuota }` where `PlaylistQuota = { used: number, limit: number }`. The analyzer can't resolve `PlaylistQuota` → generates `quota: null` → component crashes on `quota.used`.

### Root Cause

**`packages/cli/src/analyzer/collect-facts.ts` ~line 998**:

```ts
const project = new Project({
  useInMemoryFileSystem: false,
  tsConfigFilePath: tsConfigPath ?? undefined,
  skipAddingFilesFromTsConfig: true,   // ← Loads compiler options but NOT files
  ...(tsConfigPath ? {} : { compilerOptions: { strict: true, jsx: 4 } }),
})
```

ts-morph loads `compilerOptions` (including `paths: { "@/*": ["./src/*"] }`) from tsconfig. But `skipAddingFilesFromTsConfig: true` means the project's source files are never added. TypeChecker can't resolve `@/types/music` because that file doesn't exist in the project.

The resolution chain: `extractHookReturnType()` in `extract-types.ts` calls `typeChecker.getTypeAtLocation(call)` → follows the return type → hits `@/types/music` import → can't find the file → returns `any` → `isUnresolvable()` returns `true` → field gets `null` in the generated mock.

### Proposed Fix

After creating the ts-morph Project, add files matching the tsconfig `include` patterns:

```ts
const project = new Project({
  useInMemoryFileSystem: false,
  tsConfigFilePath: tsConfigPath ?? undefined,
  skipAddingFilesFromTsConfig: false,  // Allow full type resolution
})
```

If performance is a concern (large projects), a targeted approach:

```ts
// After creating project with skipAddingFilesFromTsConfig: true
// Add only the files needed for type resolution
project.addSourceFilesAtPaths([
  join(cwd, 'src/**/*.ts'),
  join(cwd, 'src/**/*.tsx'),
])
```

The `paths` config is already loaded — just the files are missing.

### Impact

- Eliminates override models for screens with simple type structures
- Generates structurally valid defaults (`{ used: 0, limit: 0 }`) instead of `null`
- LLM mode still preferred for *semantically* rich data, but this prevents crashes

---

## Issue 4: Mock fallback returns `{}` instead of `null`

### Problem

Auto-generated mocks for custom hooks return `{}` (empty object, truthy) when no region data exists. Components checking `regionData !== null` pass the check, then crash accessing fields on `{}`. Users must use `'loading' in regionData` as a workaround to distinguish real data from the empty fallback.

### Root Cause

**`packages/cli/src/analyzer/generate-mock-from-analysis.ts` ~line 246** — hardcoded fallback:

```ts
export function usePreviewRegion(..._args: any[]) {
  const data = useRegionDataForHook('preview-region')
  if (data) return resolveStoreState(data)
  return {}   // ← Should be null
}
```

The runtime's `useRegionDataForHook` correctly returns `null` when there's no `RegionDataProvider` in the tree. But the generated mock wraps it and substitutes `{}`.

### Proposed Fix

Change the fallback from `{}` to `null`:

```ts
export function usePreviewRegion(..._args: any[]) {
  const data = useRegionDataForHook('preview-region')
  if (data) return resolveStoreState(data)
  return null   // Align with runtime contract
}
```

This is a one-line change in mock generation.

### Impact

- Components can use idiomatic `regionData !== null` checks
- Eliminates the `'loading' in regionData` workaround pattern
- Aligns mock behavior with runtime contract

---

## Issue 5: No HMR invalidation for eager glob modules

### Problem

After editing model or controller override files, sidebar state switching doesn't update. The preview tool requires a full restart to pick up changes.

### Root Cause

**`packages/cli/src/server/generate-entry.ts` lines 174–187** — models and controllers use eager globs:

```ts
const modelModules = import.meta.glob('./screens/*/model.ts', { eager: true })
const overrideModules = import.meta.glob('./overrides/*/model.ts', { eager: true })
const controllerModules = import.meta.glob('./screens/*/controller.ts', { eager: true })
```

Vite's HMR for eager globs updates individual modules when their source changes, but doesn't re-evaluate the glob expression itself or re-run the `mergeOverrides()` computation. The merged data structure is stale.

### Proposed Fix

Add `import.meta.hot.accept()` in the generated `main.tsx` to handle model/controller updates:

```ts
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    // Re-evaluate entries and re-render PreviewShell
  })
}
```

Or switch to lazy (non-eager) imports with dynamic re-evaluation:

```ts
const modelModules = import.meta.glob('./screens/*/model.ts')  // lazy
// Re-import on HMR
```

### Impact

- Live-reload model/controller changes without restarting preview
- Faster iteration when tuning states and flows

---

## Issue 6: Post-restart manual cleanup required (Symptom)

Not a standalone bug. This is the combined symptom of Issues 1 and 2:

- **Issue 2** → dead regions regenerated on restart → must manually clear them
- **Issue 1** → controller overrides not loaded → must manually restore flows to `screens/`

**Fixing Issues 1 and 2 eliminates all post-restart cleanup.** No separate fix needed.

---

## Appendix A: Workaround Recipes

Until the upstream issues are fixed, these patterns work in the current preview-tool.

### Override Model Structure

```ts
// .preview/overrides/{safeName}/model.ts
import type { PlaylistQuota } from '@/types/music'

export const regions = {
  "preview-region": {                    // key derived from hook name
    states: {
      "loaded": {
        loading: false,
        songs: [/* full mock Song[] */],
        quota: { used: 3, limit: 5 } as PlaylistQuota,
      },
      "loading": { loading: true, songs: [], quota: { used: 0, limit: 5 } },
      "empty":   { loading: false, songs: [], quota: { used: 0, limit: 5 } },
    },
    defaultState: "loaded",
  },
} as const
```

- Region key must match the auto-derived key: `usePreviewRegion` → `"preview-region"`, `useAddSong` → `"add-song"`
- Each state must contain **all** fields the component reads — partial states crash
- `@/` imports work in overrides (Vite alias is configured in `create-vite-config.ts` line 151)

### Bridge Hook Pattern

```ts
// src/lib/use-preview-region.ts
import { useRegionDataForHook } from '@preview-tool/runtime'

export function usePreviewRegion<T = Record<string, unknown>>(
  regionKey: string
): T | null {
  return useRegionDataForHook(regionKey) as T | null
}
```

Returns `null` outside preview (no `RegionDataProvider` in tree). Returns active state data inside preview.

### Component Branching

```tsx
const regionData = usePreviewRegion<RegionData>('my-section')
const hasPreviewData = regionData !== null && 'loading' in regionData  // Issue 4 workaround

if (hasPreviewData) {
  // Preview branch — data from sidebar state
  if (regionData.loading) return <Skeleton />
  return <RenderWith data={regionData} />
}

// Normal branch — hardcoded mock data + useState timer
```

### Post-Restart Cleanup (until Issues 1+2 are fixed)

After each `npm run preview`:

1. **Clear dead regions** in `screens/{screen}/model.ts` for all screens with overrides — keep `meta`, set `regions = {} as const`
2. **Restore custom flows** in `screens/{screen}/controller.ts` — generator overwrites with `flows = [] as const`

Screens currently needing cleanup: `add-song--add-song-page`, `dashboard--playlist--playlist-section`, `dashboard--dashboard-page` (controller flows).

### Cross-Screen Navigation (Flows)

```ts
// .preview/screens/{safeName}/controller.ts (must be in screens/, not overrides/)
export const flows = [
  {
    trigger: { selector: "button", text: "Add Song" },
    navigate: "/add-song/add-song-page",
  },
] as const
```

Flow actions: `setState` (change state on current screen), `navigate` (go to another screen), `navigateState` (set state on target), `setRegionState` (explicit region + state).

Navigation uses preview-tool's Zustand store (`setSelectedRoute`), **not** React Router. But screens calling `useNavigate()` still need `BrowserRouter` in `wrapper.tsx`.

---

## Appendix B: Preview Tool Data Flow Reference

### In preview (localhost:6100)

```
Sidebar state toggle
  → PreviewShell updates regionData via Zustand store
    → Adapter wraps <Screen /> with <RegionDataProvider regionData={...}>
      → Auto-generated mock intercepts usePreviewRegion()
        → Mock calls useRegionDataForHook('preview-region') to read from context
          → Returns full mock data object for the active state
            → Component renders based on that data
```

### In normal dev server (localhost:5173)

```
Component calls usePreviewRegion('profile')
  → Real implementation calls useRegionDataForHook('profile')
    → No RegionDataProvider in tree → returns null
      → Component falls back to internal mock data + useState timer
```

### Override File Structure

```
client/.preview/
├── overrides/                    ← user-maintained, never overwritten
│   ├── dashboard--dashboard-page/
│   │   └── model.ts
│   ├── dashboard--profile--profile-section/
│   │   └── model.ts
│   ├── dashboard--playlist--playlist-section/
│   │   └── model.ts
│   ├── dashboard--leaderboard--leaderboard-section/
│   │   └── model.ts
│   └── add-song--add-song-page/
│       └── model.ts             ← 8 states for useAddSong hook
├── screens/                      ← regenerated on each npm run preview
│   └── {safeName}/
│       ├── adapter.tsx           ← always regenerated
│       ├── model.ts              ← always regenerated (dead regions! → Issue 2)
│       ├── controller.ts         ← always regenerated (flows lost! → Issue 1)
│       └── view.ts               ← always regenerated
├── mocks/                        ← always regenerated
│   ├── lib-use-preview-region.ts
│   └── use-add-song.ts
└── wrapper.tsx                   ← user-maintained, never overwritten
```

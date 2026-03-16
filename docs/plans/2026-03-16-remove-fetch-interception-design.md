# Remove Fetch Interception Layer

**Date:** 2026-03-16
**Status:** Approved

## Problem

The preview-tool has a fetch interception layer that overrides `window.fetch` to return mock data. This contradicts the tool's core concept: **no backend, pure mock data delivery through hook mocking.**

The hook-mocking layer (Vite aliases + `useRegionDataForHook` via `RegionDataContext`) already handles all data delivery. Components call mocked hooks, get mock data back, and re-render when the inspector panel switches states. The fetch interception layer is redundant infrastructure that adds complexity without serving the tool's purpose.

## Architecture After Removal

```
Spec files → runSpecPipeline() → enrichedScreens + mockFiles + aliasManifest
                                        ↓
              Vite aliases redirect hook imports to .preview/mocks/*.ts
                                        ↓
              Component calls useBookingStore() → mock hook → useRegionDataForHook()
                                        ↓
              RegionDataContext provides stateData for current region state
                                        ↓
              Inspector panel switches state → regionStates change → re-render
```

No `fetch()` override. No `window.__previewMockData`. No `window.__previewFetchHandlers`.

## Files to Delete

| File | Reason |
|------|--------|
| `packages/cli/src/spec/generate-fetch-interceptor.ts` | Fetch interceptor code generator |
| `packages/cli/src/spec/fetch-mock-mapper.ts` | URL-to-mockData key mapper |
| `packages/cli/src/analyzer/discover-fetch.ts` | AST discovery of fetch() calls |
| `packages/cli/src/spec/__tests__/generate-fetch-interceptor.test.ts` | Tests for deleted code |
| `packages/cli/src/spec/__tests__/fetch-mock-mapper.test.ts` | Tests for deleted code |
| `packages/cli/src/analyzer/__tests__/discover-fetch.test.ts` | Tests for deleted code |
| `packages/runtime/src/globals.d.ts` | `window.__previewFetchHandlers/MockData` declarations |
| `packages/cli/src/spec/__tests__/fixtures/src/pages/FetchPage.tsx` | Test fixture for fetch discovery |

## Files to Modify

| File | Change |
|------|--------|
| `packages/cli/src/spec/spec-pipeline-orchestrator.ts` | Remove fetch discovery imports, `discoverFetchCalls` calls, `mapFetchToMockData`, `generateFetchInterceptor`, and `fetchInterceptorCode` from return type |
| `packages/cli/src/spec/types.ts` | Remove `fetchInterceptorCode` from `SpecPipelineResult` |
| `packages/cli/src/server/generate-entry.ts` | Remove `fetchInterceptorCode` parameter from `generateSpecMainTsx` and the fetch block injection |
| `packages/cli/src/commands/dev.ts` | Remove `fetchInterceptorCode` from pipeline result destructuring and `generateEntryFiles` call |
| `packages/runtime/src/ScreenRenderer.tsx` | Remove the synchronous `window.__previewMockData` sync block |

## What Stays Unchanged

- Mock hook generation (Vite aliases → `.preview/mocks/*.ts`)
- `useRegionDataForHook()` via `RegionDataContext`
- `computeRegionData()` for region state switching
- Inspector panel state management
- `usePreviewState` for local-state screens
- Type extraction and nullable field tracking
- Zustand selector aggregation

## Success Criteria

1. `pnpm build` passes with no type errors
2. All remaining tests pass
3. `preview dev` with booking app still renders screens and switches states correctly
4. No references to `fetch` interception, `__previewMockData`, or `__previewFetchHandlers` remain in the codebase

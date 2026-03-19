# API Client Stub for Preview Mode

**Date:** 2026-03-16
**Status:** Approved

## Problem

12 of 20 booking app screens fetch data via inline `useEffect` + `api.get()` calls (not through hooks). The preview-tool's hook mocking doesn't intercept these — the `api.get()` calls fire, fail (no backend), and produce console errors.

The `usePreviewState` transform already overrides `useState` so mock data renders correctly, but the fetch still fires uselessly.

## Solution: Stub the API Client Module via Vite Alias

Use the existing Vite alias mechanism to redirect `@/lib/api` to a generated no-op stub. All `api.get()`, `api.post()`, etc. calls resolve immediately with `{ success: true, data: undefined }`. The `usePreviewState` override provides the actual mock data.

```
Component: import { api } from '@/lib/api'
                    ↓ (Vite alias)
Stub:       api.get() → Promise.resolve({ success: true, data: undefined })
                    ↓
useEffect:  fires, gets empty response, calls setState(undefined)
                    ↓
But:        usePreviewState already overrides useState → mock data wins
```

No network calls. No backend needed. No changes to components.

## API Client Detection

**Primary: Pattern-based (automatic)**

Detect imports where the module path matches API client patterns:
- `@/lib/api`, `~/lib/api`, `../lib/api`
- `@/services/api`, `@/utils/http`, `@/lib/http-client`
- Any path containing `/api` or `/http` where the imported names include `api`, `apiClient`, `http`, `client`

**Fallback: Spec-declared (explicit)**

```yaml
api_client:
  module: "@/lib/api"
  export: "api"
```

## Stub Generation

```typescript
// Auto-generated API client stub for @/lib/api
const noopResponse = { success: true, data: undefined, error: undefined }

const stub = {
  get: () => Promise.resolve(noopResponse),
  post: () => Promise.resolve(noopResponse),
  put: () => Promise.resolve(noopResponse),
  patch: () => Promise.resolve(noopResponse),
  delete: () => Promise.resolve(noopResponse),
}

export const api = stub
export const apiClient = stub
export default stub
```

The `{ success: true, data: undefined }` shape matches common `ApiResponse<T>` interfaces so `result.success` checks pass but `result.data` is undefined — fine because `usePreviewState` overrides the `useState` values.

## Files to Modify

| File | Change |
|------|--------|
| `packages/cli/src/spec/spec-pipeline-orchestrator.ts` | Add API client detection in per-screen loop; generate stub + alias |
| `packages/cli/src/spec/types.ts` | Add optional `apiClient` to `SpecManifestScreen` |
| `packages/cli/src/spec/spec-loader.ts` | Parse `api_client` from spec YAML if present |

## What Stays Unchanged

- Runtime (`usePreviewState`, `RegionDataContext`, `useRegionDataForHook`)
- Vite plugins (alias resolution already handles new entries)
- Hook mocking (store hooks still mocked via existing mechanism)
- Local-state override (`useState` → `usePreviewState` transform)

## Success Criteria

1. `pnpm build` passes
2. `preview dev --specs .specs` on booking app — zero network calls in devtools
3. All 12 inline-fetch pages render with mock data from `usePreviewState`
4. Console has no fetch errors
5. Store-only pages (3) still work via existing hook mocking

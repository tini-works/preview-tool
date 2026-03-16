# API Client Stub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stub API client modules (e.g. `@/lib/api`) via Vite aliases so inline `useEffect` + `api.get()` calls resolve without network calls.

**Architecture:** Detect API client imports from component source files using pattern matching + optional spec-declared override. Generate a no-op stub module that resolves all HTTP methods with `{ success: true, data: undefined }`. Wire it into the existing Vite alias infrastructure.

**Tech Stack:** TypeScript, ts-morph (AST), Zod (schema), Vite (aliases)

---

### Task 1: Add `apiClient` field to types and schema

**Files:**
- Modify: `packages/cli/src/spec/types.ts`

**Step 1: Add `api_client` to `SpecScreenSchema`**

Add an optional `api_client` field to the Zod schema:

```typescript
export const SpecScreenSchema = z.object({
  // ... existing fields ...
  api_client: z.object({
    module: z.string(),
    export: z.string().optional(),
  }).optional(),
})
```

**Step 2: Add `apiClient` to `SpecManifestScreen`**

```typescript
export interface SpecManifestScreen {
  // ... existing fields ...
  apiClient: { module: string; export?: string } | null
}
```

**Step 3: Build to verify**

Run: `pnpm build`
Expected: Type errors in `spec-loader.ts` (missing `apiClient` in push) — that's Task 2.

---

### Task 2: Parse `api_client` from spec YAML in loader

**Files:**
- Modify: `packages/cli/src/spec/spec-loader.ts`

**Step 1: Populate `apiClient` in the screen loop**

In `loadSpecs()`, inside the `for (const raw of rawScreens)` loop, after `routeParams`, add:

```typescript
screens.push({
  // ... existing fields ...
  apiClient: screen.api_client
    ? { module: screen.api_client.module, export: screen.api_client.export }
    : null,
})
```

**Step 2: Build to verify**

Run: `pnpm build`
Expected: Clean build, zero errors.

**Step 3: Commit**

```bash
git add packages/cli/src/spec/types.ts packages/cli/src/spec/spec-loader.ts
git commit -m "feat: add apiClient field to spec types and loader"
```

---

### Task 3: Add API client detection and stub generation to orchestrator

**Files:**
- Modify: `packages/cli/src/spec/spec-pipeline-orchestrator.ts`

**Step 1: Add the `isApiClientImport` detection function**

Add after the existing `isServerFunctionImport` function (around line 661):

```typescript
// ---------------------------------------------------------------------------
// API client detection and stubbing
// ---------------------------------------------------------------------------

/**
 * Known API client path patterns — module path segments that indicate an HTTP client.
 */
const API_CLIENT_PATH_PATTERNS = [
  /\/lib\/api$/,
  /\/lib\/http[-_]?client$/,
  /\/services\/api$/,
  /\/utils\/http$/,
  /\/api[-_]?client$/,
]

/**
 * Known API client export names — if the import path contains `/api` or `/http`
 * AND the imported name matches one of these, treat it as an API client.
 */
const API_CLIENT_EXPORT_NAMES = new Set([
  'api', 'apiClient', 'httpClient', 'http', 'client',
  'Api', 'ApiClient', 'HttpClient',
])

/**
 * Returns true if the import path + imported names look like an API client module.
 */
export function isApiClientImport(
  importPath: string,
  importedNames: string[],
): boolean {
  // Check known path patterns
  for (const pattern of API_CLIENT_PATH_PATTERNS) {
    if (pattern.test(importPath)) return true
  }

  // Check fuzzy: path contains /api or /http AND imported name is a known client name
  if (/\/(api|http)/i.test(importPath)) {
    for (const name of importedNames) {
      if (API_CLIENT_EXPORT_NAMES.has(name)) return true
    }
  }

  return false
}
```

**Step 2: Add the `discoverApiClientImports` function**

```typescript
/**
 * Scan a source file for API client imports.
 * Returns the module paths and their imported names.
 */
export function discoverApiClientImports(
  sf: SourceFile,
  alreadyMocked: Set<string>,
): Array<{ modulePath: string; importedNames: string[] }> {
  const results: Array<{ modulePath: string; importedNames: string[] }> = []

  for (const decl of sf.getImportDeclarations()) {
    const moduleSpec = decl.getModuleSpecifierValue()
    if (alreadyMocked.has(moduleSpec)) continue

    const importedNames: string[] = []
    for (const named of decl.getNamedImports()) {
      importedNames.push(named.getName())
    }
    const defaultImport = decl.getDefaultImport()
    if (defaultImport) {
      importedNames.push(defaultImport.getText())
    }

    if (importedNames.length > 0 && isApiClientImport(moduleSpec, importedNames)) {
      results.push({ modulePath: moduleSpec, importedNames })
    }
  }

  return results
}
```

**Step 3: Add the `generateApiClientStub` function**

```typescript
/**
 * Generate a no-op stub for an API client module.
 * All HTTP methods resolve with { success: true, data: undefined }.
 */
export function generateApiClientStub(
  importPath: string,
  importedNames: string[],
): string {
  const lines = [
    `// Auto-generated API client stub for ${importPath}`,
    `// All HTTP methods resolve with no-op response — usePreviewState provides real data`,
    '',
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    'const noopResponse: any = { success: true, data: undefined, error: undefined }',
    '',
    'const stub = {',
    '  get: () => Promise.resolve(noopResponse),',
    '  post: () => Promise.resolve(noopResponse),',
    '  put: () => Promise.resolve(noopResponse),',
    '  patch: () => Promise.resolve(noopResponse),',
    '  delete: () => Promise.resolve(noopResponse),',
    '  request: () => Promise.resolve(noopResponse),',
    '}',
    '',
  ]

  // Export each imported name as the stub
  for (const name of importedNames) {
    lines.push(`export const ${name} = stub`)
  }

  // Always add default export
  lines.push('')
  lines.push('export default stub')
  lines.push('')

  return lines.join('\n')
}
```

**Step 4: Wire detection into `runSpecPipeline`**

In the per-screen loop (inside `for (const { screen, absPath, sf }` block), after the existing AST hook discovery, add API client detection. The detected modules get collected into a set:

Before the `// Server function detection` block (around line 920), add:

```typescript
  // API client detection (from component source + spec declaration)
  const apiClientModules = new Map<string, string[]>()

  for (const { screen, absPath, sf } of screensWithSource) {
    // Spec-declared API client takes priority
    if (screen.apiClient) {
      const mod = screen.apiClient.module
      if (!apiClientModules.has(mod)) {
        apiClientModules.set(mod, [screen.apiClient.export ?? 'api'])
      }
    }

    // AST-discovered API client imports
    if (sf) {
      const apiImports = discoverApiClientImports(sf, new Set(mockFiles.keys()))
      for (const { modulePath, importedNames } of apiImports) {
        if (apiClientModules.has(modulePath)) {
          // Merge imported names
          const existing = apiClientModules.get(modulePath)!
          for (const n of importedNames) {
            if (!existing.includes(n)) existing.push(n)
          }
        } else {
          apiClientModules.set(modulePath, [...importedNames])
        }
      }
    }
  }

  // Generate API client stubs
  for (const [modulePath, importedNames] of apiClientModules) {
    if (mockFiles.has(modulePath)) continue
    mockFiles.set(modulePath, generateApiClientStub(modulePath, importedNames))
  }
```

**Step 5: Build to verify**

Run: `pnpm build`
Expected: Clean build, zero errors.

**Step 6: Commit**

```bash
git add packages/cli/src/spec/spec-pipeline-orchestrator.ts
git commit -m "feat: detect API client imports and generate no-op stubs"
```

---

### Task 4: Add tests for API client detection and stub generation

**Files:**
- Modify: `packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts`

**Step 1: Add test for `isApiClientImport`**

```typescript
import {
  isApiClientImport,
  generateApiClientStub,
} from '../spec-pipeline-orchestrator.js'

describe('isApiClientImport', () => {
  it('detects @/lib/api', () => {
    expect(isApiClientImport('@/lib/api', ['api'])).toBe(true)
  })

  it('detects @/services/api', () => {
    expect(isApiClientImport('@/services/api', ['apiClient'])).toBe(true)
  })

  it('detects @/lib/http-client', () => {
    expect(isApiClientImport('@/lib/http-client', ['httpClient'])).toBe(true)
  })

  it('detects fuzzy: /utils/api-helpers with api export', () => {
    expect(isApiClientImport('@/utils/api-helpers', ['api'])).toBe(true)
  })

  it('rejects non-API imports', () => {
    expect(isApiClientImport('@/stores/auth-store', ['useAuthStore'])).toBe(false)
  })

  it('rejects path with /api but non-client export names', () => {
    expect(isApiClientImport('@/hooks/use-api-data', ['useApiData'])).toBe(false)
  })
})
```

**Step 2: Add test for `generateApiClientStub`**

```typescript
describe('generateApiClientStub', () => {
  it('generates stub with all HTTP methods', () => {
    const stub = generateApiClientStub('@/lib/api', ['api'])
    expect(stub).toContain('get: () => Promise.resolve(noopResponse)')
    expect(stub).toContain('post: () => Promise.resolve(noopResponse)')
    expect(stub).toContain('put: () => Promise.resolve(noopResponse)')
    expect(stub).toContain('patch: () => Promise.resolve(noopResponse)')
    expect(stub).toContain('delete: () => Promise.resolve(noopResponse)')
    expect(stub).toContain('export const api = stub')
    expect(stub).toContain('export default stub')
  })

  it('exports all imported names', () => {
    const stub = generateApiClientStub('@/lib/api', ['api', 'apiClient'])
    expect(stub).toContain('export const api = stub')
    expect(stub).toContain('export const apiClient = stub')
  })
})
```

**Step 3: Run tests**

Run: `pnpm build && pnpm test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add packages/cli/src/spec/__tests__/spec-pipeline-orchestrator.test.ts
git commit -m "test: add API client detection and stub generation tests"
```

---

### Task 5: Build verification and booking app test

**Step 1: Full build**

Run: `pnpm build`
Expected: Clean, zero errors.

**Step 2: Full test suite**

Run: `pnpm test`
Expected: All tests pass.

**Step 3: Test with booking app**

```bash
cd /Users/loclam/Desktop/booking/client
npx preview dev --specs .specs
```

Verify:
- `alias-manifest.json` includes `@/lib/api` → `./mocks/lib-api.ts`
- Generated mock file at `.preview/mocks/lib-api.ts` contains the no-op stub
- Browser devtools Network tab shows zero API calls
- Console shows no fetch errors
- All 12 inline-fetch pages render with mock data

**Step 4: Commit plan doc**

```bash
git add docs/plans/2026-03-16-api-client-stub-plan.md
git commit -m "docs: add implementation plan for API client stubbing"
```

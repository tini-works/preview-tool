# Zustand Store Mock Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make preview-tool generate correct mocks for Zustand stores — return state directly (no `{ data, isLoading }` wrapper), include no-op function stubs for store methods, and populate all fields each screen actually uses.

**Architecture:** Three changes along the existing pipeline: (1) parse destructured fields from `returnVariable` text in `collect-facts.ts`, (2) pass `hookMappingType` into mock generator so it can choose store-direct vs query-wrapper return shape, (3) generate no-op stubs for fields used as functions. No runtime changes needed — `useRegionDataForHook` already returns raw state data, the wrapping happens in the generated `resolveFromState`.

**Tech Stack:** TypeScript, ts-morph (AST), Vitest

---

### Task 1: Add `destructuredFields` to HookFact type

**Files:**
- Modify: `packages/cli/src/analyzer/types.ts:171-180`

**Step 1: Write the failing test**

Add to `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`:

```typescript
it('parses destructured fields from returnVariable', () => {
  const sf = createSourceFile(`
    import { useAuthStore } from '@/stores/auth-store'
    function Screen() {
      const { login, isLoading, error, clearError } = useAuthStore()
      return <div />
    }
  `)
  const hooks = extractHookFacts(sf)
  expect(hooks).toHaveLength(1)
  expect(hooks[0].returnVariable).toBe('{ login, isLoading, error, clearError }')
  expect(hooks[0].destructuredFields).toEqual([
    'login', 'isLoading', 'error', 'clearError'
  ])
})

it('returns undefined destructuredFields for non-destructured returns', () => {
  const sf = createSourceFile(`
    import { useAuthStore } from '@/stores/auth-store'
    function Screen() {
      const store = useAuthStore()
      return <div />
    }
  `)
  const hooks = extractHookFacts(sf)
  expect(hooks[0].destructuredFields).toBeUndefined()
})

it('parses destructured fields with renamed bindings', () => {
  const sf = createSourceFile(`
    import { useAuthStore } from '@/stores/auth-store'
    function Screen() {
      const { error: storeError, isLoading } = useAuthStore()
      return <div />
    }
  `)
  const hooks = extractHookFacts(sf)
  expect(hooks[0].destructuredFields).toEqual(['error', 'isLoading'])
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts -t "parses destructured fields"`
Expected: FAIL — `destructuredFields` property doesn't exist on HookFact

**Step 3: Add type and implementation**

In `packages/cli/src/analyzer/types.ts`, add to `HookFact`:

```typescript
export interface HookFact {
  name: string
  importPath: string
  arguments: string[]
  returnVariable?: string
  /** Parsed field names from object destructuring pattern, e.g. ['login', 'isLoading'] */
  destructuredFields?: string[]
}
```

In `packages/cli/src/analyzer/collect-facts.ts`, modify `extractReturnVariable` to also return parsed fields:

```typescript
interface ReturnInfo {
  variable?: string
  destructuredFields?: string[]
}

function extractReturnInfo(call: CallExpression): ReturnInfo {
  const parent = call.getParent()
  if (!parent) return {}

  if (parent.isKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = parent.getNameNode()
    const text = nameNode.getText()

    // Object destructuring: { login, isLoading, error }
    if (nameNode.isKind(SyntaxKind.ObjectBindingPattern)) {
      const fields = nameNode.getElements().map((el) => {
        // For renamed bindings like { error: storeError }, use the property name (error)
        const propertyName = el.getPropertyNameNode()
        return propertyName ? propertyName.getText() : el.getNameNode().getText()
      })
      return { variable: text, destructuredFields: fields }
    }

    return { variable: text }
  }

  return {}
}
```

Update the hook extraction loop in `extractHookFacts` to use `extractReturnInfo`:

```typescript
const { variable: returnVariable, destructuredFields } = extractReturnInfo(call)

hooks.push({
  name,
  importPath,
  arguments: args,
  ...(returnVariable ? { returnVariable } : {}),
  ...(destructuredFields ? { destructuredFields } : {}),
})
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/types.ts packages/cli/src/analyzer/collect-facts.ts packages/cli/src/analyzer/__tests__/collect-facts.test.ts
git commit -m "feat(analyzer): parse destructured fields from hook return patterns"
```

---

### Task 2: Pass hookMappingType into mock generator

**Files:**
- Modify: `packages/cli/src/generator/generate-mock-from-analysis.ts`
- Test: `packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts`

**Step 1: Write the failing test**

Add to `packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts`:

```typescript
it('generates store mock that returns state directly (no resolveFromState wrapper)', () => {
  const storeFacts: ScreenFacts[] = [{
    route: '/home',
    filePath: '/home.tsx',
    sourceCode: '',
    hooks: [
      { name: 'useAuthStore', importPath: '@/stores/auth', arguments: [], destructuredFields: ['user', 'logout'] },
    ],
    components: [], conditionals: [], navigation: [],
  }]
  const storeAnalyses: ScreenAnalysisOutput[] = [{
    route: '/home',
    regions: [{
      key: 'auth-store',
      label: 'Auth Store',
      type: 'auth',
      hookBindings: ['useAuthStore:auth-store'],
      states: { authenticated: { label: 'A', mockData: { user: { name: 'Alice' }, isAuthenticated: true } } },
      defaultState: 'authenticated',
    }],
    flows: [],
  }]
  const result = generateMockModules(storeFacts, storeAnalyses)
  const code = result.mockFiles.get('@/stores/auth')!

  // Store mock should return stateData directly, not wrapped
  expect(code).toContain('return stateData')
  // Should NOT use the query-style resolveFromState
  expect(code).not.toContain('data: stateData.data ?? stateData')
})

it('generates query-hook mock with resolveFromState wrapper', () => {
  const queryFacts: ScreenFacts[] = [{
    route: '/list',
    filePath: '/list.tsx',
    sourceCode: '',
    hooks: [
      { name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['items'] }"], destructuredFields: ['data', 'isLoading'] },
    ],
    components: [], conditionals: [], navigation: [],
  }]
  const queryAnalyses: ScreenAnalysisOutput[] = [{
    route: '/list',
    regions: [{
      key: 'items',
      label: 'Items',
      type: 'list',
      hookBindings: ['useQuery:items'],
      states: { populated: { label: 'P', mockData: { data: [{ id: '1' }] } } },
      defaultState: 'populated',
    }],
    flows: [],
  }]
  const result = generateMockModules(queryFacts, queryAnalyses)
  const code = result.mockFiles.get('@tanstack/react-query')!

  // Query mock should use resolveFromState wrapper
  expect(code).toContain('resolveFromState')
  expect(code).toContain('data: stateData.data ?? stateData')
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-mock-from-analysis.test.ts -t "store mock"`
Expected: FAIL — store mock still uses `resolveFromState`

**Step 3: Implement type-aware mock generation**

Modify `generateMockModules` to build a `hookToType` map alongside `hookToRegion`, then pass it to `generateMockFile`.

In `generate-mock-from-analysis.ts`:

1. Add `hookMappingType` lookup using `inferHookMappingType` (import from `generate-from-analysis.ts` or inline):

```typescript
import { inferHookMappingType } from './generate-from-analysis.js'
```

Wait — `inferHookMappingType` is not exported. We need to either export it or duplicate the logic. Better to export it.

First, in `generate-from-analysis.ts`, export `inferHookMappingType`:

```typescript
export function inferHookMappingType(hookName: string): HookMappingType {
```

Then in `generate-mock-from-analysis.ts`:

```typescript
import { inferHookMappingType } from './generate-from-analysis.js'
```

2. Build `hookToType` map in `generateMockModules`:

```typescript
// Also track hook mapping types for type-aware mock generation
const hookToType = new Map<string, HookMappingType>()
for (const analysis of allAnalyses) {
  for (const region of analysis.regions) {
    for (const binding of region.hookBindings) {
      const parsed = parseHookBinding(binding)
      if (!parsed) continue
      hookToType.set(parsed.hookName, inferHookMappingType(parsed.hookName))
    }
  }
}
```

3. Update `generateMockFile` signature and body:

```typescript
function generateMockFile(
  hooks: Array<{ name: string }>,
  hookToRegion: Map<string, string>,
  hookToType: Map<string, HookMappingType>,
  importPath: string,
): string {
```

4. In the mock file generation, generate two resolver functions and choose based on type:

```typescript
// Add store resolver
lines.push(
  '',
  '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
  'function resolveFromState(stateData: Record<string, any>) {',
  "  if (stateData._loading) return { data: undefined, isLoading: true, isError: false, isReady: false }",
  "  if (stateData._error) return { data: undefined, isLoading: false, isError: true, isReady: false, error: stateData.message }",
  '  return { data: stateData.data ?? stateData, isLoading: false, isError: false, isReady: true }',
  '}',
  '',
  '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
  'function resolveStoreState(stateData: Record<string, any>) {',
  '  return stateData',
  '}',
  '',
)
```

Then per hook, choose resolver:

```typescript
const mappingType = hookToType.get(hookName)
const resolver = mappingType === 'store' ? 'resolveStoreState' : 'resolveFromState'
const defaultReturn = mappingType === 'store' ? '{}' : 'DEFAULT_STATE'

lines.push(
  `export function ${hookName}(..._args: any[]) {`,
  `  const data = useRegionDataForHook('${regionKey}')`,
  `  if (data) return ${resolver}(data as Record<string, any>)`,
  `  return ${defaultReturn}`,
  '}',
)
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-mock-from-analysis.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/generator/generate-mock-from-analysis.ts packages/cli/src/generator/generate-from-analysis.ts packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts
git commit -m "feat(generator): type-aware mock resolver — stores return state directly"
```

---

### Task 3: Generate no-op function stubs for store action fields

**Files:**
- Modify: `packages/cli/src/generator/generate-mock-from-analysis.ts`
- Test: `packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts`

**Step 1: Write the failing test**

```typescript
it('generates no-op stubs for destructured function fields in store mocks', () => {
  const storeFacts: ScreenFacts[] = [{
    route: '/login',
    filePath: '/login.tsx',
    sourceCode: '',
    hooks: [
      {
        name: 'useAuthStore',
        importPath: '@/stores/auth',
        arguments: [],
        destructuredFields: ['login', 'isLoading', 'error', 'clearError'],
      },
    ],
    components: [], conditionals: [], navigation: [],
  }]
  const storeAnalyses: ScreenAnalysisOutput[] = [{
    route: '/login',
    regions: [{
      key: 'auth-store',
      label: 'Auth Store',
      type: 'auth',
      hookBindings: ['useAuthStore:auth-store'],
      states: {
        default: { label: 'Default', mockData: { isLoading: false, error: null } },
      },
      defaultState: 'default',
    }],
    flows: [],
  }]
  const result = generateMockModules(storeFacts, storeAnalyses)
  const code = result.mockFiles.get('@/stores/auth')!

  // Should have no-op stubs for fields not in mockData (login, clearError are actions)
  expect(code).toContain('const NOOP')
  expect(code).toContain('login')
  expect(code).toContain('clearError')
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-mock-from-analysis.test.ts -t "no-op stubs"`
Expected: FAIL

**Step 3: Implement no-op stub generation**

The approach: collect all `destructuredFields` across all screens for each hook. Fields that appear in `destructuredFields` but NOT in any region's `mockData` are likely functions — generate no-op stubs for them.

In `generateMockModules`, build a map of hook → all destructured fields:

```typescript
// Collect destructured fields per hook for no-op stub generation
const hookDestructuredFields = new Map<string, Set<string>>()
for (const facts of allFacts) {
  for (const hook of facts.hooks) {
    if (!hook.destructuredFields) continue
    const key = `${hook.importPath}::${hook.name}`
    const existing = hookDestructuredFields.get(key) ?? new Set<string>()
    for (const field of hook.destructuredFields) {
      existing.add(field)
    }
    hookDestructuredFields.set(key, existing)
  }
}
```

Pass this into `generateMockFile`. Then in the store resolver, merge no-op stubs:

```typescript
// For store hooks, generate no-op stubs for action fields
if (mappingType === 'store') {
  const allFields = hookDestructuredFields.get(`${importPath}::${hookName}`)
  if (allFields && allFields.size > 0) {
    const fieldsList = [...allFields].map(f => `'${f}'`).join(', ')
    lines.push(
      `const _${hookName}_fields = [${fieldsList}]`,
    )
  }
}
```

Better approach — in the `resolveStoreState` function, have it accept the expected fields and fill in no-ops:

```typescript
'function resolveStoreState(',
'  stateData: Record<string, any>,',
'  fields?: string[],',
') {',
'  if (!fields) return stateData',
'  const result: Record<string, any> = { ...stateData }',
'  for (const f of fields) {',
'    if (!(f in result)) result[f] = NOOP',
'  }',
'  return result',
'}',
```

And at the top:

```typescript
'// eslint-disable-next-line @typescript-eslint/no-explicit-any',
'const NOOP = (() => {}) as any',
'const ASYNC_NOOP = (async () => {}) as any',
```

Then per hook call:

```typescript
const allFields = hookDestructuredFields.get(`${importPath}::${hookName}`)
if (mappingType === 'store' && allFields && allFields.size > 0) {
  const fieldsList = [...allFields].map(f => `'${f}'`).join(', ')
  lines.push(
    `export function ${hookName}(..._args: any[]) {`,
    `  const data = useRegionDataForHook('${regionKey}')`,
    `  if (data) return resolveStoreState(data as Record<string, any>, [${fieldsList}])`,
    `  return resolveStoreState({}, [${fieldsList}])`,
    '}',
  )
} else {
  // existing code for non-store hooks
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-mock-from-analysis.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/generator/generate-mock-from-analysis.ts packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts
git commit -m "feat(generator): generate no-op function stubs for store action fields"
```

---

### Task 4: Enrich LLM prompt with destructured fields for better state generation

**Files:**
- Modify: `packages/cli/src/llm/prompts/understand-screens.ts`
- Test: `packages/cli/src/llm/schemas/__tests__/screen-analysis.test.ts`

**Step 1: Write the failing test**

Add to a new test or existing schema test:

```typescript
it('prompt includes destructured fields for store hooks', () => {
  const facts: ScreenFacts[] = [{
    route: '/login',
    filePath: 'src/pages/LoginPage.tsx',
    sourceCode: 'const { login, isLoading, error, clearError } = useAuthStore()',
    hooks: [{
      name: 'useAuthStore',
      importPath: '@/stores/auth-store',
      arguments: [],
      returnVariable: '{ login, isLoading, error, clearError }',
      destructuredFields: ['login', 'isLoading', 'error', 'clearError'],
    }],
    components: [], conditionals: [], navigation: [],
  }]
  const prompt = buildUnderstandScreensPrompt(facts)
  // Should include destructured field info
  expect(prompt).toContain('fields: login, isLoading, error, clearError')
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/llm --passWithNoTests`
Expected: FAIL — prompt doesn't include field info

**Step 3: Update prompt builder**

In `understand-screens.ts`, modify the hook formatting line to include destructured fields:

```typescript
const hooksSection = facts.hooks.length > 0
  ? `Hooks called:\n${facts.hooks.map((h) => {
      let line = `  - ${h.name}(${h.arguments.join(', ')}) from "${h.importPath}"`
      if (h.returnVariable) line += ` → ${h.returnVariable}`
      if (h.destructuredFields && h.destructuredFields.length > 0) {
        line += ` [fields: ${h.destructuredFields.join(', ')}]`
      }
      return line
    }).join('\n')}`
  : 'No hooks detected.'
```

Add a rule to the prompt instructions:

```
- For store hooks (useXxxStore), the mockData MUST include ALL destructured fields as keys.
  Fields that are functions (e.g., login, logout, clearError) should be OMITTED from mockData — they will be auto-stubbed.
  Fields that are data (e.g., user, isLoading, error) MUST be included with realistic values.
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/llm`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/llm/prompts/understand-screens.ts packages/cli/src/llm/schemas/__tests__/screen-analysis.test.ts
git commit -m "feat(llm): enrich prompt with destructured fields for store-aware state generation"
```

---

### Task 5: Integration test — regenerate booking app preview and verify

**Files:**
- No code changes — validation only

**Step 1: Build the CLI**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Build succeeds

**Step 2: Run unit tests**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm test`
Expected: All tests pass

**Step 3: Regenerate the booking app preview**

Run: `cd /Users/loclam/Desktop/booking/client && npx preview-tool generate` (or however the CLI is invoked)

**Step 4: Verify the generated mock**

Check `client/.preview/mocks/stores-auth-store.ts`:
- Should contain `resolveStoreState` (not `resolveFromState` for the store hook)
- Should contain `NOOP` stubs
- Should list destructured fields like `login`, `logout`, `clearError`

Check `client/.preview/screens/LoginPage/model.ts`:
- States should include `isLoading`, `error` fields
- Should have states like `default`, `loading`, `error` (not just `authenticated`/`unauthenticated`)

**Step 5: Commit (if any fixture updates needed)**

```bash
git commit -m "test: verify zustand store mock generation with booking app"
```

---

## Summary of Changes

| File | Change | Why |
|------|--------|-----|
| `analyzer/types.ts` | Add `destructuredFields?: string[]` to `HookFact` | Parse which fields each screen uses from the store |
| `analyzer/collect-facts.ts` | Parse `ObjectBindingPattern` in `extractReturnInfo` | Extract structured field names instead of raw text |
| `generator/generate-from-analysis.ts` | Export `inferHookMappingType` | Share type inference with mock generator |
| `generator/generate-mock-from-analysis.ts` | Type-aware resolver + no-op stubs | Stores return state directly; action fields get `NOOP` |
| `llm/prompts/understand-screens.ts` | Include destructured fields in prompt | LLM generates all data fields, not just entity data |

**No runtime changes.** The fix is entirely in the CLI's analysis → generation pipeline.

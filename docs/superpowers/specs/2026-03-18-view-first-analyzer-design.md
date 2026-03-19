# View-First Analyzer — Design Spec

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the plan derived from this spec.

**Goal:** Replace the current hook-pattern-classification approach with a view-first analyzer that extracts data shapes from JSX, uses a universal mock for all hooks, and eliminates the entire hook classification layer.

**Problem:** The current pipeline classifies hooks into 5 patterns (zustand, query, context, local-state, custom), generates pattern-specific mocks for each, and produces cascading bugs when classification is wrong. The preview tool's concept is simple — show screen scenarios with mock data — but the hook classification layer adds accidental complexity.

**Key Insight:** The VIEW (JSX) is the source of truth for what data a screen needs. The hook pattern doesn't matter — all hooks are just pipes that deliver data. A universal mock can replace all pattern-specific mocks.

---

## Architecture

### Current (hook-first) — being replaced

```
spec + AST → classify hook patterns → generate pattern-specific mocks → wire Vite aliases
                    ↑ fragile
```

### New (view-first)

```
1. View Analysis:   JSX → extract field names, types, conditions → ViewShape
2. Hook Mapping:    imports → trace variables to hooks → HookSource[]
3. Spec Merge:      ViewShape + spec mockData → validated mock data per state
4. Universal Mock:  ONE template for all hooks → returns region data
5. Vite Wiring:     alias manifest → same as today
```

The hook classification layer (zustand vs query vs context) is eliminated entirely.

---

## Data Flow

```
                    ┌─────────────┐
                    │  Spec YAML  │  (states, mockData, data_deps, translations)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Code Map   │  (screen ID → source file path)
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │   View-First Analyzer   │
              │                         │
              │  1. Read screen file    │
              │  2. Follow all imports  │  (full component tree)
              │  3. Extract JSX usage   │  (field names, types, conditions)
              │  4. Trace to hook       │  (variable → declaration → import)
              │  5. Read hook return    │  (return shape extraction)
              └────────────┬────────────┘
                           │
                    ┌──────▼──────┐
                    │  ViewShape  │
                    │  {          │
                    │    fields: [ { name, type, source } ]
                    │    conditions: [ { field, states } ]
                    │    hookImports: [ { hook, module, fields } ]
                    │  }          │
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │    Merge with Spec      │
              │                         │
              │  spec mockData provides │  (values for each state)
              │  ViewShape provides     │  (field names + types for validation)
              │  auto-fill gaps         │  (default values by type)
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   Universal Mock Gen    │
              │                         │
              │  ONE template per hook  │
              │  No pattern detection   │
              │  Proxy for missing fns  │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   Vite Alias Manifest   │  (same as today)
              │   + Region Definitions  │  (same as today)
              └─────────────────────────┘
```

---

## Core Types

### ViewField — extracted from JSX usage

```ts
interface ViewField {
  name: string            // e.g., "user.name", "isLoading", "items"
  path: string[]          // e.g., ["user", "name"] — property access chain
  inferredType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function' | 'unknown'
  usageContext: 'rendered' | 'condition' | 'event-handler' | 'prop' | 'iterator'
  sourceVariable: string  // the top-level variable this traces back to (e.g., "user")
}
```

### ViewCondition — extracted from conditional rendering

```ts
interface ViewCondition {
  expression: string       // e.g., "isLoading", "error", "items.length === 0"
  fields: string[]         // fields involved in the condition
  impliedState: string     // e.g., "loading", "error", "empty" (heuristic name)
}
```

### HookSource — traced from variable to import

```ts
interface HookSource {
  hookName: string         // e.g., "useAuthStore"
  modulePath: string       // e.g., "@/stores/auth-store"
  returnFields: string[]   // fields extracted from hook return shape
  calledWith: 'selector' | 'no-args' | 'args'  // how the hook is called
}
```

### ViewShape — complete analysis output per screen

```ts
interface ViewShape {
  screenId: string
  fields: ViewField[]
  conditions: ViewCondition[]
  hookSources: HookSource[]
  localState: LocalStateFact[]   // reuse existing type
  staticTexts: string[]          // hardcoded JSX text (for i18n)
}
```

---

## View Analysis Rules

### Field Type Inference from JSX

| JSX Pattern | Inferred Type | Example |
|-------------|--------------|---------|
| `{field}` rendered as text child | string | `<p>{user.name}</p>` |
| `{field && <Component />}` | boolean | `{isLoading && <Spinner />}` |
| `{field ? <A /> : <B />}` | boolean | `{error ? <Error /> : <Content />}` |
| `{field.map(x => ...)}` | array | `{items.map(i => <Row />)}` |
| `onClick={field}` / `onSubmit={field}` | function | `<Button onClick={logout} />` |
| `{field > 0 && ...}` | number | `{count > 0 && <Badge />}` |
| `{field?.prop}` | nullable object | `{user?.avatar}` |

### Array Inner Shape

When encountering `.map()`, analyze the callback body:

```tsx
{items.map(item => (
  <div>
    <h3>{item.title}</h3>        // title: string
    <p>{item.description}</p>    // description: string
    <Badge>{item.status}</Badge> // status: string
  </div>
))}
```

Result: `items` is `{ title: string, description: string, status: string }[]`

### State Derivation from Conditions

Common patterns that map to states:

| Condition Pattern | Derived State |
|-------------------|--------------|
| `isLoading && ...` | "loading" |
| `error && ...` | "error" |
| `items.length === 0 && ...` | "empty" |
| `!isLoading && !error && items.length > 0` | "populated" |
| `isOffline && ...` | "offline" |

### Variable-to-Hook Tracing

```tsx
const { user, logout } = useAuthStore()
//      ↑                   ↑
//      ViewField            HookSource
//      name: "user"         hookName: "useAuthStore"
//      source: "user"       modulePath: "@/stores/auth-store"
```

For intermediate transforms:
```tsx
const { data } = useQuery(...)
const users = data?.users ?? []         // trace: users ← data.users ← useQuery
const active = users.filter(u => u.ok)  // trace: active ← users ← data.users ← useQuery
{active.map(u => <p>{u.name}</p>)}
```

The analyzer traces `active` → `users` → `data.users` → `useQuery` return. The mock provides `data.users` and the component transforms it naturally.

### Bottom-Up Component Analysis

For child components:
```tsx
// Parent (screen):
<UserList users={data.users} onDelete={removeUser} />

// Child:
function UserList({ users, onDelete }) {
  return users.map(u => <div>{u.name} <button onClick={() => onDelete(u.id)} /></div>)
}
```

1. Analyze `UserList` first → `users` is `{ name: string, id: unknown }[]`, `onDelete` is function
2. In parent, `data.users` maps to the child's `users` prop shape
3. Result: `useQuery().data.users` must be `{ name: string, id: unknown }[]`

**Depth:** Analyze ALL files imported by the screen (full tree). Stop at node_modules boundaries and third-party components.

---

## Universal Mock

### Hook Categories (2 categories, not 5)

Instead of classifying into 5 patterns, hooks fall into exactly 2 categories:

| Category | What happens | Example |
|----------|-------------|---------|
| **Data hooks** | Universal mock → returns region data | `useAuthStore`, `useQuery`, `useTaskList`, any app-specific hook |
| **Passthrough hooks** | NOT mocked — use real library via wrapper | `useNavigate`, `useParams`, `useForm`, `useTranslation` |

**How to decide:** The view analyzer checks if the hook's return value is used in JSX rendering (data) or only in event handlers/effects (passthrough). Additionally, a small static allowlist of known passthrough packages covers the common cases:

```ts
const PASSTHROUGH_PACKAGES = new Set([
  'react-router-dom',     // useNavigate, useParams, useSearchParams, useLocation
  'react-hook-form',      // useForm, useFormContext
  'react-i18next',        // useTranslation
  '@tanstack/react-router', // useRouter, useMatch
])
```

Hooks from passthrough packages are NOT mocked — they use real providers in `wrapper.tsx`. All other hooks get the universal mock.

This replaces the current 5-way classification with a simple binary decision.

### Template (ONE for all data hooks)

Every data hook mock uses the same function body:

```ts
import { useRegionDataForHook } from '@preview-tool/runtime'

const NOOP = (() => {}) as any

function smartProxy(data: Record<string, unknown>) {
  return new Proxy(data, {
    get(t, k) {
      if (typeof k === 'symbol') return t[k as any]
      // Known key → return real value
      if (k in t) return t[k as any]
      // Unknown key → return undefined (NOT NOOP)
      // This ensures falsy checks work: if (!user) → true when user is missing
      return undefined
    }
  })
}

export function useHookName(...args: any[]) {
  const data = useRegionDataForHook('region-key') ?? {}
  const proxied = smartProxy(data)
  // Support zustand selector pattern: useStore((s) => s.field)
  if (typeof args[0] === 'function') {
    try { return args[0](proxied) } catch { return proxied }
  }
  return proxied
}
```

**Proxy behavior for missing fields:**
- Missing **data** field → `undefined` (falsy, safe for `if (!user)` checks)
- Known function field (from ViewShape) → `NOOP` injected into region data at generation time
- This avoids the truthy-NOOP bug where `if (!user)` would pass because NOOP is truthy

### Hooks returning tuples

Some hooks return arrays, not objects: `useState` returns `[value, setter]`, `useSearchParams` returns `[params, setParams]`.

**Strategy:** The view analyzer detects array destructuring at the call site:
```tsx
const [params, setParams] = useSearchParams()
```

When a hook returns a tuple, the mock wraps region data in an array:
```ts
export function useSearchParams(..._args: any[]) {
  const data = useRegionDataForHook('search-params') ?? {}
  return [data, NOOP]  // [value, setter]
}
```

The ViewShape records `calledWith: 'tuple-destructure'` on the HookSource, and the universal mock generator emits the array wrapper variant.

### Static methods (Zustand-specific accommodation)

For stores that use `.getState()` outside React (e.g., in event handlers):

```ts
useHookName.getState = () => useRegionDataForHook('region-key') ?? {}
useHookName.setState = NOOP
useHookName.subscribe = () => NOOP
```

This is the ONE library-specific accommodation. It is triggered when the view analyzer sees `useHookName.getState()` usage in the component code.

---

## Language Switching (i18n)

### Approach: Vite Transform + Zustand Store (no reload, no hooks violation)

1. **Build time:** Vite plugin transforms hardcoded strings in JSX:
   ```tsx
   // Before:
   <span>Termin buchen</span>

   // After:
   <span>{__pt("Termin buchen")}</span>
   ```

2. **Runtime:** `__pt()` is a **regular function** (NOT a hook) that reads from the Zustand store synchronously:
   ```ts
   // Injected as import by the Vite transform plugin
   import { useDevToolsStore } from '@preview-tool/runtime'

   const translationIndex: Record<string, Record<string, string>> = { /* from spec */ }

   function __pt(sourceText: string): string {
     const lang = useDevToolsStore.getState().language
     return translationIndex[sourceText]?.[lang] ?? sourceText
   }
   ```

   This is NOT a hook — it uses `getState()` (synchronous Zustand access), so it can be called anywhere in JSX without violating Rules of Hooks.

3. **Reactivity:** The screen component subscribes to language changes via a hook injected once at the top of each transformed component:
   ```tsx
   // Injected at top of component by Vite transform:
   const __lang = useDevToolsStore((s) => s.language)
   ```
   When language changes, the component re-renders, `__pt()` reads the new language, all translated strings update. No reload, no DOM mutation.

4. **Language change flow:**
   - User clicks EN in inspector
   - Zustand store updates `language: 'en'`
   - Component re-renders (subscribed via `__lang`)
   - `__pt("Termin buchen")` returns `"Book Appointment"`
   - React updates the DOM naturally

### What gets transformed

Only **string literals in JSX text positions** and **string literal props** (placeholder, aria-label, title):

```tsx
// Transformed (JSX text):
<h1>Termin buchen</h1>          → <h1>{__previewText("Termin buchen")}</h1>
<p>Willkommen zurück</p>        → <p>{__previewText("Willkommen zurück")}</p>

// Transformed (string props with known translatable text):
placeholder="Fachrichtung..."    → placeholder={__previewText("Fachrichtung...")}

// NOT transformed (dynamic expressions, variables, non-text):
{user.name}                      → {user.name} (unchanged)
className="text-lg"              → className="text-lg" (unchanged)
```

The transform only replaces strings that exist as keys in the translations index.

---

## What Gets Removed

The following current code is replaced by the view-first approach:

| Current Module | Status | Replacement |
|----------------|--------|-------------|
| `hook-classifier.ts` | **Remove** | No classification needed |
| `classifyHook()` calls in pipeline | **Remove** | Universal mock handles all |
| Pattern-specific mock templates | **Remove** | One universal template |
| `detectContextHooks()` | **Remove** | Passthrough allowlist replaces it |
| `generateContextShim()` | **Remove** | Passthrough hooks use real libs |
| `vite-plugin-i18n-preview.ts` (full-reload) | **Rewrite** | Transform + Zustand store |
| `TextReplacer.tsx` (DOM mutation) | **Remove** | Zustand store approach |
| 5 mock template variations | **Remove** | One template |

### What Stays

| Module | Status | Why |
|--------|--------|-----|
| `spec-loader.ts` | **Keep** | Clean, works well |
| `spec-to-model.ts` | **Keep** | Region definitions still needed |
| `state-distributor.ts` | **Keep** | State data distribution still needed |
| `type-cache.ts` | **Keep** | Caching still valuable |
| `extract-types.ts` | **Keep** | Type extraction still useful for Gap 1 |
| `vite-plugin-preview-state.ts` | **Keep** | useState transform still needed |
| `vite-plugin-spec-preview.ts` | **Keep** | Virtual manifest still needed |
| `create-vite-config.ts` | **Keep** | Alias wiring still needed |
| Runtime (PreviewShell, ScreenRenderer, etc.) | **Keep** | Solid, works well |

---

## Spec Schema Changes

### mockData convention

mockData field names MUST match actual code fields (not conceptual labels):

```yaml
# WRONG (conceptual):
mockData:
  greeting: "Willkommen"     # not a code field
  bookingCta: "Termin buchen" # not a code field

# RIGHT (matches code):
mockData:
  user: { name: "Max" }      # matches useAuthStore().user
  isLoading: false            # matches useState variable
```

The view analyzer can validate this: if mockData has a field that doesn't appear in the view analysis, warn.

### translations convention

Translation keys are **source text** (what appears in JSX), values are translations:

```yaml
translations:
  en:
    "Willkommen zurück": "Welcome back"
    "Termin buchen": "Book Appointment"
```

### data_deps (optional override)

Auto-detected from code. Only declare in spec if auto-detection fails:

```yaml
data_deps:
  - hook: useAuthStore
    module: "@/stores/auth-store"
    provides: [user, logout, isLoading]
```

---

## Implementation Phases

### Phase 1: View Analyzer (new module)

Create `packages/cli/src/analyzer/view-analyzer.ts`:
- Parse JSX, extract ViewField[], ViewCondition[]
- Trace variables to hook imports → HookSource[]
- Follow child component imports (full tree)
- Output: ViewShape

### Phase 2: Universal Mock Generator

Create `packages/cli/src/generator/universal-mock.ts`:
- One template function
- Takes: hookName, regionKey, staticMethods (optional)
- Outputs: mock file content string

### Phase 3: Simplified Pipeline

Rewrite `spec-pipeline-orchestrator.ts` to use:
- `viewAnalyzer.analyze(screenFile)` instead of hook classification
- `universalMock.generate(hookName, regionKey)` instead of pattern templates
- Remove `classifyHook()`, `detectContextHooks()`, pattern branching

### Phase 4: i18n via Zustand Store

- Create `__pt()` regular function (NOT a hook) using `useDevToolsStore.getState()`
- Vite transform plugin replaces matching string literals with `__pt()` calls
- Inject `const __lang = useDevToolsStore((s) => s.language)` at top of transformed components for reactivity
- No reload, no DOM mutation

### Phase 5: Cleanup

- Remove `hook-classifier.ts`
- Remove `TextReplacer.tsx`
- Remove old `vite-plugin-i18n-preview.ts` (full-reload version)
- Update tests

---

## Component Tree Traversal

### Bounds

The view analyzer follows imports from the screen file to build the full component tree:

- **Follow:** Relative imports (`./`, `../`), alias imports (`@/`, `~/`) that resolve to project source
- **Stop at:** `node_modules` (third-party components), type-only imports, `.css`/`.svg`/asset imports, test files
- **Max depth:** 10 levels (configurable, covers any realistic component tree)
- **Max files:** 100 per screen (safety limit — warn if exceeded)
- **Circular imports:** Track visited file paths, skip already-analyzed files

### What gets analyzed in each file

- JSX expressions (field access, conditions, iterators, event handlers)
- Variable declarations (trace data flow from import to JSX)
- Function parameters (prop types in child components)
- Hook calls (only to identify import source, NOT to classify pattern)

---

## Integration with usePreviewState

The `vite-plugin-preview-state.ts` (useState transform) **stays unchanged**. It handles a separate concern:

- **Universal mock** → replaces imported hooks (useAuthStore, useQuery, etc.)
- **usePreviewState** → replaces `useState` calls inside the screen component

These don't overlap. `useState` is a React built-in, not an imported hook. The usePreviewState transform lets the devtools inspector control local state values (like `isLoading`, `activeTab`). The universal mock handles external data.

Both feed from the same region state machine via `RegionDataContext`.

---

## Limitations (known, accepted)

1. **Dynamic property access** — `obj[dynamicKey]` cannot be analyzed statically. Spec mockData covers these manually.
2. **Computed component names** — `const Comp = map[type]; <Comp />` — analyzer can't follow dynamic component selection.
3. **Third-party component prop shapes** — When data passes into `<DataGrid rows={items} />`, the shape of `items` can't be inferred from DataGrid source (in node_modules). Spec mockData or TypeScript `.d.ts` types fill this gap.
4. **Generic utility functions** — `formatDate(data.createdAt)` — the analyzer sees the function call but can't infer the return type without analyzing `formatDate`. The field type falls back to `unknown`.
5. **Multi-screen shared hooks** — Two screens using the same hook may access different fields. Each screen's mock provides its own region data; shared hooks get separate region keys per screen.

### Error recovery

When the view analyzer fails to trace a variable (e.g., complex destructuring, dynamic import):
- Log a warning with the variable name and file path
- The field gets type `unknown` in ViewShape
- The spec mockData is used as-is without validation for that field
- The mock still works — it returns whatever the region data provides

---

## Success Criteria

1. All 20 booking app screens render in preview without crashes
2. Language toggle works without page reload
3. State switching (loading/error/empty/populated) works for all screens
4. Zero hook-pattern-specific code in the pipeline (only 2 categories: data vs passthrough)
5. Adding a new screen requires only a spec YAML entry (no mock template work)
6. View analyzer warns when spec mockData fields don't match code fields
7. Proxy returns `undefined` for missing data fields (not NOOP) — falsy checks work correctly

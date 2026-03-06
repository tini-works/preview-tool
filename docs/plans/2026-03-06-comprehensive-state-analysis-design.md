# Comprehensive State Analysis Design

**Date:** 2026-03-06
**Goal:** Upgrade the analyzer to discover ALL visual states in a screen — not just states from external hooks, but also from `useState`, `useRef`, `useMemo`, derived variables, and function flows.

**Problem:** The current analyzer only creates regions/states for external hooks (stores, queries). It skips React built-ins (`useState`, `useRef`) and provider hooks (`useSearchParams`, `useNavigate`). This means screens with local state, form validation, URL-param-driven banners, or toggle states are only partially analyzed.

**Case study:** LoginPage in the booking app has 6 visual states. The analyzer finds 3 (from `useAuthStore`). It misses: `registrationSuccess` (from `useSearchParams`), `fieldErrors` (from `useState`), `showPassword` (from `useState`).

---

## Root Causes

| Root Cause | Location | Effect |
|---|---|---|
| Provider hooks skipped | `template-fallback.ts:223` — `classifyHook === 'provider'` → `continue` | `useSearchParams` data invisible |
| React built-in hooks skipped | `hook-binding.ts:26-33` — `REACT_BUILTIN_HOOKS` set, no template matches | `useState`/`useRef` data invisible |
| Conditionals only matched per hook | `derive-states.ts:86-99` — `findConditionalsForHook` checks one hook's fields | Orphaned conditionals produce no states |

---

## Approach: Expand Fact Collection + Unified State Derivation

Extend `collect-facts.ts` with three new fact types, then feed ALL data sources into a single state derivation pass.

---

## New Fact Types (`analyzer/types.ts`)

### LocalStateFact

Captures `useState()` and `useRef()` calls with variable name, setter, initial value, and inferred type.

```typescript
interface LocalStateFact {
  name: string          // 'showPassword', 'formData'
  hook: 'useState' | 'useRef'
  setter?: string       // 'setShowPassword' (useState only)
  initialValue: string  // 'false', '{email: "", password: ""}'
  valueType: string     // 'boolean' | 'string' | 'number' | 'object' | 'array' | 'null' | 'unknown'
}
```

### DerivedVarFact

Captures `const`/`let` variables in the component body that appear in JSX conditionals but aren't from hooks or useState.

```typescript
interface DerivedVarFact {
  name: string            // 'registrationSuccess'
  expression: string      // 'searchParams.get("registered") === "true"'
  sourceVariable?: string // 'searchParams' (traced to useSearchParams)
  valueType: string       // 'boolean' | 'string' | 'unknown'
}
```

### FunctionFact

Captures named functions and `useCallback` assignments with their JSX event bindings and internal effects.

```typescript
interface FunctionFact {
  name: string
  kind: 'function' | 'arrow' | 'useCallback'
  triggers: { element: string; event: string; elementId?: string }[]
  settersCalled: string[]      // ['setFieldErrors', 'setFormData']
  navigationCalls: string[]    // ['navigate(redirectTo)']
  externalCalls: string[]      // ['login', 'clearError']
}
```

### Extended ScreenFacts

```typescript
interface ScreenFacts {
  route: string
  filePath: string
  exportName?: string
  sourceCode: string
  hooks: HookFact[]
  components: ComponentFact[]
  conditionals: ConditionalFact[]
  navigation: NavigationFact[]
  localState: LocalStateFact[]     // NEW
  derivedVars: DerivedVarFact[]    // NEW
  functions: FunctionFact[]        // NEW
}
```

---

## New Extractors (`collect-facts.ts`)

### `extractLocalStateFacts(sourceFile)`

1. Find all `CallExpression` where callee is `useState` or `useRef` (import from `react`)
2. For `useState`: parent `VariableDeclaration` with `ArrayBindingPattern` → extract `[name, setter]`
3. For `useRef`: parent `VariableDeclaration` → extract `name`
4. First argument → `initialValue`. Infer `valueType` from literal type or generic type argument.

### `extractDerivedVarFacts(sourceFile, conditionals)`

1. Collect all variable names already tracked (hooks, useState, useRef)
2. Find `const`/`let` `VariableDeclaration` inside the component function body
3. Filter: keep only variables whose name appears in a `ConditionalFact.condition`
4. For each, capture expression and try to resolve `sourceVariable`
5. Infer `valueType` from expression shape (comparison → boolean, etc.)

### `extractFunctionFacts(sourceFile)`

1. Find all `FunctionDeclaration` and arrow `VariableDeclaration` inside component body
2. Scan function body for: setter calls → `settersCalled`, navigate calls → `navigationCalls`, external hook function calls → `externalCalls`
3. Scan JSX attributes (`onClick`, `onSubmit`, `onChange`, `onBlur`) for references to function name → `triggers`
4. For inline arrows (e.g., `onClick={() => setShowPassword(prev => !prev)}`), create anonymous entry with setter detected

### Updated `collectAllFacts` orchestrator

Extraction order matters:

```
hooks         = extractHookFacts(sourceFile)
components    = extractComponentFacts(sourceFile)
conditionals  = extractConditionalFacts(sourceFile)
navigation    = extractNavigationFacts(sourceFile)
localState    = extractLocalStateFacts(sourceFile)                // NEW
derivedVars   = extractDerivedVarFacts(sourceFile, conditionals)  // NEW — needs conditionals
functions     = extractFunctionFacts(sourceFile)                  // NEW
```

---

## Unified State Derivation (`derive-states.ts`)

### New entry point: `deriveAllStates()`

Replaces per-hook derivation. Builds a variable→source map from ALL facts, then matches every conditional to its source.

**Variable→source map:**

```
'isLoading'            → { source: 'hook', region: 'auth-store', field: 'isLoading' }
'error'                → { source: 'hook', region: 'auth-store', field: 'error' }
'registrationSuccess'  → { source: 'derived', region: 'registration-success' }
'fieldErrors'          → { source: 'local-state', region: 'field-errors' }
'showPassword'         → { source: 'local-state', region: 'show-password' }
'formData'             → { source: 'local-state', region: 'form-data' }
```

**For each conditional:** parse condition → extract variable name → look up in map → assign state to that region.

### State derivation by source type

**External hooks** — same as today. Destructured fields + conditionals → states.

**Local state (useState)** — derived from initial value + type:

| Initial value | States |
|---|---|
| `false` (boolean) | `{ hidden: false, visible: true }` (named by variable) |
| `''` (string) | `{ default: '', filled: 'sample text' }` |
| `{email:'', ...}` (object) | `{ empty: {email:'', ...}, filled: {email:'user@test.de', ...} }` |
| `{}` (empty object) | `{ default: {}, populated: {field: 'value'} }` |
| `[]` (array) | `{ default: [], populated: [{id:'1'}] }` |
| `null` | `{ default: null, present: 'value' }` |

Boolean useState with conditional: variable name drives state naming (`showPassword` → `hidden`/`visible`).

**Derived variables** — always `{ default: <falsy>, active: <truthy> }` since they appear in `&&` or `? :`.

---

## Flow Generation (`template-fallback.ts`)

### Functions → flows

Each `FunctionFact` with triggers becomes a `FlowOutput`:

| Pattern | Flow type | Example |
|---|---|---|
| `onSubmit={handleSubmit}` | form-submit | validate → API → navigate or error |
| `onClick={() => setBool(prev => !prev)}` | toggle | showPassword: hidden ↔ visible |
| `onChange={(e) => handleChange(...)}` | input-change | update formData, clear errors |
| `onClick={logout}` | action | call external function |

### FlowOutput schema extension

```typescript
interface FlowOutput {
  trigger: ComponentTrigger
  action: 'navigate' | 'setState' | 'setRegionState'
  target: string
  targetRegion?: string
  branches?: {                    // NEW — for multi-branch flows
    condition: string
    navigate?: string
    setRegionState?: { region: string; state: string }
  }[]
}
```

### LoginPage result

| Flow | Trigger | Action |
|---|---|---|
| handleSubmit | `<form onSubmit>` | validate → login → navigate or error |
| handleChange | `<Input onChange>` | update form-data, clear field-errors, clear auth-store error |
| toggle showPassword | `<button onClick>` (eye icon) | toggle show-password: hidden ↔ visible |
| Link to register | `<Link to="/register">` | navigate /register |

---

## Downstream Impact

### Model generation — no structural change

New regions use the same `ComponentRegion` shape. New `HookMappingType` values:

```typescript
type HookMappingType =
  | 'query-hook' | 'custom-hook' | 'store' | 'context' | 'prop'  // existing
  | 'local-state'    // NEW
  | 'derived-var'    // NEW
  | 'router-param'   // NEW
  | 'unknown'
```

### Controller generation — additive

Existing flows keep working. `branches` field is optional.

### Mock generation — per source type

| Source | Mock mechanism | Directly injectable? |
|---|---|---|
| External hooks (useAuthStore) | Module alias mock, `useRegionDataForHook()` | Yes |
| Router hooks (useSearchParams) | Module alias mock for react-router-dom | Yes |
| Local state (useState) | No mock — states reached via controller flows | No — flow-triggered/informational |
| Derived variables | Controlled via source mock (router/hook) | Indirect |

---

## Files Changed

| File | Change | Scope |
|---|---|---|
| `analyzer/types.ts` | Add 3 fact types, extend `ScreenFacts`, new `HookMappingType` values | Small |
| `analyzer/collect-facts.ts` | Add 3 extractors, update `collectAllFacts()` | Medium |
| `analyzer/derive-states.ts` | Add `deriveAllStates()` unified orchestrator | Medium |
| `analyzer/template-fallback.ts` | Use `deriveAllStates()`, build flows from `FunctionFact` | Medium |
| `lib/hook-classifier.ts` | Don't skip derived vars tracing to provider hooks | Small |
| `llm/schemas/screen-analysis.ts` | New region types, optional `branches` on flows | Small |
| `generator/generate-controller.ts` | Serialize `branches` field | Small |
| `generator/generate-mock-from-analysis.ts` | Generate react-router-dom mock, skip local-state mocks | Small |
| `generator/generate-from-analysis.ts` | Map new `HookMappingType` values | Small |

### Unchanged

- `analyzer/discover.ts` — screen discovery unaffected
- `analyzer/analyze-view.ts` — view tree unaffected
- `generator/generate-model.ts` — already generic
- `generator/generate-adapter.ts` — adapter template unchanged
- `packages/runtime/` — no runtime changes in Phase 1

---

## Phasing

| Phase | What | Result |
|---|---|---|
| **Phase 1** | New fact types + unified state derivation + flow generation | All states appear in model.ts. All flows appear in controller.ts. |
| **Phase 2** | Router hook mocking (react-router-dom) | Derived-var regions injectable via mock URL params. |
| **Phase 3** (future) | Runtime `PreviewStateProvider` for local-state injection | Local-state regions directly controllable in preview shell. |

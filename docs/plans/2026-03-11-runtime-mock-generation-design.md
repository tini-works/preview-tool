# Runtime Mock Data Generation — Design Document

**Date:** 2026-03-11
**Status:** Draft
**Scope:** Auto-generate mock data from TypeScript types at dev-server startup

---

## Problem

The spec-driven preview architecture is fully implemented — Vite plugin, virtual modules, mock hook interception, RegionDataContext, state switching all work. But screens render with empty data because:

1. Real-world specs (booking, roomio) have **no `mockData`** in their state definitions
2. Real-world specs have **no `data_deps`** declaring which hooks they use
3. AST analysis discovers hook calls but **can't infer return types or field names**
4. Hooks get intercepted correctly but return `{}` — no data for components to render

## Solution

At dev-server startup, use ts-morph's TypeChecker to **resolve hook return types** from the actual TypeScript source code, then **generate mock values** from those types, and **distribute them across spec-defined states** using name-based heuristics.

No changes to specx. No mockData in spec files. No LLM. Fully deterministic and offline.

---

## Architecture

```
Dev server starts
  │
  ├─ 1. Load .specs/ → screens, states, code-map
  │
  ├─ 2. For each screen with a source file:
  │     ├─ Open source file with ts-morph Project
  │     ├─ Find all hook calls (useRooms, useBookingStore, etc.)
  │     ├─ Resolve each hook's return type via TypeChecker
  │     │   useRooms() → { rooms: Room[], isLoading: boolean, error: string | null }
  │     │   Room → { id: string, name: string, capacity: number }
  │     └─ Auto-populate data_deps:
  │         hook: useRooms, module: @/hooks/useRooms
  │         provides: [rooms, isLoading, error]
  │         returnShape: { rooms: "Room[]", isLoading: "boolean", ... }
  │
  ├─ 3. Generate mock values from types
  │
  ├─ 4. Distribute across states using name heuristics
  │
  └─ 5. Cache in .preview/.cache/mock-data.json
```

---

## Type → Mock Value Rules

| TypeScript Type | Mock Value |
|----------------|------------|
| `string` | `"Sample text"` |
| `number` | `1` |
| `boolean` | `true` |
| `null` | `null` |
| `undefined` | `undefined` |
| `string[]` | `["Item 1", "Item 2"]` |
| `number[]` | `[1, 2, 3]` |
| `T[]` (object array) | `[mockT, mockT]` (2 items) |
| `T \| null` | `mockT` (populated) or `null` (empty/error) |
| `Record<string, V>` | `{ "key1": mockV }` |
| `Date` | `"2026-03-11T10:00:00.000Z"` |
| `() => void` | `() => {}` (NOOP) |
| `(args) => Promise<T>` | `async () => mockT` |
| Interface / Type alias | Recursively mock each property |
| Enum | First enum value |
| Unknown / any | `{}` |

### Field Name Hints

When the field name suggests a specific domain, use smarter defaults:

| Field name pattern | Mock value |
|-------------------|------------|
| `id` | `"mock-id-1"` (incrementing) |
| `name`, `title` | `"Sample Name"` |
| `email` | `"user@example.com"` |
| `url`, `href` | `"https://example.com"` |
| `description` | `"Sample description"` |
| `count`, `total` | `3` |
| `price`, `amount` | `9.99` |
| `createdAt`, `updatedAt` | `"2026-03-11T10:00:00.000Z"` |
| `isLoading`, `isFetching` | `true` or `false` (depends on state) |
| `error` | `null` or `"Something went wrong"` (depends on state) |

---

## State Distribution Heuristics

The state name from specs drives what mock data shape to produce:

| State name pattern | isLoading | data arrays | error / nullable | Description |
|-------------------|-----------|-------------|------------------|-------------|
| `loading`, `fetching`, `pending` | `true` | `[]` empty | `null` | Data not yet available |
| `default`, `populated`, `results`, `ready`, `success`, `free` | `false` | `[item, item]` populated | `null` / populated | Normal happy path |
| `empty`, `no-results`, `no-data` | `false` | `[]` empty | `null` | Data loaded but nothing found |
| `error`, `failed`, `offline`, `disconnected` | `false` | `[]` empty | `"Something went wrong"` | Error state |
| `submitting`, `saving` | `true` | preserve prior | `null` | Mutation in progress |
| Other (unrecognized) | `false` | `[item]` single | `null` / populated | Reasonable default |

### Distribution Algorithm

For each hook in a screen:

```
1. Extract return type shape: { rooms: Room[], isLoading: boolean, error: string | null }
2. Classify each field:
   - "loading-indicator": fields matching isLoading, isFetching, isPending
   - "error-indicator": fields matching error, errorMessage
   - "data-array": fields with array type
   - "data-nullable": fields with T | null union
   - "data-value": everything else
3. For each state in the spec:
   - Match state name to heuristic row
   - Generate field values according to that row
```

Example for `useRooms() → { rooms: Room[], isLoading: boolean, error: string | null }`:

```
State "loading":
  → isLoading: true (loading-indicator → true)
  → rooms: [] (data-array → empty)
  → error: null (error-indicator → null)

State "populated":
  → isLoading: false (loading-indicator → false)
  → rooms: [{ id: "mock-id-1", name: "Sample Name", capacity: 1 }, ...]
  → error: null (error-indicator → null)

State "empty":
  → isLoading: false
  → rooms: []
  → error: null

State "error":
  → isLoading: false
  → rooms: []
  → error: "Something went wrong"
```

---

## New Components

### `packages/cli/src/spec/type-extractor.ts`

Uses ts-morph to resolve hook return types.

```typescript
interface ExtractedHook {
  hookName: string
  importPath: string
  returnShape: TypeShape
  provides: string[]  // top-level field names
}

interface TypeShape {
  [fieldName: string]: FieldType
}

interface FieldType {
  kind: 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object' | 'function' | 'union' | 'enum' | 'unknown'
  itemType?: FieldType          // for arrays
  properties?: TypeShape        // for objects
  unionMembers?: FieldType[]    // for unions
  enumValues?: string[]         // for enums
  nullable?: boolean            // for T | null
}

function extractHooksFromScreen(
  project: Project,
  sourceFilePath: string
): ExtractedHook[]
```

**Key implementation details:**
- Create ts-morph `Project` once, reuse for all screens
- Find hook call expressions: `callExpr.getExpression().getText()` starts with `use`
- Get return type: `callExpr.getReturnType()` via TypeChecker
- Recursively resolve interface/type alias properties
- Handle generics: `useQuery<Room>()` → resolve `Room` type
- Handle destructuring: `const { rooms, isLoading } = useRooms()` → verify against return type
- Stop recursion at depth 4 to avoid infinite loops (circular types)

### `packages/cli/src/spec/mock-generator.ts`

Converts TypeShape into concrete mock values.

```typescript
function generateMockValue(field: FieldType, fieldName: string): unknown

function generateMockObject(shape: TypeShape): Record<string, unknown>
```

Uses the field name hints table + type rules to produce realistic-ish values.

### `packages/cli/src/spec/state-distributor.ts`

Distributes mock values across spec-defined states.

```typescript
interface DistributedMockData {
  [stateName: string]: Record<string, unknown>
}

function distributeAcrossStates(
  extractedHooks: ExtractedHook[],
  stateNames: string[]
): DistributedMockData
```

Uses the state name heuristics to decide which fields get which values per state.

---

## Modified Components

### `packages/cli/src/spec/spec-pipeline-orchestrator.ts`

After AST hook discovery (existing), add:

```
// Existing: discover hook calls via AST
const hookFacts = extractHookFacts(sourceFile)

// NEW: resolve return types
const extractedHooks = extractHooksFromScreen(project, sourceFilePath)

// NEW: generate mock data per state
const mockData = distributeAcrossStates(extractedHooks, screen.states)

// NEW: merge into regions with actual data
// Instead of empty {} regions, populate with generated mock data
```

### `packages/cli/src/spec/spec-to-mocks.ts`

Mock hook functions now return generated data instead of `{}`:

```typescript
// Before: returns {} because no data
const state = data ? resolveStoreState(data, [], []) : {}

// After: returns generated mock data from type extraction
const state = data ? resolveStoreState(data, fnFields, dataFields) : DEFAULT_STATE
```

---

## Caching

Cache at `.preview/.cache/mock-data.json`:

```json
{
  "version": 1,
  "screens": {
    "scr-home": {
      "sourceHash": "sha256:abc123...",
      "hooks": {
        "useRooms": {
          "returnShape": {
            "rooms": { "kind": "array", "itemType": { "kind": "object", "properties": { "id": { "kind": "string" }, "name": { "kind": "string" } } } },
            "isLoading": { "kind": "boolean" },
            "error": { "kind": "union", "nullable": true, "unionMembers": [{ "kind": "string" }, { "kind": "null" }] }
          },
          "stateData": {
            "loading": { "isLoading": true, "rooms": [], "error": null },
            "populated": { "isLoading": false, "rooms": [{ "id": "mock-id-1", "name": "Sample Name" }], "error": null }
          }
        }
      }
    }
  }
}
```

**Invalidation**: Hash source file content. If hash differs from cache, re-extract types.

**Startup optimization**: Only type-extract screens that are stale or new. Cached screens load instantly.

---

## Edge Cases

### Hooks that can't be resolved
- Import from `node_modules` without types → use destructured field names from AST, mock as `unknown`
- Dynamic imports → skip, flag in console

### Zustand store selectors
- `useStore((s) => s.field)` → resolve store type, extract selected fields
- Already handled by existing selector pattern in mock generation

### Custom hooks wrapping other hooks
- `useRoomData()` internally calls `useQuery()` → ts-morph resolves the outermost return type, which is what the component sees

### Circular types
- `type Tree = { children: Tree[] }` → stop recursion at depth 4, use `[]` for deep arrays

### Monorepo imports
- `@roomio/shared` types → ts-morph Project needs `compilerOptions.paths` from tsconfig
- Already handled: `create-vite-config.ts` resolves tsconfig paths

---

## What Changes in specx

**Nothing.** Specs stay exactly as they are:

```yaml
states:
  - name: loading
    description: Fetching room data
  - name: populated
    description: Rooms displayed
  - name: error
    description: Connection failed
```

No `mockData`. No `data_deps`. Preview-tool figures it all out from the source code types.

Optionally, `data_deps` can still be added to specs for documentation purposes or to override auto-detection, but it's not required.

---

## Success Criteria

1. **booking project**: Run `preview dev --specs .specs/`, all 19 screens render with auto-generated mock data per state
2. **roomio project**: Kiosk screen renders with realistic mock data for all 6+ states
3. **No manual mockData**: Zero `mockData` fields needed in any spec file
4. **Fast startup**: Cached screens load in <1s, full type extraction <5s
5. **Offline**: No LLM, no network required
6. **State switching**: Click "error" in Inspector → component shows error state with generated error message

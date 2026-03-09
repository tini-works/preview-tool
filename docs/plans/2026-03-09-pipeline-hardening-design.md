# Pipeline Hardening: Role-Based Hook Classification

**Date:** 2026-03-09
**Status:** Approved

## Problem

The preview pipeline fails on real codebases (roomio, booking) with 4 failure modes:
1. Runtime crashes from unhandled nulls, bad JSON, file read races
2. Screens not discovered (LLM unavailable or wrong glob pattern)
3. Wrong state handling (hooks not properly mocked)
4. Bad mock data (generic mocks don't match hook return shapes)

The root cause: the pipeline hard-codes library detection (TanStack Query, Zustand, etc.) instead of understanding what hooks *do*. Every new library breaks it.

## Design

### Section 1: Crash Resilience

Fix all 12 identified crash/silent-failure scenarios:

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `claude-code.ts:42-45` | Double `JSON.parse` no try/catch | Wrap each in try/catch, validate `envelope.result` is string |
| 2 | `discover-llm.ts:40` | `readFileSync` TOCTOU race | Add try/catch, skip unreadable files |
| 3 | `analyze-screen-llm.ts:77,22` | `readFileSync` no try/catch | Already contained by `allSettled`, add per-call try/catch for clarity |
| 4 | `generate-all-v2.ts:219` | `!` non-null assertion on Map.get | Filter screens without analysis (done) |
| 5 | `detect-framework.ts:59` | `JSON.parse(package.json)` no try/catch | Wrap with user-friendly error |
| 6 | `create-vite-config.ts:63-76` | One bad file aborts entire loop | Move readFileSync inside per-file try/catch |
| 7 | `generator/index.ts:157` | Undefined alias → bad filename | Validate before writing |
| 8 | `generator/index.ts:121` | Undefined facts → degraded model | Check before passing to model builder |
| 9 | `collect-facts.ts:56,470,490` | `!` non-null assertions on Map.get | Replace with safe access + fallback |

### Section 2: Role-Based Hook Classification

Instead of detecting libraries, the LLM reads each hook's source code and classifies it by behavior:

| Role | Examples | What it does |
|------|----------|-------------|
| `data_fetcher` | useQuery, useSWR, raw fetch+useEffect | Returns async data |
| `mutation` | useMutation, useSubmit | Triggers writes |
| `realtime` | useSocket, useSubscription | Subscribes to live updates |
| `state_store` | useStore, useAtom, useSelector | Reads/writes shared state |
| `side_effect` | useNavigate, useAnalytics | Does something outside React |
| `ui_utility` | useDebounce, useLongPress, useMediaQuery | Pure UI logic |
| `context` | useAuth, useTheme (via React Context) | Consumes provider value |

The LLM prompt changes from "what hooks does this screen use?" to "for each hook: what is its role, what does it return, and what mock data would render a happy-path state?"

This works on any codebase regardless of which libraries it uses. The LLM reads the code and understands intent.

### Section 3: Role-Based Mock Generation

Each role has a mock generation template:

| Role | Generated mock shape |
|------|---------------------|
| `data_fetcher` | `{ data: <realistic values>, isLoading: false, error: null }` |
| `mutation` | `{ mutate: noop, mutateAsync: async noop, isPending: false }` |
| `realtime` | Static snapshot (same as data_fetcher), connection lifecycle as no-ops |
| `state_store` | `{ <fields with realistic initial values>, <setters as no-ops> }` |
| `side_effect` | `{ <function names as no-ops> }` |
| `ui_utility` | Sensible default value (e.g. `useMediaQuery → true`) |
| `context` | Mock Provider wrapper with default values |

The LLM provides realistic mock values (real room names, dates, user objects) — not generic placeholders.

Wrapper generation also improves: hooks consuming React Context trigger mock Provider injection in the wrapper.

### Section 4: Validation

Test against two codebases with different stacks:

1. **roomio** (`~/Desktop/roomio`) — TanStack Start + React Query + Socket.IO + IndexedDB
2. **booking** (`~/Desktop/booking`) — different stack, different patterns

Success criteria:
- Zero crashes during `preview generate`
- All user-facing screens discovered
- Mocks compile without type errors
- Preview dev server starts and renders screens
- Hooks correctly classified by role (spot-check)

## Files to Modify

### Section 1 (Crash Resilience)
- `packages/cli/src/llm/providers/claude-code.ts`
- `packages/cli/src/analyzer/discover-llm.ts`
- `packages/cli/src/analyzer/analyze-screen-llm.ts`
- `packages/cli/src/analyzer/collect-facts.ts`
- `packages/cli/src/generator/generate-all-v2.ts`
- `packages/cli/src/generator/index.ts`
- `packages/cli/src/resolver/detect-framework.ts`
- `packages/cli/src/server/create-vite-config.ts`

### Section 2 (Role Classification)
- `packages/cli/src/llm/prompts/analyze-screen.ts` — update prompt to request role classification
- `packages/cli/src/llm/schemas/screen-analysis-v2.ts` — add `role` field to hook schema

### Section 3 (Mock Generation)
- `packages/cli/src/generator/generate-all-v2.ts` — role-aware mock builder
- `packages/cli/src/resolver/generate-wrapper.ts` — context provider injection

### Section 4 (Validation)
- Manual runs against roomio and booking codebases

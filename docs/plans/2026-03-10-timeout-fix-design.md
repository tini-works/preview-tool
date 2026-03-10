# Timeout Fix: Prompt Optimization + Parallel Execution

## Problem

The preview pipeline times out (180s) on some screens during LLM analysis. In the booking app test (20 screens), 2 screens failed:
- **HomePage.tsx** (74 lines) — timed out despite being tiny
- **AppointmentListPage.tsx** (317 lines) — timed out

Root causes:
1. **Prompt bloat** — `extractHookSources()` includes ALL imported local files (UI components, utilities, constants), not just hooks. HomePage sends `button.tsx` (65 lines) and `card.tsx` (92 lines) — irrelevant to mock generation.
2. **Excessive max-turns** — `--max-turns 30` allows the claude subprocess to use tools and wander when the task is single-turn (prompt → JSON).
3. **Sequential processing** — 20 screens analyzed one at a time, each taking 2-3 min = 40+ min total.

## Solution

Three changes to `packages/cli/`:

### 1. Filter hook sources (analyze-screen-llm.ts)

After reading each imported file, skip files that don't export React hooks.

```typescript
function containsHookExport(source: string): boolean {
  return /export\s+(function|const)\s+use[A-Z]/.test(source)
}
```

Applied in `extractHookSources()` before adding to the sources map. Reduces prompt tokens by ~60-70% for typical screens.

### 2. Reduce max-turns (claude-code.ts)

Change `--max-turns 30` → `--max-turns 2`. The analysis task is a single prompt→response exchange. No tool use is needed.

### 3. Parallel screen analysis (analyze-screen-llm.ts)

Replace the sequential `for...of` loop with concurrency-limited parallel execution (3 concurrent).

```typescript
const CONCURRENCY = 3

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!
      await fn(item)
    }
  })
  await Promise.allSettled(workers)
}
```

## Files Changed

| File | Change |
|------|--------|
| `src/analyzer/analyze-screen-llm.ts` | Hook filtering in `extractHookSources()` + parallel `analyzeAllScreens()` |
| `src/llm/claude-code.ts` | `--max-turns 2` |

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Total pipeline time (20 screens) | ~40 min | ~12 min |
| Per-screen prompt size | Screen + all imports | Screen + hooks only |
| Timeout failures | 2/20 (10%) | ~0/20 |
| Concurrent processes | 1 | 3 |

## Verification

1. `pnpm build` — clean compile
2. `pnpm test` — unit tests pass
3. Run against booking app (`~/Desktop/booking/client`) — verify:
   - All 20 screens analyzed (no timeouts)
   - Total time under 15 min
   - Generated files are valid

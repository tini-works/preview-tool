# Hybrid Detection Pipeline Design

**Date:** 2026-03-03
**Status:** Approved
**Branch:** feature/template-1

## Problem

The current detection pipeline (regex + AST + heuristic model building) has two critical issues:

1. **Slow** (~20-40s): Sequential AST parsing with per-file ts-morph Projects, multiple LLM retry loops, 7-pass mock categorization
2. **Incomplete** (~50-60% detection): Regex patterns miss ~30% of hooks, enrichModelWithHookMapping assigns hooks to wrong regions, only 4 hardcoded states, flow detection misses 50% of navigation patterns

## Concept

Point the tool at any React codebase. It finds pages/screens, discovers regions (UI sections), state machines (what states each region can be in), and navigation flows (redirects between screens). The right panel lists these as clickable controls. The center view renders the actual screen, and clicking controls shows what happens — like a real app without a backend.

## Solution: Hybrid AST + LLM Pipeline

Replace the current interleaved AST/regex/heuristic/LLM pipeline with a clean 4-stage architecture that separates **fact collection** (AST) from **semantic understanding** (LLM).

```
Current:  Discover → [AST + Regex + Heuristic + LLM retry] → Codegen → Serve
                     ^^^ tangled, slow, fragile ^^^

New:      Discover → Fast AST Facts → Batch LLM Semantics → Codegen → Serve
          (~100ms)    (~500ms)          (~5-10s, one call)    (~200ms)
```

### Key Principle

AST collects **what exists**. LLM understands **what it means**. No regex pattern matching anywhere.

## Stage 1: Screen Discovery (~100ms)

Keep current implementation. Glob for screen files, extract routes from file paths.

No changes needed — this stage works well.

## Stage 2: Fast AST Fact Collection (~500ms)

Replace `analyze-hooks.ts` (regex-based) and per-file `analyze-view.ts` with a shared-Project parallel approach.

### Changes from current

- **Single shared ts-morph Project** — create ONE Project, add ALL screen files at once (eliminates per-file compiler creation, the main speed bottleneck)
- **Parallel per-screen extraction** — `Promise.all()` across screens
- **Raw facts only** — no pattern matching, no heuristic inference

### Output per screen

```typescript
interface ScreenFacts {
  route: string
  filePath: string
  exportName: string

  // Every hook called in this component
  hooks: Array<{
    name: string           // 'useQuery', 'useAuth', 'useAppLiveQuery'
    importPath: string     // '@tanstack/react-query', '../hooks/useAuth'
    arguments: string[]    // Raw argument text
    returnVariable?: string // 'const { data, isLoading } = ...'
  }>

  // What's rendered
  components: Array<{
    name: string           // 'DataTable', 'Button', 'Form'
    importPath: string
    props: string[]        // Raw prop names
    children: string[]     // Child component names
  }>

  // Conditional branches in JSX
  conditionals: Array<{
    condition: string      // Raw condition text: 'isLoading', 'data.length > 0'
    trueContent: string    // Component names in true branch
    falseContent?: string  // Component names in false branch
  }>

  // Navigation-like patterns
  navigation: Array<{
    target: string         // '/booking', 'details/${id}'
    trigger: string        // 'onClick handler on Button', '<Link to=...>'
  }>
}
```

### What's NOT done here (left to LLM)

- Deciding what a "region" is
- Figuring out state machines
- Understanding what a hook's data means
- Mapping hooks to UI sections

## Stage 3: Batch LLM Understanding (~5-10s)

One batch call to Claude Code with all screens. Claude reads source + facts, returns structured analysis.

### Input

- For each screen: full source code (not truncated) + extracted ScreenFacts
- Project context: routes, shared imports, framework detection

### Output per screen (Zod-validated)

```typescript
interface ScreenAnalysis {
  route: string

  // Regions — the distinct UI sections
  regions: Array<{
    key: string              // 'service-list', 'booking-form'
    label: string            // 'Service List', 'Booking Form'
    type: 'list' | 'detail' | 'form' | 'status' | 'auth' | 'media' | 'custom'
    hookBindings: string[]   // Which hooks feed this region: ['useQuery:services']
    states: Record<string, {
      label: string
      mockData: Record<string, unknown>
    }>
    defaultState: string
  }>

  // Flows — navigation and state transitions
  flows: Array<{
    trigger: {
      selector: string       // CSS selector: 'button', '[role="button"]'
      text?: string          // Button text: 'Book Now', 'Submit'
      ariaLabel?: string
    }
    action: 'navigate' | 'setState' | 'setRegionState'
    target: string
    targetRegion?: string
  }>
}
```

### Why LLM is better for this

- Understands `{isLoading && <Spinner/>}` means a loading state
- Understands `<DataTable data={users}/>` is a list region
- Understands `onClick={() => navigate('/details')}` is a navigation flow
- Infers meaningful mock data (not just `{ id: 'mock-1', name: 'Item 1' }`)
- Sees cross-screen patterns (shared layouts, common flows)

### Fallback (no Claude Code available)

Template library maps hook types to default region templates:

| Hook pattern | Region type | Default states |
|---|---|---|
| useQuery, useSWR, useFetch | list | loading, populated, empty, error |
| useAuth, auth store | auth | authenticated, unauthenticated, pending |
| Form hooks, useForm | form | idle, validating, submitting, success, error |
| useContext | status | active, inactive |
| Unknown hooks | custom | loading, populated, error |

## Stage 4: Simplified Code Generation (~200ms)

With clean structured data from the LLM, codegen becomes direct mapping with no heuristics.

### Per-screen generation

| File | Current approach | New approach |
|---|---|---|
| model.ts | Complex heuristic + enrichment | Direct from `ScreenAnalysis.regions` |
| controller.ts | LLM retry + heuristic fallback | Direct from `ScreenAnalysis.flows` |
| adapter.tsx | RegionDataProvider wrapper | Same, but hookBindings already resolved |
| mock-hooks/*.ts | Regex-derived sectionId matching | Exact region key from LLM output |

### Mock hook simplification

```typescript
// Current (fragile): regex extracts sectionId, enrichment guesses region
export function useQuery(options) {
  const queryKey = options?.queryKey ?? []
  const contextData = useRegionDataForHook('query-hook', queryKey)  // hopes to match
}

// New (direct): LLM told us useQuery:services maps to 'service-list' region
export function useQuery(options) {
  const contextData = useRegionDataForHook('service-list')  // exact match
}
```

## Runtime Changes

### What stays the same

- PreviewShell + ScreenRenderer + FlowProvider
- Zustand store for device/region/flow state
- Inspector panel UI
- Vite alias manifest approach
- RegionDataProvider / RegionDataContext pattern

### What simplifies

- `useRegionDataForHook()` — no multi-strategy matching, each mock hook knows its exact region
- FlowProvider — keeps V2 ComponentTrigger matching (already works well)

## Code to Delete

| Module | Reason |
|---|---|
| `analyze-hooks.ts` regex patterns | Replaced by AST fact collection |
| `enrichModelWithHookMapping()` | LLM provides direct hook→region mapping |
| `buildHeuristicModel()` | Replaced by LLM output or template fallback |
| `extractSectionIds()` | No longer needed |
| `buildStateData()` (4 hardcoded states) | LLM generates context-appropriate states |
| 7 separate mock categorization loops | Single-pass from LLM output |

## Performance Targets

| Metric | Current | Target |
|---|---|---|
| Total detection time | 20-40s | 6-11s |
| Detection quality | ~50-60% | ~85-90% |
| Code complexity | ~5000 lines analyzer | ~40% reduction |
| Hook detection rate | ~70% | ~95% (LLM) |
| Flow detection rate | ~50% | ~90% (LLM) |
| State coverage | 4 hardcoded | Context-appropriate per region |

## Risks

1. **LLM latency variance** — batch call could take 15-20s for large codebases. Mitigation: parallel per-screen calls if batch too slow.
2. **LLM output validation** — malformed JSON. Mitigation: Zod schema validation + template fallback.
3. **Claude Code availability** — not installed or not working. Mitigation: template library provides degraded but functional experience.
4. **Source code size** — very large screens might exceed context. Mitigation: smart truncation of non-essential code (imports, types).

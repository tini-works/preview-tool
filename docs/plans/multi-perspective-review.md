# Preview Tool — Multi-Perspective Review

Three-lens analysis of the preview-tool codebase: Technical Architecture, Technical Product Management, and Technical Design.

**Date:** 2026-03-09

---

## Cross-Cutting Theme: Implicit Contracts

All three reviewers independently flagged the same root issue: **contracts between modules are implicit, not formalized**. Generator → entry generation, mocks → region keys, overrides → base files — all rely on naming conventions and filesystem structure rather than typed interfaces or manifests.

---

## Priority 1: Quick Wins (Hours, Not Days)

| # | Fix | Perspective | Files |
|---|-----|-------------|-------|
| 1 | **Controller override glob** (Issue #1) | Arch + PM | `server/generate-entry.ts` |
| 2 | **Replace-semantics for region merge** (Issue #2) | Arch + PM | `server/generate-entry.ts` |
| 3 | **Mock fallback `{}` → `null`** (Issue #4) | PM + Design | `generator/generate-mock-from-analysis.ts` |
| 4 | **ARIA landmarks** (`<main>`, `<aside>`, `<nav>`) | Design | `PreviewShell.tsx` |
| 5 | **Dynamic Island dark mode** | Design | `preview/MobileFrame.tsx` |

These are 1-3 line changes each. Issues 1+2+4 together eliminate all post-restart cleanup.

---

## Priority 2: Foundational Improvements (1-2 Weeks)

### Architecture

- **Generation manifest** (`.preview/.generation-manifest.json`) — tracks what was generated vs overridden, consumed by entry generation instead of re-scanning directories
- **Override validation** — Zod schemas for override structure; warn on region key mismatches
- **LLM result caching** — hash screen facts → cache analysis in `.preview/.llm-cache/`; avoid re-analyzing unchanged screens
- **ts-morph path alias fix** (Issue #3) — set `skipAddingFilesFromTsConfig: false` or add source files after project creation

### Product / DX

- **Progress indicators** during long analysis stages (discovery → analysis → codegen)
- **Provider detection in `init`** — detect React Router, QueryClient, i18n and scaffold `wrapper.tsx` accordingly
- **`--debug` flag** to dump ScreenFacts as JSON for inspection
- **Per-screen error recovery** — skip failing screens, report summary instead of aborting

### Design

- **Unify color system** — reconcile Shadcn tokens (`primary`, `muted`) with semantic palette (`charcoal`, `coral`, `cream`)
- **CatalogPanel search** — fuzzy filter for large screen catalogs
- **Proper ARIA for radio groups** — Language, Network, Feature Flags controls need `role="radiogroup"`
- **Distinct loading/error/empty states** — each gets unique styling, not just `text-neutral-400`

---

## Priority 3: Feature Gaps (2-4 Weeks)

### Architecture

- **LLM provider abstraction** — interface for Claude Code / Ollama / OpenAI with fallback chain
- **Adaptive batching** — split large projects into token-budget batches for LLM
- **Screen state machine** — centralize region state management in runtime instead of scattering across FlowProvider, DevToolsStore, and adapters

### Product / DX

- **URL state persistence** — `?route=/dashboard&regions=profile:loaded` for shareable preview links
- **Flow discoverability** — highlight clickable elements with flow badges; show available flows in inspector
- **Troubleshooting docs** — FAQ for common issues, promote override recipes from action-item appendix

### Design

- **Flow visualization** — breadcrumb trail + navigation diagram in devtools
- **Keyboard navigation** — Tab/Enter/Escape throughout; Shift+Arrow for resize
- **Responsive preview groups** — side-by-side device comparison (iPhone + Desktop + Tablet)
- **Snap-to-grid resizing** — snap to common breakpoints (320, 768, 1024px)
- **Typography + spacing scale** — define semantic tokens instead of arbitrary Tailwind values

---

## Priority 4: Polish (Ongoing)

- Storybook for runtime component library
- More device variants (iPhone 16 Pro, Galaxy Fold, Chromebook)
- Font scale preview in inspector
- Service Worker-based network throttling (not just render delay)
- Store splitting into domain slices (device, screen, regions, flags)

---

## DX Scorecard

| Area | Score | Blocker |
|------|-------|---------|
| Core Workflow | 5/10 | Issues 1+2 break override system |
| Onboarding | 6/10 | No provider detection, late Vite check |
| Generated Code | 6/10 | Wrong defaults, silent type failures |
| Dev Server | 5/10 | No HMR for models/controllers |
| Runtime UI | 7/10 | Good basics, missing search + a11y |
| Architecture | 6/10 | Implicit contracts, no manifest |
| Design System | 5/10 | Two color systems, incomplete dark mode |

**Overall: 5.7/10** — Strong foundation, but friction prevents daily adoption.

---

## Detailed Findings by Perspective

### A. Technical Architecture

#### 1. Generator Architecture

**Current State:** 4-stage pipeline in `packages/cli/src/generator/index.ts` — screen discovery → fact collection → LLM analysis → file generation. Files generated to `.preview/screens/{safeName}/`, overridable in `.preview/overrides/{safeName}/`.

**Weaknesses:**

- **Weak Override Contract** (`generator/index.ts:119-144`) — Override detection uses `existsSync()` at generation time. No formal interface or schema validating override structure. Generator skips writing base files when override exists, but generated code has no visibility into what the override contains.

- **Implicit Region-Hook Coupling** (`analyzer/collect-facts.ts` + `generator/generate-model.ts`) — Auto-generated model regions are keyed by kebab-case hook names. Override models must use exact same keys. If a hook name changes, all overrides break silently.

- **No Generation Metadata** — No manifest of what was generated vs overridden. Post-generation operations (entry generation, Vite config) re-scan directories, duplicating logic.

**Recommendations:**

1. Create an `OverrideManager` abstraction with typed interfaces and Zod validation
2. Establish a `RegionKeyingStrategy` interface — make region key derivation explicit and testable
3. Write `.preview/.generation-manifest.json` after generation:

```json
{
  "timestamp": "2026-03-09T...",
  "screens": [
    {
      "route": "/booking",
      "safeName": "booking",
      "generatedFiles": ["view.ts", "model.ts", "controller.ts", "adapter.tsx"],
      "overriddenFiles": ["model.ts"],
      "mocks": ["use-booking-state.ts"]
    }
  ]
}
```

#### 2. Server / Entry Generation

**Current State:** `server/generate-entry.ts` generates `main.tsx` with eager globs for models, controllers, and overrides. Runtime merge via `mergeOverrides()`.

**Weaknesses:**

- **Glob-based Discovery + Runtime Merge = Tight Coupling** (lines 173-232) — Three separate eager globs that must stay in sync with generator output. Entry generation duplicates screen discovery logic.

- **Shallow Merge Loses Information** (Issue #2) — `{ ...base.regions, ...(override.regions ?? {}) }` creates union of dead regions from base + valid regions from override.

- **No HMR for Eager Modules** (Issue #5) — Eager glob modules are cached by Vite; don't re-evaluate on file changes.

**Recommendations:**

1. Consume generation manifest instead of glob scanning
2. Introduce override modes in manifest (`"replace"` vs `"merge"`)
3. Replace eager globs with explicit imports + `import.meta.hot.accept()` handler

#### 3. Analyzer Architecture

**Current State:** Three stages — discovery (`discover.ts`), fact collection (`collect-facts.ts` via ts-morph), LLM analysis (`understand-screens.ts`).

**Weaknesses:**

- **ts-morph Project Configuration Gap** (Issue #3) — `skipAddingFilesFromTsConfig: true` loads compiler options (including path aliases) but not source files. TypeChecker can't resolve `@/` imports.

- **No Fact Validation** — Hook facts extracted from AST have no validation against discovered hook signatures. Unresolvable types silently fall back to `null`.

- **LLM vs Template Fallback Is Implicit** — No way to debug which analysis path was taken or why.

**Recommendations:**

1. Set `skipAddingFilesFromTsConfig: false` or add source files after project creation
2. Add fact validation step with warnings on type resolution failures
3. Add analysis metadata (`analysisMode`, `confidence`, `fallbackReason`) to generation output

#### 4. Runtime Architecture

**Weaknesses:**

- **Tightly Coupled Data Flow** — Region state operations scattered across FlowProvider, useDevToolsStore, and generated adapters. No central `ScreenStateMachine` abstraction.

- **Fragile Hook Mapping** (`RegionDataContext.tsx:useRegionDataForHook()`) — 4 fallback strategies for matching hooks to regions. Should be explicit registry, not guessing.

- **DOM-Based Trigger Matching** (`trigger-matcher.ts`) — CSS selector + text content matching is fragile. Case-insensitive substring can match unintended elements.

**Recommendations:**

1. Create `ScreenStateMachine` abstraction centralizing region state management
2. Generator produces `HookRegistry` mapping every hook to its region key
3. Add `data-preview-flow` attributes for reliable trigger matching

#### 5. LLM Integration

**Weaknesses:**

- **Single Provider, Hardcoded CLI** — Only Claude Code supported. Silent fallback to template heuristics.
- **No Result Caching** — Same screens re-analyzed on every run.
- **Batch Size Not Optimized** — All screens sent in one batch; large projects exceed token limits.
- **Silent Error Handling** — All errors caught and return `null` with only console warnings.

**Recommendations:**

1. Create `LLMProvider` interface supporting Claude Code, Ollama, OpenAI
2. Add `.preview/.llm-cache/` with hash-based cache keyed on screen facts
3. Implement adaptive batching based on estimated token count
4. Distinguish recoverable vs fatal errors; report in generation summary

---

### B. Technical Product Management

#### 1. CLI & Command Experience

**Strengths:** Single unified `preview <source>` command, clean error handling, remote source support.

**Friction Points:**

1. **No progress feedback** during 30-60s analysis stages — users Ctrl+C prematurely
2. **No provider detection in `init`** — first-time users crash on missing providers
3. **Vite check happens too late** — after generation + entry file creation (wasted time)
4. **No config validation** — `JSON.parse()` with silent fallback on invalid config
5. **`--no-llm` flag not on all commands** — can't fall back when LLM fails

#### 2. Override System UX

**Friction Points:**

1. Controller overrides don't load at runtime (Issue #1)
2. Dead auto-generated regions persist (Issue #2)
3. No documentation of override structure outside `action-item.md`
4. No way to configure per-screen settings

**Recommendations:**

- Add `--override-guide` flag to print working override examples
- Print warning when overrides detected but not loaded
- Add per-screen config support: `.preview/overrides/{screen}/config.json`

#### 3. Generated Output Quality

**Friction Points:**

1. Mock fallback returns `{}` instead of `null` (Issue #4)
2. No way to audit analyzer findings (ScreenFacts discarded after codegen)
3. Generated mocks use `// @ts-ignore` liberally — type errors go undetected
4. No validation that adapters match component prop signatures
5. Flow triggers have no runtime validation

**Recommendations:**

- Add `--debug` flag to save ScreenFacts as JSON
- Add TypeScript strict checking to generated mocks
- Generate adapter type comments showing expected regionData shape
- Validate flow selectors/routes at generation time

#### 4. Dev Server Experience

**Friction Points:**

1. **No HMR for eager glob modules** (Issue #5) — full restart on model/controller edit
2. Server startup errors appear in browser console, not CLI
3. No live reload for `.preview/wrapper.tsx` changes
4. Missing error context in CSS import chain
5. No network simulation logging

#### 5. Runtime DX

**Friction Points:**

1. **Flat catalog list** — no search, grouping, or filtering for 50+ screens
2. **No breadcrumb** — easy to forget which screen you're viewing
3. **Inspector regions listed flat** — no grouping by screen or semantic meaning
4. **No shareable preview links** — URL doesn't encode screen + region states
5. **Flows not discoverable** — no UI hint that flow navigation exists
6. **No conflict detection** when multiple hooks read same region

#### 6. Feature Gaps Blocking Adoption

**Critical:**
- No external hook mocking (hooks from `node_modules`)
- No non-hook data source support (Apollo cache, Zustand stores)
- No utility screen support (login, redirect, 404)
- Limited flow action types (no async, modals, notifications)

**Nice-to-Have:**
- No built-in mock data library (faker.js integration)
- No A/B variant simulation (10 permutations at once)
- No responsive preview groups (side-by-side devices)

---

### C. Technical Design

#### 1. Preview Shell Layout

**Strengths:** Clean three-column layout, flexbox with `h-svh`, immediate screen registration.

**Issues:**
- No visual hierarchy for viewport (missing shadow/depth on frame)
- No semantic HTML landmarks (`<main>`, `<aside>`)
- No keyboard navigation for panel collapse/expand
- No tab stops between panels

#### 2. Device Frames

**Strengths:** Accurate viewport dimensions, correct Dynamic Island rendering, real-time StatusBar.

**Issues:**
- Dynamic Island hardcoded black — not dark-mode-aware
- Browser frame hostname hardcoded `localhost:5173`
- Missing devices: iPhone 16, Galaxy Fold, Chromebook
- Frame border inconsistency: Mobile `border-[3px]` vs Browser `border` (1px)
- StatusBar icons decorative but not marked `aria-hidden`

#### 3. CatalogPanel

**Issues:**
- No search/filter for large catalogs
- Section headers visually weaker than screen names (inverted hierarchy)
- Truncated names have no tooltip
- Selected item may scroll out of view

#### 4. InspectorPanel

**Issues:**
- Dense layout — all sections packed in 288px with only `gap-2`
- Language buttons (EN/DE) have no label context
- Region list counter UX: manual +/- buttons; should support arrow keys
- Network mode buttons lack visual hierarchy or icons
- Font scale shows numeric value but no preview
- Missing `aria-pressed` / `role="radio"` on toggle groups

#### 5. Design System Gaps

**Critical:**
1. **Two color systems** — Shadcn tokens (`primary`, `muted`) AND semantic palette (`charcoal`, `coral`, `cream`) not reconciled
2. **No spacing scale** — arbitrary `gap-1`/`gap-2`/`gap-3` without consistent system
3. **No typography scale** — scattered `text-xs`/`text-sm`/`text-lg` without semantic names
4. **Incomplete dark mode** — some components use `dark:` prefixes, others hardcode colors
5. **No component documentation** — no Storybook or visual specs

#### 6. Flow Engine

**Issues:**
- No visual feedback on clickable elements (no hover outline, tooltip, or badge)
- Text matching is case-insensitive substring — false positives
- No flow history/breadcrumb UI
- `e.stopPropagation()` blocks nested click handlers
- No keyboard support for flow navigation

#### 7. Error Boundary

**Issues:**
- Shows only `error.message`, not component stack
- No recovery UI (no "Refresh" or "Go Back" button)
- Hardcoded colors instead of semantic tokens

#### 8. Responsive Resizing

**Issues:**
- Resize handles hard to target (small hit area)
- No snap-to-grid at common breakpoints (320, 768, 1024px)
- No keyboard support (Shift+Arrow)
- No double-click to fit-to-content

#### 9. Accessibility Summary

| Area | Status |
|------|--------|
| Landmarks | Missing `<main>`, `<aside>`, `<nav>` |
| Radio groups | No `role="radiogroup"` on Language/Network/Flags |
| Focus management | No focus trap on panel collapse |
| Keyboard navigation | No Tab/Enter/Escape support |
| Screen reader | No `aria-live` on loading/error states |
| Color contrast | Untested — needs audit |
| Resize handles | Not keyboard accessible |

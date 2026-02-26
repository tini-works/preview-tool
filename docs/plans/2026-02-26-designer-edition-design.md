# Preview Tool — Designer Edition

> **Status:** Approved
> **Date:** 2026-02-26
> **Goal:** Replace Figma for the designer by providing a spec-driven interactive prototyping tool where Claude builds screens and the preview-tool renders, tests, and presents them.

## Context

### Current State

The preview-tool is a React-based screen previewer with:
- Auto-discovered screens (`index.tsx` + `scenarios.ts` + `flow.ts` + i18n)
- Device-framed rendering with inspector panel (states, regions, language, network, font scale)
- Click-driven flow navigation via `data-flow-target` attributes
- Auto-generated Playwright E2E tests per scenario/region state
- Strict design system enforcement (brand tokens, forbidden colors, verify-screen.sh)

### Problem

The designer currently uses Figma for static mockups. Pain points:
1. **States are tedious** — duplicating artboards for loading/empty/error/populated states
2. **No real interactivity** — Figma prototypes can't show dynamic state changes or conditional flows
3. **Slow iteration** — Figma → presentation cycle is too slow for rapid idea validation
4. **Client misunderstanding** — static images don't convey actual UX, leading to misaligned expectations

### Gaps in Current Tool

1. **Component library too thin** — needs forms, data displays, navigation patterns, content layouts
2. **Iteration too slow** — Claude's first attempts rarely match intent (3-5 rounds), context lost between sessions, technical overhead (TS errors, missing translations)

## Target Workflow

```
PM/Designer writes screen spec
       ↓
Claude suggests layout, components, states, flows → designer approves
       ↓
Claude builds screen (index.tsx + scenarios + flow + i18n + .spec.ts)
       ↓
Auto-validation (tsc + verify-screen + playwright) → self-correction
       ↓
Designer reviews in preview-tool → requests changes → Claude iterates
       ↓
Play mode → share with client (flow-only nav + state reset)
       ↓
Client feedback → designer iterates
```

## Track A — Spec Pipeline Improvements

### 2a. Design Decision Log

**File:** `docs/design-decisions.md`

Captures visual conventions that persist across Claude sessions:
- Layout conventions (e.g. "all form screens use single-column layout with sticky footer")
- Component preferences (e.g. "use RadioCard not RadioGroup for single selection")
- Spacing/sizing patterns (e.g. "card padding is always p-4, gap between cards is gap-3")

Referenced from CLAUDE.md so every session picks it up automatically. Claude reads it before building any screen. After the designer approves a new pattern, Claude appends it.

### 2b. Claude-Suggested Specs

The spec authoring model is flipped from "designer fills in details" to "Claude proposes, designer approves":

1. PM/Designer writes the high-level spec (what the screen does, user stories)
2. Claude suggests:
   - **Layout hint** — single column, two column, list, form wizard, dashboard
   - **Component preferences** — which L2/L3 components to use
   - **State matrix** — explicit list of scenarios with data shapes
   - **Flow map** — which buttons navigate where, target screen + state
3. PM/Designer reviews and approves (or tweaks) Claude's suggestions
4. Claude builds from the approved spec

This means the designer doesn't need to know the component catalog or state conventions.

### 2c. Self-Correction Loop

After generating screen files, Claude automatically:
1. Runs `tsc --noEmit` → fixes type errors
2. Runs `verify-screen.sh` → fixes i18n gaps, forbidden colors, missing flow triggers
3. Runs `playwright test` for that screen → fixes runtime errors

The designer sees the screen only after it passes all checks.

### 2d. Play Mode

Two features only:
- **Flow-only navigation** — in play mode, catalog sidebar and inspector panel are hidden. Only `flow.ts` click targets work. The client clicks through the app naturally.
- **State reset** — a small floating button to reset all screens to their default state so the client can start over.

## Track C — L3 Block Library

### Philosophy

L3 blocks are opinionated, data-driven patterns built from L2 components. Screens using blocks become configuration rather than invention:

```tsx
<FormWizard
  steps={[
    { label: "Patient", fields: [...] },
    { label: "Schedule", fields: [...] },
  ]}
  onComplete={...}
/>
```

Claude generates block configurations, not raw JSX. Fewer ways to get it wrong. Faster to iterate.

### Priority Blocks

| Block | What it does | Replaces |
|---|---|---|
| **FormWizard** | Multi-step form with progress indicator, validation states, back/next | Hand-assembled form + stepper |
| **DataList** | Scrollable list with search, filters, empty/loading/populated states | Manual list + state handling |
| **StatCard** | Metric display (value, label, trend, icon) | One-off stat layouts |
| **DetailView** | Key-value pairs with sections, expandable groups | Manual description lists |
| **ActionSheet** | Bottom sheet with action items | Custom modal/drawer |
| **TabLayout** | Tab bar with content panels, badge counts | Manual tab state management |
| **Timeline** | Chronological event list with status indicators | Custom timeline markup |
| **MediaCard** | Image/icon + title + description + action, various layouts | One-off card patterns |

### Block Rules

- Blocks live in `src/blocks/{block-name}.tsx`
- Blocks import only from L1 (tokens) and L2 (ui) — never from other blocks
- Blocks accept structured data props — no children assembly
- Blocks handle their own loading/empty/error states internally
- Blocks are domain-aware but not screen-specific (reusable across screens)

### Build Strategy

Blocks are built **on-demand** — when a screen spec calls for a pattern that doesn't exist yet, Claude builds the block first, then uses it in the screen. No upfront investment in blocks nobody needs yet.

## Out of Scope

- Visual drag-and-drop editing
- Real-time collaboration / multi-cursor editing
- Client annotation/commenting system
- Responsive breakpoint exploration
- Clean URL deployment / auto-play hints
- Backend code, API endpoints, database schemas

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Designer agency gap — always one conversation turn from changes | High | Faster iteration via L3 blocks + self-correction loop reduces round-trip time |
| Client feedback loop is unstructured | Medium | Live walkthrough + verbal feedback; annotation system deferred to future |
| L3 blocks constrain novel layouts | Low | Blocks built on-demand; novel patterns start as screen-specific then graduate to L3 |
| Context loss between sessions | Medium | Design decision log + CLAUDE.md + memory files |

## Market Differentiation

This approach is differentiated from generic AI builders (v0, Bolt, Lovable) because of:
- **Scenarios as test contracts** — auto-generated E2E tests from state declarations
- **Strict design system enforcement** — brand tokens, forbidden colors, verify-screen.sh
- **Flow-based interactivity** — declarative flow.ts enables navigation without backend
- **Claude as constrained builder** — specs + architectural rules reduce "AI guesses wrong"
- **On-demand L3 blocks** — screens become configuration, not invention

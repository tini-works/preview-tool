# Architecture Reconciliation — Design Document

**Date:** 2026-02-25
**Status:** Approved

## Goal

Merge the three-layer architecture rules into CLAUDE.md, reorganize File Boundaries by layer, add a Brand placeholder section, and delete the standalone architecture doc.

## Decisions

| Decision | Choice |
|---|---|
| Architecture adoption | Aspirational — adopt incrementally |
| Brand values | Link to docs/design-tokens.md (file provided later, do not create) |
| Cross-referencing | Merge architecture rules into CLAUDE.md |
| File Boundaries table | Reorganize by layer (L1/L2/L3/App) |
| Architecture doc fate | Delete docs/three-layer-architecture.md |

## Changes

### 1. Replace `## File Boundaries` with `## Architecture`

New section includes:
- Dependency rule: tokens → ui → blocks → screens (never upward)
- Layer-organized table: L1 Tokens (planned), L2 UI (exists), L3 Blocks (planned), App (active)
- Scaffolding table for read-only infrastructure (dev/, hooks/, lib/, main.tsx, index.css)
- Layer rules: screen folder convention, L2 props-only, L3 data-driven API, no block-to-block imports

### 2. Add `## Brand` section

After Tech Stack, before UI Rules. Links to docs/design-tokens.md with note that file will be provided later.

### 3. Delete `docs/three-layer-architecture.md`

Rules are now in CLAUDE.md. Standalone doc is redundant.

## Final CLAUDE.md section order

1. `## Scope`
2. `## Architecture` (new — replaces File Boundaries)
3. `## Tech Stack`
4. `## Brand` (new)
5. `## UI Rules`
6. `## UI Patterns`

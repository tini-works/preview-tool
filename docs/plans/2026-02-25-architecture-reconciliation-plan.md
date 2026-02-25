# Architecture Reconciliation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the three-layer architecture rules into CLAUDE.md, reorganize file boundaries by layer, add a Brand section, and delete the standalone architecture doc.

**Architecture:** Replace the `## File Boundaries` section in CLAUDE.md with a new `## Architecture` section organized by layer (L1 Tokens → L2 UI → L3 Blocks → App). Add a `## Brand` section linking to a future design-tokens file. Delete the now-redundant `docs/three-layer-architecture.md`.

**Tech Stack:** Markdown only — no code changes.

---

### Task 1: Replace `## File Boundaries` with `## Architecture` in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:9-26` (replace the entire `## File Boundaries` section)

**Step 1: Replace the section**

In `CLAUDE.md`, replace the entire `## File Boundaries` section (from line 9 `## File Boundaries` through line 26 ending with the last bullet) with the following exact content:

```markdown
## Architecture

Dependencies flow one direction: **tokens → ui → blocks → screens**. Never upward.

### Layers & File Boundaries

| Layer | Path | Permission | Status | Contains |
|-------|------|-----------|--------|----------|
| L1 Tokens | `src/tokens/` | Read-only | Planned | Design values (colors, spacing, radii) as TS constants and Tailwind preset |
| L2 UI | `src/components/ui/` | Read-only | Exists | Generic React primitives (Button, Input, Card) — domain-free, no business logic |
| L3 Blocks | `src/blocks/` | Read-only | Planned | Composed, data-driven patterns from L2 — domain-aware, opinionated layout |
| App | `src/screens/<ScreenName>/` | **Writable** | Active | One-off screen layouts importing L2 + L3 |
| App | `src/App.tsx` | **Writable** | Exists | Edit only to add imports/routing for new screens |

### Scaffolding (read-only)

| Path | Notes |
|------|-------|
| `src/components/dev/` | Dev tools (ScenarioSwitcher) — do not modify |
| `src/hooks/` | Shared hooks — do not modify |
| `src/lib/` | Utilities (cn, etc.) — do not modify |
| `src/main.tsx` | App entry point — do not modify |
| `src/index.css` | Tailwind imports + CSS variables — do not modify |

### Rules

- Each screen lives in its own folder: `src/screens/<ScreenName>/index.tsx`
- Screen folders may contain sub-components, mock data, and types specific to that screen
- L2 components accept standard React props — no domain logic, all strings via props
- L3 blocks use data-driven API (accept structured data, not children assembly)
- Blocks cannot import other blocks — extract shared logic to L2
- If a scaffolding or read-only file needs changes, ask the user first
```

The old content being replaced is:

```
## File Boundaries

Screens are the primary work area. Scaffolding is pre-built and must not be modified — this isolates errors to the screen being developed.

| Path | Permission | Notes |
|------|-----------|-------|
| `src/screens/<ScreenName>/` | **Writable** | Create and update freely — all screen work goes here |
| `src/App.tsx` | **Writable** | Edit only to add imports/routing for new screens |
| `src/components/ui/` | Read-only | shadcn/ui components — add new ones via CLI only |
| `src/components/dev/` | Read-only | Dev tools (ScenarioSwitcher) — do not modify |
| `src/hooks/` | Read-only | Shared hooks — do not modify |
| `src/lib/` | Read-only | Utilities (cn, etc.) — do not modify |
| `src/main.tsx` | Read-only | App entry point — do not modify |
| `src/index.css` | Read-only | Tailwind imports + CSS variables — do not modify |

- Each screen lives in its own folder: `src/screens/<ScreenName>/index.tsx`
- Screen folders may contain sub-components, mock data, and types specific to that screen
- If a scaffolding file needs changes, ask the user first — never modify silently
```

**Step 2: Verify the edit**

Run: `head -40 CLAUDE.md`
Expected: `## Architecture` section with layer table visible.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: replace File Boundaries with Architecture section in CLAUDE.md"
```

---

### Task 2: Add `## Brand` section to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (insert new section after `## Tech Stack`, before `## UI Rules`)

**Step 1: Insert the Brand section**

In `CLAUDE.md`, find the line `## UI Rules` and insert the following content immediately before it (after the Tech Stack section ends):

```markdown
## Brand

Design tokens (colors, typography, spacing, radii) are defined in [docs/design-tokens.md](docs/design-tokens.md).

> This file will be provided later. Do not create it.

```

The result should be that `## Brand` appears between `## Tech Stack` and `## UI Rules`.

**Step 2: Verify section order**

Run: `grep '^## ' CLAUDE.md`
Expected output:
```
## Scope
## Architecture
## Tech Stack (strict — do not deviate)
## Brand
## UI Rules
## UI Patterns
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Brand section to CLAUDE.md linking to future design-tokens"
```

---

### Task 3: Delete `docs/three-layer-architecture.md`

**Files:**
- Delete: `docs/three-layer-architecture.md`

**Step 1: Delete the file**

```bash
git rm docs/three-layer-architecture.md
```

**Step 2: Commit**

```bash
git commit -m "docs: remove standalone three-layer-architecture.md (merged into CLAUDE.md)"
```

---

### Task 4: Final verification

**Step 1: Verify CLAUDE.md section order**

Run: `grep '^## \|^### ' CLAUDE.md`
Expected:
```
## Scope
## Architecture
### Layers & File Boundaries
### Scaffolding (read-only)
### Rules
## Tech Stack (strict — do not deviate)
## Brand
## UI Rules
## UI Patterns
```

**Step 2: Verify architecture doc is gone**

Run: `ls docs/three-layer-architecture.md 2>&1`
Expected: `No such file or directory`

**Step 3: Verify git is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean`

**Step 4: Review commit log**

Run: `git log --oneline -4`
Expected: Three new commits (Architecture section, Brand section, delete architecture doc) plus the design doc commit.

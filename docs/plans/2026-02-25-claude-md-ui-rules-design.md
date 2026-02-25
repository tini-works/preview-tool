# CLAUDE.md UI Rules — Design Document

**Date:** 2026-02-25
**Status:** Approved

## Goal

Create a CLAUDE.md and supporting reference files that enforce UI-only generation, tech stack compliance, translation requirements, and visual consistency across all screens.

## Decisions

| Decision | Choice |
|---|---|
| i18n library | react-i18next with `t()` convention |
| Router | None — no Link/route rules |
| Mock data | Allowed (useState + hardcoded data + simulated delays) |
| Package installs | Forbidden without explicit user approval |
| Consistency approach | Patterns section in reference file (no mandatory file reading) |
| CLAUDE.md structure | Concise directives + links to `docs/ui-rules.md` and `docs/ui-patterns.md` |

## File Structure

```
preview-tool/
├── CLAUDE.md                  ← concise directives + links
├── docs/
│   ├── ui-rules.md            ← detailed rules with examples
│   └── ui-patterns.md         ← layout conventions, component usage
```

## CLAUDE.md Content

Sections:
- **Scope** — UI only, no backend, no unapproved packages
- **Tech Stack** — React 19, TypeScript, Tailwind CSS v4, shadcn/ui, react-i18next, pnpm
- **UI Rules** — summary bullets linking to docs/ui-rules.md
- **UI Patterns** — link to docs/ui-patterns.md

## docs/ui-rules.md Content

Sections:
- **Translation** — all client-facing strings via `t()`, dot notation keys, namespace per feature
- **Form Inputs** — Label + Input with matching htmlFor/id
- **List & Table States** — loading, empty, populated
- **Status Badges** — PENDING=amber, CONFIRMED=emerald, COMPLETED=sky, CANCELLED=red; always text+color
- **Async Buttons** — disabled during operations, visible loading feedback
- **Accessibility** — alt attributes, aria-hidden for decorative images, text labels with color

## docs/ui-patterns.md Content

Sections:
- **Page Layout** — min-h-svh, bg-background, p-4, flex centering
- **Component Usage** — shadcn/ui only, import from @/components/ui/, add via CLI
- **Spacing & Sizing** — gap-6, max-w-md for forms, max-w-4xl for tables, Tailwind scale
- **Typography** — text-4xl bold for titles, shadcn CardTitle/CardDescription, text-base body
- **Mock Data Convention** — useState + setTimeout loading simulation

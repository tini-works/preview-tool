# Preview Tool

## Scope

- Generate UI screens only — no backend code, no API endpoints, no server logic, no database schemas
- Mock data is allowed: use `useState` with hardcoded values and simulated loading delays
- Do NOT install or add any npm package without explicit user approval

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

## Tech Stack (strict — do not deviate)

- **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS v4** — utility classes only, no custom CSS files
- **shadcn/ui** (New York style, neutral theme) — add components via `pnpm dlx shadcn@latest add <component>`
- **react-i18next** — all client-facing strings must use `t()` from `useTranslation()`
- **pnpm** — package manager (not npm, not yarn)

## Brand

Design tokens (colors, typography, spacing, radii) are defined in [docs/design-tokens.md](docs/design-tokens.md).

## UI Rules

Follow all rules in [docs/ui-rules.md](docs/ui-rules.md):

- All client-facing strings use `t()` from react-i18next — no hardcoded text
- Every `<Input>` has an associated `<Label>` with matching `htmlFor`/`id`
- Lists and tables handle three states: loading, empty, populated
- Status badges use consistent colors: PENDING=amber, CONFIRMED=emerald, COMPLETED=sky, CANCELLED=red
- Buttons have `disabled` state during async operations with visible loading feedback
- Images require `alt` attributes; decorative images use `alt="" aria-hidden="true"`
- Color-coded visuals always include a text label — never color-only

## UI Patterns

Follow layout and component conventions in [docs/ui-patterns.md](docs/ui-patterns.md).

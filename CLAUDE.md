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
| L1 Tokens | `src/tokens/` | Read-only | Exists | Design values (colors, spacing, radii) as TS constants and CSS custom properties |
| L2 UI | `src/components/ui/` | Read-only | Exists | Generic React primitives (Button, Input, Card) — domain-free, no business logic |
| L3 Blocks | `src/blocks/` | Read-only | Planned | Composed, data-driven patterns from L2 — domain-aware, opinionated layout |
| App | `src/screens/<ScreenName>/` | **Writable** | Active | One-off screen layouts importing L2 + L3 |
| App | `src/locales/<lang>/` | **Writable** | Active | Translation JSON files — one per screen per language |

### Scaffolding (read-only)

| Path | Notes |
|------|-------|
| `src/App.tsx` | App shell — screens are auto-discovered, do not modify |
| `src/components/dev/` | Dev tools (ScenarioSwitcher) — do not modify |
| `src/hooks/` | Shared hooks — do not modify |
| `src/lib/` | Utilities (cn, etc.) — do not modify |
| `src/main.tsx` | App entry point — do not modify |
| `src/index.css` | Tailwind imports + CSS variables — do not modify |

### Rules

- Each screen lives in its own folder: `src/screens/<ScreenName>/index.tsx`
- Screens are auto-discovered via `import.meta.glob` — no manual registration needed
- Screen folders may contain sub-components, mock data, and types specific to that screen
- Translation files go in `src/locales/<lang>/<screenName>.json` (one per screen per language)
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

### Color Rule (STRICT)

**Never use Tailwind default color palettes** (`neutral-*`, `gray-*`, `zinc-*`, `red-*`, `green-*`, `blue-*`, `orange-*`). Always use brand tokens:

| Role | Brand class | NOT this |
|------|------------|----------|
| Primary text | `text-charcoal-500` | `text-neutral-900` |
| Secondary text label | `text-charcoal-400` | `text-neutral-700` |
| Muted/description text | `text-slate-500` | `text-neutral-500` |
| Disabled/placeholder | `text-slate-400` | `text-neutral-400` |
| CTA / primary action | `bg-teal-500` | `bg-neutral-900` |
| Accent | `text-coral-500` / `bg-coral-*` | `text-red-*` / `bg-orange-*` |
| Subtle background | `bg-cream-200` | `bg-neutral-100` |
| Surface / card bg | `bg-cream-50` | `bg-white` (inline) |
| Hover background | `hover:bg-cream-100` | `hover:bg-neutral-50` |
| Border default | `border-cream-400` | `border-neutral-200` |
| Border subtle | `border-cream-300` | `border-neutral-100` |
| Focus ring | `focus:ring-teal-500` | `focus:ring-neutral-500` |
| Success | `bg-teal-100 text-teal-800` | `bg-green-*` |
| Error | `bg-coral-100 text-coral-800` | `bg-red-*` |
| Info | `bg-teal-50 text-teal-800` | `bg-blue-*` |
| Overlay | `bg-charcoal-900/40` | `bg-black/40` |

Allowed exceptions: `text-white`, `text-black`, Tailwind's `bg-background`/`text-foreground` semantic variables, and `yellow-*` for warnings (no brand yellow defined).

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

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
| L3 Blocks | `src/blocks/` | Read-only | Active | Composed, data-driven patterns from L2 — domain-aware, opinionated layout |
| App | `src/screens/{section}/{screen}/` | **Writable** | Active | One-off screen layouts importing L2 + L3, with co-located locale JSON |

### Available L3 Blocks

| Block | Path | Props API | Use When |
|-------|------|-----------|----------|
| DataTable | `src/blocks/data-table/` | `columns`, `data`, `pageSize`, `loading`, `emptyMessage` | Tabular data with pagination (≥10 rows) |
| DataList | `src/blocks/data-list/` | `data`, `renderItem`, `keyExtractor`, `loading`, `searchable`, `emptyMessage` | Scrollable item lists with optional search |

When a screen spec calls for a pattern not covered by existing blocks, build the block first in `src/blocks/{block-name}/index.tsx`, then use it in the screen. Follow existing block conventions:
- Generic TypeScript props (no domain types in block interface)
- Handle loading/empty/populated states internally
- Import only from L1 (tokens) and L2 (ui)
- No block-to-block imports

### Scaffolding (read-only)

| Path | Notes |
|------|-------|
| `src/App.tsx` | App shell — screens are auto-discovered, do not modify |
| `src/components/dev/` | Dev tools (ScenarioSwitcher) — do not modify |
| `src/hooks/` | Shared hooks — do not modify |
| `src/lib/` | Utilities (cn, etc.) — do not modify |
| `src/main.tsx` | App entry point — do not modify |
| `src/index.css` | Tailwind imports + CSS variables — do not modify |
| `playwright.config.ts` | E2E test config — do not modify |
| `src/screens/_test-helpers/` | Playwright fixtures and helpers — do not modify |
| `src/blocks/` | L3 composed blocks (DataTable, etc.) — do not modify |

### Rules

- Screens live in `src/screens/{section}/{screen}/index.tsx` (sectioned) or `src/screens/{screen}/index.tsx` (standalone)
- Folder names use **lowercase kebab-case** (e.g., `booking/time-slots/`, `hello-world/`)
- Screens are auto-discovered via `import.meta.glob('**/index.tsx')` — no manual registration needed
- Screen folders may contain sub-components, mock data, and types specific to that screen
- Shared components within a section go in `src/screens/{section}/_shared/` (excluded from screen discovery)
- Translation files are **co-located** in the screen folder: `src/screens/{section}/{screen}/en.json`
- Locale namespace is derived from the path: `prescription/scan/en.json` → namespace `prescription-scan`
- Locales are auto-discovered via `import.meta.glob` — no manual registration in `i18n.ts`
- L2 components accept standard React props — no domain logic, all strings via props
- L3 blocks use data-driven API (accept structured data, not children assembly)
- Blocks cannot import other blocks — extract shared logic to L2
- If a scaffolding or read-only file needs changes, ask the user first
- Every screen must include `scenarios.ts` — it drives both the dev tools UI and E2E tests
- Every screen must include a co-located `.spec.ts` with one test per scenario/region state — follow existing screen patterns
- `flow.ts` is optional — include it for screens with click-driven navigation or state transitions
- Interactive elements with flow triggers must have `data-flow-target="ComponentType:Label"` attributes (e.g., `data-flow-target="Button:Continue"`)
- List regions must have ≥ 10 `mockItems` and set `defaultCount: 3` — inspector loads showing 3, user can slide up to full set
- Table regions must have ≥ 100 `mockItems` (10 pages × 10 rows) and set `defaultCount: 10`
- Every region with `isList: true` must set `defaultCount`

## Tech Stack (strict — do not deviate)

- **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS v4** — utility classes only, no custom CSS files
- **shadcn/ui** (New York style, neutral theme) — add components via `pnpm dlx shadcn@latest add <component>`
- **react-i18next** — all client-facing strings must use `t()` from `useTranslation()`
  - **Supported locales:** `de` (German, default), `en` (English)
  - Every screen with user-facing text must ship both `de.json` and `en.json`
- **pnpm** — package manager (not npm, not yarn)
- **Playwright** — E2E smoke tests co-located as `{screen}.spec.ts`; run with `pnpm test:e2e`

## Brand

Design tokens (colors, typography, spacing, radii) are defined in [docs/design-tokens.md](docs/design-tokens.md).

Visual conventions and component preferences are documented in [docs/design-decisions.md](docs/design-decisions.md). Read this before building any screen.

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

## Testing

- **Scenarios are the test contract** — define all user-visible states in `scenarios.ts` before or alongside `index.tsx`
- Each `.spec.ts` follows a consistent pattern: select screen → switch state → assert frame not empty
- Tests auto-capture `console.error` — a single console error during rendering fails the test
- Keep renders clean: no stray `console.log` / `console.warn` in committed code
- Run tests during development, not just at the end:
  - All screens: `pnpm test:e2e`
  - Single screen: `pnpm exec playwright test src/screens/{section}/{screen}/`

## Verification

Before declaring a screen implementation task complete:

1. Confirm TypeScript compiles: `pnpm exec tsc --noEmit`
2. Run E2E smoke tests: `pnpm test:e2e` (auto-starts dev server)
3. All scenario states must render without console errors
4. Verify both locales (`de` and `en`) display correctly
5. Fix any TypeScript, lint, or runtime errors — do not leave known issues

For comprehensive per-screen validation (i18n coverage, flow triggers, forbidden colors):

    bash .claude/skills/screen-spec/references/verify-screen.sh {section}/{screen}

## Self-Correction Loop

After generating or modifying screen files, automatically run the verification pipeline and fix issues before presenting the result to the designer:

1. `pnpm exec tsc --noEmit` — fix any TypeScript errors
2. `bash .claude/skills/screen-spec/references/verify-screen.sh {section}/{screen}` — fix i18n gaps, forbidden colors, missing flow triggers
3. `pnpm exec playwright test src/screens/{section}/{screen}/` — fix any runtime/rendering errors

Repeat until all three pass with zero errors. Only then tell the designer the screen is ready for review.

# Preview Tool

## Scope

- Generate UI screens only — no backend code, no API endpoints, no server logic, no database schemas
- Mock data is allowed: use `useState` with hardcoded values and simulated loading delays
- Do NOT install or add any npm package without explicit user approval

## Tech Stack (strict — do not deviate)

- **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS v4** — utility classes only, no custom CSS files
- **shadcn/ui** (New York style, neutral theme) — add components via `pnpm dlx shadcn@latest add <component>`
- **react-i18next** — all client-facing strings must use `t()` from `useTranslation()`
- **pnpm** — package manager (not npm, not yarn)

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

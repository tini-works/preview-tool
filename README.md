# Preview Tool

A UI screen preview tool for designing and iterating on healthcare clinic app screens. Screens are built with React + TypeScript + Tailwind CSS and rendered in an interactive dev environment with scenario switching.

## Quick Start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Tech Stack

- **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS v4** — utility classes only
- **shadcn/ui** (New York style) — add components via `pnpm dlx shadcn@latest add <component>`
- **react-i18next** — all user-facing strings use `t()`
- **pnpm** — package manager

## Project Structure

```
src/
├── tokens/              # L1 — Design tokens (TS constants)
│   └── index.ts         #   colors, spacing, typography, radius, shadow, motion
├── components/
│   ├── ui/              # L2 — Generic primitives (Button, Card, Select)
│   ├── screen.tsx       #   Screen layout component
│   └── dev/             #   Dev tools (ScenarioSwitcher)
├── screens/             # App — One screen per folder
│   ├── Hello/
│   ├── HelloWorld/
│   ├── LoginForm/
│   ├── BookingSearch/
│   ├── BookingType/
│   ├── BookingDoctor/
│   ├── BookingLocation/
│   ├── BookingTimeSlots/
│   ├── BookingPatient/
│   ├── BookingAppointments/
│   ├── BookingConfirmation/
│   ├── ScreenRenderer.tsx
│   ├── useScreenModules.ts
│   ├── flow.yaml        #   Screen flow definitions
│   └── types.ts
├── flow/                # Flow engine (navigation between screens)
├── devtools/            # Inspector, catalog, dev tools bar
├── hooks/               # Shared hooks
├── lib/                 # Utilities (cn, etc.)
├── index.css            # Tailwind config + CSS variables
├── App.tsx              # Routing / screen registration
└── main.tsx             # Entry point
```

### Layer Architecture

Dependencies flow one direction: **tokens → ui → blocks → screens**. Never upward.

| Layer | Path | Contains |
|-------|------|----------|
| L1 Tokens | `src/tokens/` | Design values as TS constants + CSS custom properties |
| L2 UI | `src/components/ui/` | Generic React primitives — domain-free |
| L3 Blocks | `src/blocks/` | Composed patterns from L2 — domain-aware (planned) |
| App | `src/screens/<Name>/` | Screen layouts importing L2 + L3 |

## Design Tokens

Brand colors are implemented in two places:

1. **`src/tokens/index.ts`** — Typed TS constants for use in code
2. **`src/index.css`** — CSS custom properties powering Tailwind utilities

### Brand Palette

| Scale | Primary (500) | Role |
|-------|--------------|------|
| **teal** | `#13A3B5` | Primary CTA, focus rings |
| **charcoal** | `#1C2A30` | Primary text |
| **cream** | `#FAF8F5` (100) | Main background |
| **slate** | `#5E7A86` | Secondary/muted text |
| **coral** | `#E88A73` | Accent, destructive actions |

### Semantic Mapping

Tailwind's semantic classes map to brand tokens:

| Class | Resolves to | Hex |
|-------|------------|-----|
| `bg-background` | cream-100 | `#FAF8F5` |
| `bg-primary` | teal-500 | `#13A3B5` |
| `text-foreground` | charcoal-500 | `#1C2A30` |
| `text-muted-foreground` | slate-500 | `#5E7A86` |
| `border-border` | cream-400 | `#E8E3DB` |
| `ring-ring` | teal-500 | `#13A3B5` |
| `bg-destructive` | coral-600 | `#E06A4F` |
| `bg-accent` | coral-50 | `#FDF3F0` |

### Using Tokens

**Prefer semantic classes** (`bg-primary`, `text-foreground`, `border-border`) for anything mapped through shadcn/ui. Use **brand palette utilities** (`bg-teal-500`, `text-coral-600`, `bg-cream-200`) when you need a specific brand shade not covered by semantic mapping.

```tsx
// Semantic (preferred — auto-inherits brand)
<Button className="bg-primary text-primary-foreground">Save</Button>

// Brand palette (when you need a specific shade)
<div className="bg-cream-200 text-charcoal-700 border-slate-200">
```

Full token reference: [docs/design-tokens.md](docs/design-tokens.md)

## Adding a Screen

Each screen lives in `src/screens/<ScreenName>/`:

```
src/screens/MyScreen/
├── index.tsx        # Screen component (default export)
└── scenarios.ts     # Scenario definitions for dev tools
```

Register the screen in `src/App.tsx`.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Type-check + production build |
| `pnpm lint` | Run ESLint |
| `pnpm preview` | Preview production build |

## Documentation

- [Design Tokens Reference](docs/design-tokens.md) — Full color, spacing, typography, radius, shadow, motion values
- [UI Rules](docs/ui-rules.md) — Accessibility and consistency rules
- [UI Patterns](docs/ui-patterns.md) — Layout and component conventions
- [CLAUDE.md](CLAUDE.md) — AI assistant instructions and project constraints

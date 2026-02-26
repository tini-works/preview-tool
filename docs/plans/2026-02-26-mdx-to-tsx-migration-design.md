# MDX to TSX Migration Design

**Date:** 2026-02-26
**Status:** Approved

## Problem

MDX files are too complex for non-technical content authors. The JSX-in-Markdown syntax is a barrier, and the MDX toolchain adds build complexity.

## Decision

Replace the MDX content system with **AI-generated TSX screen components** that import directly from the existing L2 component library. Follow the established `HelloWorld/` pattern with `scenarios.ts` for state metadata.

## Screen Structure

Each screen is a folder under `src/screens/`:

```
src/screens/<ScreenName>/
├── index.tsx          # React component (named export)
├── scenarios.ts       # State config + mock data (exported object)
└── components/        # Optional sub-components
```

### scenarios.ts (replaces MDX frontmatter)

Defines state variants as data — no UI duplication per state:

```typescript
export type BookingTypeData = {
  selectedType: 'acute' | 'prevention' | 'follow-up' | null
}

export const bookingTypeScenarios = {
  acute: {
    label: 'Acute appointment selected',
    data: { selectedType: 'acute' } as BookingTypeData,
  },
  prevention: {
    label: 'Prevention appointment selected',
    data: { selectedType: 'prevention' } as BookingTypeData,
  },
}
```

### index.tsx (replaces MDX file)

Standard React component receiving scenario data as props:

```tsx
export function BookingTypeScreen({ data }: { data: BookingTypeData }) {
  return (
    <RadioCard
      data-flow-target="RadioCard:Acute"
      selected={data.selectedType === 'acute'}
    >
      Acute
    </RadioCard>
  )
}
```

## Screen Discovery & Rendering

### useScreenModules (replaces useContentModules)

Uses `import.meta.glob` on TSX screens instead of MDX files:

```typescript
const screenModules = import.meta.glob('/src/screens/*/index.tsx')
const scenarioModules = import.meta.glob('/src/screens/*/scenarios.ts', { eager: true })
```

Route derivation: `src/screens/BookingType/index.tsx` → `/booking-type`

### ScreenRenderer (replaces ContentRenderer)

- No `MDXProvider` wrapper
- No `VariantProvider` — scenarios handle state via props
- Still wraps with `FlowProvider` for interactive flows
- Passes current scenario data as props to the screen component

## Flow System

### What stays unchanged

- `FlowProvider.tsx` — event delegation
- `FlowEngine.ts` — YAML parser + action resolver
- `trigger-matcher.ts` — DOM element matching
- `flow.yaml` format
- `useFlowConfig.ts` — YAML glob loader

### What changes

- `data-flow-target` is set directly as props on components (no more `withFlowTarget()` HOC)
- `flow.yaml` moves to `src/screens/` alongside screen folders
- Routes in `flow.yaml` updated to match new screen paths

## Migration Map

| MDX file | TSX screen |
|----------|------------|
| `content/hello.mdx` | `src/screens/Hello/` |
| `content/login-form.mdx` | `src/screens/LoginForm/` |
| `content/booking/type.mdx` | `src/screens/BookingType/` |
| `content/booking/doctor.mdx` | `src/screens/BookingDoctor/` |
| `content/booking/patient.mdx` | `src/screens/BookingPatient/` |
| `content/booking/location.mdx` | `src/screens/BookingLocation/` |
| `content/booking/time-slots.mdx` | `src/screens/BookingTimeSlots/` |
| `content/booking/search.mdx` | `src/screens/BookingSearch/` |
| `content/booking/confirmation.mdx` | `src/screens/BookingConfirmation/` |
| `content/booking/appointments.mdx` | `src/screens/BookingAppointments/` |

## Files to Remove

- `/content/` directory (all MDX files)
- `src/content/ContentRenderer.tsx`
- `src/content/mdx-components.tsx`
- `src/content/Variant.tsx`
- `src/content/useContentModules.ts`
- `@mdx-js/rollup` from Vite config + package.json

## Files to Create

- `src/screens/useScreenModules.ts` — discovery hook
- `src/screens/ScreenRenderer.tsx` — replaces ContentRenderer
- `src/screens/types.ts` — shared screen/scenario types
- 10 screen folders (converted from MDX)

## Files to Update

- `src/devtools/` — point catalog + inspector at new screen modules
- `vite.config.ts` — remove MDX plugin
- `flow.yaml` routes updated to new paths

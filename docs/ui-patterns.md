# UI Patterns

## Page Layout

- Full viewport height: `min-h-svh`
- Background: `bg-background`
- Content padding: `p-4` minimum
- Center content with flexbox when single-card layout:
  ```tsx
  <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-4">
    {/* content */}
  </div>
  ```

## Component Usage

- Use shadcn/ui components (Button, Card, Input, Label, etc.) — do not create custom equivalents
- Import from `@/components/ui/<component>`
- Add new shadcn components via CLI: `pnpm dlx shadcn@latest add <component>`
- Do not install alternative component libraries

## Spacing & Sizing

- Gap between stacked elements: `gap-6`
- Card max width: `max-w-md` for forms, `max-w-4xl` for tables/lists
- Use Tailwind spacing scale consistently — avoid arbitrary values (`[17px]`) unless necessary

## Typography

- Page title: `text-4xl font-bold tracking-tight`
- Card title: via shadcn `CardTitle` component
- Card description: via shadcn `CardDescription` component
- Body text: default Tailwind (`text-base`)

## Mock Data Convention

Each screen defines a set of **scenarios** — named states with corresponding mock data — and uses the `useScenarios` hook + `<ScenarioSwitcher>` component to switch between them in dev mode.

### Required base scenarios

Every screen must define at least these three scenarios:

| Key          | Label       | Data shape                                |
|--------------|-------------|-------------------------------------------|
| `loading`    | Loading     | `{ isLoading: true, items: [] }`          |
| `empty`      | Empty       | `{ isLoading: false, items: [] }`         |
| `populated`  | Populated   | `{ isLoading: false, items: [...data] }`  |

Custom extras are encouraged: `single-item`, `error`, `many-items`, etc.

### Hook: `useScenarios<T>`

```tsx
import { useScenarios } from "@/hooks/use-scenarios"

const scenarios = {
  loading:    { label: "Loading",    data: { isLoading: true,  items: [] } },
  empty:      { label: "Empty",      data: { isLoading: false, items: [] } },
  populated:  { label: "Populated",  data: { isLoading: false, items: MOCK_DATA } },
  singleItem: { label: "Single Item", data: { isLoading: false, items: [MOCK_DATA[0]] } },
}

const { active, activeKey, setActiveKey, scenarios: allScenarios } = useScenarios(scenarios)
```

### Component: `<ScenarioSwitcher>`

- Dev-only (`import.meta.env.DEV`) — hidden in production builds
- Floating bottom-right panel, collapsible via beaker icon toggle
- Clicking a scenario instantly swaps the active state — no transition delay

```tsx
import { ScenarioSwitcher } from "@/components/dev/scenario-switcher"

function MyScreen() {
  const { active, activeKey, setActiveKey, scenarios } = useScenarios(myScenarios)
  const { isLoading, items } = active.data

  return (
    <>
      {/* screen content using isLoading and items */}
      <ScenarioSwitcher
        scenarios={scenarios}
        activeKey={activeKey}
        onChange={setActiveKey}
      />
    </>
  )
}
```

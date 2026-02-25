# Mock Data State Switcher Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `useScenarios` hook and `ScenarioSwitcher` component so each screen can define multiple mock data states and switch between them via a floating dev-only panel.

**Architecture:** A generic `useScenarios<T>` hook manages the active scenario state. A `<ScenarioSwitcher>` component renders a collapsible floating panel (bottom-right) that lists all scenarios and lets the user swap instantly. The component is conditionally rendered only in dev mode. Documentation in `docs/ui-patterns.md` is updated to replace the old Mock Data Convention.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Button, Card), lucide-react (FlaskConical icon)

---

### Task 1: Create `useScenarios` hook

**Files:**
- Create: `src/hooks/use-scenarios.ts`

**Step 1: Create the hook file**

Write `src/hooks/use-scenarios.ts` with the following exact content:

```ts
import { useState } from "react"

export type Scenario<T> = {
  label: string
  data: T
}

export function useScenarios<T>(
  scenarios: Record<string, Scenario<T>>,
  defaultKey?: string
) {
  const keys = Object.keys(scenarios)
  const [activeKey, setActiveKey] = useState(defaultKey ?? keys[0])
  const active = scenarios[activeKey]

  return { activeKey, setActiveKey, active, scenarios }
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors (exit code 0).

**Step 3: Commit**

```bash
git add src/hooks/use-scenarios.ts
git commit -m "feat: add useScenarios hook for mock data state switching"
```

---

### Task 2: Create `ScenarioSwitcher` component

**Files:**
- Create: `src/components/dev/scenario-switcher.tsx`

**Step 1: Create the component file**

Write `src/components/dev/scenario-switcher.tsx` with the following exact content:

```tsx
import { useState } from "react"
import { FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Scenario } from "@/hooks/use-scenarios"
import { cn } from "@/lib/utils"

type ScenarioSwitcherProps<T> = {
  scenarios: Record<string, Scenario<T>>
  activeKey: string
  onChange: (key: string) => void
}

export function ScenarioSwitcher<T>({
  scenarios,
  activeKey,
  onChange,
}: ScenarioSwitcherProps<T>) {
  const [isOpen, setIsOpen] = useState(false)

  if (!import.meta.env.DEV) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <Card className="w-56 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <FlaskConical className="size-4" />
                Scenarios
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsOpen(false)}
              >
                &times;
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {Object.entries(scenarios).map(([key, scenario]) => (
              <button
                key={key}
                onClick={() => onChange(key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                  key === activeKey
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                )}
              >
                {scenario.label}
              </button>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsOpen(true)}
          title="Toggle scenario switcher"
        >
          <FlaskConical className="size-4" />
        </Button>
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors (exit code 0).

**Step 3: Commit**

```bash
git add src/components/dev/scenario-switcher.tsx
git commit -m "feat: add ScenarioSwitcher floating dev panel component"
```

---

### Task 3: Update `docs/ui-patterns.md` — Mock Data Convention

**Files:**
- Modify: `docs/ui-patterns.md:35-51` (replace `## Mock Data Convention` section)

**Step 1: Replace the section**

Replace the entire `## Mock Data Convention` section (lines 35-51) in `docs/ui-patterns.md` with the following:

```markdown
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
```

**Step 2: Verify the file**

Run: `head -60 docs/ui-patterns.md`
Expected: The Mock Data Convention section now contains the scenarios hook/component documentation.

**Step 3: Commit**

```bash
git add docs/ui-patterns.md
git commit -m "docs: update Mock Data Convention with useScenarios and ScenarioSwitcher"
```

---

### Task 4: Verify the build

**Step 1: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors (exit code 0).

**Step 2: Run dev build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

**Step 3: Verify git is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean`

**Step 4: Review commit log**

Run: `git log --oneline -4`
Expected: Three new implementation commits plus the design doc commit.

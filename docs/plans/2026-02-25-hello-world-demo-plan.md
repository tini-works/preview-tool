# Hello World Demo Screen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a demo Hello World screen that validates the project architecture: i18n, useScenarios, ScenarioSwitcher, shadcn/ui, list states, and a German language scenario.

**Architecture:** Install react-i18next + i18next, create a minimal i18n config, build the HelloWorld screen in `src/screens/HelloWorld/` with scenarios and translations, and wire it into App.tsx. The screen shows a greeting card and a mock items list with 5 switchable scenarios.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Card, Button), react-i18next, lucide-react, useScenarios hook, ScenarioSwitcher component.

---

### Task 1: Install react-i18next and i18next

**Files:**
- Modify: `package.json` (via pnpm install)

**Step 1: Install packages**

```bash
pnpm add react-i18next i18next
```

**Step 2: Verify installation**

Run: `pnpm ls react-i18next i18next`
Expected: Both packages listed with versions.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: install react-i18next and i18next"
```

---

### Task 2: Set up i18n configuration and translation files

**Files:**
- Create: `src/lib/i18n.ts`
- Create: `src/locales/en/helloWorld.json`
- Create: `src/locales/de/helloWorld.json`
- Modify: `src/main.tsx:1` (add i18n import)

**Step 1: Create `src/lib/i18n.ts`**

Write `src/lib/i18n.ts` with the following exact content:

```ts
import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import enHelloWorld from "@/locales/en/helloWorld.json"
import deHelloWorld from "@/locales/de/helloWorld.json"

i18n.use(initReactI18next).init({
  resources: {
    en: { helloWorld: enHelloWorld },
    de: { helloWorld: deHelloWorld },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

export default i18n
```

**Step 2: Create `src/locales/en/helloWorld.json`**

```json
{
  "title": "Hello World",
  "description": "This is a demo screen to validate the project architecture.",
  "getStarted": "Get Started",
  "itemsTitle": "Items",
  "emptyMessage": "No items yet. Add your first item to get started.",
  "loadingMessage": "Loading items..."
}
```

**Step 3: Create `src/locales/de/helloWorld.json`**

```json
{
  "title": "Hallo Welt",
  "description": "Dies ist ein Demo-Bildschirm zur Validierung der Projektarchitektur.",
  "getStarted": "Loslegen",
  "itemsTitle": "Einträge",
  "emptyMessage": "Noch keine Einträge. Fügen Sie Ihren ersten Eintrag hinzu.",
  "loadingMessage": "Einträge werden geladen..."
}
```

**Step 4: Add i18n import to `src/main.tsx`**

Add `import './lib/i18n'` as the first import in `src/main.tsx`. The file should become:

```tsx
import './lib/i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Note: The CLAUDE.md says `src/main.tsx` is read-only scaffolding, but adding the i18n import is a one-time infrastructure change required to enable translations. This was approved in the design.

**Step 5: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors.

**Step 6: Commit**

```bash
git add src/lib/i18n.ts src/locales/en/helloWorld.json src/locales/de/helloWorld.json src/main.tsx
git commit -m "feat: set up react-i18next with English and German translations"
```

---

### Task 3: Create HelloWorld screen with scenarios

**Files:**
- Create: `src/screens/HelloWorld/scenarios.ts`
- Create: `src/screens/HelloWorld/index.tsx`

**Step 1: Create `src/screens/HelloWorld/scenarios.ts`**

```ts
export type Item = {
  id: string
  title: string
  subtitle: string
}

export const MOCK_ITEMS: Item[] = [
  { id: "1", title: "Design system", subtitle: "Set up tokens and theme" },
  { id: "2", title: "Authentication", subtitle: "Login and signup flows" },
  { id: "3", title: "Dashboard", subtitle: "Main overview screen" },
]

export type HelloWorldData = {
  isLoading: boolean
  items: Item[]
  lang: string
}

export const helloWorldScenarios = {
  loading: {
    label: "Loading",
    data: { isLoading: true, items: [] as Item[], lang: "en" },
  },
  empty: {
    label: "Empty",
    data: { isLoading: false, items: [] as Item[], lang: "en" },
  },
  populated: {
    label: "Populated",
    data: { isLoading: false, items: MOCK_ITEMS, lang: "en" },
  },
  singleItem: {
    label: "Single Item",
    data: { isLoading: false, items: [MOCK_ITEMS[0]], lang: "en" },
  },
  german: {
    label: "German",
    data: { isLoading: false, items: MOCK_ITEMS, lang: "de" },
  },
}
```

**Step 2: Create `src/screens/HelloWorld/index.tsx`**

```tsx
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useScenarios } from "@/hooks/use-scenarios"
import { ScenarioSwitcher } from "@/components/dev/scenario-switcher"
import { helloWorldScenarios } from "./scenarios"

export function HelloWorldScreen() {
  const { active, activeKey, setActiveKey, scenarios } =
    useScenarios(helloWorldScenarios)
  const { isLoading, items, lang } = active.data
  const { t, i18n } = useTranslation("helloWorld")

  useEffect(() => {
    i18n.changeLanguage(lang)
  }, [lang, i18n])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-4">
      <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>{t("getStarted")}</Button>
        </CardContent>
      </Card>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("itemsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>{t("loadingMessage")}</span>
            </div>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">{t("emptyMessage")}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border px-3 py-2"
                >
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.subtitle}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ScenarioSwitcher
        scenarios={scenarios}
        activeKey={activeKey}
        onChange={setActiveKey}
      />
    </div>
  )
}
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/screens/HelloWorld/scenarios.ts src/screens/HelloWorld/index.tsx
git commit -m "feat: add HelloWorld demo screen with scenarios and i18n"
```

---

### Task 4: Wire HelloWorld screen into App.tsx

**Files:**
- Modify: `src/App.tsx` (replace current content)

**Step 1: Update App.tsx**

Replace the entire content of `src/App.tsx` with:

```tsx
import { HelloWorldScreen } from "@/screens/HelloWorld"

function App() {
  return <HelloWorldScreen />
}

export default App
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors.

**Step 3: Verify build succeeds**

Run: `pnpm build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire HelloWorld screen into App.tsx"
```

---

### Task 5: Manual verification

**Step 1: Start dev server**

Run: `pnpm dev`

**Step 2: Verify in browser**

Open the URL shown in terminal (usually http://localhost:5173). Verify:

1. Page shows "Hello World" title and greeting card
2. Items list shows 3 populated items (default scenario)
3. Bottom-right corner has a beaker icon (ScenarioSwitcher)
4. Click the beaker → panel opens showing 5 scenarios
5. Click "Loading" → shows spinner with loading message
6. Click "Empty" → shows empty state message
7. Click "Single Item" → shows 1 item
8. Click "German" → all text switches to German
9. Click "Populated" → back to English with 3 items

**Step 3: Stop dev server and verify git is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean`

**Step 4: Review commit log**

Run: `git log --oneline -5`
Expected: 4 new commits (install, i18n setup, screen, App.tsx wiring).

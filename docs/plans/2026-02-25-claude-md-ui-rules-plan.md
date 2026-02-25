# CLAUDE.md UI Rules Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create CLAUDE.md and two reference files (docs/ui-rules.md, docs/ui-patterns.md) that enforce UI-only generation, tech stack compliance, react-i18next translations, and visual consistency.

**Architecture:** Three markdown files — a concise CLAUDE.md with directives and links, plus two reference docs with detailed rules and patterns. No code changes, no package installs. Documentation only.

**Tech Stack:** Markdown files only. References: React 19, TypeScript, Tailwind CSS v4, shadcn/ui, react-i18next, pnpm.

---

### Task 1: Create docs/ui-rules.md

**Files:**
- Create: `docs/ui-rules.md`

**Step 1: Create the file**

Write `docs/ui-rules.md` with the following exact content:

```markdown
# UI Rules

## Translation (react-i18next)

- Every client-facing string must use `t('key')` — no hardcoded text in JSX
- Translation keys use dot notation: `t('appointments.title')`
- Namespace per feature/screen: `useTranslation('appointments')`
- Placeholders, aria-labels, alt text — all translated
- Import convention:
  ```tsx
  import { useTranslation } from 'react-i18next'

  function MyScreen() {
    const { t } = useTranslation('featureName')
    return <h1>{t('title')}</h1>
  }
  ```

## Form Inputs

- Every `<Input>` must have an associated `<Label>`
- Label's `htmlFor` must match Input's `id`
- Example:
  ```tsx
  <Label htmlFor="patient-name">{t('form.patientName')}</Label>
  <Input id="patient-name" placeholder={t('form.patientNamePlaceholder')} />
  ```

## List & Table States

Every list or table must handle three states:

1. **Loading** — skeleton or spinner
2. **Empty** — message explaining no data exists, with optional CTA
3. **Populated** — normal data rendering

Example pattern:
```tsx
if (isLoading) return <Skeleton />
if (items.length === 0) return <EmptyState message={t('list.empty')} />
return <ul>{items.map(item => ...)}</ul>
```

## Status Badges

Consistent colors across all screens:

| Status      | Color   | Tailwind classes                  |
|-------------|---------|-----------------------------------|
| PENDING     | Amber   | `bg-amber-100 text-amber-800`    |
| CONFIRMED   | Emerald | `bg-emerald-100 text-emerald-800`|
| COMPLETED   | Sky     | `bg-sky-100 text-sky-800`        |
| CANCELLED   | Red     | `bg-red-100 text-red-800`        |

- Always include a text label alongside the color — never color-only

## Async Buttons

- Buttons must have `disabled` state during async operations
- Show visible loading feedback (spinner icon or loading text)
- Example:
  ```tsx
  <Button disabled={isSubmitting}>
    {isSubmitting ? t('common.saving') : t('form.submit')}
  </Button>
  ```

## Accessibility

- Images require `alt` attributes with translated text
- Decorative images: `alt="" aria-hidden="true"`
- Color-coded visuals always include a text label — never rely on color alone
```

**Step 2: Verify the file**

Run: `cat docs/ui-rules.md | head -5`
Expected: The file header and first section title.

**Step 3: Commit**

```bash
git add docs/ui-rules.md
git commit -m "docs: add UI rules reference for CLAUDE.md"
```

---

### Task 2: Create docs/ui-patterns.md

**Files:**
- Create: `docs/ui-patterns.md`

**Step 1: Create the file**

Write `docs/ui-patterns.md` with the following exact content:

```markdown
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

- Use `useState` with hardcoded initial data
- Simulate loading with `useEffect` + `setTimeout` (1-2 second delay)
- Include at least one example of empty state in comments or toggle
- Example:
  ```tsx
  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => {
      setItems(MOCK_DATA)
      setIsLoading(false)
    }, 1500)
  }, [])
  ```
```

**Step 2: Verify the file**

Run: `cat docs/ui-patterns.md | head -5`
Expected: The file header and first section title.

**Step 3: Commit**

```bash
git add docs/ui-patterns.md
git commit -m "docs: add UI patterns reference for CLAUDE.md"
```

---

### Task 3: Create CLAUDE.md

**Files:**
- Create: `CLAUDE.md` (project root)

**Step 1: Create the file**

Write `CLAUDE.md` at the project root with the following exact content:

```markdown
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
```

**Step 2: Verify the file**

Run: `cat CLAUDE.md | head -5`
Expected: The file header and Scope section title.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with UI-only generation rules"
```

---

### Task 4: Final verification

**Step 1: Verify all three files exist**

Run: `ls -la CLAUDE.md docs/ui-rules.md docs/ui-patterns.md`
Expected: All three files listed with non-zero sizes.

**Step 2: Verify git is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean`

**Step 3: Review commit log**

Run: `git log --oneline -4`
Expected: Three new commits for the three files, plus the design doc commit.

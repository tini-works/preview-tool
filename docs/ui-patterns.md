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

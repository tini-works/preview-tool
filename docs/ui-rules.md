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

# MDX to TSX Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the MDX content system with TSX screen components that use exported scenario objects for state metadata.

**Architecture:** Each screen is a folder (`index.tsx` + `scenarios.ts`) under `src/screens/`, auto-discovered via `import.meta.glob`. A new `ScreenRenderer` lazy-loads components and passes scenario data as props. The flow system stays unchanged except routes become flat kebab-case. Screen-specific primitives (RadioCard, ListItem, etc.) are extracted from `mdx-components.tsx` into a shared `src/components/screen.tsx`.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS v4, Zustand, pnpm

**Design doc:** `docs/plans/2026-02-26-mdx-to-tsx-migration-design.md`

---

## Task 1: Extract screen primitives

Extract all component definitions from `src/content/mdx-components.tsx` into a new file. Remove the `withFlowTarget` HOC and `mdxComponents` map. Add `...rest` prop spreading to all components so `data-flow-target` attributes pass through to the DOM.

**Files:**
- Create: `src/components/screen.tsx`

**Step 1: Create the file**

```tsx
// src/components/screen.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ─── Button ─── */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        {
          'bg-neutral-900 text-white hover:bg-neutral-800': variant === 'primary',
          'bg-neutral-100 text-neutral-900 hover:bg-neutral-200': variant === 'secondary',
          'border border-neutral-300 bg-transparent hover:bg-neutral-50': variant === 'outline',
          'bg-transparent hover:bg-neutral-100': variant === 'ghost',
        },
        {
          'h-8 px-3 text-sm': size === 'sm',
          'h-10 px-4 text-sm': size === 'md',
          'h-12 px-6 text-base': size === 'lg',
        },
        className
      )}
    >
      {children}
    </button>
  )
}

/* ─── Card ─── */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Card({ children, className, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-lg border border-neutral-200 bg-white p-6 shadow-sm',
        className
      )}
    >
      {children}
    </div>
  )
}

/* ─── Input ─── */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({
  placeholder,
  type = 'text',
  label,
  className,
  ...rest
}: InputProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-neutral-700">{label}</label>
      )}
      <input
        {...rest}
        type={type}
        placeholder={placeholder}
        className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
      />
    </div>
  )
}

/* ─── Badge ─── */

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error'
}

export function Badge({
  children,
  variant = 'default',
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-neutral-100 text-neutral-800': variant === 'default',
          'bg-green-100 text-green-800': variant === 'success',
          'bg-yellow-100 text-yellow-800': variant === 'warning',
          'bg-red-100 text-red-800': variant === 'error',
        },
        className
      )}
    >
      {children}
    </span>
  )
}

/* ─── Note ─── */

interface NoteProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  type?: 'info' | 'warning' | 'error' | 'success'
}

export function Note({
  children,
  type = 'info',
  className,
  ...rest
}: NoteProps) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-md border-l-4 p-4 text-sm',
        {
          'border-blue-500 bg-blue-50 text-blue-800': type === 'info',
          'border-yellow-500 bg-yellow-50 text-yellow-800': type === 'warning',
          'border-red-500 bg-red-50 text-red-800': type === 'error',
          'border-green-500 bg-green-50 text-green-800': type === 'success',
        },
        className
      )}
    >
      {children}
    </div>
  )
}

/* ─── ScreenHeader ─── */

interface ScreenHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  subtitle?: string
}

export function ScreenHeader({ title, subtitle, className, ...rest }: ScreenHeaderProps) {
  return (
    <div
      {...rest}
      className={cn(
        'sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3',
        className
      )}
    >
      <div className="flex size-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </div>
      <div className="flex flex-col">
        <span className="text-base font-semibold text-neutral-900">{title}</span>
        {subtitle && (
          <span className="text-xs text-neutral-500">{subtitle}</span>
        )}
      </div>
    </div>
  )
}

/* ─── ListItem ─── */

interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: string
  label: string
  description?: string
  required?: boolean
  selected?: boolean
  trailing?: ReactNode
}

export function ListItem({
  icon,
  label,
  description,
  required,
  selected,
  trailing,
  className,
  ...rest
}: ListItemProps) {
  return (
    <div
      {...rest}
      className={cn(
        'flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0',
        selected && 'bg-neutral-50',
        className
      )}
    >
      {icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm">
          {icon}
        </span>
      )}
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-neutral-900">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </span>
        {description && (
          <span className="text-xs text-neutral-500">{description}</span>
        )}
      </div>
      {trailing ?? (
        <svg className="size-4 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      )}
    </div>
  )
}

/* ─── RadioCard ─── */

interface RadioCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  selected?: boolean
}

export function RadioCard({ children, selected, className, ...rest }: RadioCardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'flex items-center gap-3 rounded-lg border-2 px-4 py-3',
        selected
          ? 'border-teal-500 bg-teal-50'
          : 'border-neutral-200 bg-white',
        className
      )}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-teal-500' : 'border-neutral-400'
        )}
      >
        {selected && <span className="size-2.5 rounded-full bg-teal-500" />}
      </span>
      <span className="text-sm font-medium text-neutral-900">{children}</span>
    </div>
  )
}

/* ─── Avatar ─── */

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  initials: string
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}

export function Avatar({
  initials,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: AvatarProps) {
  return (
    <div
      {...rest}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        {
          'bg-teal-100 text-teal-700': variant === 'primary',
          'bg-orange-100 text-orange-600': variant === 'secondary',
        },
        {
          'size-8 text-xs': size === 'sm',
          'size-10 text-sm': size === 'md',
          'size-12 text-base': size === 'lg',
        },
        className
      )}
    >
      {initials}
    </div>
  )
}

/* ─── Divider ─── */

interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string
}

export function Divider({ label, className, ...rest }: DividerProps) {
  if (label) {
    return (
      <div {...rest} className={cn('flex items-center gap-3 py-2', className)}>
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-xs text-neutral-400">{label}</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>
    )
  }
  return <div {...rest} className={cn('h-px bg-neutral-200', className)} />
}

/* ─── Stack ─── */

interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  gap?: 'sm' | 'md' | 'lg'
}

export function Stack({ children, gap = 'md', className, ...rest }: StackProps) {
  return (
    <div
      {...rest}
      className={cn(
        'flex flex-col',
        {
          'gap-2': gap === 'sm',
          'gap-4': gap === 'md',
          'gap-6': gap === 'lg',
        },
        className
      )}
    >
      {children}
    </div>
  )
}

/* ─── Textarea ─── */

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({
  label,
  placeholder,
  value,
  maxLength,
  className,
  ...rest
}: TextareaProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-neutral-700">{label}</label>
      )}
      <textarea
        {...rest}
        placeholder={placeholder}
        defaultValue={value}
        maxLength={maxLength}
        rows={3}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
      />
      {maxLength && (
        <span className="self-end text-xs text-neutral-400">
          {typeof value === 'string' ? value.length : 0}/{maxLength}
        </span>
      )}
    </div>
  )
}

/* ─── Footer ─── */

interface FooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Footer({ children, className, ...rest }: FooterProps) {
  return (
    <div
      {...rest}
      className={cn(
        'sticky bottom-0 border-t border-neutral-200 bg-white px-4 py-3',
        className
      )}
    >
      {children}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/screen.tsx
git commit -m "feat: extract screen primitives from mdx-components"
```

---

## Task 2: Create screen infrastructure

Create the types, discovery hook, and renderer that replace the MDX content system.

**Files:**
- Create: `src/screens/types.ts`
- Create: `src/screens/useScreenModules.ts`
- Create: `src/screens/ScreenRenderer.tsx`

**Step 1: Create types**

```typescript
// src/screens/types.ts
import type { ComponentType } from 'react'

export interface Scenario<T = unknown> {
  label: string
  data: T
}

export interface ScreenModule {
  default: ComponentType<{ data: unknown }>
}

export interface ScenarioModule {
  scenarios: Record<string, Scenario>
}

export interface ScreenEntry {
  route: string
  module: () => Promise<ScreenModule>
  scenarios: Record<string, Scenario>
}
```

**Step 2: Create useScreenModules**

```typescript
// src/screens/useScreenModules.ts
import { useMemo } from 'react'
import type { ScreenEntry, ScreenModule, ScenarioModule } from '@/screens/types'

const screenModules = import.meta.glob<ScreenModule>(
  '/src/screens/*/index.tsx'
)

const scenarioModules = import.meta.glob<ScenarioModule>(
  '/src/screens/*/scenarios.ts',
  { eager: true }
)

/**
 * Convert PascalCase folder name to kebab-case route.
 * e.g. "/src/screens/BookingType/index.tsx" → "/booking-type"
 */
function filePathToRoute(filePath: string): string {
  const match = filePath.match(/\/src\/screens\/([^/]+)\/index\.tsx$/)
  if (!match) return filePath

  const folderName = match[1]
  const kebab = folderName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()

  return `/${kebab}`
}

/**
 * Derive the scenarios file path from a screen file path.
 * "/src/screens/BookingType/index.tsx" → "/src/screens/BookingType/scenarios.ts"
 */
function toScenariosPath(screenPath: string): string {
  return screenPath.replace(/\/index\.tsx$/, '/scenarios.ts')
}

export function useScreenModules(): ScreenEntry[] {
  return useMemo(() => {
    return Object.entries(screenModules).map(([filePath, loader]) => {
      const scenariosPath = toScenariosPath(filePath)
      const scenarioMod = scenarioModules[scenariosPath]

      return {
        route: filePathToRoute(filePath),
        module: loader,
        scenarios: scenarioMod?.scenarios ?? {},
      }
    })
  }, [])
}

export function useScreenRoutes(): string[] {
  const modules = useScreenModules()
  return useMemo(() => modules.map((m) => m.route), [modules])
}
```

**Step 3: Create ScreenRenderer**

```tsx
// src/screens/ScreenRenderer.tsx
import { useEffect, useState, type ComponentType } from 'react'
import { FlowProvider } from '@/flow/FlowProvider'
import { useScreenModules } from '@/screens/useScreenModules'
import type { ScreenModule } from '@/screens/types'

interface ScreenRendererProps {
  route: string | null
  activeState: string | null
}

interface LoadedScreen {
  route: string
  Component: ComponentType<{ data: unknown }>
}

export function ScreenRenderer({ route, activeState }: ScreenRendererProps) {
  const modules = useScreenModules()
  const [loaded, setLoaded] = useState<LoadedScreen | null>(null)

  useEffect(() => {
    if (!route) return

    const entry = modules.find((m) => m.route === route)
    if (!entry) return

    let cancelled = false
    entry.module().then((mod: ScreenModule) => {
      if (!cancelled) {
        setLoaded({ route, Component: mod.default })
      }
    })

    return () => {
      cancelled = true
    }
  }, [route, modules])

  if (!route) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-neutral-400">
        <p>Select a screen to preview</p>
      </div>
    )
  }

  const entry = modules.find((m) => m.route === route)
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-neutral-400">
        <p>Screen not found: {route}</p>
      </div>
    )
  }

  if (!loaded || loaded.route !== route) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-neutral-400">
        Loading...
      </div>
    )
  }

  const { Component } = loaded
  const scenarios = entry.scenarios
  const scenarioKeys = Object.keys(scenarios)

  // Resolve scenario data: use activeState, fall back to first scenario
  const activeScenario = activeState && scenarios[activeState]
    ? scenarios[activeState]
    : scenarioKeys.length > 0
      ? scenarios[scenarioKeys[0]]
      : null

  const data = activeScenario?.data ?? {}

  return (
    <FlowProvider>
      <Component data={data} />
    </FlowProvider>
  )
}
```

**Step 4: Commit**

```bash
git add src/screens/types.ts src/screens/useScreenModules.ts src/screens/ScreenRenderer.tsx
git commit -m "feat: add screen infrastructure (types, discovery, renderer)"
```

---

## Task 3: Update HelloWorld to new pattern

Convert from internal `useScenarios` hook to the standard `scenarios` export + data props pattern.

**Files:**
- Modify: `src/screens/HelloWorld/scenarios.ts`
- Modify: `src/screens/HelloWorld/index.tsx`

**Step 1: Update scenarios.ts**

Replace the entire file. Export as `scenarios` (standard name):

```typescript
// src/screens/HelloWorld/scenarios.ts
export type Item = {
  id: string
  title: string
  subtitle: string
}

export const MOCK_ITEMS: Item[] = [
  { id: '1', title: 'Design system', subtitle: 'Set up tokens and theme' },
  { id: '2', title: 'Authentication', subtitle: 'Login and signup flows' },
  { id: '3', title: 'Dashboard', subtitle: 'Main overview screen' },
]

export type HelloWorldData = {
  isLoading: boolean
  items: Item[]
  lang: string
}

export const scenarios = {
  loading: {
    label: 'Loading',
    data: { isLoading: true, items: [] as Item[], lang: 'en' } satisfies HelloWorldData,
  },
  empty: {
    label: 'Empty',
    data: { isLoading: false, items: [] as Item[], lang: 'en' } satisfies HelloWorldData,
  },
  populated: {
    label: 'Populated',
    data: { isLoading: false, items: MOCK_ITEMS, lang: 'en' } satisfies HelloWorldData,
  },
  singleItem: {
    label: 'Single Item',
    data: { isLoading: false, items: [MOCK_ITEMS[0]], lang: 'en' } satisfies HelloWorldData,
  },
  german: {
    label: 'German',
    data: { isLoading: false, items: MOCK_ITEMS, lang: 'de' } satisfies HelloWorldData,
  },
}
```

**Step 2: Update index.tsx**

Replace the entire file. Receive data via props, remove ScenarioSwitcher:

```tsx
// src/screens/HelloWorld/index.tsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { HelloWorldData } from './scenarios'

export default function HelloWorldScreen({ data }: { data: HelloWorldData }) {
  const { isLoading, items, lang } = data
  const { t, i18n } = useTranslation('helloWorld')

  useEffect(() => {
    i18n.changeLanguage(lang)
  }, [lang, i18n])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-4">
      <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>{t('getStarted')}</Button>
        </CardContent>
      </Card>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('itemsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>{t('loadingMessage')}</span>
            </div>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">{t('emptyMessage')}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-md border px-3 py-2">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/HelloWorld/scenarios.ts src/screens/HelloWorld/index.tsx
git commit -m "refactor: update HelloWorld to new screen pattern (data props)"
```

---

## Task 4: Convert Hello screen

Source: `content/hello.mdx` (no states, simple static content)

**Files:**
- Create: `src/screens/Hello/scenarios.ts`
- Create: `src/screens/Hello/index.tsx`

**Step 1: Create scenarios.ts**

```typescript
// src/screens/Hello/scenarios.ts
export type HelloData = Record<string, never>

export const scenarios = {
  default: {
    label: 'Default view',
    data: {} as HelloData,
  },
}
```

**Step 2: Create index.tsx**

```tsx
// src/screens/Hello/index.tsx
import { Card, Button, Note } from '@/components/screen'

export default function HelloScreen() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Hello Preview Tool</h1>
      <p className="mb-4">This is a sample screen rendered inside a device frame.</p>

      <Card>
        <p>This card is a built-in screen component.</p>
        <Button className="mt-3">Click me</Button>
      </Card>

      <Note type="info" className="mt-4">
        Edit this file and watch it hot-reload inside the device frame.
      </Note>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/Hello/
git commit -m "feat: convert hello.mdx to TSX screen"
```

---

## Task 5: Convert LoginForm screen

Source: `content/login-form.mdx` (4 states: idle, filling, error, success)

**Files:**
- Create: `src/screens/LoginForm/scenarios.ts`
- Create: `src/screens/LoginForm/index.tsx`

**Step 1: Create scenarios.ts**

```typescript
// src/screens/LoginForm/scenarios.ts
export type LoginFormData = {
  state: 'idle' | 'filling' | 'error' | 'success'
}

export const scenarios = {
  idle: {
    label: 'Empty login form',
    data: { state: 'idle' } satisfies LoginFormData,
  },
  filling: {
    label: 'User is typing credentials',
    data: { state: 'filling' } satisfies LoginFormData,
  },
  error: {
    label: 'Login failed with error message',
    data: { state: 'error' } satisfies LoginFormData,
  },
  success: {
    label: 'Login succeeded',
    data: { state: 'success' } satisfies LoginFormData,
  },
}
```

**Step 2: Create index.tsx**

```tsx
// src/screens/LoginForm/index.tsx
import { Card, Input, Button, Note } from '@/components/screen'
import type { LoginFormData } from './scenarios'

export default function LoginFormScreen({ data }: { data: LoginFormData }) {
  if (data.state === 'success') {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-2xl font-bold">Login</h1>
        <Card>
          <Note type="success">Welcome back! Redirecting...</Note>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Login</h1>
      <Card>
        {data.state === 'error' && (
          <Note type="error" className="mb-4">
            Invalid email or password. Please try again.
          </Note>
        )}
        <Input label="Email" placeholder="you@example.com" />
        <Input label="Password" type="password" placeholder="Enter password" className="mt-3" />
        <Button className="mt-4">Sign In</Button>
        {data.state === 'filling' && (
          <p className="mt-2 text-sm text-neutral-500">Typing...</p>
        )}
      </Card>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/LoginForm/
git commit -m "feat: convert login-form.mdx to TSX screen"
```

---

## Task 6: Convert BookingType screen

Source: `content/booking/type.mdx` (3 states with different UI structures, flow-targeted)

This is the reference pattern for all booking screens. Note how:
- `data-flow-target` attributes are set directly on interactive components
- Different states show different UI sections via conditional rendering
- Imports are from `@/components/screen`

**Files:**
- Create: `src/screens/BookingType/scenarios.ts`
- Create: `src/screens/BookingType/index.tsx`

**Step 1: Create scenarios.ts**

```typescript
// src/screens/BookingType/scenarios.ts
export type BookingTypeData = {
  selectedType: 'acute' | 'prevention' | 'follow-up'
}

export const scenarios = {
  acute: {
    label: 'Acute appointment selected',
    data: { selectedType: 'acute' } satisfies BookingTypeData,
  },
  prevention: {
    label: 'Prevention appointment selected',
    data: { selectedType: 'prevention' } satisfies BookingTypeData,
  },
  'follow-up': {
    label: 'Follow-up appointment selected',
    data: { selectedType: 'follow-up' } satisfies BookingTypeData,
  },
}
```

**Step 2: Create index.tsx**

```tsx
// src/screens/BookingType/index.tsx
import {
  ScreenHeader,
  Stack,
  RadioCard,
  Card,
  ListItem,
  Button,
  Footer,
} from '@/components/screen'
import type { BookingTypeData } from './scenarios'

export default function BookingTypeScreen({ data }: { data: BookingTypeData }) {
  const { selectedType } = data
  const isSaveEnabled = selectedType === 'acute'

  return (
    <>
      <ScreenHeader
        title="Booking type"
        data-flow-target="ScreenHeader:Booking type"
      />

      <Stack gap="md" className="p-4">
        <p className="text-sm font-medium text-neutral-700">Select booking type</p>

        <Stack gap="sm">
          <RadioCard
            data-flow-target="RadioCard:Acute"
            selected={selectedType === 'acute'}
          >
            Acute
          </RadioCard>
          <RadioCard
            data-flow-target="RadioCard:Prevention"
            selected={selectedType === 'prevention'}
          >
            Prevention
          </RadioCard>
          <RadioCard
            data-flow-target="RadioCard:Follow-up"
            selected={selectedType === 'follow-up'}
          >
            Follow-up
          </RadioCard>
        </Stack>

        {selectedType === 'prevention' && (
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="🩺"
              label="Specialty & Doctor"
              description="Select..."
              required
            />
            <ListItem icon="📄" label="Referral" description="Optional" />
          </Card>
        )}

        {selectedType === 'follow-up' && (
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="👨‍⚕️"
              label="Doctor"
              description="Select..."
              required
            />
          </Card>
        )}

        <Footer>
          <Button
            data-flow-target="Button:Save"
            variant={isSaveEnabled ? 'primary' : 'secondary'}
            size="lg"
            className={isSaveEnabled ? 'w-full' : 'w-full opacity-50'}
          >
            Save
          </Button>
        </Footer>
      </Stack>
    </>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/BookingType/
git commit -m "feat: convert booking/type.mdx to TSX screen"
```

---

## Task 7: Convert BookingDoctor screen

Source: `content/booking/doctor.mdx` (3 states: browsing, selected, specialty-drawer)

**Files:**
- Create: `src/screens/BookingDoctor/scenarios.ts`
- Create: `src/screens/BookingDoctor/index.tsx`

**Step 1: Create scenarios.ts**

```typescript
// src/screens/BookingDoctor/scenarios.ts
export type BookingDoctorData = {
  view: 'browsing' | 'selected' | 'specialty-drawer'
}

export const scenarios = {
  browsing: {
    label: 'Viewing all doctors',
    data: { view: 'browsing' } satisfies BookingDoctorData,
  },
  selected: {
    label: 'A doctor is selected',
    data: { view: 'selected' } satisfies BookingDoctorData,
  },
  'specialty-drawer': {
    label: 'Specialty selection drawer open',
    data: { view: 'specialty-drawer' } satisfies BookingDoctorData,
  },
}
```

**Step 2: Create index.tsx**

Convert the MDX Variant blocks to conditional rendering. Reference `content/booking/doctor.mdx` for the full UI structure. Key points:
- `ScreenHeader` has `data-flow-target="ScreenHeader:Specialty & Doctor"`
- `Avatar` components have `data-flow-target="Avatar:AS"`, `"Avatar:TW"` etc.
- `ListItem` for specialty has `data-flow-target="ListItem:Specialty"`
- The `specialty-drawer` state renders an overlay with a bottom sheet

```tsx
// src/screens/BookingDoctor/index.tsx
import {
  ScreenHeader,
  Stack,
  Card,
  Avatar,
  ListItem,
  Input,
  Note,
} from '@/components/screen'
import type { BookingDoctorData } from './scenarios'

export default function BookingDoctorScreen({ data }: { data: BookingDoctorData }) {
  const { view } = data

  return (
    <>
      <ScreenHeader
        title="Specialty & Doctor"
        data-flow-target="ScreenHeader:Specialty & Doctor"
      />

      {view === 'browsing' && (
        <Stack gap="md" className="p-4">
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="🩺"
              label="Specialty"
              description="General Practice"
              selected
              data-flow-target="ListItem:Specialty"
            />
          </Card>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">FAVORITED</p>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
                <Avatar initials="AS" data-flow-target="Avatar:AS" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-neutral-900">Dr. Anna Schmidt</span>
                  <span className="text-xs text-neutral-500">General Practice</span>
                </div>
                <span className="text-red-400">♥</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar initials="TW" data-flow-target="Avatar:TW" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-neutral-900">Dr. Thomas Weber</span>
                  <span className="text-xs text-neutral-500">Cardiology</span>
                </div>
                <span className="text-red-400">♥</span>
              </div>
            </Card>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">ALL DOCTORS</p>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
                <div className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-neutral-300">
                  <span className="text-sm text-neutral-400">Any</span>
                </div>
                <span className="text-sm font-medium text-neutral-900">Any available doctor</span>
              </div>
              <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
                <Avatar initials="LB" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-neutral-900">Dr. Lisa Bauer</span>
                  <span className="text-xs text-neutral-500">Dermatology</span>
                </div>
                <span className="text-neutral-300">♡</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar initials="EK" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-neutral-900">Dr. Emily Klein</span>
                  <span className="text-xs text-neutral-500">General Practice</span>
                </div>
                <span className="text-neutral-300">♡</span>
              </div>
            </Card>
          </div>
        </Stack>
      )}

      {view === 'selected' && (
        <Stack gap="md" className="p-4">
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="🩺"
              label="Specialty"
              description="General Practice"
              selected
              data-flow-target="ListItem:Specialty"
            />
          </Card>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">FAVORITED</p>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center gap-3 rounded-lg border-2 border-teal-500 bg-teal-50 px-4 py-3">
                <Avatar initials="AS" data-flow-target="Avatar:AS" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-neutral-900">Dr. Anna Schmidt</span>
                  <span className="text-xs text-neutral-500">General Practice</span>
                </div>
                <span className="text-red-400">♥</span>
              </div>
            </Card>
          </div>

          <Note type="success">Dr. Anna Schmidt selected for your appointment.</Note>
        </Stack>
      )}

      {view === 'specialty-drawer' && (
        <>
          <Stack gap="md" className="p-4">
            <Card className="overflow-hidden p-0">
              <ListItem icon="🩺" label="Specialty" description="Tap to change..." />
            </Card>
          </Stack>

          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300" />
            <Input placeholder="Search specialty..." className="mb-3" />
            <Stack gap="sm">
              <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-neutral-50">
                <span className="text-sm text-neutral-900">General Practice</span>
                <span className="text-teal-500">✓</span>
              </div>
              <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-neutral-50">
                <span className="text-sm text-neutral-900">Cardiology</span>
              </div>
              <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-neutral-50">
                <span className="text-sm text-neutral-900">Dermatology</span>
              </div>
              <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-neutral-50">
                <span className="text-sm text-neutral-900">Orthopedics</span>
              </div>
            </Stack>
          </div>
        </>
      )}
    </>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/BookingDoctor/
git commit -m "feat: convert booking/doctor.mdx to TSX screen"
```

---

## Task 8: Convert BookingPatient screen

Source: `content/booking/patient.mdx` (2 states: self, family)

**Files:**
- Create: `src/screens/BookingPatient/scenarios.ts`
- Create: `src/screens/BookingPatient/index.tsx`

**Step 1: Create scenarios.ts**

```typescript
// src/screens/BookingPatient/scenarios.ts
export type BookingPatientData = {
  selectedPatient: 'self' | 'family'
}

export const scenarios = {
  self: {
    label: 'Booking for self',
    data: { selectedPatient: 'self' } satisfies BookingPatientData,
  },
  family: {
    label: 'Booking for family member',
    data: { selectedPatient: 'family' } satisfies BookingPatientData,
  },
}
```

**Step 2: Create index.tsx**

Convert the MDX. Both states share the same patient picker row at top, but differ in which patient is highlighted and which insurance card is shown. Reference `content/booking/patient.mdx` for exact markup.

```tsx
// src/screens/BookingPatient/index.tsx
import {
  ScreenHeader,
  Stack,
  Card,
  Avatar,
  Badge,
} from '@/components/screen'
import type { BookingPatientData } from './scenarios'

export default function BookingPatientScreen({ data }: { data: BookingPatientData }) {
  const { selectedPatient } = data
  const isSelf = selectedPatient === 'self'

  return (
    <>
      <ScreenHeader
        title="Book appointment for"
        data-flow-target="ScreenHeader:Book appointment for"
      />

      <Stack gap="md" className="p-4">
        {/* Patient picker row */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          <div className="flex flex-col items-center gap-1.5">
            <div className={`flex size-14 items-center justify-center rounded-full border-2 ${isSelf ? 'border-teal-500 bg-teal-50' : 'border-neutral-200'}`}>
              <Avatar initials="SM" data-flow-target="Avatar:SM" />
            </div>
            <span className={`text-xs ${isSelf ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}>Me</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className={`flex size-14 items-center justify-center rounded-full border-2 ${!isSelf ? 'border-teal-500 bg-teal-50' : 'border-neutral-200'}`}>
              <Avatar initials="MM" variant="secondary" data-flow-target="Avatar:MM" />
            </div>
            <span className={`text-xs ${!isSelf ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}>Max</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex size-14 items-center justify-center rounded-full border-2 border-neutral-200">
              <Avatar initials="LM" variant="secondary" />
            </div>
            <span className="text-xs text-neutral-500">Lena</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-neutral-300">
              <span className="text-lg text-neutral-400">+</span>
            </div>
            <span className="text-xs text-neutral-400">Add</span>
          </div>
        </div>

        {/* Insurance cards */}
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700">Insurance card</p>
          <Stack gap="sm">
            {isSelf ? (
              <>
                <Card className="border-2 border-teal-500 bg-teal-50">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 items-center justify-center rounded-full border-2 border-teal-500">
                      <span className="size-2.5 rounded-full bg-teal-500" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <Badge>GKV</Badge>
                      <p className="text-sm font-medium text-neutral-900">Techniker Krankenkasse</p>
                      <p className="text-xs text-neutral-500">A123456789</p>
                    </div>
                  </div>
                </Card>
                <Card>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 items-center justify-center rounded-full border-2 border-neutral-400" />
                    <div className="flex flex-col gap-1">
                      <Badge>PKV</Badge>
                      <p className="text-sm font-medium text-neutral-900">Debeka</p>
                      <p className="text-xs text-neutral-500">P987654321</p>
                    </div>
                  </div>
                </Card>
              </>
            ) : (
              <Card className="border-2 border-teal-500 bg-teal-50">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 items-center justify-center rounded-full border-2 border-teal-500">
                    <span className="size-2.5 rounded-full bg-teal-500" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <Badge>GKV</Badge>
                    <p className="text-sm font-medium text-neutral-900">AOK Bayern</p>
                    <p className="text-xs text-neutral-500">M567890123</p>
                  </div>
                </div>
              </Card>
            )}
          </Stack>
        </div>
      </Stack>
    </>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/BookingPatient/
git commit -m "feat: convert booking/patient.mdx to TSX screen"
```

---

## Task 9: Convert BookingLocation screen

Source: `content/booking/location.mdx` (3 states: initial, search-results, selected)

**Files:**
- Create: `src/screens/BookingLocation/scenarios.ts`
- Create: `src/screens/BookingLocation/index.tsx`

**Step 1: Create scenarios.ts**

```typescript
// src/screens/BookingLocation/scenarios.ts
export type BookingLocationData = {
  view: 'initial' | 'search-results' | 'selected'
}

export const scenarios = {
  initial: {
    label: 'No location selected',
    data: { view: 'initial' } satisfies BookingLocationData,
  },
  'search-results': {
    label: 'Showing address search results',
    data: { view: 'search-results' } satisfies BookingLocationData,
  },
  selected: {
    label: 'Location selected',
    data: { view: 'selected' } satisfies BookingLocationData,
  },
}
```

**Step 2: Create index.tsx**

```tsx
// src/screens/BookingLocation/index.tsx
import {
  ScreenHeader,
  Stack,
  Button,
  Divider,
  Input,
  Card,
  Note,
} from '@/components/screen'
import type { BookingLocationData } from './scenarios'

export default function BookingLocationScreen({ data }: { data: BookingLocationData }) {
  const { view } = data

  return (
    <>
      <ScreenHeader
        title="Choose location"
        data-flow-target="ScreenHeader:Choose location"
      />

      {view === 'initial' && (
        <Stack gap="md" className="p-4">
          <Button
            size="lg"
            className="flex w-full items-center justify-center gap-2"
            data-flow-target="Button:Use current location"
          >
            <span>📍</span> Use current location
          </Button>

          <Divider label="or enter an address" />
          <Input placeholder="Search address..." />

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">RECENT LOCATIONS</p>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
                <span className="text-neutral-400">📍</span>
                <span className="text-sm text-neutral-900">Friedrichstr. 123, 10117 Berlin</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-neutral-400">📍</span>
                <span className="text-sm text-neutral-900">Kurfürstendamm 45, 10719 Berlin</span>
              </div>
            </Card>
          </div>
        </Stack>
      )}

      {view === 'search-results' && (
        <Stack gap="md" className="p-4">
          <Button
            size="lg"
            className="flex w-full items-center justify-center gap-2"
            data-flow-target="Button:Use current location"
          >
            <span>📍</span> Use current location
          </Button>

          <Divider label="or enter an address" />
          <Input placeholder="Search address..." />

          <Card className="overflow-hidden p-0">
            {['Friedrichstr. 123, 10117 Berlin', 'Schönhauser Allee 78, 10439 Berlin', 'Torstr. 220, 10115 Berlin', 'Kantstr. 58, 10627 Berlin'].map((addr) => (
              <div key={addr} className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0 hover:bg-neutral-50">
                <span className="text-neutral-400">📍</span>
                <span className="text-sm text-neutral-900">{addr}</span>
              </div>
            ))}
          </Card>
        </Stack>
      )}

      {view === 'selected' && (
        <Stack gap="md" className="p-4">
          <Note type="success">Location selected</Note>

          <Card className="border-2 border-teal-500 bg-teal-50">
            <div className="flex items-center gap-3">
              <span className="text-teal-500">📍</span>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-neutral-900">Friedrichstr. 123</span>
                <span className="text-xs text-neutral-500">10117 Berlin</span>
              </div>
            </div>
          </Card>

          <Button variant="outline" size="lg" className="w-full">Change location</Button>
        </Stack>
      )}
    </>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/BookingLocation/
git commit -m "feat: convert booking/location.mdx to TSX screen"
```

---

## Task 10: Convert BookingTimeSlots screen

Source: `content/booking/time-slots.mdx` (3 states: all-selected, partial, minimal)

**Files:**
- Create: `src/screens/BookingTimeSlots/scenarios.ts`
- Create: `src/screens/BookingTimeSlots/index.tsx`

**Step 1: Create scenarios.ts**

```typescript
// src/screens/BookingTimeSlots/scenarios.ts

type SlotRow = [boolean, boolean, boolean, boolean, boolean]

export type BookingTimeSlotsData = {
  slots: [SlotRow, SlotRow, SlotRow]
  showWarning: boolean
}

const ALL: SlotRow = [true, true, true, true, true]

export const scenarios = {
  'all-selected': {
    label: 'All 15 time slots selected',
    data: {
      slots: [ALL, ALL, ALL],
      showWarning: false,
    } satisfies BookingTimeSlotsData,
  },
  partial: {
    label: 'Some slots deselected',
    data: {
      slots: [
        [true, true, false, true, false],
        [false, true, false, true, false],
        [true, false, false, false, true],
      ],
      showWarning: false,
    } satisfies BookingTimeSlotsData,
  },
  minimal: {
    label: 'Only a few slots selected',
    data: {
      slots: [
        [false, false, true, false, false],
        [false, false, false, false, false],
        [false, true, false, false, false],
      ],
      showWarning: true,
    } satisfies BookingTimeSlotsData,
  },
}
```

**Step 2: Create index.tsx**

```tsx
// src/screens/BookingTimeSlots/index.tsx
import { ScreenHeader, Stack, Note } from '@/components/screen'
import type { BookingTimeSlotsData } from './scenarios'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const TIMES = ['08–12', '12–14', '14–18']

function SlotCell({ selected }: { selected: boolean }) {
  if (selected) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-md bg-teal-500">
        <span className="text-xs text-white">✓</span>
      </div>
    )
  }
  return <div className="aspect-square rounded-md bg-neutral-100" />
}

export default function BookingTimeSlotsScreen({ data }: { data: BookingTimeSlotsData }) {
  const { slots, showWarning } = data

  return (
    <>
      <ScreenHeader
        title="Time slots"
        data-flow-target="ScreenHeader:Time slots"
      />

      <Stack gap="md" className="p-4">
        <p className="text-sm text-neutral-500">Tap to toggle preferred times</p>

        <div className="grid grid-cols-6 gap-1.5">
          {/* Header row */}
          <div />
          {DAYS.map((day) => (
            <span key={day} className="text-center text-xs font-medium text-neutral-500">{day}</span>
          ))}

          {/* Slot rows */}
          {TIMES.map((time, rowIdx) => (
            <>
              <span key={`label-${time}`} className="flex items-center text-xs text-neutral-500">{time}</span>
              {slots[rowIdx].map((selected, colIdx) => (
                <SlotCell key={`${rowIdx}-${colIdx}`} selected={selected} />
              ))}
            </>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-teal-500" /> Selected</span>
          <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-neutral-100" /> Available</span>
        </div>

        {showWarning && (
          <Note type="warning">
            Only 2 slots selected. More slots increase your chances of finding a match.
          </Note>
        )}
      </Stack>
    </>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/BookingTimeSlots/
git commit -m "feat: convert booking/time-slots.mdx to TSX screen"
```

---

## Task 11: Convert BookingSearch screen

Source: `content/booking/search.mdx` (4 states: empty, partial, ready, loading)

**Files:**
- Create: `src/screens/BookingSearch/scenarios.ts`
- Create: `src/screens/BookingSearch/index.tsx`

**Step 1: Create scenarios.ts**

```typescript
// src/screens/BookingSearch/scenarios.ts

interface SearchField {
  icon: string
  label: string
  description: string
  filled: boolean
  required?: boolean
}

export type BookingSearchData = {
  fields: SearchField[]
  reason: string
  canSearch: boolean
  isSearching: boolean
}

const emptyFields: SearchField[] = [
  { icon: '📋', label: 'Booking type', description: 'Select type...', filled: false },
  { icon: '👤', label: 'Book appointment for', description: 'Select patient...', filled: false },
  { icon: '📅', label: 'Time slots', description: 'Select preferred times...', filled: false },
  { icon: '📍', label: 'Location', description: 'Select location...', filled: false, required: true },
]

const partialFields: SearchField[] = [
  { icon: '📋', label: 'Booking type', description: 'Acute', filled: true },
  { icon: '👤', label: 'Book appointment for', description: 'Sarah M.', filled: true },
  { icon: '📅', label: 'Time slots', description: '15 slots selected', filled: true },
  { icon: '📍', label: 'Location', description: 'Select location...', filled: false, required: true },
]

const readyFields: SearchField[] = [
  { icon: '📋', label: 'Booking type', description: 'Acute', filled: true },
  { icon: '👤', label: 'Book appointment for', description: 'Sarah M.', filled: true },
  { icon: '📅', label: 'Time slots', description: '15 slots selected', filled: true },
  { icon: '📍', label: 'Location', description: 'Friedrichstr. 123, Berlin', filled: true },
]

export const scenarios = {
  empty: {
    label: 'No selections made yet',
    data: { fields: emptyFields, reason: '', canSearch: false, isSearching: false } satisfies BookingSearchData,
  },
  partial: {
    label: 'Some fields filled, location missing',
    data: { fields: partialFields, reason: 'Persistent headache for 3 days', canSearch: false, isSearching: false } satisfies BookingSearchData,
  },
  ready: {
    label: 'All required fields filled',
    data: { fields: readyFields, reason: 'Persistent headache for 3 days', canSearch: true, isSearching: false } satisfies BookingSearchData,
  },
  loading: {
    label: 'Submitting search request',
    data: { fields: readyFields, reason: 'Persistent headache for 3 days', canSearch: false, isSearching: true } satisfies BookingSearchData,
  },
}
```

**Step 2: Create index.tsx**

```tsx
// src/screens/BookingSearch/index.tsx
import {
  ScreenHeader,
  Stack,
  Card,
  ListItem,
  Textarea,
  Footer,
  Button,
} from '@/components/screen'
import type { BookingSearchData } from './scenarios'

export default function BookingSearchScreen({ data }: { data: BookingSearchData }) {
  const { fields, reason, canSearch, isSearching } = data

  return (
    <>
      <ScreenHeader
        title="Search for Appointment"
        data-flow-target="ScreenHeader:Search for Appointment"
      />

      <Stack gap="md" className="p-4">
        <Card className="overflow-hidden p-0">
          {fields.map((field) => (
            <ListItem
              key={field.label}
              icon={field.icon}
              label={field.label}
              description={field.description}
              selected={field.filled}
              required={field.required}
              data-flow-target={`ListItem:${field.label}`}
            />
          ))}
        </Card>

        <Textarea
          label="Reason for visit"
          placeholder="Describe your symptoms or reason for visit..."
          value={reason}
          maxLength={200}
        />

        <Footer>
          <Button
            data-flow-target="Button:Search"
            variant={canSearch ? 'primary' : 'secondary'}
            size="lg"
            className={canSearch ? 'w-full' : 'w-full opacity-50'}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
        </Footer>
      </Stack>
    </>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/BookingSearch/
git commit -m "feat: convert booking/search.mdx to TSX screen"
```

---

## Task 12: Convert BookingConfirmation screen

Source: `content/booking/confirmation.mdx` (2 states: searching, found)

**Files:**
- Create: `src/screens/BookingConfirmation/scenarios.ts`
- Create: `src/screens/BookingConfirmation/index.tsx`

**Step 1: Create scenarios.ts**

```typescript
// src/screens/BookingConfirmation/scenarios.ts
export type BookingConfirmationData = {
  status: 'searching' | 'found'
}

export const scenarios = {
  searching: {
    label: 'Finding a doctor match',
    data: { status: 'searching' } satisfies BookingConfirmationData,
  },
  found: {
    label: 'Match found successfully',
    data: { status: 'found' } satisfies BookingConfirmationData,
  },
}
```

**Step 2: Create index.tsx**

```tsx
// src/screens/BookingConfirmation/index.tsx
import {
  ScreenHeader,
  Stack,
  Card,
  Avatar,
  Footer,
  Button,
} from '@/components/screen'
import type { BookingConfirmationData } from './scenarios'

export default function BookingConfirmationScreen({ data }: { data: BookingConfirmationData }) {
  const { status } = data

  return (
    <>
      <ScreenHeader title="Booking" />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        {status === 'searching' ? (
          <>
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-teal-100">
              <span className="text-4xl">🔍</span>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-neutral-900">Finding Your Match...</h2>
            <p className="max-w-[280px] text-center text-sm text-neutral-500">
              We're searching for the best doctor match based on your preferences and availability.
            </p>
          </>
        ) : (
          <>
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-green-100">
              <span className="text-4xl">✅</span>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-neutral-900">Match Found!</h2>
            <p className="max-w-[280px] text-center text-sm text-neutral-500">
              Dr. Anna Schmidt is available for your appointment.
            </p>
            <Card className="mt-6 w-full max-w-[280px]">
              <div className="flex items-center gap-3">
                <Avatar initials="AS" size="lg" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-neutral-900">Dr. Anna Schmidt</span>
                  <span className="text-xs text-neutral-500">General Practice</span>
                  <span className="text-xs text-teal-600">Wed, Mar 5 · 10:00 AM</span>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      <Footer>
        <Stack gap="sm">
          {status === 'searching' ? (
            <>
              <Button
                size="lg"
                className="w-full"
                data-flow-target="Button:Allow Notifications"
              >
                Allow Notifications
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                data-flow-target="Button:Back to Home"
              >
                Back to Home
              </Button>
            </>
          ) : (
            <>
              <Button
                size="lg"
                className="w-full"
                data-flow-target="Button:Confirm Appointment"
              >
                Confirm Appointment
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                data-flow-target="Button:Back to Home"
              >
                Back to Home
              </Button>
            </>
          )}
        </Stack>
      </Footer>
    </>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/BookingConfirmation/
git commit -m "feat: convert booking/confirmation.mdx to TSX screen"
```

---

## Task 13: Convert BookingAppointments screen

Source: `content/booking/appointments.mdx` (3 states: loaded, empty, loading)

**Files:**
- Create: `src/screens/BookingAppointments/scenarios.ts`
- Create: `src/screens/BookingAppointments/index.tsx`

**Step 1: Create scenarios.ts**

```typescript
// src/screens/BookingAppointments/scenarios.ts
export type BookingAppointmentsData = {
  view: 'loaded' | 'empty' | 'loading'
}

export const scenarios = {
  loaded: {
    label: 'Upcoming and past appointments displayed',
    data: { view: 'loaded' } satisfies BookingAppointmentsData,
  },
  empty: {
    label: 'No appointments booked yet',
    data: { view: 'empty' } satisfies BookingAppointmentsData,
  },
  loading: {
    label: 'Loading appointment data',
    data: { view: 'loading' } satisfies BookingAppointmentsData,
  },
}
```

**Step 2: Create index.tsx**

```tsx
// src/screens/BookingAppointments/index.tsx
import {
  ScreenHeader,
  Stack,
  Card,
  ListItem,
  Badge,
  Note,
  Footer,
  Button,
} from '@/components/screen'
import type { BookingAppointmentsData } from './scenarios'

export default function BookingAppointmentsScreen({ data }: { data: BookingAppointmentsData }) {
  const { view } = data

  return (
    <>
      <ScreenHeader title="My Appointments" />

      {view === 'loaded' && (
        <>
          <Stack gap="md" className="p-4">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">UPCOMING</p>
              <Card className="overflow-hidden p-0">
                <ListItem
                  icon="📅"
                  label="Dr. Anna Schmidt"
                  description="General Practice · Wed, Mar 5 · 10:00 AM"
                  trailing={<Badge variant="success">Confirmed</Badge>}
                />
                <ListItem
                  icon="📅"
                  label="Dr. Thomas Weber"
                  description="Cardiology · Mon, Mar 10 · 2:30 PM"
                  trailing={<Badge variant="warning">Pending</Badge>}
                />
              </Card>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">PAST</p>
              <Card className="overflow-hidden p-0">
                <ListItem
                  icon="📅"
                  label="Dr. Lisa Bauer"
                  description="Dermatology · Jan 15, 2026"
                  trailing={<Badge>Completed</Badge>}
                />
                <ListItem
                  icon="📅"
                  label="Dr. Emily Klein"
                  description="General Practice · Dec 8, 2025"
                  trailing={<Badge>Completed</Badge>}
                />
              </Card>
            </div>
          </Stack>

          <Footer>
            <Button
              size="lg"
              className="w-full"
              data-flow-target="Button:Book New Appointment"
            >
              Book New Appointment
            </Button>
          </Footer>
        </>
      )}

      {view === 'empty' && (
        <>
          <Stack gap="md" className="p-4">
            <Note type="info">
              You have no appointments yet. Book your first appointment to get started.
            </Note>
          </Stack>

          <Footer>
            <Button
              size="lg"
              className="w-full"
              data-flow-target="Button:Book New Appointment"
            >
              Book New Appointment
            </Button>
          </Footer>
        </>
      )}

      {view === 'loading' && (
        <>
          <Stack gap="md" className="p-4">
            <p className="text-sm text-neutral-500">Loading your appointments...</p>
          </Stack>

          <Footer>
            <Button
              variant="secondary"
              size="lg"
              className="w-full opacity-50"
              data-flow-target="Button:Book New Appointment"
            >
              Book New Appointment
            </Button>
          </Footer>
        </>
      )}
    </>
  )
}
```

**Step 3: Commit**

```bash
git add src/screens/BookingAppointments/
git commit -m "feat: convert booking/appointments.mdx to TSX screen"
```

---

## Task 14: Update flow system

Move `flow.yaml` to `src/screens/` and update all routes from `/booking/X` to `/booking-x` kebab-case. Update `useFlowConfig.ts` glob pattern and matching logic.

**Files:**
- Move: `content/booking/flow.yaml` → `src/screens/flow.yaml`
- Modify: `src/flow/useFlowConfig.ts`

**Step 1: Create updated flow.yaml at new location**

```yaml
# src/screens/flow.yaml
name: Booking Appointment
startRoute: /booking-search
startState: empty

actions:
  /booking-search:
    - trigger: "ListItem:Booking type"
      navigate: /booking-type
      navigateState: acute
    - trigger: "ListItem:Book appointment for"
      navigate: /booking-patient
      navigateState: self
    - trigger: "ListItem:Time slots"
      navigate: /booking-time-slots
      navigateState: all-selected
    - trigger: "ListItem:Location"
      navigate: /booking-location
      navigateState: initial
    - trigger: "Button:Search"
      navigate: /booking-confirmation
      navigateState: searching

  /booking-type:
    - trigger: "RadioCard:Acute"
      setState: acute
    - trigger: "RadioCard:Prevention"
      setState: prevention
    - trigger: "RadioCard:Follow-up"
      setState: follow-up
    - trigger: "Button:Save"
      navigate: /booking-search
      navigateState: partial
    - trigger: "ScreenHeader:Booking type"
      navigate: /booking-search
      navigateState: empty

  /booking-doctor:
    - trigger: "Avatar:AS"
      setState: selected
    - trigger: "Avatar:TW"
      setState: selected
    - trigger: "ListItem:Specialty"
      setState: specialty-drawer
    - trigger: "ScreenHeader:Specialty & Doctor"
      navigate: /booking-type
      navigateState: prevention

  /booking-patient:
    - trigger: "ScreenHeader:Book appointment for"
      navigate: /booking-search
      navigateState: partial
    - trigger: "Avatar:MM"
      setState: family
    - trigger: "Avatar:SM"
      setState: self

  /booking-location:
    - trigger: "ScreenHeader:Choose location"
      navigate: /booking-search
      navigateState: partial
    - trigger: "Button:Use current location"
      setState: selected

  /booking-time-slots:
    - trigger: "ScreenHeader:Time slots"
      navigate: /booking-search
      navigateState: partial

  /booking-confirmation:
    - trigger: "Button:Confirm Appointment"
      navigate: /booking-appointments
      navigateState: loaded
    - trigger: "Button:Back to Home"
      navigate: /booking-search
      navigateState: empty
    - trigger: "Button:Allow Notifications"
      setState: found

  /booking-appointments:
    - trigger: "Button:Book New Appointment"
      navigate: /booking-search
      navigateState: empty
```

**Step 2: Update useFlowConfig.ts**

Replace the entire file:

```typescript
// src/flow/useFlowConfig.ts
import { useMemo } from 'react'
import { parseFlowConfig, type FlowConfig } from '@/flow/FlowEngine'

const flowFiles = import.meta.glob<string>(
  '/src/screens/**/flow.yaml',
  { query: '?raw', import: 'default', eager: true }
)

/**
 * Returns the FlowConfig for the given route, if one exists.
 * Matches by checking if the route appears in any flow config's actions.
 */
export function useFlowConfig(route: string | null): FlowConfig | null {
  const flows = useMemo(() => {
    return Object.values(flowFiles).map((raw) => parseFlowConfig(raw))
  }, [])

  if (!route) return null

  return flows.find((config) => config.actions[route] != null) ?? null
}
```

**Step 3: Commit**

```bash
git add src/screens/flow.yaml src/flow/useFlowConfig.ts
git commit -m "feat: move flow.yaml to src/screens and update routes to kebab-case"
```

---

## Task 15: Wire up App + devtools

Replace all `useContentModules` usage with `useScreenModules`. Replace `ContentRenderer` with `ScreenRenderer`. Update state/scenario label resolution.

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/devtools/CatalogPanel.tsx`
- Modify: `src/devtools/InspectorPanel.tsx`

**Step 1: Update App.tsx**

Replace the entire file:

```tsx
// src/App.tsx
import { useEffect, useRef } from 'react'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { CatalogPanel } from '@/devtools/CatalogPanel'
import { InspectorPanel } from '@/devtools/InspectorPanel'
import { DeviceFrame } from '@/preview/DeviceFrame'
import { ScreenRenderer } from '@/screens/ScreenRenderer'
import { useScreenModules } from '@/screens/useScreenModules'
import { getDevice } from '@/preview/device-frames'

function App() {
  const activeDevice = useDevToolsStore((s) => s.activeDevice)
  const osMode = useDevToolsStore((s) => s.osMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const selectedState = useDevToolsStore((s) => s.selectedState)
  const setSelectedState = useDevToolsStore((s) => s.setSelectedState)
  const responsiveWidth = useDevToolsStore((s) => s.responsiveWidth)
  const responsiveHeight = useDevToolsStore((s) => s.responsiveHeight)
  const setResponsiveSize = useDevToolsStore((s) => s.setResponsiveSize)

  const modules = useScreenModules()
  const prevRouteRef = useRef<string | null>(null)

  // Auto-select the first state when navigating to a new route
  useEffect(() => {
    if (selectedRoute === prevRouteRef.current) return
    prevRouteRef.current = selectedRoute

    if (!selectedRoute) return

    const mod = modules.find((m) => m.route === selectedRoute)
    const scenarioKeys = mod ? Object.keys(mod.scenarios) : []
    const firstState = scenarioKeys.length > 0 ? scenarioKeys[0] : null
    setSelectedState(firstState)
  }, [selectedRoute, modules, setSelectedState])

  const device = getDevice(activeDevice)

  return (
    <div className="flex h-svh bg-neutral-100">
      <CatalogPanel />

      <div className="flex flex-1 flex-col overflow-hidden">
        <DeviceFrame
          device={device}
          osMode={osMode}
          responsiveWidth={responsiveWidth}
          responsiveHeight={responsiveHeight}
          onResponsiveResize={setResponsiveSize}
        >
          <ScreenRenderer
            route={selectedRoute}
            activeState={selectedState}
          />
        </DeviceFrame>
      </div>

      <InspectorPanel />
    </div>
  )
}

export default App
```

**Step 2: Update CatalogPanel.tsx**

Replace `useContentModules` with `useScreenModules`:

In `src/devtools/CatalogPanel.tsx`, change:
- Import: `import { useContentModules } from '@/content/useContentModules'` → `import { useScreenModules } from '@/screens/useScreenModules'`
- Usage: `const modules = useContentModules()` → `const modules = useScreenModules()`

**Step 3: Update InspectorPanel.tsx**

In `src/devtools/InspectorPanel.tsx`, change:
- Import: `import { useContentModules } from '@/content/useContentModules'` → `import { useScreenModules } from '@/screens/useScreenModules'`
- Usage: `const modules = useContentModules()` → `const modules = useScreenModules()`
- State keys: `const states = currentModule?.frontmatter?.states` → `const states = currentModule?.scenarios`
- State keys: `const stateKeys = states ? Object.keys(states) : []` stays the same
- Content info section: replace `currentModule?.frontmatter?.type` check with a simpler display since all entries are screens now. Replace that section with:

```tsx
{selectedRoute && (
  <Section title="Screen">
    <span className="text-xs text-neutral-400">{selectedRoute}</span>
  </Section>
)}
```

**Step 4: Commit**

```bash
git add src/App.tsx src/devtools/CatalogPanel.tsx src/devtools/InspectorPanel.tsx
git commit -m "refactor: wire up devtools and App to use screen modules"
```

---

## Task 16: Remove MDX infrastructure

Delete all MDX-related files, remove MDX dependencies, update Vite config.

**Files:**
- Delete: `content/` directory (entire)
- Delete: `src/content/` directory (entire)
- Modify: `vite.config.ts`
- Modify: `package.json` (then run `pnpm install`)

**Step 1: Delete MDX content and infrastructure**

```bash
rm -rf content/
rm -rf src/content/
```

**Step 2: Update vite.config.ts**

Replace the entire file — remove MDX plugin and remark imports:

```typescript
// vite.config.ts
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

**Step 3: Remove MDX dependencies**

```bash
pnpm remove @mdx-js/react @mdx-js/rollup remark-frontmatter remark-gfm remark-mdx-frontmatter
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove MDX infrastructure and dependencies"
```

---

## Task 17: Build verification

**Step 1: Run build**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

**Step 2: Run dev server and smoke test**

```bash
pnpm dev
```

Verify:
- App loads without console errors
- Catalog panel shows all screen routes
- Clicking a screen renders it in the device frame
- State switching in inspector panel works
- Play mode with flow interactions works for booking screens

**Step 3: Fix any issues**

If TypeScript errors occur, fix them. Common issues:
- Missing type assertions on scenario data
- Import path resolution
- Fragment key warnings in JSX arrays

**Step 4: Final commit (if fixes needed)**

```bash
git add -A
git commit -m "fix: resolve build issues from MDX to TSX migration"
```

---

## Task dependency graph

```
Task 1 (screen primitives) ─┐
                             ├─→ Tasks 4-13 (convert screens) ─┐
Task 2 (infrastructure)  ───┤                                   ├─→ Task 15 (wire up) → Task 16 (cleanup) → Task 17 (verify)
Task 3 (update HelloWorld) ─┘                                   │
                                Task 14 (flow system) ──────────┘
```

**Parallelizable:** Tasks 4-13 (all screen conversions) can run in parallel after Tasks 1-3 complete. Task 14 can run in parallel with screen conversions.

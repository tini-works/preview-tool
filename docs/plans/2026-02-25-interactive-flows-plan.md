# Interactive Flow System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add clickable prototype behavior to MDX screens via `flow.yaml` config files, supporting screen-to-screen navigation and in-screen state transitions.

**Architecture:** Event delegation on a wrapper div intercepts clicks in the device preview. A trigger-matcher resolves clicked DOM elements to `ComponentName:TextContent` patterns. A FlowEngine looks up matching actions from the parsed flow.yaml and dispatches setState/navigate to the Zustand store.

**Tech Stack:** React 19, Zustand 5, Vite 7 (glob imports), `yaml` npm package, TypeScript

---

### Task 1: Install YAML parser dependency

**Files:**
- Modify: `package.json`

**Step 1: Install yaml package**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm add yaml`

**Step 2: Verify installation**

Run: `pnpm ls yaml`
Expected: `yaml` listed in dependencies

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add yaml parser dependency for flow config"
```

---

### Task 2: Add playMode and flowHistory to Zustand store

**Files:**
- Modify: `src/devtools/useDevToolsStore.ts:7-27` (interfaces), `:31-39` (defaults), `:42-86` (store)

**Step 1: Add new state and actions to the store**

Add to `DevToolsState` interface (after line 15):
```typescript
playMode: boolean
flowHistory: Array<{ route: string; state: string | null }>
```

Add to `DevToolsActions` interface (after line 26):
```typescript
setPlayMode: (enabled: boolean) => void
togglePlayMode: () => void
pushFlowHistory: (route: string, state: string | null) => void
resetFlowHistory: () => void
```

Add to `DEFAULT_STATE` (after line 39):
```typescript
playMode: false,
flowHistory: [],
```

Add to store implementation (after the `toggleInspectorCollapsed` action):
```typescript
setPlayMode: (enabled) =>
  set({ playMode: enabled }),

togglePlayMode: () =>
  set((state) => ({
    playMode: !state.playMode,
    flowHistory: !state.playMode ? [] : state.flowHistory,
  })),

pushFlowHistory: (route, state) =>
  set((prev) => ({
    flowHistory: [...prev.flowHistory, { route, state }],
  })),

resetFlowHistory: () =>
  set({ flowHistory: [] }),
```

**Step 2: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add src/devtools/useDevToolsStore.ts
git commit -m "feat: add playMode and flowHistory to devtools store"
```

---

### Task 3: Create trigger-matcher utility

**Files:**
- Create: `src/flow/trigger-matcher.ts`

**Step 1: Create the trigger matcher**

This is a pure function that walks up the DOM from a click target, finds the nearest element with `data-flow-target`, and returns the trigger string.

```typescript
/**
 * Walks up from a click target to find the nearest data-flow-target attribute.
 * Returns the trigger string (e.g. "RadioCard:Acute") or null if none found.
 */
export function resolveTrigger(
  target: EventTarget | null,
  boundary: HTMLElement
): string | null {
  let el = target instanceof HTMLElement ? target : null

  while (el && el !== boundary) {
    const trigger = el.dataset.flowTarget
    if (trigger) return trigger
    el = el.parentElement
  }

  return null
}
```

**Step 2: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/flow/trigger-matcher.ts
git commit -m "feat: add trigger-matcher for resolving click targets"
```

---

### Task 4: Create FlowEngine — types and action resolver

**Files:**
- Create: `src/flow/FlowEngine.ts`

**Step 1: Create the flow engine**

Defines the FlowConfig type and provides a function to find matching actions for a given route + trigger.

```typescript
import YAML from 'yaml'

export interface FlowAction {
  trigger: string
  setState?: string
  navigate?: string
  navigateState?: string
}

export interface FlowConfig {
  name: string
  startRoute: string
  startState: string
  actions: Record<string, FlowAction[]>
}

/**
 * Parse a raw YAML string into a FlowConfig.
 */
export function parseFlowConfig(raw: string): FlowConfig {
  return YAML.parse(raw) as FlowConfig
}

/**
 * Find the matching action for a route + trigger combination.
 * Returns the first matching action, or null if none found.
 */
export function findAction(
  config: FlowConfig,
  route: string,
  trigger: string
): FlowAction | null {
  const routeActions = config.actions[route]
  if (!routeActions) return null

  return routeActions.find((a) => a.trigger === trigger) ?? null
}
```

**Step 2: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/flow/FlowEngine.ts
git commit -m "feat: add FlowEngine with YAML parser and action resolver"
```

---

### Task 5: Create useFlowConfig hook — Vite glob loader for flow.yaml

**Files:**
- Create: `src/flow/useFlowConfig.ts`
- Modify: `vite.config.ts` (add `?raw` support note — Vite supports this natively, no config change needed)

**Step 1: Create the hook**

Uses Vite's `import.meta.glob` with `{ query: '?raw', import: 'default' }` to eager-load all `flow.yaml` files as raw strings, then parses them with the FlowEngine.

```typescript
import { useMemo } from 'react'
import { parseFlowConfig, type FlowConfig } from '@/flow/FlowEngine'

const flowFiles = import.meta.glob<string>(
  '/content/**/flow.yaml',
  { query: '?raw', import: 'default', eager: true }
)

interface FlowEntry {
  /** Directory prefix, e.g. "/booking" */
  prefix: string
  config: FlowConfig
}

function filePathToPrefix(filePath: string): string {
  return filePath
    .replace(/^\/content/, '')
    .replace(/\/flow\.yaml$/, '')
}

/**
 * Returns the FlowConfig for the given route, if one exists.
 * Matches by checking if the route starts with any flow directory prefix.
 */
export function useFlowConfig(route: string | null): FlowConfig | null {
  const flows = useMemo<FlowEntry[]>(() => {
    return Object.entries(flowFiles).map(([filePath, raw]) => ({
      prefix: filePathToPrefix(filePath),
      config: parseFlowConfig(raw),
    }))
  }, [])

  if (!route) return null

  const match = flows.find((f) => route.startsWith(f.prefix))
  return match?.config ?? null
}
```

**Step 2: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Build succeeds (no flow.yaml files yet — glob returns empty object, that's fine)

**Step 3: Commit**

```bash
git add src/flow/useFlowConfig.ts
git commit -m "feat: add useFlowConfig hook with Vite glob loader"
```

---

### Task 6: Enhance mdx-components with data-flow-target injection

**Files:**
- Modify: `src/content/mdx-components.tsx:394-409` (mdxComponents map)

**Step 1: Add a `withFlowTarget` wrapper function**

Add this function before the `mdxComponents` export (around line 390):

```typescript
/**
 * Wraps an MDX component to inject data-flow-target attribute on its root element.
 * The target format is "ComponentName:text" where text is derived from:
 * - `label` prop (for ListItem)
 * - `initials` prop (for Avatar)
 * - `title` prop (for ScreenHeader)
 * - string children (for Button, RadioCard, Badge, etc.)
 */
function extractTargetText(componentName: string, props: Record<string, unknown>): string | null {
  if ('label' in props && typeof props.label === 'string') return props.label
  if ('initials' in props && typeof props.initials === 'string') return props.initials
  if ('title' in props && typeof props.title === 'string') return props.title
  if ('children' in props) {
    const children = props.children
    if (typeof children === 'string') return children.trim()
  }
  return null
}

function withFlowTarget<P extends Record<string, unknown>>(
  componentName: string,
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  function Wrapped(props: P) {
    const text = extractTargetText(componentName, props)
    const target = text ? `${componentName}:${text}` : null

    return (
      <div data-flow-target={target ?? undefined} style={{ display: 'contents' }}>
        <Component {...props} />
      </div>
    )
  }
  Wrapped.displayName = `FlowTarget(${componentName})`
  return Wrapped
}
```

**Step 2: Update the mdxComponents map to wrap interactive components**

Replace the existing `mdxComponents` export with:

```typescript
export const mdxComponents = {
  Variant,
  Button: withFlowTarget('Button', Button),
  Card,
  Input,
  Badge,
  Note,
  ScreenHeader: withFlowTarget('ScreenHeader', ScreenHeader),
  ListItem: withFlowTarget('ListItem', ListItem),
  RadioCard: withFlowTarget('RadioCard', RadioCard),
  Avatar: withFlowTarget('Avatar', Avatar),
  Divider,
  Stack,
  Textarea,
  Footer,
}
```

Only interactive components get wrapped: Button, ScreenHeader, ListItem, RadioCard, Avatar.
Non-interactive components (Card, Input, Badge, Note, Divider, Stack, Textarea, Footer, Variant) stay unwrapped.

**Step 3: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Build succeeds

**Step 4: Verify the dev server renders correctly**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm dev`
Manually check: Open browser, select a booking screen, verify it renders without visual changes. The `display: contents` wrapper should be invisible.

**Step 5: Commit**

```bash
git add src/content/mdx-components.tsx
git commit -m "feat: inject data-flow-target on interactive MDX components"
```

---

### Task 7: Create FlowProvider with event delegation

**Files:**
- Create: `src/flow/FlowProvider.tsx`

**Step 1: Create the FlowProvider component**

```typescript
import { useCallback, useRef, type ReactNode } from 'react'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { useFlowConfig } from '@/flow/useFlowConfig'
import { findAction } from '@/flow/FlowEngine'
import { resolveTrigger } from '@/flow/trigger-matcher'

interface FlowProviderProps {
  children: ReactNode
}

export function FlowProvider({ children }: FlowProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const playMode = useDevToolsStore((s) => s.playMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const setSelectedRoute = useDevToolsStore((s) => s.setSelectedRoute)
  const setSelectedState = useDevToolsStore((s) => s.setSelectedState)
  const pushFlowHistory = useDevToolsStore((s) => s.pushFlowHistory)

  const flowConfig = useFlowConfig(selectedRoute)

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!playMode || !flowConfig || !selectedRoute) return
      if (!containerRef.current) return

      const trigger = resolveTrigger(e.target, containerRef.current)
      if (!trigger) return

      const action = findAction(flowConfig, selectedRoute, trigger)
      if (!action) return

      e.preventDefault()
      e.stopPropagation()

      // Push current position to history before navigating
      const currentState = useDevToolsStore.getState().selectedState

      if (action.setState && !action.navigate) {
        pushFlowHistory(selectedRoute, currentState)
        setSelectedState(action.setState)
      }

      if (action.navigate) {
        pushFlowHistory(selectedRoute, currentState)
        setSelectedRoute(action.navigate)
        if (action.navigateState) {
          // Small delay to let route change propagate before setting state
          queueMicrotask(() => {
            setSelectedState(action.navigateState!)
          })
        }
      }
    },
    [playMode, flowConfig, selectedRoute, setSelectedRoute, setSelectedState, pushFlowHistory]
  )

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={playMode && flowConfig ? 'cursor-pointer' : undefined}
    >
      {children}
    </div>
  )
}
```

**Step 2: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/flow/FlowProvider.tsx
git commit -m "feat: add FlowProvider with event delegation click handler"
```

---

### Task 8: Wrap ContentRenderer with FlowProvider

**Files:**
- Modify: `src/content/ContentRenderer.tsx:1` (import), `:66-74` (render)

**Step 1: Add FlowProvider import**

Add to imports at top of file:
```typescript
import { FlowProvider } from '@/flow/FlowProvider'
```

**Step 2: Wrap the render output**

Replace the return block at lines 66-74:

```typescript
// Before:
  return (
    <MDXProvider components={mdxComponents}>
      <VariantProvider activeState={activeState}>
        <div className="p-4">
          <Component />
        </div>
      </VariantProvider>
    </MDXProvider>
  )

// After:
  return (
    <MDXProvider components={mdxComponents}>
      <VariantProvider activeState={activeState}>
        <FlowProvider>
          <div className="p-4">
            <Component />
          </div>
        </FlowProvider>
      </VariantProvider>
    </MDXProvider>
  )
```

**Step 3: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/content/ContentRenderer.tsx
git commit -m "feat: wrap ContentRenderer with FlowProvider"
```

---

### Task 9: Add Play mode toggle and breadcrumb to InspectorPanel

**Files:**
- Modify: `src/devtools/InspectorPanel.tsx:1` (imports), `:14-27` (store selectors), `:69-108` (after header, before Device section)

**Step 1: Add Play and RotateCcw icon imports**

Update the lucide-react import at line 1:
```typescript
import { Moon, Sun, Monitor, PanelRightClose, PanelRight, Play, Square, RotateCcw } from 'lucide-react'
```

**Step 2: Add store selectors for play mode**

Add after line 27 (after `toggleInspectorCollapsed`):
```typescript
const playMode = useDevToolsStore((s) => s.playMode)
const togglePlayMode = useDevToolsStore((s) => s.togglePlayMode)
const flowHistory = useDevToolsStore((s) => s.flowHistory)
const resetFlowHistory = useDevToolsStore((s) => s.resetFlowHistory)
```

**Step 3: Add Play mode section after the header div (line 68)**

Insert a new section between the header and the controls div. Add this right after the closing `</div>` of the header (after line 68):

```tsx
{/* Play mode toggle */}
<div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
  <div className="flex items-center gap-2">
    <Button
      variant={playMode ? 'default' : 'outline'}
      size="icon-sm"
      onClick={togglePlayMode}
      title={playMode ? 'Stop play mode' : 'Start play mode'}
    >
      {playMode ? <Square className="size-3" /> : <Play className="size-3" />}
    </Button>
    <span className="text-xs font-medium text-neutral-500">
      {playMode ? 'Playing' : 'Play'}
    </span>
  </div>
  {playMode && flowHistory.length > 0 && (
    <button
      onClick={resetFlowHistory}
      className="text-neutral-400 hover:text-neutral-600"
      title="Reset flow"
    >
      <RotateCcw className="size-3.5" />
    </button>
  )}
</div>
```

**Step 4: Add breadcrumb section**

Add a new `Section` after the Play mode toggle, before the Device section, that shows when in play mode with history:

```tsx
{/* Flow breadcrumb (only in play mode with history) */}
{playMode && flowHistory.length > 0 && (
  <Section title="Flow History">
    <div className="flex flex-col gap-1">
      {flowHistory.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs text-neutral-400">
          <span className="truncate">{entry.route.split('/').pop()}</span>
          {entry.state && (
            <>
              <span>·</span>
              <span className="truncate text-neutral-300">{entry.state}</span>
            </>
          )}
        </div>
      ))}
      {selectedRoute && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-700">
          <span className="truncate">{selectedRoute.split('/').pop()}</span>
          {selectedState && (
            <>
              <span>·</span>
              <span className="truncate text-teal-600">{selectedState}</span>
            </>
          )}
        </div>
      )}
    </div>
  </Section>
)}
```

**Step 5: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/devtools/InspectorPanel.tsx
git commit -m "feat: add Play mode toggle and flow breadcrumb to Inspector"
```

---

### Task 10: Create booking flow.yaml config

**Files:**
- Create: `content/booking/flow.yaml`

**Step 1: Write the flow config**

Based on the 8 booking screens and their states/interactive elements:

```yaml
name: Booking Appointment
startRoute: /booking/search
startState: empty

actions:
  # Search screen — hub that links to sub-screens
  /booking/search:
    - trigger: "ListItem:Booking type"
      navigate: /booking/type
      navigateState: acute
    - trigger: "ListItem:Book appointment for"
      navigate: /booking/patient
      navigateState: self
    - trigger: "ListItem:Time slots"
      navigate: /booking/time-slots
      navigateState: all-selected
    - trigger: "ListItem:Location"
      navigate: /booking/location
      navigateState: initial
    - trigger: "Button:Search"
      navigate: /booking/confirmation
      navigateState: searching

  # Type selection screen
  /booking/type:
    - trigger: "RadioCard:Acute"
      setState: acute
    - trigger: "RadioCard:Prevention"
      setState: prevention
    - trigger: "RadioCard:Follow-up"
      setState: follow-up
    - trigger: "Button:Save"
      navigate: /booking/search
      navigateState: partial
    - trigger: "ScreenHeader:Booking type"
      navigate: /booking/search
      navigateState: empty

  # Doctor selection screen
  /booking/doctor:
    - trigger: "Avatar:AS"
      setState: selected
    - trigger: "Avatar:TW"
      setState: selected
    - trigger: "ListItem:Specialty"
      setState: specialty-drawer
    - trigger: "ScreenHeader:Specialty & Doctor"
      navigate: /booking/type
      navigateState: prevention

  # Patient selection screen
  /booking/patient:
    - trigger: "ScreenHeader:Book appointment for"
      navigate: /booking/search
      navigateState: partial
    - trigger: "Avatar:MM"
      setState: family
    - trigger: "Avatar:SM"
      setState: self

  # Location screen
  /booking/location:
    - trigger: "ScreenHeader:Choose location"
      navigate: /booking/search
      navigateState: partial
    - trigger: "Button:Use current location"
      setState: selected

  # Time slots screen
  /booking/time-slots:
    - trigger: "ScreenHeader:Time slots"
      navigate: /booking/search
      navigateState: partial

  # Confirmation screen
  /booking/confirmation:
    - trigger: "Button:Confirm Appointment"
      navigate: /booking/appointments
      navigateState: loaded
    - trigger: "Button:Back to Home"
      navigate: /booking/search
      navigateState: empty
    - trigger: "Button:Allow Notifications"
      setState: found

  # Appointments list screen
  /booking/appointments:
    - trigger: "Button:Book New Appointment"
      navigate: /booking/search
      navigateState: empty
```

**Step 2: Verify build**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add content/booking/flow.yaml
git commit -m "feat: add booking flow config with all screen interactions"
```

---

### Task 11: Integration verification

**Step 1: Start dev server**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm dev`

**Step 2: Manual verification checklist**

Open browser to localhost and verify:

1. Select `/booking/search` from the Catalog panel
2. Verify Play mode toggle appears in Inspector panel
3. Click Play button — it should show "Playing" with a stop icon
4. Click the "Booking type" ListItem in the preview — it should navigate to `/booking/type` screen with `acute` state
5. Click "Prevention" RadioCard — state should switch to `prevention`
6. Click "Save" Button — should navigate back to `/booking/search` with `partial` state
7. Verify breadcrumb in Inspector shows the navigation history
8. Click Reset button — breadcrumb clears
9. Toggle Play mode off — clicking elements should do nothing
10. Verify non-flow screens (like `hello.mdx`, `login-form.mdx`) work normally without play mode

**Step 3: Fix any issues found during testing**

Address any click handling, trigger matching, or navigation bugs.

**Step 4: Final build check**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Clean build with no errors or warnings

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address integration issues from flow system testing"
```

---

## Summary

| Task | Description | Files | Est. |
|------|-------------|-------|------|
| 1 | Install yaml dependency | package.json | 2 min |
| 2 | Add playMode/flowHistory to store | useDevToolsStore.ts | 3 min |
| 3 | Create trigger-matcher | src/flow/trigger-matcher.ts | 2 min |
| 4 | Create FlowEngine | src/flow/FlowEngine.ts | 3 min |
| 5 | Create useFlowConfig hook | src/flow/useFlowConfig.ts | 3 min |
| 6 | Enhance mdx-components | mdx-components.tsx | 5 min |
| 7 | Create FlowProvider | src/flow/FlowProvider.tsx | 5 min |
| 8 | Wrap ContentRenderer | ContentRenderer.tsx | 2 min |
| 9 | Add Play mode to Inspector | InspectorPanel.tsx | 5 min |
| 10 | Create booking flow.yaml | content/booking/flow.yaml | 3 min |
| 11 | Integration verification | — | 5 min |

**Total new files:** 5 (4 in src/flow/, 1 flow.yaml)
**Total modified files:** 4 (store, mdx-components, ContentRenderer, InspectorPanel)
**Total new dependency:** 1 (yaml)

# DevTools Inspector Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 new inspector sections (language, feature flags, list item count, network simulation, font scale) to the preview-tool's InspectorPanel.

**Architecture:** Extend the existing Zustand store (`useDevToolsStore.ts`) with new state slices and add collapsible sections to `InspectorPanel.tsx`. Network simulation uses a wrapper component. Font scale uses inline `fontSize` on the screen content container.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4, shadcn/ui (slider, switch), react-i18next

---

### Task 1: Add shadcn/ui Slider and Switch components

We need Slider for font scale and Switch for feature flag toggles. These don't exist yet in `src/components/ui/`.

**Step 1: Install Slider component**

Run: `pnpm dlx shadcn@latest add slider`

**Step 2: Install Switch component**

Run: `pnpm dlx shadcn@latest add switch`

**Step 3: Verify both files exist**

Check that these files were created:
- `src/components/ui/slider.tsx`
- `src/components/ui/switch.tsx`

**Step 4: Commit**

```bash
git add src/components/ui/slider.tsx src/components/ui/switch.tsx
git commit -m "chore: add shadcn slider and switch components"
```

---

### Task 2: Extend store with new state slices

**Files:**
- Modify: `src/devtools/useDevToolsStore.ts`

**Step 1: Add new types and state fields**

Add after the `OsMode` type (line 5):

```typescript
export type NetworkMode = 'online' | 'slow-3g' | 'offline'
```

Add new fields to `DevToolsState` interface (after `flowHistory`, line 17):

```typescript
  networkMode: NetworkMode
  fontScale: number
  language: string
  listItemCount: number
  featureFlags: Record<string, boolean>
```

Add new actions to `DevToolsActions` interface (after `navigateFlow`, line 33):

```typescript
  setNetworkMode: (mode: NetworkMode) => void
  setFontScale: (scale: number) => void
  setLanguage: (lang: string) => void
  setListItemCount: (count: number) => void
  setFeatureFlag: (key: string, value: boolean) => void
  resetFeatureFlags: () => void
```

**Step 2: Add defaults**

Add to `DEFAULT_STATE` (after `flowHistory: []`, line 48):

```typescript
  networkMode: 'online' as NetworkMode,
  fontScale: 1,
  language: 'en',
  listItemCount: 5,
  featureFlags: {},
```

**Step 3: Add action implementations**

Add inside the `create` callback, after `navigateFlow` (after line 103):

```typescript
      setNetworkMode: (mode) =>
        set({ networkMode: mode }),

      setFontScale: (scale) =>
        set({ fontScale: Math.round(Math.max(0.75, Math.min(2, scale)) * 100) / 100 }),

      setLanguage: (lang) =>
        set({ language: lang }),

      setListItemCount: (count) =>
        set({ listItemCount: Math.max(0, Math.min(99, Math.round(count))) }),

      setFeatureFlag: (key, value) =>
        set((prev) => ({
          featureFlags: { ...prev.featureFlags, [key]: value },
        })),

      resetFeatureFlags: () =>
        set({ featureFlags: {} }),
```

**Step 4: Update persistence partialize**

Extend the `partialize` function (line 107-112) to also persist `fontScale`, `language`, and `networkMode`:

```typescript
      partialize: (state) => ({
        activeDevice: state.activeDevice,
        responsiveWidth: state.responsiveWidth,
        responsiveHeight: state.responsiveHeight,
        osMode: state.osMode,
        fontScale: state.fontScale,
        language: state.language,
        networkMode: state.networkMode,
      }),
```

**Step 5: Verify build**

Run: `pnpm build`
Expected: No type errors.

**Step 6: Commit**

```bash
git add src/devtools/useDevToolsStore.ts
git commit -m "feat(devtools): add store slices for language, network, font scale, list count, flags"
```

---

### Task 3: Extend screen types and auto-discovery for flags

**Files:**
- Modify: `src/screens/types.ts`
- Modify: `src/screens/useScreenModules.ts`

**Step 1: Add FlagDefinition type to types.ts**

Add after the `Scenario` interface (after line 6):

```typescript
export interface FlagDefinition {
  label: string
  default: boolean
}

export interface FlagModule {
  flags: Record<string, FlagDefinition>
}
```

Add optional `flags` field to `ScreenEntry` (after `scenarios`, line 19):

```typescript
  flags?: Record<string, FlagDefinition>
```

**Step 2: Extend useScreenModules to glob flags**

In `src/screens/useScreenModules.ts`, add a new glob import after `scenarioModules` (after line 11):

```typescript
const flagModules = import.meta.glob<FlagModule>(
  '/src/screens/*/scenarios.ts',
  { eager: true }
)
```

Note: flags are exported from the same `scenarios.ts` file, so we reuse the same glob path. But since `scenarioModules` is typed as `ScenarioModule`, we need a separate typed glob for flags. Update import line:

```typescript
import type { ScreenEntry, ScreenModule, ScenarioModule, FlagModule } from '@/screens/types'
```

In the `useScreenModules` function, add flags to the returned object (after `scenarios`, line 38):

```typescript
        flags: flagModules[scenariosPath]?.flags,
```

**Step 3: Verify build**

Run: `pnpm build`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/screens/types.ts src/screens/useScreenModules.ts
git commit -m "feat(screens): extend types and auto-discovery for per-screen feature flags"
```

---

### Task 4: Create NetworkSimulationLayer component

**Files:**
- Create: `src/devtools/NetworkSimulationLayer.tsx`

**Step 1: Write the component**

Create `src/devtools/NetworkSimulationLayer.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { WifiOff, Loader2 } from 'lucide-react'
import { useDevToolsStore, type NetworkMode } from '@/devtools/useDevToolsStore'

interface NetworkSimulationLayerProps {
  children: ReactNode
}

export function NetworkSimulationLayer({ children }: NetworkSimulationLayerProps) {
  const networkMode = useDevToolsStore((s) => s.networkMode)

  if (networkMode === 'offline') {
    return <OfflineScreen />
  }

  if (networkMode === 'slow-3g') {
    return <SlowNetworkWrapper>{children}</SlowNetworkWrapper>
  }

  return <>{children}</>
}

function OfflineScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-cream-50 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-coral-100">
        <WifiOff className="size-6 text-coral-600" />
      </div>
      <h2 className="text-lg font-semibold text-charcoal-500">No Connection</h2>
      <p className="max-w-xs text-sm text-slate-500">
        You appear to be offline. Check your connection and try again.
      </p>
    </div>
  )
}

function SlowNetworkWrapper({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(false)
    const timer = setTimeout(() => setReady(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-cream-50 p-8 text-center">
        <Loader2 className="size-6 animate-spin text-teal-500" />
        <p className="text-sm text-slate-500">Loading on slow connection...</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-1.5 bg-teal-50 px-3 py-1">
        <div className="size-1.5 rounded-full bg-teal-500" />
        <span className="text-xs text-teal-700">Slow 3G</span>
      </div>
      {children}
    </>
  )
}
```

**Step 2: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/devtools/NetworkSimulationLayer.tsx
git commit -m "feat(devtools): add NetworkSimulationLayer component"
```

---

### Task 5: Integrate NetworkSimulationLayer and font scale into ScreenRenderer

**Files:**
- Modify: `src/screens/ScreenRenderer.tsx`

**Step 1: Add imports**

Add at top of file:

```typescript
import { NetworkSimulationLayer } from '@/devtools/NetworkSimulationLayer'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
```

**Step 2: Read fontScale from store**

Inside the `ScreenRenderer` component, add after `const modules = useScreenModules()`:

```typescript
  const fontScale = useDevToolsStore((s) => s.fontScale)
```

**Step 3: Wrap the return JSX**

Replace the final return block (lines 75-79) with:

```tsx
  return (
    <div style={{ fontSize: `${fontScale * 100}%` }} className="h-full">
      <NetworkSimulationLayer>
        <FlowProvider>
          <Component data={data} />
        </FlowProvider>
      </NetworkSimulationLayer>
    </div>
  )
```

**Step 4: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/screens/ScreenRenderer.tsx
git commit -m "feat(devtools): integrate network simulation and font scale into ScreenRenderer"
```

---

### Task 6: Add new sections to InspectorPanel

**Files:**
- Modify: `src/devtools/InspectorPanel.tsx`

This is the largest task. We add 5 new `<Section>` blocks to the InspectorPanel.

**Step 1: Add imports**

Add to the existing lucide import line:

```typescript
import { Moon, Sun, Monitor, PanelRightClose, PanelRight, Play, Square, RotateCcw, Globe, Wifi, WifiOff, Signal, Flag, List, Type } from 'lucide-react'
```

Add new component imports:

```typescript
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import i18n from '@/lib/i18n'
import type { NetworkMode } from '@/devtools/useDevToolsStore'
```

**Step 2: Read new store values**

Inside the `InspectorPanel` component, after the existing store selectors (after line 31), add:

```typescript
  const networkMode = useDevToolsStore((s) => s.networkMode)
  const setNetworkMode = useDevToolsStore((s) => s.setNetworkMode)
  const fontScale = useDevToolsStore((s) => s.fontScale)
  const setFontScale = useDevToolsStore((s) => s.setFontScale)
  const language = useDevToolsStore((s) => s.language)
  const setLanguage = useDevToolsStore((s) => s.setLanguage)
  const listItemCount = useDevToolsStore((s) => s.listItemCount)
  const setListItemCount = useDevToolsStore((s) => s.setListItemCount)
  const featureFlags = useDevToolsStore((s) => s.featureFlags)
  const setFeatureFlag = useDevToolsStore((s) => s.setFeatureFlag)

  const currentFlags = currentModule?.flags
```

**Step 3: Add Language section**

Insert after the "States" section closing tag (after line 189), before the "Screen" section:

```tsx
        {/* Language section */}
        <Section title="Language">
          <div className="flex gap-1">
            {['en', 'de'].map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  setLanguage(lang)
                  i18n.changeLanguage(lang)
                }}
                className={
                  language === lang
                    ? 'flex-1 rounded-md bg-neutral-900/5 px-2 py-1 text-center text-sm font-medium text-neutral-900'
                    : 'flex-1 rounded-md px-2 py-1 text-center text-sm text-neutral-600 hover:bg-neutral-50'
                }
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </Section>
```

**Step 4: Add Feature Flags section**

Insert after the Language section:

```tsx
        {/* Feature Flags section (per-screen) */}
        {currentFlags && Object.keys(currentFlags).length > 0 && (
          <Section title="Feature Flags">
            <div className="flex flex-col gap-2">
              {Object.entries(currentFlags).map(([key, def]) => (
                <div key={key} className="flex items-center justify-between">
                  <Label htmlFor={`flag-${key}`} className="text-xs text-neutral-600">
                    {def.label}
                  </Label>
                  <Switch
                    id={`flag-${key}`}
                    checked={featureFlags[key] ?? def.default}
                    onCheckedChange={(checked) => setFeatureFlag(key, checked)}
                  />
                </div>
              ))}
            </div>
          </Section>
        )}
```

**Step 5: Add List Item Count section**

Insert after the Feature Flags section:

```tsx
        {/* List Item Count section */}
        <Section title="List Items">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setListItemCount(listItemCount - 1)}
              disabled={listItemCount <= 0}
              className="flex size-7 items-center justify-center rounded-md border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
            >
              &minus;
            </button>
            <input
              type="number"
              value={listItemCount}
              onChange={(e) => setListItemCount(Number(e.target.value))}
              min={0}
              max={99}
              className="h-7 w-14 rounded-md border border-neutral-200 bg-white px-2 text-center text-sm text-neutral-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              onClick={() => setListItemCount(listItemCount + 1)}
              disabled={listItemCount >= 99}
              className="flex size-7 items-center justify-center rounded-md border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </Section>
```

**Step 6: Add Network section**

Insert after the List Item Count section:

```tsx
        {/* Network section */}
        <Section title="Network">
          <div className="flex gap-1">
            {([
              { mode: 'online' as NetworkMode, label: 'Online' },
              { mode: 'slow-3g' as NetworkMode, label: 'Slow 3G' },
              { mode: 'offline' as NetworkMode, label: 'Offline' },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setNetworkMode(mode)}
                className={
                  networkMode === mode
                    ? 'flex-1 rounded-md bg-neutral-900/5 px-2 py-1 text-center text-xs font-medium text-neutral-900'
                    : 'flex-1 rounded-md px-2 py-1 text-center text-xs text-neutral-600 hover:bg-neutral-50'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Section>
```

**Step 7: Add Font Scale section**

Insert after the Network section:

```tsx
        {/* Font Scale section */}
        <Section title="Font Scale">
          <div className="flex flex-col gap-2">
            <Slider
              value={[fontScale]}
              onValueChange={([v]) => setFontScale(v)}
              min={0.75}
              max={2}
              step={0.05}
              className="w-full"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">0.75x</span>
              <span className="font-mono text-xs font-medium text-neutral-700">
                {fontScale.toFixed(2)}x
              </span>
              <span className="text-xs text-neutral-400">2.0x</span>
            </div>
          </div>
        </Section>
```

**Step 8: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 9: Commit**

```bash
git add src/devtools/InspectorPanel.tsx
git commit -m "feat(devtools): add language, flags, list items, network, font scale inspector sections"
```

---

### Task 7: Sync language store with i18n on mount

**Files:**
- Modify: `src/devtools/InspectorPanel.tsx`

Since the language is persisted in the Zustand store, we need to sync it with i18n when the app loads.

**Step 1: Add useEffect for i18n sync**

Inside the `InspectorPanel` component, add after the store selectors:

```typescript
  // Sync persisted language with i18n on mount
  useEffect(() => {
    if (language && language !== i18n.language) {
      i18n.changeLanguage(language)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
```

Add `useEffect` to the React import at the top of the file (it's not currently imported there).

**Step 2: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 3: Manual test**

Run: `pnpm dev`
1. Open browser to localhost:5173
2. Select a screen from the catalog
3. Verify all 5 new sections appear in the right sidebar:
   - Language: EN/DE buttons
   - Feature Flags: shows toggles if the screen defines them (will be empty for now since no screen has flags yet)
   - List Items: counter with +/- buttons
   - Network: Online/Slow 3G/Offline buttons
   - Font Scale: slider with readout
4. Test each control:
   - Language: switches i18n language (visible on HelloWorld screen with translations)
   - Network > Slow 3G: shows 2s loading then slow banner
   - Network > Offline: shows offline screen
   - Font Scale: drag slider, text in screen should scale
   - List Items: change number (no visible effect yet — screens haven't been updated to consume it)

**Step 4: Commit**

```bash
git add src/devtools/InspectorPanel.tsx
git commit -m "feat(devtools): sync persisted language with i18n on mount"
```

---

### Task 8: Add sample feature flags to one screen

**Files:**
- Modify: `src/screens/BookingSearch/scenarios.ts` (or another suitable screen)

This demonstrates the flags convention. Pick a screen that would benefit from toggleable features.

**Step 1: Check BookingSearch scenarios**

Read: `src/screens/BookingSearch/scenarios.ts`

**Step 2: Add flags export**

Add at the bottom of the file:

```typescript
export const flags = {
  showRecentSearches: { label: 'Recent Searches', default: true },
  showSpecialties: { label: 'Specialties Filter', default: true },
}
```

**Step 3: Verify the flags appear in InspectorPanel**

Run: `pnpm dev`
1. Select BookingSearch screen
2. InspectorPanel should show "Feature Flags" section with two toggles

**Step 4: Commit**

```bash
git add src/screens/BookingSearch/scenarios.ts
git commit -m "feat(devtools): add sample feature flags to BookingSearch screen"
```

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Install shadcn slider + switch | `ui/slider.tsx`, `ui/switch.tsx` | — |
| 2 | Extend Zustand store | — | `useDevToolsStore.ts` |
| 3 | Extend types + auto-discovery for flags | — | `types.ts`, `useScreenModules.ts` |
| 4 | Create NetworkSimulationLayer | `NetworkSimulationLayer.tsx` | — |
| 5 | Integrate into ScreenRenderer | — | `ScreenRenderer.tsx` |
| 6 | Add 5 new InspectorPanel sections | — | `InspectorPanel.tsx` |
| 7 | Sync language on mount | — | `InspectorPanel.tsx` |
| 8 | Sample feature flags | — | `BookingSearch/scenarios.ts` |

**Total: 8 tasks, 3 new files, 6 modified files**

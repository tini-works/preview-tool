# Preview Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a general-purpose MDX preview tool that renders content inside realistic device frames with live reload, OS mode toggle, and state switching.

**Architecture:** Monolithic React/Vite app with three module boundaries — `preview/` (device frames), `content/` (MDX loading + state), `devtools/` (toolbar + Zustand store). MDX compiled via Vite plugin, content discovered via glob imports, state managed by Zustand with localStorage persistence.

**Tech Stack:** React 19, Vite 7, TypeScript 5.9, Tailwind CSS v4, Zustand, @mdx-js/rollup, shadcn/ui, lucide-react.

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/mdx.d.ts`

**Step 1: Install MDX toolchain + Zustand**

```bash
pnpm add @mdx-js/rollup @mdx-js/react remark-frontmatter remark-mdx-frontmatter remark-gfm zustand
```

**Step 2: Add MDX type declarations**

Create `src/mdx.d.ts`:

```typescript
declare module '*.mdx' {
  import type { ComponentType } from 'react'

  export const frontmatter: Record<string, unknown>
  const MDXComponent: ComponentType
  export default MDXComponent
}
```

**Step 3: Configure Vite for MDX**

Update `vite.config.ts`:

```typescript
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import mdx from "@mdx-js/rollup"
import remarkFrontmatter from "remark-frontmatter"
import remarkMdxFrontmatter from "remark-mdx-frontmatter"
import remarkGfm from "remark-gfm"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    mdx({
      remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
    }),
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

Note: `mdx()` plugin must come before `react()` so `.mdx` files are transformed before React's JSX handling.

**Step 4: Verify build still works**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts src/mdx.d.ts
git commit -m "chore: add MDX toolchain and Zustand dependencies"
```

---

## Task 2: Device Frame Types and Metadata

**Files:**
- Create: `src/preview/device-frames.ts`

**Step 1: Create device type definitions and frame metadata**

Create `src/preview/device-frames.ts`:

```typescript
export type DeviceType =
  | 'iphone-15-pro'
  | 'iphone-se'
  | 'pixel-8'
  | 'ipad-mini'
  | 'desktop'
  | 'responsive'

export type FrameCategory = 'mobile' | 'browser' | 'responsive'

export interface DeviceDefinition {
  readonly id: DeviceType
  readonly name: string
  readonly width: number
  readonly height: number
  readonly category: FrameCategory
  readonly notch: 'dynamic-island' | 'none'
  readonly homeIndicator: boolean
  readonly statusBarHeight: number
}

export const DEVICE_DEFINITIONS: ReadonlyMap<DeviceType, DeviceDefinition> = new Map([
  ['iphone-15-pro', {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    width: 393,
    height: 852,
    category: 'mobile',
    notch: 'dynamic-island',
    homeIndicator: true,
    statusBarHeight: 54,
  }],
  ['iphone-se', {
    id: 'iphone-se',
    name: 'iPhone SE',
    width: 375,
    height: 667,
    category: 'mobile',
    notch: 'none',
    homeIndicator: false,
    statusBarHeight: 20,
  }],
  ['pixel-8', {
    id: 'pixel-8',
    name: 'Pixel 8',
    width: 412,
    height: 915,
    category: 'mobile',
    notch: 'none',
    homeIndicator: true,
    statusBarHeight: 24,
  }],
  ['ipad-mini', {
    id: 'ipad-mini',
    name: 'iPad Mini',
    width: 744,
    height: 1133,
    category: 'mobile',
    notch: 'none',
    homeIndicator: true,
    statusBarHeight: 24,
  }],
  ['desktop', {
    id: 'desktop',
    name: 'Desktop',
    width: 1280,
    height: 800,
    category: 'browser',
    notch: 'none',
    homeIndicator: false,
    statusBarHeight: 0,
  }],
  ['responsive', {
    id: 'responsive',
    name: 'Responsive',
    width: 390,
    height: 844,
    category: 'responsive',
    notch: 'none',
    homeIndicator: false,
    statusBarHeight: 0,
  }],
])

export function getDevice(id: DeviceType): DeviceDefinition {
  const device = DEVICE_DEFINITIONS.get(id)
  if (!device) {
    throw new Error(`Unknown device: ${id}`)
  }
  return device
}

export function getAllDevices(): readonly DeviceDefinition[] {
  return [...DEVICE_DEFINITIONS.values()]
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/preview/device-frames.ts
git commit -m "feat: add device frame type definitions and metadata"
```

---

## Task 3: Zustand DevTools Store

**Files:**
- Create: `src/devtools/useDevToolsStore.ts`

**Step 1: Create the Zustand store**

Create `src/devtools/useDevToolsStore.ts`:

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DeviceType } from '@/preview/device-frames'

export type OsMode = 'light' | 'dark'

interface DevToolsState {
  activeDevice: DeviceType
  responsiveWidth: number
  responsiveHeight: number
  osMode: OsMode
  selectedRoute: string | null
  selectedState: string | null
}

interface DevToolsActions {
  setActiveDevice: (device: DeviceType) => void
  setOsMode: (mode: OsMode) => void
  toggleOsMode: () => void
  setSelectedRoute: (route: string | null) => void
  setSelectedState: (state: string | null) => void
  setResponsiveSize: (width: number, height: number) => void
}

export type DevToolsStore = DevToolsState & DevToolsActions

const DEFAULT_STATE: DevToolsState = {
  activeDevice: 'iphone-15-pro',
  responsiveWidth: 390,
  responsiveHeight: 844,
  osMode: 'light',
  selectedRoute: null,
  selectedState: null,
}

export const useDevToolsStore = create<DevToolsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setActiveDevice: (device) =>
        set({ activeDevice: device }),

      setOsMode: (mode) =>
        set({ osMode: mode }),

      toggleOsMode: () =>
        set((state) => ({
          osMode: state.osMode === 'light' ? 'dark' : 'light',
        })),

      setSelectedRoute: (route) =>
        set({ selectedRoute: route, selectedState: null }),

      setSelectedState: (state) =>
        set({ selectedState: state }),

      setResponsiveSize: (width, height) =>
        set({ responsiveWidth: width, responsiveHeight: height }),
    }),
    {
      name: 'preview-tool-devtools',
      partialize: (state) => ({
        activeDevice: state.activeDevice,
        responsiveWidth: state.responsiveWidth,
        responsiveHeight: state.responsiveHeight,
        osMode: state.osMode,
      }),
    }
  )
)
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/devtools/useDevToolsStore.ts
git commit -m "feat: add Zustand devtools store with persistence"
```

---

## Task 4: StatusBar Component

**Files:**
- Create: `src/preview/StatusBar.tsx`

**Step 1: Create the StatusBar component**

Create `src/preview/StatusBar.tsx`. This renders a mobile-style status bar with time, signal, wifi, and battery indicators.

```tsx
import { cn } from '@/lib/utils'
import type { OsMode } from '@/devtools/useDevToolsStore'

interface StatusBarProps {
  osMode: OsMode
  height: number
  showDynamicIsland?: boolean
}

function TimeDisplay({ className }: { className?: string }) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return <span className={className}>{time}</span>
}

function SignalBars({ className }: { className?: string }) {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" className={className}>
      <rect x="0" y="9" width="3" height="3" rx="0.5" fill="currentColor" />
      <rect x="4.5" y="6" width="3" height="6" rx="0.5" fill="currentColor" />
      <rect x="9" y="3" width="3" height="9" rx="0.5" fill="currentColor" />
      <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="currentColor" />
    </svg>
  )
}

function WifiIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" className={className}>
      <path d="M8 11.5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z" fill="currentColor" />
      <path d="M4.93 7.57a4.5 4.5 0 016.14 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M2.1 4.73a8 8 0 0111.8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function BatteryIcon({ className }: { className?: string }) {
  return (
    <svg width="28" height="12" viewBox="0 0 28 12" className={className}>
      <rect x="0.5" y="0.5" width="23" height="11" rx="2" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.35" />
      <rect x="24.5" y="3.5" width="2" height="5" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="2" y="2" width="20" height="8" rx="1" fill="currentColor" />
    </svg>
  )
}

export function StatusBar({ osMode, height, showDynamicIsland = false }: StatusBarProps) {
  const isDark = osMode === 'dark'

  return (
    <div
      className={cn(
        'flex shrink-0 items-end justify-between px-6 pb-1',
        isDark ? 'text-white' : 'text-black'
      )}
      style={{ height }}
    >
      <TimeDisplay className="text-[15px] font-semibold leading-none" />

      {showDynamicIsland && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 h-[37px] w-[126px] rounded-full bg-black" />
      )}

      <div className="flex items-center gap-1.5">
        <SignalBars />
        <WifiIcon />
        <BatteryIcon />
      </div>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/preview/StatusBar.tsx
git commit -m "feat: add StatusBar component with signal, wifi, and battery icons"
```

---

## Task 5: HomeIndicator Component

**Files:**
- Create: `src/preview/HomeIndicator.tsx`

**Step 1: Create the HomeIndicator component**

Create `src/preview/HomeIndicator.tsx`:

```tsx
import { cn } from '@/lib/utils'
import type { OsMode } from '@/devtools/useDevToolsStore'

interface HomeIndicatorProps {
  osMode: OsMode
}

export function HomeIndicator({ osMode }: HomeIndicatorProps) {
  const isDark = osMode === 'dark'

  return (
    <div className="flex shrink-0 items-center justify-center pb-2 pt-1">
      <div
        className={cn(
          'h-[5px] w-[134px] rounded-full',
          isDark ? 'bg-white/60' : 'bg-black/30'
        )}
      />
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/preview/HomeIndicator.tsx
git commit -m "feat: add HomeIndicator component"
```

---

## Task 6: MobileFrame Component

**Files:**
- Create: `src/preview/MobileFrame.tsx`

**Step 1: Create the MobileFrame component**

Create `src/preview/MobileFrame.tsx`. This renders a phone bezel with status bar, viewport, and optional home indicator.

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { DeviceDefinition } from '@/preview/device-frames'
import type { OsMode } from '@/devtools/useDevToolsStore'
import { StatusBar } from '@/preview/StatusBar'
import { HomeIndicator } from '@/preview/HomeIndicator'

interface MobileFrameProps {
  device: DeviceDefinition
  osMode: OsMode
  children: ReactNode
}

export function MobileFrame({ device, osMode, children }: MobileFrameProps) {
  const isDark = osMode === 'dark'

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-[44px] border-[3px]',
        isDark
          ? 'border-neutral-700 bg-neutral-900'
          : 'border-neutral-300 bg-white'
      )}
      style={{ width: device.width, height: device.height }}
    >
      <StatusBar
        osMode={osMode}
        height={device.statusBarHeight}
        showDynamicIsland={device.notch === 'dynamic-island'}
      />

      <div
        className="flex-1 overflow-y-auto"
        data-theme={osMode}
      >
        {children}
      </div>

      {device.homeIndicator && (
        <HomeIndicator osMode={osMode} />
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/preview/MobileFrame.tsx
git commit -m "feat: add MobileFrame component with status bar and home indicator"
```

---

## Task 7: BrowserFrame Component

**Files:**
- Create: `src/preview/BrowserFrame.tsx`

**Step 1: Create the BrowserFrame component**

Create `src/preview/BrowserFrame.tsx`. This renders a simplified browser chrome with address bar.

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Globe, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import type { DeviceDefinition } from '@/preview/device-frames'
import type { OsMode } from '@/devtools/useDevToolsStore'

interface BrowserFrameProps {
  device: DeviceDefinition
  osMode: OsMode
  children: ReactNode
}

export function BrowserFrame({ device, osMode, children }: BrowserFrameProps) {
  const isDark = osMode === 'dark'

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border',
        isDark
          ? 'border-neutral-700 bg-neutral-900'
          : 'border-neutral-300 bg-white'
      )}
      style={{ width: device.width, height: device.height }}
    >
      {/* Browser chrome */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 border-b px-3 py-2',
          isDark
            ? 'border-neutral-700 bg-neutral-800'
            : 'border-neutral-200 bg-neutral-100'
        )}
      >
        {/* Traffic lights */}
        <div className="flex gap-1.5">
          <div className="size-3 rounded-full bg-red-400" />
          <div className="size-3 rounded-full bg-yellow-400" />
          <div className="size-3 rounded-full bg-green-400" />
        </div>

        {/* Navigation buttons */}
        <div className={cn('flex gap-1', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
          <ChevronLeft className="size-4" />
          <ChevronRight className="size-4" />
          <RotateCw className="size-3.5" />
        </div>

        {/* Address bar */}
        <div
          className={cn(
            'flex flex-1 items-center gap-2 rounded-md px-3 py-1 text-sm',
            isDark
              ? 'bg-neutral-700 text-neutral-300'
              : 'bg-white text-neutral-600'
          )}
        >
          <Globe className="size-3.5 shrink-0" />
          <span className="truncate">localhost:5173</span>
        </div>
      </div>

      {/* Viewport */}
      <div
        className="flex-1 overflow-y-auto"
        data-theme={osMode}
      >
        {children}
      </div>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/preview/BrowserFrame.tsx
git commit -m "feat: add BrowserFrame component with browser chrome"
```

---

## Task 8: ResizableFrame Component

**Files:**
- Create: `src/preview/ResizableFrame.tsx`

**Step 1: Create the ResizableFrame component**

Create `src/preview/ResizableFrame.tsx`. This renders a frameless viewport with drag handles and a dimension label.

```tsx
import { type ReactNode, useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { OsMode } from '@/devtools/useDevToolsStore'

interface ResizableFrameProps {
  width: number
  height: number
  osMode: OsMode
  onResize: (width: number, height: number) => void
  children: ReactNode
}

type ResizeEdge = 'right' | 'bottom' | 'corner'

export function ResizableFrame({
  width,
  height,
  osMode,
  onResize,
  children,
}: ResizableFrameProps) {
  const isDark = osMode === 'dark'
  const dragRef = useRef<{
    edge: ResizeEdge
    startX: number
    startY: number
    startW: number
    startH: number
  } | null>(null)

  const [dragging, setDragging] = useState(false)

  const handlePointerDown = useCallback(
    (edge: ResizeEdge) => (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      dragRef.current = {
        edge,
        startX: e.clientX,
        startY: e.clientY,
        startW: width,
        startH: height,
      }
      setDragging(true)
    },
    [width, height]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return

      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY

      const nextW =
        drag.edge === 'right' || drag.edge === 'corner'
          ? Math.max(200, drag.startW + dx)
          : drag.startW

      const nextH =
        drag.edge === 'bottom' || drag.edge === 'corner'
          ? Math.max(200, drag.startH + dy)
          : drag.startH

      onResize(Math.round(nextW), Math.round(nextH))
    },
    [onResize]
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
    setDragging(false)
  }, [])

  return (
    <div
      className="relative"
      style={{ width, height }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Viewport */}
      <div
        className={cn(
          'h-full w-full overflow-y-auto rounded-md border',
          isDark
            ? 'border-neutral-700 bg-neutral-900'
            : 'border-neutral-300 bg-white'
        )}
        data-theme={osMode}
      >
        {children}
      </div>

      {/* Right edge handle */}
      <div
        className="absolute -right-2 top-0 h-full w-4 cursor-ew-resize"
        onPointerDown={handlePointerDown('right')}
      >
        <div
          className={cn(
            'absolute right-1.5 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full',
            dragging ? 'bg-blue-500' : 'bg-neutral-400'
          )}
        />
      </div>

      {/* Bottom edge handle */}
      <div
        className="absolute -bottom-2 left-0 h-4 w-full cursor-ns-resize"
        onPointerDown={handlePointerDown('bottom')}
      >
        <div
          className={cn(
            'absolute bottom-1.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full',
            dragging ? 'bg-blue-500' : 'bg-neutral-400'
          )}
        />
      </div>

      {/* Corner handle */}
      <div
        className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize"
        onPointerDown={handlePointerDown('corner')}
      >
        <div
          className={cn(
            'absolute bottom-1 right-1 size-2 rounded-sm',
            dragging ? 'bg-blue-500' : 'bg-neutral-400'
          )}
        />
      </div>

      {/* Dimension label */}
      <div
        className={cn(
          'absolute -bottom-7 left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 text-xs font-mono',
          isDark
            ? 'bg-neutral-800 text-neutral-400'
            : 'bg-neutral-100 text-neutral-500'
        )}
      >
        {width} x {height}
      </div>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/preview/ResizableFrame.tsx
git commit -m "feat: add ResizableFrame component with drag handles"
```

---

## Task 9: DeviceFrame Orchestrator

**Files:**
- Create: `src/preview/DeviceFrame.tsx`

**Step 1: Create the DeviceFrame orchestrator**

Create `src/preview/DeviceFrame.tsx`. This auto-scales the frame to fit its container and delegates to the correct frame type.

```tsx
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { DeviceDefinition } from '@/preview/device-frames'
import type { OsMode } from '@/devtools/useDevToolsStore'
import { MobileFrame } from '@/preview/MobileFrame'
import { BrowserFrame } from '@/preview/BrowserFrame'
import { ResizableFrame } from '@/preview/ResizableFrame'

interface DeviceFrameProps {
  device: DeviceDefinition
  osMode: OsMode
  responsiveWidth: number
  responsiveHeight: number
  onResponsiveResize: (width: number, height: number) => void
  children: ReactNode
}

export function DeviceFrame({
  device,
  osMode,
  responsiveWidth,
  responsiveHeight,
  onResponsiveResize,
  children,
}: DeviceFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const frameWidth =
    device.category === 'responsive' ? responsiveWidth : device.width
  const frameHeight =
    device.category === 'responsive' ? responsiveHeight : device.height

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(([entry]) => {
      const { width: cw, height: ch } = entry.contentRect
      // Leave padding around the frame (40px each side)
      const availableW = cw - 80
      const availableH = ch - 80
      const nextScale = Math.min(
        1,
        availableW / frameWidth,
        availableH / frameHeight
      )
      setScale(Math.max(0.1, nextScale))
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [frameWidth, frameHeight])

  function renderFrame() {
    switch (device.category) {
      case 'mobile':
        return (
          <MobileFrame device={device} osMode={osMode}>
            {children}
          </MobileFrame>
        )
      case 'browser':
        return (
          <BrowserFrame device={device} osMode={osMode}>
            {children}
          </BrowserFrame>
        )
      case 'responsive':
        return (
          <ResizableFrame
            width={responsiveWidth}
            height={responsiveHeight}
            osMode={osMode}
            onResize={onResponsiveResize}
          >
            {children}
          </ResizableFrame>
        )
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-1 items-center justify-center overflow-hidden"
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {renderFrame()}
      </div>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/preview/DeviceFrame.tsx
git commit -m "feat: add DeviceFrame orchestrator with auto-scaling"
```

---

## Task 10: Variant Component

**Files:**
- Create: `src/content/Variant.tsx`

**Step 1: Create the Variant component**

Create `src/content/Variant.tsx`. This conditionally renders children based on the active state.

```tsx
import { type ReactNode, createContext, useContext } from 'react'

interface VariantContextValue {
  activeState: string | null
}

const VariantContext = createContext<VariantContextValue>({
  activeState: null,
})

export function VariantProvider({
  activeState,
  children,
}: {
  activeState: string | null
  children: ReactNode
}) {
  return (
    <VariantContext.Provider value={{ activeState }}>
      {children}
    </VariantContext.Provider>
  )
}

interface VariantProps {
  state: string
  children: ReactNode
}

export function Variant({ state, children }: VariantProps) {
  const { activeState } = useContext(VariantContext)

  // If no active state is set, show the first variant (caller decides)
  // If active state matches this variant's state, render children
  if (activeState !== null && activeState !== state) {
    return null
  }

  return <>{children}</>
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/content/Variant.tsx
git commit -m "feat: add Variant component for MDX state filtering"
```

---

## Task 11: Built-in MDX Components

**Files:**
- Create: `src/content/mdx-components.tsx`

**Step 1: Create built-in MDX components**

Create `src/content/mdx-components.tsx`. These are the components available inside MDX files without importing. They use Tailwind and respect `data-theme`.

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Variant } from '@/content/Variant'

// Re-export Variant so it's available in MDX
export { Variant }

interface MdxButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
}: MdxButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        {
          'bg-neutral-900 text-white hover:bg-neutral-800 [data-theme=dark]_&:bg-white [data-theme=dark]_&:text-neutral-900':
            variant === 'primary',
          'bg-neutral-100 text-neutral-900 hover:bg-neutral-200':
            variant === 'secondary',
          'border border-neutral-300 bg-transparent hover:bg-neutral-50':
            variant === 'outline',
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

interface MdxCardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className }: MdxCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-200 bg-white p-6 shadow-sm',
        className
      )}
    >
      {children}
    </div>
  )
}

interface MdxInputProps {
  placeholder?: string
  type?: string
  label?: string
  className?: string
}

export function Input({
  placeholder,
  type = 'text',
  label,
  className,
}: MdxInputProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-neutral-700">
          {label}
        </label>
      )}
      <input
        type={type}
        placeholder={placeholder}
        className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
      />
    </div>
  )
}

interface MdxBadgeProps {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error'
  className?: string
}

export function Badge({
  children,
  variant = 'default',
  className,
}: MdxBadgeProps) {
  return (
    <span
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

interface MdxNoteProps {
  children: ReactNode
  type?: 'info' | 'warning' | 'error' | 'success'
  className?: string
}

export function Note({
  children,
  type = 'info',
  className,
}: MdxNoteProps) {
  return (
    <div
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

/**
 * Component map provided to MDX runtime.
 * These are available in MDX files without importing.
 */
export const mdxComponents = {
  Variant,
  Button,
  Card,
  Input,
  Badge,
  Note,
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/content/mdx-components.tsx
git commit -m "feat: add built-in MDX components (Button, Card, Input, Badge, Note)"
```

---

## Task 12: Content Loader and Renderer

**Files:**
- Create: `src/content/ContentRenderer.tsx`
- Create: `src/content/useContentModules.ts`

**Step 1: Create the content module loader hook**

Create `src/content/useContentModules.ts`. Uses Vite's `import.meta.glob` to discover and load MDX files.

```typescript
import { useMemo } from 'react'
import type { ComponentType } from 'react'

interface ContentModule {
  default: ComponentType
  frontmatter?: {
    type?: 'region' | 'screen' | 'flow'
    states?: Record<string, { description?: string }>
    [key: string]: unknown
  }
}

export interface ContentEntry {
  route: string
  module: () => Promise<ContentModule>
  frontmatter?: ContentModule['frontmatter']
}

// Vite eager-loads frontmatter, lazy-loads the component
const mdxModules = import.meta.glob<ContentModule>(
  '/content/**/*.mdx'
)

// Eager import for frontmatter only (if available)
const mdxFrontmatters = import.meta.glob<ContentModule>(
  '/content/**/*.mdx',
  { eager: true }
)

function filePathToRoute(filePath: string): string {
  return filePath
    .replace(/^\/content/, '')
    .replace(/\.mdx$/, '')
    .replace(/\/index$/, '/')
}

export function useContentModules(): ContentEntry[] {
  return useMemo(() => {
    return Object.entries(mdxModules).map(([filePath, loader]) => ({
      route: filePathToRoute(filePath),
      module: loader,
      frontmatter: mdxFrontmatters[filePath]?.frontmatter,
    }))
  }, [])
}

export function useContentRoutes(): string[] {
  const modules = useContentModules()
  return useMemo(() => modules.map((m) => m.route), [modules])
}
```

**Step 2: Create the ContentRenderer component**

Create `src/content/ContentRenderer.tsx`:

```tsx
import { Suspense, lazy, useMemo } from 'react'
import { VariantProvider } from '@/content/Variant'
import { mdxComponents } from '@/content/mdx-components'
import { useContentModules } from '@/content/useContentModules'
import { MDXProvider } from '@mdx-js/react'

interface ContentRendererProps {
  route: string | null
  activeState: string | null
}

export function ContentRenderer({ route, activeState }: ContentRendererProps) {
  const modules = useContentModules()

  const MdxComponent = useMemo(() => {
    if (!route) return null
    const entry = modules.find((m) => m.route === route)
    if (!entry) return null
    return lazy(async () => {
      const mod = await entry.module()
      return { default: mod.default }
    })
  }, [route, modules])

  if (!route) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-neutral-400">
        <p>Select a content file to preview</p>
      </div>
    )
  }

  if (!MdxComponent) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-neutral-400">
        <p>Content not found: {route}</p>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center p-8 text-neutral-400">
          Loading...
        </div>
      }
    >
      <MDXProvider components={mdxComponents}>
        <VariantProvider activeState={activeState}>
          <div className="p-4">
            <MdxComponent />
          </div>
        </VariantProvider>
      </MDXProvider>
    </Suspense>
  )
}
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors. (Note: may need to adjust `tsconfig.app.json` `include` to allow `/content/` if glob doesn't resolve — check in step 4.)

**Step 4: Commit**

```bash
git add src/content/ContentRenderer.tsx src/content/useContentModules.ts
git commit -m "feat: add content loader and renderer with MDX provider"
```

---

## Task 13: DevToolsBar Component

**Files:**
- Create: `src/devtools/DevToolsBar.tsx`

**Prerequisite:** Add shadcn Select component.

**Step 1: Add shadcn Select component**

```bash
pnpm dlx shadcn@latest add select
```

**Step 2: Create the DevToolsBar component**

Create `src/devtools/DevToolsBar.tsx`:

```tsx
import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { getAllDevices, getDevice, type DeviceType } from '@/preview/device-frames'
import { useContentModules } from '@/content/useContentModules'

export function DevToolsBar() {
  const activeDevice = useDevToolsStore((s) => s.activeDevice)
  const setActiveDevice = useDevToolsStore((s) => s.setActiveDevice)
  const osMode = useDevToolsStore((s) => s.osMode)
  const toggleOsMode = useDevToolsStore((s) => s.toggleOsMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const setSelectedRoute = useDevToolsStore((s) => s.setSelectedRoute)
  const selectedState = useDevToolsStore((s) => s.selectedState)
  const setSelectedState = useDevToolsStore((s) => s.setSelectedState)
  const responsiveWidth = useDevToolsStore((s) => s.responsiveWidth)
  const responsiveHeight = useDevToolsStore((s) => s.responsiveHeight)

  const modules = useContentModules()
  const currentModule = modules.find((m) => m.route === selectedRoute)
  const states = currentModule?.frontmatter?.states
  const stateKeys = states ? Object.keys(states) : []

  const device = getDevice(activeDevice)
  const displayWidth =
    device.category === 'responsive' ? responsiveWidth : device.width
  const displayHeight =
    device.category === 'responsive' ? responsiveHeight : device.height

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2">
      {/* Device selector */}
      <Select
        value={activeDevice}
        onValueChange={(value) => setActiveDevice(value as DeviceType)}
      >
        <SelectTrigger className="w-[180px]">
          <Monitor className="size-4" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {getAllDevices().map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* OS Mode toggle */}
      <Button
        variant="outline"
        size="icon-sm"
        onClick={toggleOsMode}
        title={`Switch to ${osMode === 'light' ? 'dark' : 'light'} mode`}
      >
        {osMode === 'light' ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
      </Button>

      {/* Content route selector */}
      {modules.length > 0 && (
        <Select
          value={selectedRoute ?? ''}
          onValueChange={(value) => setSelectedRoute(value || null)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select content..." />
          </SelectTrigger>
          <SelectContent>
            {modules.map((m) => (
              <SelectItem key={m.route} value={m.route}>
                {m.route}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* State selector (only when content has states) */}
      {stateKeys.length > 0 && (
        <Select
          value={selectedState ?? ''}
          onValueChange={(value) => setSelectedState(value || null)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="State..." />
          </SelectTrigger>
          <SelectContent>
            {stateKeys.map((key) => (
              <SelectItem key={key} value={key}>
                {key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Dimension readout */}
      <span className="font-mono text-xs text-neutral-400">
        {displayWidth} x {displayHeight}
      </span>
    </div>
  )
}
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/devtools/DevToolsBar.tsx src/components/ui/select.tsx
git commit -m "feat: add DevToolsBar with device, OS mode, route, and state selectors"
```

---

## Task 14: Wire Up App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Replace welcome page with preview tool layout**

Replace the contents of `src/App.tsx`:

```tsx
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { DevToolsBar } from '@/devtools/DevToolsBar'
import { DeviceFrame } from '@/preview/DeviceFrame'
import { ContentRenderer } from '@/content/ContentRenderer'
import { getDevice } from '@/preview/device-frames'

function App() {
  const activeDevice = useDevToolsStore((s) => s.activeDevice)
  const osMode = useDevToolsStore((s) => s.osMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const selectedState = useDevToolsStore((s) => s.selectedState)
  const responsiveWidth = useDevToolsStore((s) => s.responsiveWidth)
  const responsiveHeight = useDevToolsStore((s) => s.responsiveHeight)
  const setResponsiveSize = useDevToolsStore((s) => s.setResponsiveSize)

  const device = getDevice(activeDevice)

  return (
    <div className="flex h-svh flex-col bg-neutral-50">
      <DevToolsBar />

      <DeviceFrame
        device={device}
        osMode={osMode}
        responsiveWidth={responsiveWidth}
        responsiveHeight={responsiveHeight}
        onResponsiveResize={setResponsiveSize}
      >
        <ContentRenderer
          route={selectedRoute}
          activeState={selectedState}
        />
      </DeviceFrame>
    </div>
  )
}

export default App
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Verify dev server starts**

```bash
pnpm dev
```

Expected: Dev server starts. Page shows toolbar at top with device selector, OS mode toggle, and dimension readout. Centered device frame shows "Select a content file to preview".

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire up App layout with DevToolsBar and DeviceFrame"
```

---

## Task 15: Sample MDX Content

**Files:**
- Create: `content/hello.mdx`
- Create: `content/login-form.mdx`

**Step 1: Create a simple hello world MDX file**

Create `content/hello.mdx`:

```mdx
---
type: region
---

# Hello Preview Tool

This is a sample MDX file rendered inside a device frame.

<Card>
  <p>This card is a built-in MDX component.</p>
  <Button>Click me</Button>
</Card>

<Note type="info">
  Edit this file and watch it hot-reload inside the device frame.
</Note>
```

**Step 2: Create a stateful MDX file with Variants**

Create `content/login-form.mdx`:

```mdx
---
type: region
states:
  idle:
    description: Empty login form
  filling:
    description: User is typing credentials
  error:
    description: Login failed with error message
  success:
    description: Login succeeded
---

# Login

<Variant state="idle">
  <Card>
    <Input label="Email" placeholder="you@example.com" />
    <Input label="Password" type="password" placeholder="Enter password" />
    <Button>Sign In</Button>
  </Card>
</Variant>

<Variant state="filling">
  <Card>
    <Input label="Email" placeholder="you@example.com" />
    <Input label="Password" type="password" placeholder="Enter password" />
    <Button>Sign In</Button>
    <p className="text-sm text-neutral-500">Typing...</p>
  </Card>
</Variant>

<Variant state="error">
  <Card>
    <Note type="error">Invalid email or password. Please try again.</Note>
    <Input label="Email" placeholder="you@example.com" />
    <Input label="Password" type="password" placeholder="Enter password" />
    <Button>Sign In</Button>
  </Card>
</Variant>

<Variant state="success">
  <Card>
    <Note type="success">Welcome back! Redirecting...</Note>
  </Card>
</Variant>
```

**Step 3: Verify content loads in dev server**

```bash
pnpm dev
```

Expected:
1. DevToolsBar shows two content routes: `/hello` and `/login-form`
2. Selecting `/hello` renders the hello page inside the device frame
3. Selecting `/login-form` shows state dropdown with: idle, filling, error, success
4. Switching states shows the corresponding variant content
5. Switching devices changes the frame (iPhone → Pixel → Desktop → etc.)
6. Toggling OS mode flips the device chrome between light/dark

**Step 4: Commit**

```bash
git add content/hello.mdx content/login-form.mdx
git commit -m "feat: add sample MDX content with hello world and stateful login form"
```

---

## Task 16: Final Verification and Cleanup

**Step 1: Run full build**

```bash
pnpm build
```

Expected: Build succeeds. Check `dist/` contains the built output.

**Step 2: Run lint**

```bash
pnpm lint
```

Expected: No lint errors. Fix any issues found.

**Step 3: Test hot reload**

1. Start dev server: `pnpm dev`
2. Select `/hello` content
3. Edit `content/hello.mdx` — change the heading text
4. Verify the change appears instantly in the device frame without page reload

**Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore: fix lint and build issues"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Install deps + configure MDX in Vite | `package.json`, `vite.config.ts`, `src/mdx.d.ts` |
| 2 | Device frame types and metadata | `src/preview/device-frames.ts` |
| 3 | Zustand devtools store | `src/devtools/useDevToolsStore.ts` |
| 4 | StatusBar component | `src/preview/StatusBar.tsx` |
| 5 | HomeIndicator component | `src/preview/HomeIndicator.tsx` |
| 6 | MobileFrame component | `src/preview/MobileFrame.tsx` |
| 7 | BrowserFrame component | `src/preview/BrowserFrame.tsx` |
| 8 | ResizableFrame component | `src/preview/ResizableFrame.tsx` |
| 9 | DeviceFrame orchestrator | `src/preview/DeviceFrame.tsx` |
| 10 | Variant component | `src/content/Variant.tsx` |
| 11 | Built-in MDX components | `src/content/mdx-components.tsx` |
| 12 | Content loader + renderer | `src/content/ContentRenderer.tsx`, `src/content/useContentModules.ts` |
| 13 | DevToolsBar toolbar | `src/devtools/DevToolsBar.tsx` |
| 14 | Wire up App.tsx | `src/App.tsx` |
| 15 | Sample MDX content | `content/hello.mdx`, `content/login-form.mdx` |
| 16 | Final verification | Build, lint, hot reload test |

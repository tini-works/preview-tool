# Preview Tool Design

## Summary

A general-purpose, standalone React/Vite app that renders MDX content inside realistic device frames with live reload and devtools controls. Inspired by docliq-proto's DevTools system and quickable's MDX content model.

## Goals

1. Render MDX files inside device viewport frames (phones, tablets, browsers, responsive)
2. Live-reload content when MDX files change on disk
3. Toggle light/dark OS mode that affects the frame and content
4. Switch between 6 device frames with auto-scaling
5. Support quickable's content model: regions with states via `<Variant>` blocks
6. Ship built-in MDX components (Button, Card, Input, Badge, Note, Variant)
7. Standalone app first, extractable as a library later

## Architecture

**Approach:** Monolithic app with clear folder boundaries.

```
src/
  app/
    App.tsx                    # Root layout: toolbar + frame + content
    main.tsx                   # Entry point
  preview/
    DeviceFrame.tsx            # Scaled device frame container
    MobileFrame.tsx            # Phone chrome (notch, status bar, home indicator)
    BrowserFrame.tsx           # Browser chrome (address bar, tabs)
    ResizableFrame.tsx         # Free-resize viewport with drag handles
    StatusBar.tsx              # iOS/Android status bar
    HomeIndicator.tsx          # Bottom swipe indicator
    device-frames.ts           # Device dimensions & metadata
  content/
    useMdxContent.ts           # Hook: load compiled MDX component for route
    content-tree.ts            # Build navigation tree from MDX file metadata
    frontmatter.ts             # Parse/validate frontmatter
    ContentRenderer.tsx        # Renders MDX component with state filtering
    Variant.tsx                # <Variant state="x"> conditional renderer
  devtools/
    DevToolsBar.tsx            # Top toolbar
    useDevToolsStore.ts        # Zustand store for devtools state
  components/ui/               # shadcn/ui components (existing)
  lib/
    utils.ts                   # cn() utility (existing)
  index.css                    # Tailwind styles (existing)
```

MDX content lives outside `src/` in a configurable content directory (e.g., `./content/`).

## Device Frame System

Six viewport frames, all auto-scaled via ResizeObserver + CSS transform:

| Frame | Width | Height | Chrome |
|-------|-------|--------|--------|
| iPhone 15 Pro | 393 | 852 | Dynamic Island + status bar + home indicator |
| iPhone SE | 375 | 667 | Status bar + home button |
| Pixel 8 | 412 | 915 | Punch hole + status bar + nav bar |
| iPad Mini | 744 | 1133 | Minimal bezel |
| Desktop | 1280 | 800 | Browser chrome (address bar, tabs) |
| Responsive | Resizable | Resizable | Drag handles + dimension label |

**Scaling formula:**
```
fitScale = min(1, containerHeight / deviceHeight, containerWidth / deviceWidth)
transform: scale(fitScale)
```

**OS Mode:**
- `data-theme="light|dark"` on viewport div
- StatusBar text color adapts
- Device background adapts
- Content can respond via CSS `[data-theme="dark"]` selectors

## MDX Content Pipeline

```
.mdx files in content/
  → @mdx-js/rollup (Vite plugin) compiles to React components
  → remark-frontmatter + remark-mdx-frontmatter extract metadata
  → import.meta.glob('./content/**/*.mdx') discovers all files
  → Content tree built from file paths + frontmatter
  → Vite HMR watches files → hot-reloads on change
```

**Frontmatter schema (from quickable):**
```yaml
type: region          # region | screen | flow
states:
  idle: { description: "Empty form" }
  filling: { description: "User typing" }
  error: { description: "Validation failed" }
```

**Variant component:**
```tsx
<Variant state="idle">
  <p>Empty form content here</p>
</Variant>
<Variant state="filling">
  <p>Form with user input</p>
</Variant>
```

Only the active variant renders based on selected state.

## DevTools State (Zustand)

```typescript
interface DevToolsState {
  activeDevice: DeviceType
  responsiveWidth: number
  responsiveHeight: number
  osMode: 'light' | 'dark'
  selectedRoute: string | null
  selectedState: string | null

  setActiveDevice: (device: DeviceType) => void
  setOsMode: (mode: 'light' | 'dark') => void
  setSelectedRoute: (route: string) => void
  setSelectedState: (state: string | null) => void
  setResponsiveSize: (w: number, h: number) => void
}
```

Persisted to localStorage (device selection and OS mode survive reload).

## DevToolsBar Layout

```
[ Device: iPhone 15 Pro ▾ ]  [ Light / Dark ]  [ State: idle ▾ ]  [ 393 x 852 ]
```

## App Layout

```
┌──────────────────────────────────────────────┐
│  DevToolsBar                                  │
├──────────────────────────────────────────────┤
│                                              │
│          ┌──────────────────┐                │
│          │   Device Frame   │                │
│          │  ┌────────────┐  │                │
│          │  │ StatusBar  │  │                │
│          │  ├────────────┤  │                │
│          │  │            │  │                │
│          │  │ MDX Content│  │                │
│          │  │            │  │                │
│          │  ├────────────┤  │                │
│          │  │ HomeIndicator│ │               │
│          │  └────────────┘  │                │
│          └──────────────────┘                │
│                                              │
└──────────────────────────────────────────────┘
```

Centered frame, no sidebars for MVP. Sidebars (catalog, inspector) planned for later.

## Built-in MDX Components

| Component | Purpose |
|-----------|---------|
| Variant | Conditional rendering by state |
| Button | Styled button for mockups |
| Card | Content card |
| Input | Form input |
| Badge | Status badge |
| Note | Callout/annotation |

These use Tailwind classes and respect the `data-theme` attribute for dark mode.

## Tech Stack

- React 19 + TypeScript 5.9 (existing)
- Vite 7 with @mdx-js/rollup plugin (new)
- Tailwind CSS v4 (existing)
- Zustand for devtools state (new)
- shadcn/ui for toolbar controls (existing)
- lucide-react for icons (existing)

## New Dependencies

- `@mdx-js/rollup` — MDX compilation for Vite
- `@mdx-js/react` — MDX React provider
- `remark-frontmatter` — Parse YAML frontmatter
- `remark-mdx-frontmatter` — Expose frontmatter as export
- `remark-gfm` — GitHub-flavored markdown
- `zustand` — State management
- `gray-matter` — Frontmatter extraction (if needed beyond remark)

## Future Enhancements (Not MVP)

- Catalog sidebar (left) for navigating content tree
- Inspector sidebar (right) for screen specs and controls
- Network simulation (online/slow-3g/offline)
- Error state overlays (404, 500, maintenance)
- Font scaling
- Feature flags
- Scenarios and personas
- Flow stepping (multi-screen journeys)
- Static export mode
- CLI wrapper for pointing at external content directories
- npm package extraction for use as a Vite plugin

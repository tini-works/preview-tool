# Interactive Flow System Design

**Date:** 2026-02-25
**Status:** Approved

## Goal

Add clickable prototype behavior to MDX screens via a separate `flow.yaml` config file, supporting both screen-to-screen navigation and in-screen state transitions with instant switching.

## Decisions

- **Interaction definition:** Separate `flow.yaml` per flow directory (not inline in MDX)
- **Trigger matching:** ID-based using `ComponentName:TextContent` patterns
- **Transitions:** Instant switch (no animations)
- **Activation:** Play mode toggle in Inspector panel
- **MDX changes:** Zero — components auto-inject `data-flow-target` attributes

## Architecture

### New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `src/flow/FlowEngine.ts` | Parse flow.yaml, resolve triggers, dispatch actions | ~80 |
| `src/flow/FlowProvider.tsx` | React context with event delegation click handler | ~60 |
| `src/flow/useFlowConfig.ts` | Vite glob loader for flow.yaml files | ~40 |
| `src/flow/trigger-matcher.ts` | Match DOM click targets to trigger patterns | ~50 |
| `content/booking/flow.yaml` | Flow config for 7-screen booking flow | ~60 |

### Modified Files

| File | Change |
|------|--------|
| `src/content/mdx-components.tsx` | Wrap components with `data-flow-target` injection |
| `src/content/ContentRenderer.tsx` | Wrap output with `FlowProvider` |
| `src/devtools/InspectorPanel.tsx` | Add Play mode toggle + breadcrumb trail |
| `src/devtools/useDevToolsStore.ts` | Add `playMode`, `flowHistory` state |

## Flow Config Format

```yaml
name: Booking Appointment
startRoute: /booking/type
startState: acute

actions:
  /booking/type:
    - trigger: "RadioCard:Acute"
      setState: acute
    - trigger: "RadioCard:Prevention"
      setState: prevention
    - trigger: "RadioCard:Follow-up"
      setState: follow-up
    - trigger: "Button:Save"
      navigate: /booking/doctor
      navigateState: browsing

  /booking/doctor:
    - trigger: "Avatar:AS"
      setState: selected
    - trigger: "ListItem:Specialty"
      setState: specialty-drawer
    - trigger: "Button:Continue"
      navigate: /booking/patient
```

### Trigger Patterns

| Pattern | Matches |
|---------|---------|
| `Button:Save` | Button component with text "Save" |
| `RadioCard:Acute` | RadioCard with text "Acute" |
| `ListItem:Specialty` | ListItem with label prop "Specialty" |
| `ScreenHeader:back` | Back arrow in ScreenHeader |
| `Avatar:AS` | Avatar with initials "AS" |

### Special Matching Rules

- `ListItem` matches on `label` prop, not children
- `ScreenHeader` exposes virtual `back` target
- First match wins if multiple elements share a trigger

## Data Flow

```
User clicks element in preview
        |
        v
FlowProvider intercepts click (event delegation on wrapper div)
        |
        v
trigger-matcher resolves clicked element -> "RadioCard:Acute"
        |
        v
FlowEngine looks up action for current route + trigger
        |
        v
Action found? -> dispatch setState / navigate / both
        |                    |
        v                    v
useDevToolsStore        useDevToolsStore
 .setSelectedState()     .setSelectedRoute()
```

## Component Enhancement

MDX components auto-inject `data-flow-target` via a wrapper HOC:

```tsx
// Transparent wrapping - no MDX file changes needed
<RadioCard selected>Acute</RadioCard>
// Renders: <div data-flow-target="RadioCard:Acute" ...>Acute</div>
```

## Play Mode

- Toggle button in Inspector panel
- ON: clicks trigger flow actions, breadcrumb shows navigation history
- OFF: static preview (current behavior)
- Breadcrumb enables jumping back to previous screens

## What Stays Unchanged

- All existing MDX content files
- Device frame system
- Catalog panel
- Build/Vite configuration

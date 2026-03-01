# CLI MVC Generation Design

**Date**: 2026-03-01
**Status**: Approved

## Summary

Upgrade the `preview generate` command to produce three structured artifacts per screen: **View** (component tree), **Model** (regions + mock data), and **Controller** (flows + behavioral model). Build V uses static AST analysis. Build M+C uses a single LLM call with Ollama-first, cloud-fallback, heuristic-last strategy.

## Target User

External developers who install `@preview-tool/cli` in their React project. No modifications to their production code required.

## Pipeline Architecture

```
preview generate
  |
  +-- Phase 1: Discover
  |     discover.ts (existing) -> ScreenInfo[]
  |
  +-- Phase 2: Build V (per screen, parallel, no LLM)
  |     analyze-view.ts (ts-morph AST) -> ViewTree
  |       - Nested component hierarchy
  |       - Props interface at each node
  |       - Import source (ui / block / local / external)
  |
  +-- Phase 3: Build M+C (per screen, single LLM call)
  |     generate-model-controller.ts
  |       - Input: ViewTree + raw source code
  |       - LLM provider: Ollama -> Claude -> OpenAI -> heuristic
  |       - Output: Zod-validated JSON -> model.ts + controller.ts
  |
  +-- Phase 4: Write Artifacts
        .preview/screens/{screen-name}/
          view.ts, model.ts, controller.ts, adapter.ts
```

## Build V: View Tree Analysis

Static AST analysis using ts-morph. No LLM required.

### Output Types

```typescript
interface ViewNode {
  component: string          // "Card", "DataTable", "Button"
  source: 'ui' | 'block' | 'local' | 'external'
  importPath: string         // "@/components/ui/card"
  props: PropDefinition[]
  children: ViewNode[]
}

interface PropDefinition {
  name: string               // "columns", "onClick"
  type: string               // "ColumnDef[]", "() => void"
  required: boolean
  defaultValue?: string
}

interface ViewTree {
  screenName: string         // derived from path
  filePath: string           // relative to project root, from discover phase
  exportType: 'default' | 'named'
  exportName?: string
  dataProps: PropDefinition[]
  tree: ViewNode[]
}
```

### How It Works

1. Find the screen's export function
2. Extract its props interface (data, flags types)
3. Walk JSX tree recursively
4. For each JSX element, resolve import to determine source
5. Extract props passed to each element
6. Build nested ViewNode[] tree

All paths are dynamic -- discovered at runtime from the user's project via glob + ts-morph import resolution.

## Build M+C: LLM-Powered Generation

Single LLM call per screen produces both Model and Controller.

### Input to LLM

1. ViewTree from Build V (component tree with props)
2. Raw source code of the screen file
3. System prompt explaining preview-tool concepts

### Model Output Schema

```typescript
interface ModelOutput {
  regions: Record<string, ComponentRegion>
  // key = component identifier (e.g. "appointmentTable")
}

interface ComponentRegion {
  label: string              // "Appointment Table"
  component: string          // "DataTable"
  componentPath: string      // path in ViewTree to identify instance
  states: Record<string, Record<string, unknown>>
  // e.g. { populated: { data: [...] }, empty: { data: [] } }
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  defaultCount?: number
}
```

Regions are **component-level**, not screen-level. Each component in the tree gets its own region with independent states, togglable in the inspector.

### Controller Output Schema

```typescript
interface ControllerOutput {
  flows: FlowAction[]
  componentStates: Record<string, ComponentStateMachine>
  journeys: UserJourney[]
}

interface FlowAction {
  trigger: ComponentTrigger
  navigate?: string
  navigateState?: string
  setRegionState?: { region: string; state: string }
}

interface ComponentTrigger {
  selector: string            // CSS selector: "button", "a"
  text?: string               // textContent match: "Book New"
  ariaLabel?: string          // aria-label match
  nth?: number                // disambiguate multiple matches
}

interface ComponentStateMachine {
  component: string
  states: string[]            // ["idle", "loading", "disabled"]
  defaultState: string
  transitions: { from: string; to: string; on: string }[]
}

interface UserJourney {
  name: string                // "Happy path booking"
  steps: { action: string; expectedState: string }[]
}
```

Triggers use **DOM-based matching** (CSS selectors + text content). No `data-flow-target` attributes required in the user's production code.

## LLM Provider Layer

### Provider Interface

```typescript
interface LLMProvider {
  name: string
  isAvailable(): Promise<boolean>
  generate(prompt: string, options: {
    schema?: ZodSchema
    temperature?: number       // default 0.2
    maxTokens?: number
  }): Promise<unknown>
}
```

### Fallback Chain

1. **Ollama** -- ping localhost:11434, use configured model (default: llama3.2)
2. **Claude** -- if ANTHROPIC_API_KEY env var is set
3. **OpenAI** -- if OPENAI_API_KEY env var is set
4. **Heuristic** -- field-name-based mock generation (current logic, always works)

Zod validation on every LLM response. If validation fails, retry once with correction prompt, then fall back to next provider.

### Config Extension

```json
{
  "screenGlob": "src/**/*.tsx",
  "port": 6100,
  "title": "Preview Tool",
  "llm": {
    "provider": "auto",
    "ollamaModel": "llama3.2",
    "ollamaUrl": "http://localhost:11434"
  }
}
```

## Runtime Changes

### Component-Level Inspector

InspectorPanel shows per-component region controls:

```
Inspector
+-- Appointment Table         (component region)
|   +-- State: [populated v]  (dropdown)
|   +-- Items: [===3===]      (slider)
+-- Search Bar                (component region)
|   +-- State: [default v]    (dropdown)
+-- Stats Summary             (component region)
|   +-- State: [visible v]    (dropdown)
+-- Feature Flags
    +-- [toggle] Recent Searches
```

### DOM-Based Trigger Matching

Replace `data-flow-target` matching with DOM inspection:

```typescript
function matchTrigger(
  element: HTMLElement,
  triggers: ComponentTrigger[]
): ComponentTrigger | null {
  for (const trigger of triggers) {
    let el: HTMLElement | null = element
    while (el) {
      if (el.matches(trigger.selector)) {
        const text = el.textContent?.trim()
        if (trigger.text && text?.includes(trigger.text)) return trigger
        if (trigger.ariaLabel && el.getAttribute('aria-label') === trigger.ariaLabel) return trigger
        if (!trigger.text && !trigger.ariaLabel) return trigger
      }
      el = el.parentElement
    }
  }
  return null
}
```

### Backward Compatibility

ComponentRegion extends RegionDefinition with `component` and `componentPath` fields. If absent, the runtime behaves as before (screen-level regions).

## File Structure

### CLI Changes

```
packages/cli/src/
+-- index.ts                          # add --no-llm flag
+-- commands/
|   +-- init.ts                       # MODIFY: screens/ dir structure
|   +-- dev.ts                        # MODIFY: read from screens/
|   +-- generate.ts                   # MODIFY: V -> M+C pipeline
+-- analyzer/
|   +-- discover.ts                   # KEEP
|   +-- analyze-view.ts              # NEW: Build V
|   +-- analyze-component.ts          # KEEP (used by Build V)
|   +-- types.ts                      # MODIFY: ViewTree types
|   +-- mock-generator.ts             # KEEP: heuristic fallback
+-- llm/                              # NEW
|   +-- index.ts                      # callLLM() fallback chain
|   +-- types.ts                      # Provider interface
|   +-- providers/
|   |   +-- ollama.ts
|   |   +-- anthropic.ts
|   |   +-- openai.ts
|   +-- prompts/
|   |   +-- system.ts
|   |   +-- generate-mc.ts
|   +-- schemas/
|       +-- model.ts
|       +-- controller.ts
+-- generator/
|   +-- index.ts                      # MODIFY: new pipeline
|   +-- generate-view.ts             # NEW
|   +-- generate-model.ts            # NEW
|   +-- generate-controller.ts       # NEW
|   +-- generate-adapter.ts           # MODIFY
|   +-- merge-overrides.ts            # KEEP
+-- server/
|   +-- create-vite-config.ts         # MODIFY
|   +-- generate-entry.ts             # MODIFY
+-- lib/
    +-- config.ts                     # MODIFY: llm config
```

### Runtime Changes

```
packages/runtime/src/
+-- types.ts                          # MODIFY: ComponentRegion, ComponentTrigger
+-- ScreenRenderer.tsx                # MODIFY: component-level assembly
+-- flow/trigger-matcher.ts           # MODIFY: DOM-based matching
+-- devtools/InspectorPanel.tsx       # MODIFY: component-level controls
```

### Output Structure (user's project)

```
.preview/
+-- preview.config.json
+-- wrapper.tsx
+-- index.html                        # generated by dev
+-- main.tsx                          # generated by dev
+-- preview.css                       # generated by dev
+-- screens/
|   +-- dashboard/
|   |   +-- view.ts
|   |   +-- model.ts
|   |   +-- controller.ts
|   |   +-- adapter.ts
|   +-- booking-search/
|       +-- view.ts
|       +-- model.ts
|       +-- controller.ts
|       +-- adapter.ts
+-- overrides/
    +-- dashboard/
        +-- model.ts                  # user overrides
```

## Design Decisions

1. **Approach A (Structured JSON Schema)** chosen over free-form TS generation or two-pass reasoning. Best for local model compatibility and deterministic output.
2. **Single LLM call** for M+C (not separate) to minimize latency and share context.
3. **V runs first** (static analysis) and feeds into M+C prompt for richer LLM context.
4. **Component-level regions** (not screen-level) for granular state control per UI element.
5. **DOM-based triggers** (not data-flow-target attributes) so production code is never modified.
6. **Per-screen MVC folders** (not flat directories) for clear artifact organization.
7. **Heuristic fallback** ensures the CLI always works, even without any LLM available.

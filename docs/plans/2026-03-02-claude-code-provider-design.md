# Claude Code LLM Provider — Design

**Date:** 2026-03-02
**Problem:** Controller generation (`flows`, `componentStates`, `journeys`) produces empty arrays when LLM providers are unavailable, because the heuristic fallback is a no-op stub.
**Solution:** Add a `claude-code` LLM provider that shells out to the `claude` CLI in batch mode — no API keys required.

## Architecture

### Provider Chain (auto mode)

```
claude-code → ollama → anthropic → openai → heuristic
```

Claude Code is first: it's local, free (no extra API key), and has the richest context (can read the full codebase).

### Batch Generation Flow

```
preview generate
  │
  ├─ discoverScreens()
  ├─ analyzeViewTree() per screen
  │
  ├─ claude CLI on PATH?
  │   ├─ YES → batchGenerateWithClaude(screens, viewTrees)
  │   │   ├─ Build batch prompt (screen paths + ViewTree summaries + schema)
  │   │   ├─ exec('claude -p "..." --output-format json --max-turns 30')
  │   │   ├─ Parse multi-screen JSON response
  │   │   └─ Validate each screen's controller with Zod
  │   │
  │   └─ NO → per-screen LLM (existing path) → heuristic fallback
  │
  └─ Write controller.ts per screen
```

### Key Difference from Existing Providers

Existing providers (ollama/anthropic/openai) receive truncated source code in the prompt. The `claude-code` provider passes **file paths** and lets Claude read them — giving it full codebase context (imports, shared state, navigation patterns).

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `packages/cli/src/llm/providers/claude-code.ts` | **Create** | Provider: detect `claude` CLI, shell out with batch prompt |
| `packages/cli/src/llm/prompts/generate-mc-batch.ts` | **Create** | Batch prompt template for multiple screens |
| `packages/cli/src/llm/types.ts` | **Modify** | Add `'claude-code'` to provider union type |
| `packages/cli/src/llm/index.ts` | **Modify** | Add batch generation function, insert claude-code in provider chain |
| `packages/cli/src/generator/index.ts` | **Modify** | Try batch claude-code generation before per-screen loop |

## Provider Implementation

```typescript
// packages/cli/src/llm/providers/claude-code.ts

export function createClaudeCodeProvider(): LLMProvider {
  return {
    name: 'claude-code',

    async isAvailable(): Promise<boolean> {
      // Check if 'claude' binary exists on PATH
      // exec('which claude') or exec('claude --version')
    },

    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      // exec('claude -p "..." --output-format json --max-turns 30')
      // Parse the result field from JSON output
      // Timeout: 120s (Claude needs time to read files + generate)
    },
  }
}
```

### Batch Function

```typescript
// In packages/cli/src/llm/index.ts

export async function callLLMBatch(
  screens: Array<{ id: string; prompt: string }>,
  config: LLMConfig,
): Promise<Map<string, unknown>> {
  // Only claude-code supports batch mode
  // For other providers, returns empty map (caller falls back to per-screen)
}
```

## Batch Prompt Design

The batch prompt includes:
1. **Screen manifest** — list of screen IDs, file paths, routes
2. **ViewTree summaries** — pre-computed component trees (saves Claude work)
3. **Output schema** — exact JSON format per screen
4. **Instructions** — read each file, analyze flows/states/journeys

```
Analyze these React screens and generate controller metadata for each.

## Screens

| ID | File | Route |
|----|------|-------|
| booking | src/pages/booking.tsx | /booking |
| login | src/pages/login.tsx | /login |
| ... | ... | ... |

## ViewTree Analysis (pre-computed)
<JSON for each screen>

## Output Format
Return a JSON object keyed by screen ID:
{
  "booking": { "flows": [...], "componentStates": {...}, "journeys": [...] },
  "login": { "flows": [...], "componentStates": {...}, "journeys": [...] }
}

## Schema
<ControllerOutput schema definition>

## Rules
- Read each screen's source file for full context
- flows: user interaction paths (button clicks, form submissions, navigation)
- componentStates: state machines for interactive components
- journeys: end-to-end user workflows spanning multiple actions
```

## Config Changes

```typescript
// LLMConfig.provider union type
provider: 'auto' | 'claude-code' | 'ollama' | 'anthropic' | 'openai' | 'none'
```

The `preview.config.json` can explicitly set `"provider": "claude-code"` or leave it as `"auto"` for auto-detection.

## Timeout Strategy

- `claude -p` timeout: 180 seconds (3 minutes for batch)
- Per-screen fallback timeout: 60 seconds (existing)
- `isAvailable()` timeout: 3 seconds (just checking if binary exists)

## Fallback Behavior

```
batchGenerateWithClaude() fails for screen X
  → tryLLMGeneration(X) with remaining providers
    → buildHeuristicController(X) (existing empty fallback)
```

Partial batch success is supported: if Claude generates 7 of 9 screens correctly, only the 2 failures fall back.

## Testing

- Unit test: mock `child_process.exec` to verify prompt construction and response parsing
- Integration test: skip if `claude` not on PATH (`describe.skipIf`)
- Existing tests unchanged (heuristic path still works)

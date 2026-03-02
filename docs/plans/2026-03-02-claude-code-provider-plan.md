# Claude Code LLM Provider — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `claude-code` LLM provider that shells out to the `claude` CLI in batch mode, so controller generation works without API keys.

**Architecture:** New provider type `claude-code` auto-detected when the `claude` binary is on PATH. In `generateAll()`, before the per-screen loop, attempt batch generation via a single `claude -p` subprocess. On failure, fall back to existing per-screen LLM providers, then heuristic.

**Tech Stack:** Node.js `child_process.execFile`, Zod validation, existing LLM provider interface.

---

### Task 1: Add `claude-code` to the LLM type system

**Files:**
- Modify: `packages/cli/src/llm/types.ts`

**Step 1: Update the LLMConfig provider union type**

In `packages/cli/src/llm/types.ts`, change the `provider` field to include `'claude-code'`:

```typescript
export interface LLMConfig {
  provider: 'auto' | 'claude-code' | 'ollama' | 'anthropic' | 'openai' | 'none'
  ollamaModel: string
  ollamaUrl: string
}
```

**Step 2: Add batch-specific timeout constant**

Add below `DEFAULT_LLM_TIMEOUT_MS`:

```typescript
/** Timeout for batch claude-code generation: 180 seconds */
export const CLAUDE_CODE_BATCH_TIMEOUT_MS = 180_000
```

**Step 3: Verify build compiles**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Clean build (no type errors)

**Step 4: Commit**

```bash
git add packages/cli/src/llm/types.ts
git commit -m "feat(cli): add claude-code to LLM provider type union"
```

---

### Task 2: Create the claude-code provider

**Files:**
- Create: `packages/cli/src/llm/providers/claude-code.ts`

**Step 1: Write the provider implementation**

Create `packages/cli/src/llm/providers/claude-code.ts`:

```typescript
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { LLMProvider, LLMOptions } from '../types.js'
import { CLAUDE_CODE_BATCH_TIMEOUT_MS } from '../types.js'
import { extractJson } from '../utils.js'

const execFileAsync = promisify(execFile)

export function createClaudeCodeProvider(): LLMProvider {
  return {
    name: 'claude-code',

    async isAvailable(): Promise<boolean> {
      try {
        await execFileAsync('claude', ['--version'], {
          timeout: 3000,
        })
        return true
      } catch {
        return false
      }
    },

    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      const timeout = options.timeoutMs ?? CLAUDE_CODE_BATCH_TIMEOUT_MS

      const fullPrompt = options.systemPrompt
        ? `${options.systemPrompt}\n\n${prompt}`
        : prompt

      const { stdout } = await execFileAsync(
        'claude',
        ['-p', fullPrompt, '--output-format', 'json', '--max-turns', '30'],
        { timeout, maxBuffer: 10 * 1024 * 1024 },
      )

      // claude --output-format json returns { result: "...", ... }
      const envelope = JSON.parse(stdout) as { result: string }
      const text = envelope.result

      return JSON.parse(extractJson(text)) as unknown
    },
  }
}
```

**Step 2: Verify build compiles**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Clean build (file created but not yet imported anywhere — no errors)

**Step 3: Commit**

```bash
git add packages/cli/src/llm/providers/claude-code.ts
git commit -m "feat(cli): create claude-code LLM provider using claude CLI subprocess"
```

---

### Task 3: Create the batch prompt template

**Files:**
- Create: `packages/cli/src/llm/prompts/generate-mc-batch.ts`

**Step 1: Write the batch prompt builder**

Create `packages/cli/src/llm/prompts/generate-mc-batch.ts`:

```typescript
import type { ViewTree, DiscoveredScreen } from '../../analyzer/types.js'

export interface BatchScreenInput {
  id: string
  screen: DiscoveredScreen
  viewTree: ViewTree | null
}

export function buildBatchGenerateMCPrompt(
  screens: BatchScreenInput[],
  cwd: string,
): string {
  const screenManifest = screens
    .map((s) => `| ${s.id} | ${s.screen.filePath} | ${s.screen.route} |`)
    .join('\n')

  const viewTreeSummaries = screens
    .filter((s) => s.viewTree)
    .map((s) => `### ${s.id}\n\`\`\`json\n${JSON.stringify(s.viewTree!.tree, null, 2)}\n\`\`\``)
    .join('\n\n')

  return `You are analyzing a React application to generate preview controller metadata.

The project root is: ${cwd}

## Screens to Analyze

| ID | File Path | Route |
|----|-----------|-------|
${screenManifest}

## Pre-computed Component Trees

${viewTreeSummaries || 'No ViewTree data available — read the source files directly.'}

## Task

For EACH screen above:
1. Read the screen's source file to understand its UI, user interactions, state, and navigation
2. Identify all interactive elements (buttons, links, forms, toggles)
3. Identify navigation patterns (useNavigate, router.push, Link components)
4. Identify stateful components (loading states, toggles, expandable sections)
5. Generate the controller metadata

## Output Format

Return a single JSON object keyed by screen ID. Each value must match this exact schema:

\`\`\`json
{
  "<screenId>": {
    "flows": [
      {
        "trigger": { "selector": "button", "text": "Button Text" },
        "navigate": "/target-route",
        "setRegionState": { "region": "regionKey", "state": "stateName" }
      }
    ],
    "componentStates": {
      "<componentKey>": {
        "component": "ComponentName",
        "states": ["idle", "loading", "success"],
        "defaultState": "idle",
        "transitions": [
          { "from": "idle", "to": "loading", "on": "click" }
        ]
      }
    },
    "journeys": [
      {
        "name": "Journey name",
        "steps": [
          { "action": "Click X", "expectedState": "description of state after action" }
        ]
      }
    ]
  }
}
\`\`\`

## Rules

- **flows**: One entry per interactive element. Use \`{ selector: "button", text: "..." }\` for triggers — NO data attributes.
  - Include \`navigate\` if the action navigates to another route
  - Include \`setRegionState\` if the action changes a region's visual state
- **componentStates**: One entry per component that has distinct visual states (e.g., a form with idle/submitting/success/error)
  - \`states\` array lists all possible states
  - \`transitions\` describe what triggers state changes
- **journeys**: End-to-end user workflows (e.g., "Book an appointment", "Login and view dashboard")
  - Each step has an \`action\` (what the user does) and \`expectedState\` (what they see after)
- Return ONLY the JSON object, no markdown fences, no explanation
- If a screen has no interactive elements, return empty arrays/objects for that screen`
}
```

**Step 2: Verify build compiles**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Clean build

**Step 3: Commit**

```bash
git add packages/cli/src/llm/prompts/generate-mc-batch.ts
git commit -m "feat(cli): add batch prompt template for claude-code controller generation"
```

---

### Task 4: Wire claude-code into the provider chain

**Files:**
- Modify: `packages/cli/src/llm/index.ts`

**Step 1: Import the new provider**

Add at top of `packages/cli/src/llm/index.ts`:

```typescript
import { createClaudeCodeProvider } from './providers/claude-code.js'
```

**Step 2: Add claude-code to provider chain**

In `buildProviderChain()`, add `'claude-code'` to the switch and to the auto chain:

```typescript
function buildProviderChain(config: LLMConfig): LLMProvider[] {
  if (config.provider === 'none') {
    return []
  }

  if (config.provider !== 'auto') {
    switch (config.provider) {
      case 'claude-code':
        return [createClaudeCodeProvider()]
      case 'ollama':
        return [createOllamaProvider(config.ollamaModel, config.ollamaUrl)]
      case 'anthropic':
        return [createAnthropicProvider()]
      case 'openai':
        return [createOpenAIProvider()]
    }
  }

  return [
    createClaudeCodeProvider(),
    createOllamaProvider(config.ollamaModel, config.ollamaUrl),
    createAnthropicProvider(),
    createOpenAIProvider(),
  ]
}
```

**Step 3: Add batch LLM function**

Add a new exported function `callLLMBatch` at the bottom of `packages/cli/src/llm/index.ts`, before the re-exports:

```typescript
/**
 * Batch LLM call — only supported by claude-code provider.
 * Returns null if claude-code is unavailable (caller should fall back to per-screen).
 */
export async function callLLMBatch(
  prompt: string,
  config: LLMConfig,
  options: LLMOptions = {},
): Promise<unknown | null> {
  const provider = createClaudeCodeProvider()

  try {
    const available = await provider.isAvailable()
    if (!available) {
      return null
    }

    console.log(chalk.dim(`  LLM: Using ${provider.name} (batch mode)...`))
    const opts: LLMOptions = {
      ...options,
      systemPrompt: options.systemPrompt ?? SYSTEM_PROMPT,
    }
    const result = await provider.generate(prompt, { ...opts, jsonMode: true })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.yellow(`  LLM: ${provider.name} batch failed: ${message}`))
    return null
  }
}
```

**Step 4: Verify build compiles**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Clean build

**Step 5: Commit**

```bash
git add packages/cli/src/llm/index.ts
git commit -m "feat(cli): wire claude-code provider into LLM chain with batch support"
```

---

### Task 5: Integrate batch generation into generateAll()

**Files:**
- Modify: `packages/cli/src/generator/index.ts`

This is the core integration. The strategy:
1. After discovering screens and analyzing ViewTrees, attempt batch generation via `callLLMBatch`
2. Store results in a Map keyed by screen ID
3. In the per-screen loop, use batch results if available before falling back to per-screen LLM

**Step 1: Add new imports**

At the top of `packages/cli/src/generator/index.ts`, add:

```typescript
import { callLLM, callLLMBatch } from '../llm/index.js'
import { buildBatchGenerateMCPrompt } from '../llm/prompts/generate-mc-batch.js'
import type { BatchScreenInput } from '../llm/prompts/generate-mc-batch.js'
```

And update the existing `callLLM` import (remove it since we're replacing it with the combined import above).

**Step 2: Add batch generation before the per-screen loop**

After the ViewTree analysis loop (line ~107) and before the per-screen generation loop, insert batch generation logic. Find the for loop that starts with `for (const screen of screens)` (line 90) and restructure it.

Replace the section from line 84 through line 166 with:

```typescript
  let viewsGenerated = 0
  let modelsGenerated = 0
  let controllersGenerated = 0
  let adaptersGenerated = 0
  let overridesSkipped = 0

  // Phase 1: Analyze all screens (ViewTree)
  const screenData: Array<{
    screen: DiscoveredScreen
    safeName: string
    screenOutDir: string
    overrideScreenDir: string
    viewTree: ViewTree | null
  }> = []

  for (const screen of screens) {
    const safeName = routeToFolderName(screen.route)
    const screenOutDir = join(screensDir, safeName)
    const overrideScreenDir = join(overridesDir, safeName)

    await mkdir(screenOutDir, { recursive: true })

    console.log(chalk.dim(`  Processing: ${screen.route} (${screen.pattern})`))

    let viewTree: ViewTree | null = null
    try {
      viewTree = analyzeViewTree(screen)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(chalk.yellow(`    View analysis failed, using legacy fallback: ${message}`))
    }

    screenData.push({ screen, safeName, screenOutDir, overrideScreenDir, viewTree })
  }

  // Phase 2: Attempt batch controller generation via claude-code
  const batchControllers = new Map<string, ControllerOutput>()

  if (config.llm.provider !== 'none') {
    const batchInputs: BatchScreenInput[] = screenData
      .filter((d) => !existsSync(join(d.overrideScreenDir, 'controller.ts')))
      .map((d) => ({
        id: d.safeName,
        screen: d.screen,
        viewTree: d.viewTree,
      }))

    if (batchInputs.length > 0) {
      console.log(chalk.dim('\nAttempting batch controller generation via claude-code...'))
      const batchPrompt = buildBatchGenerateMCPrompt(batchInputs, cwd)
      const batchRaw = await callLLMBatch(batchPrompt, config.llm, {
        temperature: 0.2,
        maxTokens: 16384,
        jsonMode: true,
      })

      if (batchRaw && typeof batchRaw === 'object') {
        const batchObj = batchRaw as Record<string, unknown>
        for (const [screenId, controllerData] of Object.entries(batchObj)) {
          const parsed = ControllerOutputSchema.safeParse(controllerData)
          if (parsed.success) {
            batchControllers.set(screenId, parsed.data)
            console.log(chalk.dim(`    Batch: ${screenId} controller validated`))
          } else {
            console.log(chalk.dim(`    Batch: ${screenId} controller failed validation, will retry per-screen`))
          }
        }
      }
    }
  }

  // Phase 3: Generate files per screen (using batch results where available)
  for (const { screen, safeName, screenOutDir, overrideScreenDir, viewTree } of screenData) {
    // Write view.ts
    if (viewTree) {
      const viewContent = generateViewFileContent(viewTree)
      await writeFile(join(screenOutDir, 'view.ts'), viewContent, 'utf-8')
      viewsGenerated++
    } else {
      const placeholderView = buildPlaceholderView(screen)
      await writeFile(join(screenOutDir, 'view.ts'), placeholderView, 'utf-8')
      viewsGenerated++
    }

    // Check overrides
    const hasModelOverride = existsSync(join(overrideScreenDir, 'model.ts'))
    const hasControllerOverride = existsSync(join(overrideScreenDir, 'controller.ts'))

    if (hasModelOverride) {
      console.log(chalk.dim(`    Override exists: overrides/${safeName}/model.ts`))
      overridesSkipped++
    }
    if (hasControllerOverride) {
      console.log(chalk.dim(`    Override exists: overrides/${safeName}/controller.ts`))
      overridesSkipped++
    }

    // Model + Controller generation
    const needsModel = !hasModelOverride
    const needsController = !hasControllerOverride

    // Try per-screen LLM only if batch didn't cover this screen
    let llmResult: LLMResult = { model: null, controller: null }
    const hasBatchController = batchControllers.has(safeName)

    if ((needsModel || (needsController && !hasBatchController)) && viewTree && config.llm.provider !== 'none') {
      llmResult = await tryLLMGeneration(screen, viewTree, cwd, config)
    }

    if (needsModel) {
      const model = llmResult.model ?? await buildHeuristicModel(screen, viewTree, devToolConfig)
      const modelMeta = {
        route: screen.route,
        pattern: screen.pattern,
        filePath: relative(cwd, screen.filePath).split('\\').join('/'),
      }
      const modelContent = generateModelFileContent(model, modelMeta)
      await writeFile(join(screenOutDir, 'model.ts'), modelContent, 'utf-8')
      modelsGenerated++
    }

    if (needsController) {
      const controller = batchControllers.get(safeName)
        ?? llmResult.controller
        ?? buildHeuristicController(screen, viewTree)
      const controllerContent = generateControllerFileContent(controller)
      await writeFile(join(screenOutDir, 'controller.ts'), controllerContent, 'utf-8')
      controllersGenerated++
    }

    // Adapter — always regenerated
    const adapterContent = buildAdapterContent(screen, screenOutDir)
    await writeFile(join(screenOutDir, 'adapter.ts'), adapterContent, 'utf-8')
    adaptersGenerated++
  }
```

**Step 3: Verify build compiles**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Clean build

**Step 4: Commit**

```bash
git add packages/cli/src/generator/index.ts
git commit -m "feat(cli): integrate batch claude-code generation into generateAll pipeline"
```

---

### Task 6: Manual integration test against booking app

**Files:**
- No files modified — validation only

**Step 1: Build the CLI**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm build`
Expected: Clean build

**Step 2: Run generate against booking app**

Run: `node /Users/loclam/Desktop/preview-tool/packages/cli/dist/index.js generate --cwd /Users/loclam/Desktop/booking/client`

Expected output should include:
- `LLM: Using claude-code (batch mode)...`
- `Batch: <screenId> controller validated` for each screen
- Generated controller.ts files should now have populated `flows`, `componentStates`, and `journeys`

**Step 3: Verify a generated controller has data**

Read: `/Users/loclam/Desktop/booking/client/.preview/screens/booking/controller.ts`

Expected: Non-empty arrays. For example:
```typescript
export const flows = [
  { trigger: { selector: "button", text: "Book Now" }, navigate: "/confirmation" },
  // ... more flows
] as const
```

**Step 4: Verify fallback works without claude**

Temporarily test with provider set to `none`:
Run: Edit `preview.config.json` to set `"provider": "none"`, run generate, verify heuristic fallback still works (empty controllers — same as before).

**Step 5: Commit integration test results (if applicable)**

No code changes expected — this is validation only.

---

### Task 7: Run existing test suite to verify no regressions

**Files:**
- No files modified — validation only

**Step 1: Run the sample-app test**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm test`

Expected: CLI builds and generates against sample-app without errors. The sample-app test will now attempt claude-code batch generation (if claude is available) before falling back.

**Step 2: Verify generated files are valid**

Check that `packages/cli/test-fixtures/sample-app/.preview/screens/*/controller.ts` files exist and are valid TypeScript.

---

## Summary of Changes

| # | Task | Files | Type |
|---|------|-------|------|
| 1 | Add type | `llm/types.ts` | Modify |
| 2 | Create provider | `llm/providers/claude-code.ts` | Create |
| 3 | Create batch prompt | `llm/prompts/generate-mc-batch.ts` | Create |
| 4 | Wire into chain | `llm/index.ts` | Modify |
| 5 | Integrate into generator | `generator/index.ts` | Modify |
| 6 | Manual test (booking) | — | Validate |
| 7 | Regression test | — | Validate |

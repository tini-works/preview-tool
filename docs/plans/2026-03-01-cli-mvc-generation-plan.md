# CLI MVC Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade `preview generate` to produce per-screen MVC artifacts (view.ts, model.ts, controller.ts) using static AST analysis + LLM-powered generation with Ollama-first fallback chain.

**Architecture:** Build V (static ts-morph AST) produces a ViewTree. A single LLM call consumes ViewTree + source code and outputs Zod-validated JSON for both Model and Controller. If no LLM is available, heuristic fallback ensures the CLI always works offline.

**Tech Stack:** ts-morph (AST), Zod (schema validation), Ollama/Anthropic/OpenAI HTTP APIs (no SDK dependencies), Commander.js (CLI)

---

## Task 1: Add New Types to CLI

**Files:**
- Modify: `packages/cli/src/analyzer/types.ts`

**Step 1: Add ViewTree types**

Add to `packages/cli/src/analyzer/types.ts` — append after the existing types:

```typescript
// === Build V: View Tree ===

export interface PropDefinition {
  name: string
  type: string
  required: boolean
  defaultValue?: string
}

export interface ViewNode {
  component: string
  source: 'ui' | 'block' | 'local' | 'external'
  importPath: string
  props: PropDefinition[]
  children: ViewNode[]
}

export interface ViewTree {
  screenName: string
  filePath: string
  exportType: 'default' | 'named'
  exportName?: string
  dataProps: PropDefinition[]
  tree: ViewNode[]
}

// === Build M: Model ===

export interface ComponentRegion {
  label: string
  component: string
  componentPath: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  defaultCount?: number
}

export interface ModelOutput {
  regions: Record<string, ComponentRegion>
}

// === Build C: Controller ===

export interface ComponentTrigger {
  selector: string
  text?: string
  ariaLabel?: string
  nth?: number
}

export interface ComponentStateMachine {
  component: string
  states: string[]
  defaultState: string
  transitions: { from: string; to: string; on: string }[]
}

export interface UserJourney {
  name: string
  steps: { action: string; expectedState: string }[]
}

export interface ControllerOutput {
  flows: FlowActionV2[]
  componentStates: Record<string, ComponentStateMachine>
  journeys: UserJourney[]
}

export interface FlowActionV2 {
  trigger: ComponentTrigger
  navigate?: string
  navigateState?: string
  setRegionState?: { region: string; state: string }
}

// === Combined LLM Output ===

export interface LLMGenerationOutput {
  model: ModelOutput
  controller: ControllerOutput
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/cli/src/analyzer/types.ts
git commit -m "feat(cli): add ViewTree, ModelOutput, and ControllerOutput types"
```

---

## Task 2: Add Runtime Types (ComponentRegion, ComponentTrigger)

**Files:**
- Modify: `packages/runtime/src/types.ts`
- Modify: `packages/runtime/src/index.ts`

**Step 1: Extend runtime types**

Add to `packages/runtime/src/types.ts` — append after existing types:

```typescript
// === Component-level regions (from CLI MVC generation) ===

export interface ComponentRegion extends RegionDefinition {
  component?: string
  componentPath?: string
}

// === DOM-based trigger matching (no data-flow-target required) ===

export interface ComponentTrigger {
  selector: string
  text?: string
  ariaLabel?: string
  nth?: number
}

export interface FlowActionV2 {
  trigger: ComponentTrigger
  navigate?: string
  navigateState?: string
  setRegionState?: { region: string; state: string }
}
```

**Step 2: Export new types from index.ts**

Add to `packages/runtime/src/index.ts`:

```typescript
export type { ComponentRegion, ComponentTrigger, FlowActionV2 } from './types.ts'
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/runtime exec tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/runtime/src/types.ts packages/runtime/src/index.ts
git commit -m "feat(runtime): add ComponentRegion and ComponentTrigger types"
```

---

## Task 3: Build V — View Tree Analyzer

**Files:**
- Create: `packages/cli/src/analyzer/analyze-view.ts`

**Step 1: Create the view tree analyzer**

Create `packages/cli/src/analyzer/analyze-view.ts`:

```typescript
import {
  Project,
  SyntaxKind,
  type SourceFile,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
  type ImportDeclaration,
} from 'ts-morph'
import type {
  DiscoveredScreen,
  ViewTree,
  ViewNode,
  PropDefinition,
} from './types.js'

/**
 * Analyzes a screen file and produces a ViewTree:
 * nested component hierarchy with props at each node.
 */
export function analyzeViewTree(screen: DiscoveredScreen): ViewTree {
  const project = new Project({
    tsConfigFilePath: undefined,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      strict: true,
      jsx: 4, // JsxEmit.ReactJSX
    },
  })

  const filePath = screen.viewFile ?? screen.filePath
  const sourceFile = project.addSourceFileAtPath(filePath)

  const importMap = buildImportMap(sourceFile)
  const exportInfo = findScreenExport(sourceFile, screen)
  const dataProps = exportInfo.dataProps
  const tree = exportInfo.jsxRoot
    ? walkJsxTree(exportInfo.jsxRoot, importMap)
    : []

  return {
    screenName: screen.route.replace(/^\//, '').replace(/\//g, '-') || 'root',
    filePath: screen.filePath,
    exportType: screen.exportName ? 'named' : 'default',
    exportName: screen.exportName,
    dataProps,
    tree,
  }
}

/**
 * Maps imported component names to their source info.
 */
interface ImportInfo {
  source: 'ui' | 'block' | 'local' | 'external'
  importPath: string
}

function buildImportMap(
  sourceFile: SourceFile
): Map<string, ImportInfo> {
  const map = new Map<string, ImportInfo>()

  for (const imp of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = imp.getModuleSpecifierValue()
    const source = classifyImportSource(moduleSpecifier)

    // Named imports
    for (const named of imp.getNamedImports()) {
      const name = named.getAliasNode()?.getText() ?? named.getName()
      map.set(name, { source, importPath: moduleSpecifier })
    }

    // Default import
    const defaultImport = imp.getDefaultImport()
    if (defaultImport) {
      map.set(defaultImport.getText(), {
        source,
        importPath: moduleSpecifier,
      })
    }
  }

  return map
}

function classifyImportSource(
  moduleSpecifier: string
): 'ui' | 'block' | 'local' | 'external' {
  if (
    moduleSpecifier.includes('/components/ui/') ||
    moduleSpecifier.includes('/ui/')
  ) {
    return 'ui'
  }
  if (moduleSpecifier.includes('/blocks/')) {
    return 'block'
  }
  if (
    moduleSpecifier.startsWith('.') ||
    moduleSpecifier.startsWith('@/')
  ) {
    return 'local'
  }
  return 'external'
}

interface ExportInfo {
  dataProps: PropDefinition[]
  jsxRoot: import('ts-morph').Node | null
}

function findScreenExport(
  sourceFile: SourceFile,
  screen: DiscoveredScreen
): ExportInfo {
  // Try default export
  const defaultExport = sourceFile.getDefaultExportSymbol()
  if (defaultExport) {
    const decls = defaultExport.getDeclarations()
    if (decls.length > 0) {
      const funcDecl = decls[0].asKind(SyntaxKind.FunctionDeclaration)
      if (funcDecl) {
        return {
          dataProps: extractPropsFromParams(funcDecl.getParameters(), sourceFile),
          jsxRoot: funcDecl.getBody() ?? null,
        }
      }
      const varDecl = decls[0].asKind(SyntaxKind.VariableDeclaration)
      if (varDecl) {
        const arrow = varDecl.getInitializer()?.asKind(SyntaxKind.ArrowFunction)
        if (arrow) {
          return {
            dataProps: extractPropsFromParams(arrow.getParameters(), sourceFile),
            jsxRoot: arrow.getBody(),
          }
        }
      }
    }
  }

  // Try named export
  if (screen.exportName) {
    const funcDecl = sourceFile.getFunction(screen.exportName)
    if (funcDecl) {
      return {
        dataProps: extractPropsFromParams(funcDecl.getParameters(), sourceFile),
        jsxRoot: funcDecl.getBody() ?? null,
      }
    }
    const varDecl = sourceFile.getVariableDeclaration(screen.exportName)
    if (varDecl) {
      const arrow = varDecl.getInitializer()?.asKind(SyntaxKind.ArrowFunction)
      if (arrow) {
        return {
          dataProps: extractPropsFromParams(arrow.getParameters(), sourceFile),
          jsxRoot: arrow.getBody(),
        }
      }
    }
  }

  return { dataProps: [], jsxRoot: null }
}

function extractPropsFromParams(
  params: { getType(): import('ts-morph').Type }[],
  sourceFile: SourceFile
): PropDefinition[] {
  const results: PropDefinition[] = []

  for (const param of params) {
    const paramType = param.getType()
    const props = paramType.getProperties()

    for (const prop of props) {
      const propType = prop.getTypeAtLocation(sourceFile)
      results.push({
        name: prop.getName(),
        type: propType.getText(),
        required: !prop.isOptional(),
      })
    }
  }

  return results
}

function walkJsxTree(
  node: import('ts-morph').Node,
  importMap: Map<string, ImportInfo>
): ViewNode[] {
  const results: ViewNode[] = []

  // Find all JSX elements (opening + self-closing)
  const jsxElements = [
    ...node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ]

  for (const jsx of jsxElements) {
    const tagName = jsx.getTagNameNode().getText()

    // Skip HTML elements (lowercase)
    if (tagName[0] === tagName[0]?.toLowerCase()) continue

    // Skip if this is a nested child of an already-processed component
    // (we handle children recursively below)
    const parentJsx = findParentJsxComponent(jsx)
    if (parentJsx) continue

    const viewNode = buildViewNode(jsx, tagName, importMap)
    results.push(viewNode)
  }

  return results
}

function buildViewNode(
  jsx: JsxOpeningElement | JsxSelfClosingElement,
  tagName: string,
  importMap: Map<string, ImportInfo>
): ViewNode {
  const info = importMap.get(tagName) ?? {
    source: 'local' as const,
    importPath: '',
  }

  const props = extractJsxProps(jsx)

  // Find children (for JsxOpeningElement, walk its parent JsxElement)
  let children: ViewNode[] = []
  const isOpening = jsx.getKind() === SyntaxKind.JsxOpeningElement
  if (isOpening) {
    const jsxElement = jsx.getParent()
    if (jsxElement) {
      children = walkJsxChildren(jsxElement, importMap)
    }
  }

  return {
    component: tagName,
    source: info.source,
    importPath: info.importPath,
    props,
    children,
  }
}

function walkJsxChildren(
  parentElement: import('ts-morph').Node,
  importMap: Map<string, ImportInfo>
): ViewNode[] {
  const results: ViewNode[] = []

  const childOpenings = parentElement.getDescendantsOfKind(
    SyntaxKind.JsxOpeningElement
  )
  const childSelfClosings = parentElement.getDescendantsOfKind(
    SyntaxKind.JsxSelfClosingElement
  )

  for (const child of [...childOpenings, ...childSelfClosings]) {
    const childTagName = child.getTagNameNode().getText()
    if (childTagName[0] === childTagName[0]?.toLowerCase()) continue

    // Only direct children (not deeply nested)
    const directParentJsx = findDirectParentComponent(child, parentElement)
    if (directParentJsx && directParentJsx !== parentElement) continue

    results.push(buildViewNode(child, childTagName, importMap))
  }

  return results
}

function extractJsxProps(
  jsx: JsxOpeningElement | JsxSelfClosingElement
): PropDefinition[] {
  const props: PropDefinition[] = []

  const attributes = jsx.getAttributes()
  for (const attr of attributes) {
    if (attr.getKind() === SyntaxKind.JsxAttribute) {
      const jsxAttr = attr.asKind(SyntaxKind.JsxAttribute)
      if (!jsxAttr) continue

      const name = jsxAttr.getNameNode().getText()
      const initializer = jsxAttr.getInitializer()
      let type = 'unknown'
      let defaultValue: string | undefined

      if (initializer) {
        const text = initializer.getText()
        // String literal: "hello" or 'hello'
        if (text.startsWith('"') || text.startsWith("'")) {
          type = 'string'
          defaultValue = text.slice(1, -1)
        } else if (text.startsWith('{')) {
          // Expression: {value}, {() => ...}, {someVar}
          const inner = text.slice(1, -1).trim()
          if (inner === 'true' || inner === 'false') type = 'boolean'
          else if (/^\d+$/.test(inner)) type = 'number'
          else if (inner.startsWith('(') || inner.includes('=>'))
            type = 'function'
          else type = 'expression'
        }
      } else {
        // Boolean shorthand: <Comp disabled />
        type = 'boolean'
        defaultValue = 'true'
      }

      props.push({ name, type, required: true, defaultValue })
    }
  }

  return props
}

function findParentJsxComponent(
  node: import('ts-morph').Node
): import('ts-morph').Node | null {
  let current = node.getParent()
  while (current) {
    if (
      current.getKind() === SyntaxKind.JsxOpeningElement ||
      current.getKind() === SyntaxKind.JsxSelfClosingElement
    ) {
      const tagName = (current as JsxOpeningElement).getTagNameNode?.()?.getText()
      if (tagName && tagName[0] !== tagName[0]?.toLowerCase()) {
        return current
      }
    }
    current = current.getParent()
  }
  return null
}

function findDirectParentComponent(
  node: import('ts-morph').Node,
  boundary: import('ts-morph').Node
): import('ts-morph').Node | null {
  let current = node.getParent()
  while (current && current !== boundary) {
    if (
      current.getKind() === SyntaxKind.JsxElement ||
      current.getKind() === SyntaxKind.JsxSelfClosingElement
    ) {
      return current
    }
    current = current.getParent()
  }
  return boundary
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/cli/src/analyzer/analyze-view.ts
git commit -m "feat(cli): add Build V view tree analyzer using ts-morph AST"
```

---

## Task 4: LLM Provider Layer — Types and Interface

**Files:**
- Create: `packages/cli/src/llm/types.ts`

**Step 1: Create LLM provider types**

Create `packages/cli/src/llm/types.ts`:

```typescript
export interface LLMProvider {
  name: string
  isAvailable(): Promise<boolean>
  generate(prompt: string, options: LLMOptions): Promise<unknown>
}

export interface LLMOptions {
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
}

export interface LLMConfig {
  provider: 'auto' | 'ollama' | 'anthropic' | 'openai' | 'none'
  ollamaModel: string
  ollamaUrl: string
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'auto',
  ollamaModel: 'llama3.2',
  ollamaUrl: 'http://localhost:11434',
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/llm/types.ts
git commit -m "feat(cli): add LLM provider types"
```

---

## Task 5: LLM Provider — Ollama

**Files:**
- Create: `packages/cli/src/llm/providers/ollama.ts`

**Step 1: Create Ollama provider**

Create `packages/cli/src/llm/providers/ollama.ts`:

```typescript
import type { LLMProvider, LLMOptions } from '../types.js'

export function createOllamaProvider(
  model: string,
  baseUrl: string
): LLMProvider {
  return {
    name: 'ollama',

    async isAvailable(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(2000),
        })
        return response.ok
      } catch {
        return false
      }
    },

    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: options.jsonMode ? 'json' : undefined,
          options: {
            temperature: options.temperature ?? 0.2,
            num_predict: options.maxTokens ?? 4096,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { response: string }
      return JSON.parse(data.response)
    },
  }
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/llm/providers/ollama.ts
git commit -m "feat(cli): add Ollama LLM provider"
```

---

## Task 6: LLM Provider — Anthropic

**Files:**
- Create: `packages/cli/src/llm/providers/anthropic.ts`

**Step 1: Create Anthropic provider**

Create `packages/cli/src/llm/providers/anthropic.ts`:

```typescript
import type { LLMProvider, LLMOptions } from '../types.js'

export function createAnthropicProvider(): LLMProvider {
  return {
    name: 'anthropic',

    async isAvailable(): Promise<boolean> {
      return Boolean(process.env.ANTHROPIC_API_KEY)
    },

    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.2,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic error: ${response.status} ${errorText}`)
      }

      const data = (await response.json()) as {
        content: { type: string; text: string }[]
      }

      const textBlock = data.content.find((c) => c.type === 'text')
      if (!textBlock) throw new Error('No text block in Anthropic response')

      // Extract JSON from response (may be wrapped in markdown code block)
      const jsonText = extractJson(textBlock.text)
      return JSON.parse(jsonText)
    },
  }
}

function extractJson(text: string): string {
  // Try to extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()

  // Try the raw text
  return text.trim()
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/llm/providers/anthropic.ts
git commit -m "feat(cli): add Anthropic LLM provider"
```

---

## Task 7: LLM Provider — OpenAI

**Files:**
- Create: `packages/cli/src/llm/providers/openai.ts`

**Step 1: Create OpenAI provider**

Create `packages/cli/src/llm/providers/openai.ts`:

```typescript
import type { LLMProvider, LLMOptions } from '../types.js'

export function createOpenAIProvider(): LLMProvider {
  return {
    name: 'openai',

    async isAvailable(): Promise<boolean> {
      return Boolean(process.env.OPENAI_API_KEY)
    },

    async generate(prompt: string, options: LLMOptions): Promise<unknown> {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) throw new Error('OPENAI_API_KEY not set')

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: options.maxTokens ?? 4096,
            temperature: options.temperature ?? 0.2,
            response_format: options.jsonMode
              ? { type: 'json_object' }
              : undefined,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI error: ${response.status} ${errorText}`)
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[]
      }

      const content = data.choices[0]?.message?.content
      if (!content) throw new Error('No content in OpenAI response')

      // Extract JSON from response
      const jsonText = extractJson(content)
      return JSON.parse(jsonText)
    },
  }
}

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()
  return text.trim()
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/llm/providers/openai.ts
git commit -m "feat(cli): add OpenAI LLM provider"
```

---

## Task 8: LLM Fallback Chain Orchestrator

**Files:**
- Create: `packages/cli/src/llm/index.ts`

**Step 1: Create the LLM orchestrator with fallback chain**

Create `packages/cli/src/llm/index.ts`:

```typescript
import chalk from 'chalk'
import type { LLMProvider, LLMConfig, LLMOptions } from './types.js'
import { createOllamaProvider } from './providers/ollama.js'
import { createAnthropicProvider } from './providers/anthropic.js'
import { createOpenAIProvider } from './providers/openai.js'

/**
 * Calls the LLM with a fallback chain: Ollama → Anthropic → OpenAI.
 * Returns the parsed JSON response, or null if all providers fail.
 */
export async function callLLM(
  prompt: string,
  config: LLMConfig,
  options: LLMOptions = {}
): Promise<unknown | null> {
  const providers = buildProviderChain(config)

  for (const provider of providers) {
    try {
      const available = await provider.isAvailable()
      if (!available) {
        console.log(chalk.dim(`  LLM: ${provider.name} not available, skipping`))
        continue
      }

      console.log(chalk.dim(`  LLM: Using ${provider.name}...`))
      const result = await provider.generate(prompt, {
        ...options,
        jsonMode: true,
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(chalk.yellow(`  LLM: ${provider.name} failed: ${message}`))
    }
  }

  console.log(chalk.dim('  LLM: All providers failed, using heuristic fallback'))
  return null
}

function buildProviderChain(config: LLMConfig): LLMProvider[] {
  if (config.provider === 'none') return []

  if (config.provider !== 'auto') {
    // Specific provider requested
    switch (config.provider) {
      case 'ollama':
        return [createOllamaProvider(config.ollamaModel, config.ollamaUrl)]
      case 'anthropic':
        return [createAnthropicProvider()]
      case 'openai':
        return [createOpenAIProvider()]
    }
  }

  // Auto mode: try all in order
  return [
    createOllamaProvider(config.ollamaModel, config.ollamaUrl),
    createAnthropicProvider(),
    createOpenAIProvider(),
  ]
}

export { type LLMConfig, type LLMOptions, DEFAULT_LLM_CONFIG } from './types.js'
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/cli/src/llm/
git commit -m "feat(cli): add LLM fallback chain (Ollama → Anthropic → OpenAI)"
```

---

## Task 9: LLM Prompt Templates

**Files:**
- Create: `packages/cli/src/llm/prompts/system.ts`
- Create: `packages/cli/src/llm/prompts/generate-mc.ts`

**Step 1: Create system prompt**

Create `packages/cli/src/llm/prompts/system.ts`:

```typescript
export const SYSTEM_PROMPT = `You are a UI analysis assistant for Preview Tool, a screen preview system for React applications.

Your job is to analyze React screen components and generate structured preview metadata:
- **Regions**: Independent UI sections, each with multiple visual states (e.g. loaded, empty, loading, error)
- **Flows**: User interaction paths — what happens when buttons/links are clicked
- **Component States**: Per-component state machines (idle, loading, disabled, etc.)
- **Journeys**: End-to-end user workflows across screens

Key rules:
1. Regions are COMPONENT-LEVEL, not screen-level. Each meaningful UI component gets its own region.
2. Flow triggers use CSS selectors + text content matching — NOT custom data attributes.
3. Generate realistic mock data that matches the domain (medical app = patient data, e-commerce = products, etc.)
4. List regions need ≥10 mock items with defaultCount of 3.
5. Every region must have at least 2 states (typically: populated/loaded + empty or loading).
6. Return valid JSON matching the exact schema provided.`
```

**Step 2: Create M+C generation prompt template**

Create `packages/cli/src/llm/prompts/generate-mc.ts`:

```typescript
import type { ViewTree } from '../../analyzer/types.js'

export function buildGenerateMCPrompt(
  viewTree: ViewTree,
  sourceCode: string
): string {
  return `Analyze this React screen component and generate preview metadata.

## Screen Info
- Name: ${viewTree.screenName}
- File: ${viewTree.filePath}
- Export: ${viewTree.exportType}${viewTree.exportName ? ` (${viewTree.exportName})` : ''}

## Component Tree (from static analysis)
${JSON.stringify(viewTree.tree, null, 2)}

## Screen Props
${JSON.stringify(viewTree.dataProps, null, 2)}

## Source Code
\`\`\`tsx
${sourceCode}
\`\`\`

## Required Output

Return a JSON object with exactly this structure:

{
  "model": {
    "regions": {
      "<regionKey>": {
        "label": "Human-readable label",
        "component": "ComponentName from the tree",
        "componentPath": "path.to.component in tree",
        "states": {
          "<stateName>": { "<propKey>": "<value>", ... },
          ...
        },
        "defaultState": "<stateName>",
        "isList": true/false,
        "mockItems": [...],
        "defaultCount": 3
      }
    }
  },
  "controller": {
    "flows": [
      {
        "trigger": {
          "selector": "button",
          "text": "Button Text"
        },
        "navigate": "/target-route",
        "setRegionState": { "region": "regionKey", "state": "stateName" }
      }
    ],
    "componentStates": {
      "<componentKey>": {
        "component": "ComponentName",
        "states": ["idle", "loading", ...],
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
          { "action": "Click X", "expectedState": "description" }
        ]
      }
    ]
  }
}

Rules:
- Create one region per meaningful UI component (tables, lists, forms, stat cards, etc.)
- Skip trivial elements (individual buttons, icons, labels) unless they have distinct states
- For list regions: mockItems must have ≥10 items, defaultCount = 3
- For triggers: use { selector: "button", text: "..." } format — NO data attributes
- Mock data must be realistic and domain-appropriate
- Return ONLY the JSON object, no markdown wrapping`
}
```

**Step 3: Commit**

```bash
git add packages/cli/src/llm/prompts/
git commit -m "feat(cli): add LLM prompt templates for M+C generation"
```

---

## Task 10: Zod Validation Schemas

**Files:**
- Create: `packages/cli/src/llm/schemas/model.ts`
- Create: `packages/cli/src/llm/schemas/controller.ts`

Note: This task requires adding `zod` as a dependency first.

**Step 1: Install zod**

Run: `cd /Users/loclam/Desktop/preview-tool && pnpm --filter @preview-tool/cli add zod`

**Step 2: Create model schema**

Create `packages/cli/src/llm/schemas/model.ts`:

```typescript
import { z } from 'zod'

export const ComponentRegionSchema = z.object({
  label: z.string(),
  component: z.string(),
  componentPath: z.string(),
  states: z.record(z.string(), z.record(z.string(), z.unknown())),
  defaultState: z.string(),
  isList: z.boolean().optional(),
  mockItems: z.array(z.unknown()).optional(),
  defaultCount: z.number().optional(),
})

export const ModelOutputSchema = z.object({
  regions: z.record(z.string(), ComponentRegionSchema),
})

export type ValidatedModelOutput = z.infer<typeof ModelOutputSchema>
```

**Step 3: Create controller schema**

Create `packages/cli/src/llm/schemas/controller.ts`:

```typescript
import { z } from 'zod'

export const ComponentTriggerSchema = z.object({
  selector: z.string(),
  text: z.string().optional(),
  ariaLabel: z.string().optional(),
  nth: z.number().optional(),
})

export const FlowActionV2Schema = z.object({
  trigger: ComponentTriggerSchema,
  navigate: z.string().optional(),
  navigateState: z.string().optional(),
  setRegionState: z
    .object({
      region: z.string(),
      state: z.string(),
    })
    .optional(),
})

export const ComponentStateMachineSchema = z.object({
  component: z.string(),
  states: z.array(z.string()),
  defaultState: z.string(),
  transitions: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      on: z.string(),
    })
  ),
})

export const UserJourneySchema = z.object({
  name: z.string(),
  steps: z.array(
    z.object({
      action: z.string(),
      expectedState: z.string(),
    })
  ),
})

export const ControllerOutputSchema = z.object({
  flows: z.array(FlowActionV2Schema),
  componentStates: z.record(z.string(), ComponentStateMachineSchema),
  journeys: z.array(UserJourneySchema),
})

export type ValidatedControllerOutput = z.infer<typeof ControllerOutputSchema>
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/cli/src/llm/schemas/ packages/cli/package.json pnpm-lock.yaml
git commit -m "feat(cli): add Zod validation schemas for model and controller"
```

---

## Task 11: Code Generators (view.ts, model.ts, controller.ts)

**Files:**
- Create: `packages/cli/src/generator/generate-view.ts`
- Create: `packages/cli/src/generator/generate-model.ts`
- Create: `packages/cli/src/generator/generate-controller.ts`

**Step 1: Create view.ts generator**

Create `packages/cli/src/generator/generate-view.ts`:

```typescript
import type { ViewTree } from '../analyzer/types.js'

/**
 * Generates the view.ts file content from a ViewTree.
 */
export function generateViewFileContent(viewTree: ViewTree): string {
  const lines: string[] = []

  lines.push('// Auto-generated by @preview-tool/cli — do not edit manually')
  lines.push('')
  lines.push(`export const view = ${formatValue(viewTree, 0)} as const`)
  lines.push('')

  return lines.join('\n')
}

function formatValue(value: unknown, indent: number): string {
  const json = JSON.stringify(value, null, 2)
  const padding = ' '.repeat(indent)
  return json
    .split('\n')
    .map((line, i) => (i === 0 ? line : padding + line))
    .join('\n')
}
```

**Step 2: Create model.ts generator**

Create `packages/cli/src/generator/generate-model.ts`:

```typescript
import type { ModelOutput } from '../analyzer/types.js'

/**
 * Generates the model.ts file content from a ModelOutput.
 */
export function generateModelFileContent(
  model: ModelOutput,
  meta: { route: string; pattern: string; filePath: string }
): string {
  const lines: string[] = []

  lines.push('// Auto-generated by @preview-tool/cli — do not edit manually')
  lines.push('')

  // Meta export
  lines.push('export const meta = {')
  lines.push(`  route: ${JSON.stringify(meta.route)},`)
  lines.push(`  pattern: ${JSON.stringify(meta.pattern)},`)
  lines.push(`  filePath: ${JSON.stringify(meta.filePath)},`)
  lines.push('} as const')
  lines.push('')

  // Regions export
  lines.push(`export const regions = ${formatValue(model.regions, 0)} as const`)
  lines.push('')

  return lines.join('\n')
}

function formatValue(value: unknown, indent: number): string {
  const json = JSON.stringify(value, null, 2)
  const padding = ' '.repeat(indent)
  return json
    .split('\n')
    .map((line, i) => (i === 0 ? line : padding + line))
    .join('\n')
}
```

**Step 3: Create controller.ts generator**

Create `packages/cli/src/generator/generate-controller.ts`:

```typescript
import type { ControllerOutput } from '../analyzer/types.js'

/**
 * Generates the controller.ts file content from a ControllerOutput.
 */
export function generateControllerFileContent(
  controller: ControllerOutput
): string {
  const lines: string[] = []

  lines.push('// Auto-generated by @preview-tool/cli — do not edit manually')
  lines.push('')

  // Flows export
  lines.push(`export const flows = ${formatValue(controller.flows, 0)} as const`)
  lines.push('')

  // Component states export
  lines.push(
    `export const componentStates = ${formatValue(controller.componentStates, 0)} as const`
  )
  lines.push('')

  // Journeys export
  lines.push(
    `export const journeys = ${formatValue(controller.journeys, 0)} as const`
  )
  lines.push('')

  return lines.join('\n')
}

function formatValue(value: unknown, indent: number): string {
  const json = JSON.stringify(value, null, 2)
  const padding = ' '.repeat(indent)
  return json
    .split('\n')
    .map((line, i) => (i === 0 ? line : padding + line))
    .join('\n')
}
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/cli/src/generator/generate-view.ts packages/cli/src/generator/generate-model.ts packages/cli/src/generator/generate-controller.ts
git commit -m "feat(cli): add code generators for view.ts, model.ts, controller.ts"
```

---

## Task 12: Update Config to Support LLM Settings

**Files:**
- Modify: `packages/cli/src/lib/config.ts`

**Step 1: Extend PreviewConfig with LLM settings**

In `packages/cli/src/lib/config.ts`, update the interface and defaults:

Replace the `PreviewConfig` interface and `DEFAULT_CONFIG`:

```typescript
import type { LLMConfig } from '../llm/types.js'

export interface PreviewConfig {
  screenGlob: string
  port: number
  title: string
  llm: LLMConfig
}

export const DEFAULT_CONFIG: PreviewConfig = {
  screenGlob: 'src/**/*.tsx',
  port: 6100,
  title: 'Preview Tool',
  llm: {
    provider: 'auto',
    ollamaModel: 'llama3.2',
    ollamaUrl: 'http://localhost:11434',
  },
}
```

Also update `readConfig` to merge LLM defaults:

```typescript
export async function readConfig(cwd: string): Promise<PreviewConfig> {
  const configPath = join(cwd, PREVIEW_DIR, 'preview.config.json')
  try {
    const raw = await readFile(configPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PreviewConfig>
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      llm: { ...DEFAULT_CONFIG.llm, ...(parsed.llm ?? {}) },
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/cli/src/lib/config.ts
git commit -m "feat(cli): extend config with LLM settings"
```

---

## Task 13: Update Init Command for New Directory Structure

**Files:**
- Modify: `packages/cli/src/commands/init.ts`

**Step 1: Change directory structure from flat to per-screen**

In `packages/cli/src/commands/init.ts`:

Replace `PREVIEW_SUBDIRS`:

```typescript
const PREVIEW_SUBDIRS = ['screens', 'overrides'] as const
```

Update gitignore entries in `ensureGitignore`:

```typescript
const entriesToAdd = [
  '.preview/screens',
  '.preview/*.html',
  '.preview/*.tsx',
  '.preview/*.css',
]
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/cli/src/commands/init.ts
git commit -m "refactor(cli): update init command for per-screen MVC directory structure"
```

---

## Task 14: Rewrite Generator Pipeline

**Files:**
- Modify: `packages/cli/src/generator/index.ts`

**Step 1: Rewrite the orchestration pipeline**

Replace the entire `packages/cli/src/generator/index.ts`:

```typescript
import { writeFile, mkdir } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import chalk from 'chalk'
import { discoverScreens } from '../analyzer/discover.js'
import { analyzeScreen } from '../analyzer/analyze-component.js'
import { analyzeViewTree } from '../analyzer/analyze-view.js'
import { generateViewFileContent } from './generate-view.js'
import { generateModelFileContent } from './generate-model.js'
import { generateControllerFileContent } from './generate-controller.js'
import { generateAdapterFileContent } from './generate-adapter.js'
import { callLLM } from '../llm/index.js'
import { SYSTEM_PROMPT } from '../llm/prompts/system.js'
import { buildGenerateMCPrompt } from '../llm/prompts/generate-mc.js'
import { ModelOutputSchema } from '../llm/schemas/model.js'
import { ControllerOutputSchema } from '../llm/schemas/controller.js'
import type { PreviewConfig } from '../lib/config.js'
import { PREVIEW_DIR } from '../lib/config.js'
import type {
  ScreenAnalysis,
  ViewTree,
  ModelOutput,
  ControllerOutput,
  LLMGenerationOutput,
} from '../analyzer/types.js'

export interface GenerateResult {
  screensFound: number
  viewsGenerated: number
  modelsGenerated: number
  controllersGenerated: number
  adaptersGenerated: number
  overridesSkipped: number
}

/**
 * Orchestrates the full MVC generation pipeline:
 * discover → Build V (view tree) → Build M+C (LLM or heuristic) → write files
 */
export async function generateAll(
  cwd: string,
  config: PreviewConfig
): Promise<GenerateResult> {
  const previewDir = join(cwd, PREVIEW_DIR)
  const screensDir = join(previewDir, 'screens')
  const overridesDir = join(previewDir, 'overrides')

  await mkdir(screensDir, { recursive: true })
  await mkdir(overridesDir, { recursive: true })

  // Phase 1: Discover
  console.log(chalk.dim('Discovering screens...'))
  const screens = await discoverScreens(cwd, config.screenGlob)
  console.log(chalk.dim(`  Found ${screens.length} screen(s)`))

  if (screens.length === 0) {
    return {
      screensFound: 0,
      viewsGenerated: 0,
      modelsGenerated: 0,
      controllersGenerated: 0,
      adaptersGenerated: 0,
      overridesSkipped: 0,
    }
  }

  let viewsGenerated = 0
  let modelsGenerated = 0
  let controllersGenerated = 0
  let adaptersGenerated = 0
  let overridesSkipped = 0

  for (const screen of screens) {
    const safeName = routeToFolderName(screen.route)
    const screenOutDir = join(screensDir, safeName)
    await mkdir(screenOutDir, { recursive: true })

    console.log(chalk.dim(`  Processing: ${screen.route}`))

    // Phase 2: Build V (static AST analysis)
    let viewTree: ViewTree
    try {
      viewTree = analyzeViewTree(screen)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(chalk.yellow(`    Build V failed: ${message}`))
      // Fall back to legacy analysis
      try {
        const legacyAnalysis = analyzeScreen(screen)
        await writeLegacyFiles(screenOutDir, screen, legacyAnalysis, cwd)
        modelsGenerated++
        adaptersGenerated++
      } catch {
        console.log(chalk.yellow(`    Legacy analysis also failed, skipping`))
      }
      continue
    }

    // Write view.ts
    const viewContent = generateViewFileContent(viewTree)
    await writeFile(join(screenOutDir, 'view.ts'), viewContent, 'utf-8')
    viewsGenerated++

    // Phase 3: Build M+C (LLM or heuristic)
    const relativeFilePath = relative(cwd, screen.filePath).split('\\').join('/')
    const meta = {
      route: screen.route,
      pattern: screen.pattern,
      filePath: relativeFilePath,
    }

    // Check for overrides
    const overrideDir = join(overridesDir, safeName)
    const hasModelOverride = existsSync(join(overrideDir, 'model.ts'))
    const hasControllerOverride = existsSync(join(overrideDir, 'controller.ts'))

    if (hasModelOverride || hasControllerOverride) {
      overridesSkipped++
      console.log(chalk.dim(`    Override(s) exist, skipping LLM generation`))
    }

    let model: ModelOutput
    let controller: ControllerOutput

    if (!hasModelOverride || !hasControllerOverride) {
      const mcResult = await generateMC(screen.filePath, viewTree, config, cwd)
      model = mcResult.model
      controller = mcResult.controller
    } else {
      model = { regions: {} }
      controller = { flows: [], componentStates: {}, journeys: [] }
    }

    // Write model.ts
    if (!hasModelOverride) {
      const modelContent = generateModelFileContent(model, meta)
      await writeFile(join(screenOutDir, 'model.ts'), modelContent, 'utf-8')
      modelsGenerated++
    }

    // Write controller.ts
    if (!hasControllerOverride) {
      const controllerContent = generateControllerFileContent(controller)
      await writeFile(join(screenOutDir, 'controller.ts'), controllerContent, 'utf-8')
      controllersGenerated++
    }

    // Write adapter.ts
    const adapterPath = join(screenOutDir, 'adapter.ts')
    const adapterContent = generateScreenAdapter(screen, adapterPath, screenOutDir, cwd)
    await writeFile(adapterPath, adapterContent, 'utf-8')
    adaptersGenerated++
  }

  return {
    screensFound: screens.length,
    viewsGenerated,
    modelsGenerated,
    controllersGenerated,
    adaptersGenerated,
    overridesSkipped,
  }
}

async function generateMC(
  screenFilePath: string,
  viewTree: ViewTree,
  config: PreviewConfig,
  cwd: string
): Promise<{ model: ModelOutput; controller: ControllerOutput }> {
  // Read source code
  let sourceCode: string
  try {
    sourceCode = await readFile(screenFilePath, 'utf-8')
  } catch {
    sourceCode = '// Could not read source file'
  }

  // Try LLM generation
  if (config.llm.provider !== 'none') {
    const prompt = `${SYSTEM_PROMPT}\n\n${buildGenerateMCPrompt(viewTree, sourceCode)}`
    const result = await callLLM(prompt, config.llm, {
      temperature: 0.2,
      maxTokens: 8192,
    })

    if (result && typeof result === 'object') {
      try {
        const parsed = result as { model?: unknown; controller?: unknown }
        const model = ModelOutputSchema.parse(parsed.model ?? { regions: {} })
        const controller = ControllerOutputSchema.parse(
          parsed.controller ?? { flows: [], componentStates: {}, journeys: [] }
        )
        console.log(chalk.dim('    M+C generated via LLM'))
        return { model, controller }
      } catch (validationError) {
        const msg =
          validationError instanceof Error
            ? validationError.message
            : String(validationError)
        console.log(chalk.yellow(`    LLM output validation failed: ${msg}`))
      }
    }
  }

  // Heuristic fallback
  console.log(chalk.dim('    Using heuristic fallback'))
  return generateHeuristicMC(viewTree, cwd)
}

function generateHeuristicMC(
  viewTree: ViewTree,
  cwd: string
): { model: ModelOutput; controller: ControllerOutput } {
  // Use existing analyzeScreen logic as heuristic fallback
  const regions: ModelOutput['regions'] = {}

  // Convert dataProps to basic regions
  for (const prop of viewTree.dataProps) {
    if (prop.name === 'flags') continue

    if (prop.type === 'boolean' || prop.name.startsWith('is') || prop.name.startsWith('has')) {
      regions[prop.name] = {
        label: formatLabel(prop.name),
        component: 'Screen',
        componentPath: 'root',
        states: {
          enabled: { [prop.name]: true },
          disabled: { [prop.name]: false },
        },
        defaultState: 'enabled',
      }
    } else if (prop.type.endsWith('[]') || prop.type.startsWith('Array<')) {
      regions[prop.name] = {
        label: formatLabel(prop.name),
        component: 'Screen',
        componentPath: 'root',
        states: {
          populated: { [prop.name]: generateBasicMockArray(prop.name, 10) },
          empty: { [prop.name]: [] },
        },
        defaultState: 'populated',
        isList: true,
        mockItems: generateBasicMockArray(prop.name, 10),
        defaultCount: 3,
      }
    }
  }

  return {
    model: { regions },
    controller: { flows: [], componentStates: {}, journeys: [] },
  }
}

function generateBasicMockArray(name: string, count: number): unknown[] {
  const items: unknown[] = []
  for (let i = 0; i < count; i++) {
    items.push({
      id: `${name}-${String(i + 1).padStart(3, '0')}`,
      name: `${name.charAt(0).toUpperCase() + name.slice(1)} Item ${i + 1}`,
    })
  }
  return items
}

function generateScreenAdapter(
  screen: { filePath: string; exportName?: string },
  adapterPath: string,
  screenOutDir: string,
  hostCwd: string
): string {
  const lines: string[] = []
  lines.push('// Auto-generated by @preview-tool/cli — do not edit manually')

  // Import screen component
  const relToScreen = toRelativeImport(screenOutDir, screen.filePath)
  if (screen.exportName) {
    lines.push(`import { ${screen.exportName} as Screen } from '${relToScreen}'`)
  } else {
    lines.push(`import Screen from '${relToScreen}'`)
  }

  // Import from co-located files
  lines.push(`import { meta, regions } from './model'`)
  lines.push(`import { flows, componentStates, journeys } from './controller'`)
  lines.push(`import { view } from './view'`)
  lines.push('')
  lines.push('export default Screen')
  lines.push('export { meta, regions, flows, componentStates, journeys, view }')
  lines.push('')

  return lines.join('\n')
}

function toRelativeImport(fromDir: string, toFile: string): string {
  const { relative: relFn } = require('node:path') as typeof import('node:path')
  let rel = relFn(fromDir, toFile)
  rel = rel.split('\\').join('/')
  rel = rel.replace(/\.(tsx?)$/, '')
  if (!rel.startsWith('.')) {
    rel = './' + rel
  }
  return rel
}

async function writeLegacyFiles(
  screenOutDir: string,
  screen: { route: string; pattern: string; filePath: string },
  analysis: ScreenAnalysis,
  cwd: string
): Promise<void> {
  const relativeFilePath = relative(cwd, screen.filePath).split('\\').join('/')

  // Convert legacy regions to ComponentRegion format
  const regions: Record<string, unknown> = {}
  for (const [key, region] of Object.entries(analysis.regions)) {
    regions[key] = {
      ...region,
      component: 'Screen',
      componentPath: 'root',
    }
  }

  const modelContent = [
    '// Auto-generated by @preview-tool/cli — do not edit manually',
    '',
    'export const meta = {',
    `  route: ${JSON.stringify(screen.route)},`,
    `  pattern: ${JSON.stringify(screen.pattern)},`,
    `  filePath: ${JSON.stringify(relativeFilePath)},`,
    '} as const',
    '',
    `export const regions = ${JSON.stringify(regions, null, 2)} as const`,
    '',
  ].join('\n')

  await writeFile(join(screenOutDir, 'model.ts'), modelContent, 'utf-8')

  const controllerContent = [
    '// Auto-generated by @preview-tool/cli — do not edit manually',
    '',
    `export const flows = ${JSON.stringify(analysis.flows, null, 2)} as const`,
    '',
    'export const componentStates = {} as const',
    '',
    'export const journeys = [] as const',
    '',
  ].join('\n')

  await writeFile(join(screenOutDir, 'controller.ts'), controllerContent, 'utf-8')
}

function routeToFolderName(route: string): string {
  return route
    .replace(/^\//, '')
    .replace(/\//g, '--')
    .replace(/[^a-zA-Z0-9\-_]/g, '_') || 'root'
}

function formatLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/cli/src/generator/index.ts
git commit -m "feat(cli): rewrite generator pipeline for MVC artifacts with LLM support"
```

---

## Task 15: Update Generate Command

**Files:**
- Modify: `packages/cli/src/commands/generate.ts`

**Step 1: Update output reporting and add --no-llm flag**

Replace `packages/cli/src/commands/generate.ts`:

```typescript
import { Command } from 'commander'
import { resolve } from 'node:path'
import chalk from 'chalk'
import { readConfig } from '../lib/config.js'
import { generateAll } from '../generator/index.js'

export const generateCommand = new Command('generate')
  .description('Discover screens and generate MVC preview artifacts')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .option('--no-llm', 'Skip LLM generation, use heuristic fallback only')
  .action(async (options: { cwd: string; llm: boolean }) => {
    const cwd = resolve(options.cwd)

    console.log(chalk.bold('\nPreview Tool — Generate\n'))

    const config = await readConfig(cwd)

    // Override LLM provider if --no-llm flag is set
    if (!options.llm) {
      config.llm = { ...config.llm, provider: 'none' }
    }

    console.log(chalk.dim(`Config: glob=${config.screenGlob}, llm=${config.llm.provider}`))
    console.log('')

    try {
      const result = await generateAll(cwd, config)

      console.log('')
      console.log(chalk.green('Generation complete:'))
      console.log(`  Screens found:        ${result.screensFound}`)
      console.log(`  Views generated:      ${result.viewsGenerated}`)
      console.log(`  Models generated:     ${result.modelsGenerated}`)
      console.log(`  Controllers generated: ${result.controllersGenerated}`)
      console.log(`  Adapters generated:   ${result.adaptersGenerated}`)
      if (result.overridesSkipped > 0) {
        console.log(`  Overrides skipped:    ${result.overridesSkipped}`)
      }

      console.log('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Generation failed: ${message}`))
      process.exit(1)
    }
  })
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/cli/src/commands/generate.ts
git commit -m "feat(cli): update generate command with MVC output and --no-llm flag"
```

---

## Task 16: Update Entry File Generation for New Directory Structure

**Files:**
- Modify: `packages/cli/src/server/generate-entry.ts`

**Step 1: Update main.tsx generation to use screens/ directory**

In `packages/cli/src/server/generate-entry.ts`, replace the `generateMainTsx` function:

```typescript
function generateMainTsx(): string {
  return `// Auto-generated by @preview-tool/cli — do not edit manually
import React from 'react'
import { createRoot } from 'react-dom/client'
import { PreviewShell } from '@preview-tool/runtime'
import type { ScreenEntry } from '@preview-tool/runtime'
import { Wrapper } from './wrapper'
import './preview.css'

// Auto-discover screen modules via import.meta.glob
const screenModules = import.meta.glob('./screens/*/adapter.ts')
const modelModules = import.meta.glob('./screens/*/model.ts', { eager: true }) as Record<
  string,
  { meta: { route: string }; regions: Record<string, unknown> }
>

// Auto-discover user overrides (eager)
const overrideModelModules = import.meta.glob('./overrides/*/model.ts', { eager: true }) as Record<
  string,
  { regions?: Record<string, unknown> }
>
const overrideControllerModules = import.meta.glob('./overrides/*/controller.ts', { eager: true }) as Record<
  string,
  { flows?: readonly unknown[] }
>

/**
 * Merge override regions into base model.
 */
function mergeOverrides(
  base: { regions: Record<string, unknown> },
  overrideModel: { regions?: Record<string, unknown> } | undefined
): { regions: Record<string, unknown> } {
  if (!overrideModel) return base
  return {
    regions: { ...base.regions, ...(overrideModel.regions ?? {}) },
  }
}

// Build screen entries
const entries: ScreenEntry[] = []

for (const [adapterPath, importFn] of Object.entries(screenModules)) {
  // Extract screen folder name from path
  const parts = adapterPath.split('/')
  const folderName = parts[parts.length - 2] ?? ''
  const modelPath = \`./screens/\${folderName}/model.ts\`
  const overrideModelPath = \`./overrides/\${folderName}/model.ts\`

  const model = modelModules[modelPath]
  if (!model) continue

  const overrideModel = overrideModelModules[overrideModelPath]
  const merged = mergeOverrides(model, overrideModel)

  entries.push({
    route: model.meta.route,
    module: importFn as () => Promise<{ default: React.ComponentType<{ data: unknown; flags?: Record<string, boolean> }> }>,
    regions: merged.regions as ScreenEntry['regions'],
  })
}

// Render
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <Wrapper>
        <PreviewShell screens={entries} />
      </Wrapper>
    </React.StrictMode>
  )
}
`
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/cli/src/server/generate-entry.ts
git commit -m "refactor(cli): update entry generation for per-screen MVC directory structure"
```

---

## Task 17: Update Runtime — DOM-Based Trigger Matching

**Files:**
- Modify: `packages/runtime/src/flow/trigger-matcher.ts`

**Step 1: Add DOM-based trigger matching alongside existing data-flow-target**

Replace `packages/runtime/src/flow/trigger-matcher.ts`:

```typescript
import type { ComponentTrigger } from '../types.ts'

/**
 * Walks up from a click target to find the nearest data-flow-target attribute.
 * Returns the trigger string (e.g. "RadioCard:Acute") or null if none found.
 *
 * This is the LEGACY matcher for screens that use data-flow-target attributes.
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

/**
 * DOM-based trigger matching for CLI-generated screens.
 * Matches clicks against ComponentTrigger definitions using CSS selectors
 * and text content — no data attributes required in production code.
 */
export function matchComponentTrigger(
  target: EventTarget | null,
  boundary: HTMLElement,
  triggers: ComponentTrigger[]
): ComponentTrigger | null {
  if (triggers.length === 0) return null

  for (const trigger of triggers) {
    let el = target instanceof HTMLElement ? target : null

    while (el && el !== boundary) {
      if (el.matches(trigger.selector)) {
        // Check text content match
        if (trigger.text) {
          const text = el.textContent?.trim()
          if (text && text.includes(trigger.text)) return trigger
        }
        // Check aria-label match
        else if (trigger.ariaLabel) {
          const label = el.getAttribute('aria-label')
          if (label === trigger.ariaLabel) return trigger
        }
        // No text/ariaLabel filter — selector alone matches
        else {
          return trigger
        }
      }

      el = el.parentElement
    }
  }

  return null
}
```

**Step 2: Export the new function**

In `packages/runtime/src/flow/index.ts`, add:

```typescript
export { matchComponentTrigger } from './trigger-matcher.ts'
```

In `packages/runtime/src/index.ts`, add:

```typescript
export { matchComponentTrigger } from './flow/index.ts'
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm --filter @preview-tool/runtime exec tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/runtime/src/flow/trigger-matcher.ts packages/runtime/src/flow/index.ts packages/runtime/src/index.ts
git commit -m "feat(runtime): add DOM-based trigger matching for CLI-generated flows"
```

---

## Task 18: Build and Test End-to-End

**Step 1: Build the CLI**

Run: `pnpm cli:build`
Expected: Successful compilation

**Step 2: Test against sample app (heuristic mode)**

Run: `node packages/cli/dist/index.js generate --cwd packages/cli/test-fixtures/sample-app --no-llm`
Expected: Generates `.preview/screens/{name}/view.ts`, `model.ts`, `controller.ts`, `adapter.ts`

**Step 3: Verify generated files exist and are valid TypeScript**

Run: `ls -la packages/cli/test-fixtures/sample-app/.preview/screens/`
Expected: Directories for each discovered screen

**Step 4: Commit any test fixture updates**

```bash
git add packages/cli/test-fixtures/
git commit -m "test(cli): update test fixtures for MVC generation"
```

---

## Task 19: Final Verification and Cleanup

**Step 1: Full TypeScript check (both packages)**

Run: `pnpm --filter @preview-tool/cli exec tsc --noEmit && pnpm --filter @preview-tool/runtime exec tsc --noEmit`
Expected: No errors in either package

**Step 2: Verify no console.log statements in production code**

Grep for console.log in source (not tests/fixtures):

Run: Check `packages/cli/src/` and `packages/runtime/src/` for unintended console.log statements. `chalk.dim` and `chalk.yellow` in CLI output are intentional.

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore(cli): finalize MVC generation pipeline"
```

---

## Dependency Graph

```
Task 1 (CLI types) ─────┬─→ Task 3 (Build V)
                         ├─→ Task 4-8 (LLM layer)
                         ├─→ Task 9 (prompts) ──→ Task 10 (schemas)
                         └─→ Task 11 (generators)

Task 2 (Runtime types) ──→ Task 17 (trigger matching)

Task 12 (config) ────────→ Task 13 (init) ──→ Task 14 (pipeline)

Task 3 + 8 + 9 + 10 + 11 + 14 → Task 15 (generate command)
Task 14 ──────────────────→ Task 16 (entry files)
Task 15 + 16 + 17 ───────→ Task 18 (integration test)
Task 18 ──────────────────→ Task 19 (verification)
```

Tasks 1-2 can run in parallel. Tasks 4-7 can run in parallel. Tasks 3, 11, 12-13 can run in parallel after Task 1.

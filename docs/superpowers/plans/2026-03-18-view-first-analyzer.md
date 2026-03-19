# View-First Analyzer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hook-pattern-classification pipeline with a view-first analyzer that extracts data shapes from JSX, uses a universal mock, and eliminates the hook classification layer.

**Architecture:** Analyze JSX to discover what data a screen needs (fields, types, conditions). Trace variables back to hook imports to know what to mock. Generate one universal mock template for all data hooks. Use Vite transform + Zustand for i18n (no reload).

**Tech Stack:** TypeScript, ts-morph (AST), Vite plugins, React, Zustand

**Spec:** `docs/superpowers/specs/2026-03-18-view-first-analyzer-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/cli/src/analyzer/view-analyzer.ts` | JSX analysis: extract fields, types, conditions, trace to hooks |
| `packages/cli/src/analyzer/__tests__/view-analyzer.test.ts` | Tests for view analyzer |
| `packages/cli/src/generator/universal-mock.ts` | Single mock template generator for all data hooks |
| `packages/cli/src/generator/__tests__/universal-mock.test.ts` | Tests for universal mock generator |
| `packages/cli/src/server/vite-plugin-i18n-transform.ts` | Vite plugin: transform JSX strings + inject `__pt()` for i18n |

### Modified files

| File | Change |
|------|--------|
| `packages/cli/src/spec/spec-pipeline-orchestrator.ts` | Replace hook classification with view analyzer + universal mock |
| `packages/cli/src/server/create-vite-config.ts` | Replace i18n plugin reference |
| `packages/runtime/src/ScreenRenderer.tsx` | Remove TextReplacer import (already cleaned up) |
| `packages/runtime/src/devtools/InspectorPanel.tsx` | Keep WebSocket send for i18n (already exists) |

### Removed files

| File | Reason |
|------|--------|
| `packages/runtime/src/TextReplacer.tsx` | Replaced by Vite transform approach |
| `packages/cli/src/server/vite-plugin-i18n-preview.ts` | Replaced by vite-plugin-i18n-transform.ts |

### Kept as-is

| File | Why |
|------|-----|
| `packages/cli/src/lib/hook-classifier.ts` | Kept temporarily during transition; PASSTHROUGH_PACKAGES logic extracted from it |
| `packages/cli/src/spec/spec-loader.ts` | Clean, unchanged |
| `packages/cli/src/spec/spec-to-model.ts` | Region defs unchanged |
| `packages/cli/src/spec/state-distributor.ts` | State distribution unchanged |
| `packages/cli/src/server/vite-plugin-preview-state.ts` | useState transform unchanged |
| `packages/cli/src/server/vite-plugin-spec-preview.ts` | Virtual manifest unchanged |

---

## Chunk 1: View Analyzer

### Task 1: ViewShape types

**Files:**
- Create: `packages/cli/src/analyzer/view-analyzer.ts`

- [ ] **Step 1: Define types**

```ts
// packages/cli/src/analyzer/view-analyzer.ts
import type { SourceFile } from 'ts-morph'

export interface ViewField {
  name: string
  path: string[]
  inferredType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function' | 'unknown'
  usageContext: 'rendered' | 'condition' | 'event-handler' | 'prop' | 'iterator'
  sourceVariable: string
}

export interface ViewCondition {
  expression: string
  fields: string[]
  impliedState: string | null
}

export interface HookSource {
  hookName: string
  modulePath: string
  returnFields: string[]
  calledWith: 'selector' | 'tuple-destructure' | 'no-args' | 'args'
}

export interface ViewShape {
  screenId: string
  fields: ViewField[]
  conditions: ViewCondition[]
  hookSources: HookSource[]
  staticTexts: string[]
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/analyzer/view-analyzer.ts
git commit -m "feat(analyzer): add ViewShape types for view-first analysis"
```

---

### Task 2: JSX field extraction

**Files:**
- Modify: `packages/cli/src/analyzer/view-analyzer.ts`
- Create: `packages/cli/src/analyzer/__tests__/view-analyzer.test.ts`

- [ ] **Step 1: Write failing test for field extraction**

```ts
// packages/cli/src/analyzer/__tests__/view-analyzer.test.ts
import { describe, it, expect } from 'vitest'
import { Project } from 'ts-morph'
import { extractViewFields } from '../view-analyzer.js'

function analyzeCode(code: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile('test.tsx', code)
  return extractViewFields(sf)
}

describe('extractViewFields', () => {
  it('extracts rendered text fields', () => {
    const fields = analyzeCode(`
      function Page({ data }) {
        return <p>{data.name}</p>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'data.name', path: ['data', 'name'], inferredType: 'string' })
    )
  })

  it('extracts boolean conditions from && expressions', () => {
    const fields = analyzeCode(`
      function Page({ isLoading }) {
        return <div>{isLoading && <span>Loading</span>}</div>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'isLoading', inferredType: 'boolean', usageContext: 'condition' })
    )
  })

  it('extracts array fields from .map() calls', () => {
    const fields = analyzeCode(`
      function Page({ items }) {
        return <div>{items.map(i => <p>{i.title}</p>)}</div>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'items', inferredType: 'array', usageContext: 'iterator' })
    )
  })

  it('extracts function fields from event handlers', () => {
    const fields = analyzeCode(`
      function Page({ onSubmit }) {
        return <button onClick={onSubmit}>Go</button>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'onSubmit', inferredType: 'function', usageContext: 'event-handler' })
    )
  })

  it('extracts fields from ternary conditions', () => {
    const fields = analyzeCode(`
      function Page({ error }) {
        return <div>{error ? <p>{error}</p> : <p>OK</p>}</div>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'error', usageContext: 'condition' })
    )
  })

  it('extracts nullable fields from optional chaining', () => {
    const fields = analyzeCode(`
      function Page({ user }) {
        return <p>{user?.avatar}</p>
      }
    `)
    expect(fields).toContainEqual(
      expect.objectContaining({ name: 'user?.avatar', path: ['user', 'avatar'] })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/view-analyzer.test.ts --reporter verbose`
Expected: FAIL — `extractViewFields` not exported

- [ ] **Step 3: Implement extractViewFields**

Add to `packages/cli/src/analyzer/view-analyzer.ts`:

```ts
import { SyntaxKind, type SourceFile, type JsxExpression, type Node } from 'ts-morph'

export function extractViewFields(sourceFile: SourceFile): ViewField[] {
  const fields: ViewField[] = []
  const seen = new Set<string>()

  // Find all JSX expressions: {expr}
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxExpression).forEach((expr) => {
    const child = expr.getExpression()
    if (!child) return
    extractFromExpression(child, fields, seen)
  })

  // Find event handler props: onClick={handler}
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).forEach((attr) => {
    const name = attr.getNameNode().getText()
    if (!name.startsWith('on')) return
    const init = attr.getInitializer()
    if (!init || !init.isKind(SyntaxKind.JsxExpression)) return
    const expr = init.asKind(SyntaxKind.JsxExpression)?.getExpression()
    if (!expr) return
    const text = expr.getText()
    if (!seen.has(text) && isIdentifierOrAccess(expr)) {
      seen.add(text)
      fields.push({
        name: text,
        path: text.split('.'),
        inferredType: 'function',
        usageContext: 'event-handler',
        sourceVariable: text.split('.')[0],
      })
    }
  })

  return fields
}

function extractFromExpression(node: Node, fields: ViewField[], seen: Set<string>): void {
  const kind = node.getKind()

  // Property access: data.name
  if (kind === SyntaxKind.PropertyAccessExpression && isRenderedPosition(node)) {
    const text = node.getText()
    if (!seen.has(text)) {
      seen.add(text)
      const path = text.replace(/\?/g, '').split('.')
      fields.push({
        name: text,
        path,
        inferredType: 'string', // default for rendered text
        usageContext: 'rendered',
        sourceVariable: path[0],
      })
    }
    return
  }

  // Binary expression: condition && <Component />
  if (kind === SyntaxKind.BinaryExpression) {
    const binary = node.asKindOrThrow(SyntaxKind.BinaryExpression)
    const op = binary.getOperatorToken().getText()
    if (op === '&&') {
      const left = binary.getLeft()
      const leftText = left.getText()
      if (!seen.has(leftText + ':cond') && isIdentifierOrAccess(left)) {
        seen.add(leftText + ':cond')
        const path = leftText.replace(/\?/g, '').split('.')
        fields.push({
          name: leftText,
          path,
          inferredType: 'boolean',
          usageContext: 'condition',
          sourceVariable: path[0],
        })
      }
    }
    return
  }

  // Conditional (ternary): condition ? <A /> : <B />
  if (kind === SyntaxKind.ConditionalExpression) {
    const cond = node.asKindOrThrow(SyntaxKind.ConditionalExpression)
    const condition = cond.getCondition()
    const condText = condition.getText()
    if (!seen.has(condText + ':cond') && isIdentifierOrAccess(condition)) {
      seen.add(condText + ':cond')
      const path = condText.replace(/\?/g, '').split('.')
      fields.push({
        name: condText,
        path,
        inferredType: 'boolean',
        usageContext: 'condition',
        sourceVariable: path[0],
      })
    }
    return
  }

  // Call expression: items.map(...)
  if (kind === SyntaxKind.CallExpression) {
    const call = node.asKindOrThrow(SyntaxKind.CallExpression)
    const callExpr = call.getExpression()
    if (callExpr.isKind(SyntaxKind.PropertyAccessExpression)) {
      const method = callExpr.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
      const methodName = method.getName()
      if (methodName === 'map' || methodName === 'filter' || methodName === 'forEach') {
        const obj = method.getExpression().getText()
        if (!seen.has(obj + ':iter')) {
          seen.add(obj + ':iter')
          fields.push({
            name: obj,
            path: obj.replace(/\?/g, '').split('.'),
            inferredType: 'array',
            usageContext: 'iterator',
            sourceVariable: obj.split('.')[0],
          })
        }
      }
    }
    return
  }

  // Simple identifier rendered as text: {name}
  if (kind === SyntaxKind.Identifier && isRenderedPosition(node)) {
    const text = node.getText()
    // Skip React/JSX built-ins and common non-data identifiers
    if (!seen.has(text) && !isBuiltinIdentifier(text)) {
      seen.add(text)
      fields.push({
        name: text,
        path: [text],
        inferredType: 'string',
        usageContext: 'rendered',
        sourceVariable: text,
      })
    }
  }
}

function isRenderedPosition(node: Node): boolean {
  // Check if this node is directly inside a JsxExpression (rendered in JSX)
  let parent = node.getParent()
  while (parent) {
    if (parent.isKind(SyntaxKind.JsxExpression)) return true
    if (parent.isKind(SyntaxKind.JsxAttribute)) return false
    if (parent.isKind(SyntaxKind.Block)) return false
    parent = parent.getParent()
  }
  return false
}

function isIdentifierOrAccess(node: Node): boolean {
  return node.isKind(SyntaxKind.Identifier) ||
    node.isKind(SyntaxKind.PropertyAccessExpression) ||
    node.isKind(SyntaxKind.ElementAccessExpression)
}

function isBuiltinIdentifier(name: string): boolean {
  return ['React', 'undefined', 'null', 'true', 'false', 'console', 'window', 'document',
    'Math', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Error',
    'Promise', 'Map', 'Set', 'RegExp', 'Symbol', 'Proxy', 'Reflect'].includes(name)
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/view-analyzer.test.ts --reporter verbose`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/analyzer/view-analyzer.ts packages/cli/src/analyzer/__tests__/view-analyzer.test.ts
git commit -m "feat(analyzer): implement JSX field extraction in view analyzer"
```

---

### Task 3: Hook source tracing

**Files:**
- Modify: `packages/cli/src/analyzer/view-analyzer.ts`
- Modify: `packages/cli/src/analyzer/__tests__/view-analyzer.test.ts`

- [ ] **Step 1: Write failing test for hook tracing**

Add to test file:

```ts
import { extractHookSources } from '../view-analyzer.js'

describe('extractHookSources', () => {
  it('traces variable to hook import', () => {
    const sources = analyzeHooks(`
      import { useAuthStore } from '@/stores/auth-store'
      function Page() {
        const { user, logout } = useAuthStore()
        return <p>{user.name}</p>
      }
    `)
    expect(sources).toContainEqual(
      expect.objectContaining({
        hookName: 'useAuthStore',
        modulePath: '@/stores/auth-store',
        returnFields: expect.arrayContaining(['user', 'logout']),
        calledWith: 'no-args',
      })
    )
  })

  it('detects selector pattern', () => {
    const sources = analyzeHooks(`
      import { useStore } from '@/stores/main'
      function Page() {
        const name = useStore((s) => s.user.name)
        return <p>{name}</p>
      }
    `)
    expect(sources).toContainEqual(
      expect.objectContaining({
        hookName: 'useStore',
        calledWith: 'selector',
      })
    )
  })

  it('detects tuple destructuring (useState-like)', () => {
    const sources = analyzeHooks(`
      import { useSearchParams } from 'react-router-dom'
      function Page() {
        const [params, setParams] = useSearchParams()
        return <p>{params.get('q')}</p>
      }
    `)
    expect(sources).toContainEqual(
      expect.objectContaining({
        hookName: 'useSearchParams',
        calledWith: 'tuple-destructure',
      })
    )
  })
})

function analyzeHooks(code: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile('test.tsx', code)
  return extractHookSources(sf)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/view-analyzer.test.ts --reporter verbose`
Expected: FAIL — `extractHookSources` not exported

- [ ] **Step 3: Implement extractHookSources**

Add to `view-analyzer.ts`:

```ts
export function extractHookSources(sourceFile: SourceFile): HookSource[] {
  const sources: HookSource[] = []
  const importMap = buildImportMap(sourceFile)

  // Find all call expressions that start with 'use'
  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call) => {
    const expr = call.getExpression()
    const hookName = expr.getText()

    // Must be a use* hook
    if (!hookName.match(/^use[A-Z]/)) return

    // Must be imported (not local function)
    const modulePath = importMap.get(hookName)
    if (!modulePath) return

    // Skip React built-in hooks
    if (modulePath === 'react' || modulePath === 'react-dom') return

    // Determine call style
    const args = call.getArguments()
    let calledWith: HookSource['calledWith'] = 'no-args'
    if (args.length > 0) {
      const firstArg = args[0]
      if (firstArg.isKind(SyntaxKind.ArrowFunction) || firstArg.isKind(SyntaxKind.FunctionExpression)) {
        calledWith = 'selector'
      } else {
        calledWith = 'args'
      }
    }

    // Extract return fields from destructuring
    const returnFields = extractReturnFields(call)

    // Check for tuple destructuring: const [a, b] = useHook()
    if (returnFields.length === 0) {
      const parent = call.getParent()
      if (parent?.isKind(SyntaxKind.VariableDeclaration)) {
        const nameNode = parent.asKindOrThrow(SyntaxKind.VariableDeclaration).getNameNode()
        if (nameNode.isKind(SyntaxKind.ArrayBindingPattern)) {
          calledWith = 'tuple-destructure'
          nameNode.getElements().forEach((el) => {
            if (el.isKind(SyntaxKind.BindingElement)) {
              returnFields.push(el.getName())
            }
          })
        }
      }
    }

    sources.push({ hookName, modulePath, returnFields, calledWith })
  })

  return deduplicateHookSources(sources)
}

function buildImportMap(sourceFile: SourceFile): Map<string, string> {
  const map = new Map<string, string>()
  sourceFile.getImportDeclarations().forEach((decl) => {
    const modulePath = decl.getModuleSpecifierValue()
    decl.getNamedImports().forEach((named) => {
      map.set(named.getAliasNode()?.getText() ?? named.getName(), modulePath)
    })
    const defaultImport = decl.getDefaultImport()
    if (defaultImport) {
      map.set(defaultImport.getText(), modulePath)
    }
  })
  return map
}

function extractReturnFields(call: Node): string[] {
  const parent = call.getParent()
  if (!parent?.isKind(SyntaxKind.VariableDeclaration)) return []
  const nameNode = parent.asKindOrThrow(SyntaxKind.VariableDeclaration).getNameNode()
  if (nameNode.isKind(SyntaxKind.ObjectBindingPattern)) {
    return nameNode.getElements()
      .filter((el) => el.isKind(SyntaxKind.BindingElement))
      .map((el) => el.asKindOrThrow(SyntaxKind.BindingElement).getName())
  }
  return []
}

function deduplicateHookSources(sources: HookSource[]): HookSource[] {
  const map = new Map<string, HookSource>()
  for (const source of sources) {
    const key = `${source.modulePath}::${source.hookName}`
    const existing = map.get(key)
    if (existing) {
      // Merge return fields from multiple calls (e.g., multiple selector calls)
      const merged = new Set([...existing.returnFields, ...source.returnFields])
      existing.returnFields = [...merged]
    } else {
      map.set(key, { ...source })
    }
  }
  return [...map.values()]
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/view-analyzer.test.ts --reporter verbose`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/analyzer/view-analyzer.ts packages/cli/src/analyzer/__tests__/view-analyzer.test.ts
git commit -m "feat(analyzer): implement hook source tracing in view analyzer"
```

---

### Task 4: Static text extraction (for i18n)

**Files:**
- Modify: `packages/cli/src/analyzer/view-analyzer.ts`
- Modify: `packages/cli/src/analyzer/__tests__/view-analyzer.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { extractStaticTexts } from '../view-analyzer.js'

describe('extractStaticTexts', () => {
  it('extracts text from JSX elements', () => {
    const texts = analyzeTexts(`
      function Page() {
        return <div>
          <h1>Termin buchen</h1>
          <p>Willkommen zurück</p>
        </div>
      }
    `)
    expect(texts).toContain('Termin buchen')
    expect(texts).toContain('Willkommen zurück')
  })

  it('ignores dynamic expressions', () => {
    const texts = analyzeTexts(`
      function Page({ name }) {
        return <p>{name}</p>
      }
    `)
    expect(texts).toHaveLength(0)
  })

  it('extracts translatable string props', () => {
    const texts = analyzeTexts(`
      function Page() {
        return <input placeholder="Fachrichtung suchen..." />
      }
    `)
    expect(texts).toContain('Fachrichtung suchen...')
  })
})

function analyzeTexts(code: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile('test.tsx', code)
  return extractStaticTexts(sf)
}
```

- [ ] **Step 2: Implement extractStaticTexts**

```ts
const TRANSLATABLE_PROPS = new Set(['placeholder', 'title', 'aria-label', 'alt'])

export function extractStaticTexts(sourceFile: SourceFile): string[] {
  const texts: string[] = []
  const seen = new Set<string>()

  // JSX text content: <h1>Termin buchen</h1>
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxText).forEach((textNode) => {
    const text = textNode.getText().trim()
    if (text && !seen.has(text)) {
      seen.add(text)
      texts.push(text)
    }
  })

  // String literal props: placeholder="Search..."
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).forEach((attr) => {
    const propName = attr.getNameNode().getText()
    if (!TRANSLATABLE_PROPS.has(propName)) return
    const init = attr.getInitializer()
    if (init?.isKind(SyntaxKind.StringLiteral)) {
      const text = init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
      if (text && !seen.has(text)) {
        seen.add(text)
        texts.push(text)
      }
    }
  })

  return texts
}
```

- [ ] **Step 3: Run tests**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/view-analyzer.test.ts --reporter verbose`
Expected: All 12 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/analyzer/view-analyzer.ts packages/cli/src/analyzer/__tests__/view-analyzer.test.ts
git commit -m "feat(analyzer): add static text extraction for i18n"
```

---

### Task 5: Full analyzeView() orchestrator

**Files:**
- Modify: `packages/cli/src/analyzer/view-analyzer.ts`
- Modify: `packages/cli/src/analyzer/__tests__/view-analyzer.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { analyzeView } from '../view-analyzer.js'

describe('analyzeView', () => {
  it('produces complete ViewShape', () => {
    const shape = analyzeFullView(`
      import { useAuthStore } from '@/stores/auth-store'
      function Page() {
        const { user, logout } = useAuthStore()
        return (
          <div>
            <h1>Willkommen</h1>
            {user && <p>{user.name}</p>}
            <button onClick={logout}>Abmelden</button>
          </div>
        )
      }
    `)
    expect(shape.fields.length).toBeGreaterThan(0)
    expect(shape.hookSources).toHaveLength(1)
    expect(shape.hookSources[0].hookName).toBe('useAuthStore')
    expect(shape.staticTexts).toContain('Willkommen')
    expect(shape.staticTexts).toContain('Abmelden')
  })
})

function analyzeFullView(code: string) {
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile('test.tsx', code)
  return analyzeView(sf, 'test-screen')
}
```

- [ ] **Step 2: Implement analyzeView**

```ts
export function analyzeView(sourceFile: SourceFile, screenId: string): ViewShape {
  return {
    screenId,
    fields: extractViewFields(sourceFile),
    conditions: extractViewConditions(sourceFile),
    hookSources: extractHookSources(sourceFile),
    staticTexts: extractStaticTexts(sourceFile),
  }
}

export function extractViewConditions(sourceFile: SourceFile): ViewCondition[] {
  const conditions: ViewCondition[] = []
  const seen = new Set<string>()

  sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression).forEach((binary) => {
    const op = binary.getOperatorToken().getText()
    if (op !== '&&') return

    // Only in JSX context
    if (!binary.getFirstAncestorByKind(SyntaxKind.JsxExpression)) return

    const left = binary.getLeft()
    const text = left.getText()
    if (seen.has(text)) return
    seen.add(text)

    const fields = [text.replace(/\?/g, '').split('.')[0]]
    const impliedState = inferStateName(text)
    conditions.push({ expression: text, fields, impliedState })
  })

  return conditions
}

function inferStateName(expression: string): string | null {
  const lower = expression.toLowerCase()
  if (lower.includes('loading')) return 'loading'
  if (lower.includes('error')) return 'error'
  if (lower.includes('offline')) return 'offline'
  if (lower.includes('empty') || lower.includes('length === 0') || lower.includes('length > 0')) return 'empty'
  return null
}
```

- [ ] **Step 3: Run tests, commit**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/view-analyzer.test.ts --reporter verbose`

```bash
git add packages/cli/src/analyzer/view-analyzer.ts packages/cli/src/analyzer/__tests__/view-analyzer.test.ts
git commit -m "feat(analyzer): add analyzeView orchestrator with condition extraction"
```

---

## Chunk 2: Universal Mock Generator

### Task 6: Universal mock template

**Files:**
- Create: `packages/cli/src/generator/universal-mock.ts`
- Create: `packages/cli/src/generator/__tests__/universal-mock.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/cli/src/generator/__tests__/universal-mock.test.ts
import { describe, it, expect } from 'vitest'
import { generateUniversalMock } from '../universal-mock.js'

describe('generateUniversalMock', () => {
  it('generates mock with region data lookup', () => {
    const code = generateUniversalMock({
      hookName: 'useAuthStore',
      regionKey: 'auth-store',
      importPath: '@/stores/auth-store',
      isBarrel: false,
      hasStaticGetState: false,
      returnStyle: 'object',
    })
    expect(code).toContain("export function useAuthStore")
    expect(code).toContain("useRegionDataForHook('auth-store')")
    expect(code).toContain("export * from '__real:@/stores/auth-store'")
  })

  it('adds .getState() when requested', () => {
    const code = generateUniversalMock({
      hookName: 'useAuthStore',
      regionKey: 'auth-store',
      importPath: '@/stores/auth-store',
      isBarrel: false,
      hasStaticGetState: true,
      returnStyle: 'object',
    })
    expect(code).toContain("useAuthStore.getState")
    expect(code).toContain("useAuthStore.setState")
    expect(code).toContain("useAuthStore.subscribe")
  })

  it('generates tuple return for tuple-destructure style', () => {
    const code = generateUniversalMock({
      hookName: 'useSearchParams',
      regionKey: 'search-params',
      importPath: 'react-router-dom',
      isBarrel: false,
      hasStaticGetState: false,
      returnStyle: 'tuple',
    })
    expect(code).toContain("return [")
    expect(code).toContain("NOOP")
  })

  it('skips __real: re-export for barrel files', () => {
    const code = generateUniversalMock({
      hookName: 'useAuth',
      regionKey: 'auth',
      importPath: '@/hooks/index',
      isBarrel: true,
      hasStaticGetState: false,
      returnStyle: 'object',
    })
    expect(code).not.toContain("__real:")
  })
})
```

- [ ] **Step 2: Implement generateUniversalMock**

```ts
// packages/cli/src/generator/universal-mock.ts

export interface UniversalMockOptions {
  hookName: string
  regionKey: string
  importPath: string
  isBarrel: boolean
  hasStaticGetState: boolean
  returnStyle: 'object' | 'tuple'
}

export function generateUniversalMock(options: UniversalMockOptions): string {
  const { hookName, regionKey, importPath, isBarrel, hasStaticGetState, returnStyle } = options

  const lines: string[] = [
    `// Auto-generated universal mock for ${importPath}`,
  ]

  // Re-export non-mocked names from the real module
  if (!isBarrel) {
    lines.push(`export * from '__real:${importPath}'`)
  }

  lines.push(
    '',
    "import { useRegionDataForHook } from '@preview-tool/runtime'",
    '',
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    'const NOOP = (() => {}) as any',
    '',
  )

  if (returnStyle === 'tuple') {
    lines.push(
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      `export function ${hookName}(..._args: any[]) {`,
      `  const data = useRegionDataForHook('${regionKey}') ?? {}`,
      '  return [data, NOOP] as const',
      '}',
    )
  } else {
    lines.push(
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
      `export function ${hookName}(..._args: any[]) {`,
      `  const data = useRegionDataForHook('${regionKey}') ?? {}`,
      '  const proxied = new Proxy(data as any, {',
      '    get(t, k) {',
      '      if (typeof k === "symbol") return t[k]',
      '      if (k in t) return t[k]',
      '      return undefined',
      '    }',
      '  })',
      '  // Zustand selector pattern: useStore((s) => s.field)',
      '  if (typeof _args[0] === "function") {',
      '    try {',
      '      const selectorProxy = new Proxy(data as any, {',
      '        get(t, k) { return (typeof k === "symbol" || k in t) ? t[k] : NOOP }',
      '      })',
      '      return _args[0](selectorProxy)',
      '    } catch { return proxied }',
      '  }',
      '  return proxied',
      '}',
    )
  }

  // Static methods (Zustand .getState() etc.)
  if (hasStaticGetState) {
    lines.push(
      '',
      '// Zustand static methods',
      `${hookName}.getState = () => useRegionDataForHook('${regionKey}') ?? {}`,
      `${hookName}.setState = NOOP`,
      `${hookName}.subscribe = () => NOOP`,
    )
  }

  return lines.join('\n') + '\n'
}
```

- [ ] **Step 3: Run tests, commit**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/universal-mock.test.ts --reporter verbose`
Expected: All 4 tests PASS

```bash
git add packages/cli/src/generator/universal-mock.ts packages/cli/src/generator/__tests__/universal-mock.test.ts
git commit -m "feat(generator): add universal mock generator — one template for all hooks"
```

---

## Chunk 3: i18n Vite Transform (no reload)

### Task 7: Rewrite i18n plugin with `__pt()` approach

**Files:**
- Create: `packages/cli/src/server/vite-plugin-i18n-transform.ts`
- Modify: `packages/cli/src/server/create-vite-config.ts` (swap plugin reference)

- [ ] **Step 1: Create the new i18n transform plugin**

```ts
// packages/cli/src/server/vite-plugin-i18n-transform.ts
import type { SpecManifest } from '../spec/types.js'

interface I18nTransformOptions {
  manifest: SpecManifest
  screenFilePaths: string[]
}

/**
 * Vite plugin for preview i18n. Transforms hardcoded JSX strings into
 * __pt() calls that read the active language from the Zustand store.
 *
 * No page reload. No DOM mutation. React re-renders naturally.
 */
export function createI18nTransformPlugin(options: I18nTransformOptions) {
  // Build a set of all translatable strings from all screen specs
  const translatableStrings = new Set<string>()
  const translationIndex: Record<string, Record<string, string>> = {}

  for (const screen of options.manifest.screens) {
    if (!screen.translations) continue
    for (const [lang, entries] of Object.entries(screen.translations)) {
      for (const [sourceText, translated] of Object.entries(entries as Record<string, unknown>)) {
        if (typeof translated !== 'string') continue
        translatableStrings.add(sourceText)
        if (!translationIndex[sourceText]) translationIndex[sourceText] = {}
        translationIndex[sourceText][lang] = translated
      }
    }
  }

  if (translatableStrings.size === 0) return null

  const screenFiles = new Set(options.screenFilePaths)

  return {
    name: 'preview-i18n-transform',
    enforce: 'pre' as const,

    transform(code: string, id: string) {
      if (!screenFiles.has(id)) return null
      if (!id.endsWith('.tsx') && !id.endsWith('.jsx')) return null

      let transformed = code
      let hasReplacements = false

      for (const sourceText of translatableStrings) {
        const escaped = sourceText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

        // Replace JSX text content: >Termin buchen< → >{__pt("Termin buchen")}<
        const jsxTextRegex = new RegExp(`(>\\s*)${escaped}(\\s*<)`, 'g')
        transformed = transformed.replace(jsxTextRegex, (_, before, after) => {
          hasReplacements = true
          return `${before}{__pt("${sourceText}")}${after}`
        })

        // Replace string literal props: placeholder="text" → placeholder={__pt("text")}
        const propRegex = new RegExp(`((?:placeholder|title|aria-label|alt)=)(["'])${escaped}\\2`, 'g')
        transformed = transformed.replace(propRegex, (_, prefix) => {
          hasReplacements = true
          return `${prefix}{__pt("${sourceText}")}`
        })

        // Replace string literals in expressions: 'text' or "text" in ternaries, variables
        const quotedRegex = new RegExp(`(['"])${escaped}\\1`, 'g')
        transformed = transformed.replace(quotedRegex, (_match, _quote) => {
          hasReplacements = true
          return `__pt("${sourceText}")`
        })
      }

      if (!hasReplacements) return null

      // Inject __pt function and language subscription at the top of the file
      const injection = `
import { useDevToolsStore as __useDevToolsStore } from '@preview-tool/runtime';
const __ptIndex = ${JSON.stringify(translationIndex)};
function __pt(s) { const l = __useDevToolsStore.getState().language; return __ptIndex[s]?.[l] ?? s; }
`
      // Inject useDevToolsStore subscription inside each component for reactivity
      // Find the first function component and inject const __lang = ...
      const componentMatch = transformed.match(/(export\s+function\s+\w+\s*\([^)]*\)\s*\{)/)
      if (componentMatch) {
        transformed = transformed.replace(
          componentMatch[1],
          `${componentMatch[1]}\n  const __lang = __useDevToolsStore((s) => s.language);`
        )
      }

      return { code: injection + transformed, map: null }
    },
  }
}
```

- [ ] **Step 2: Update create-vite-config.ts to use new plugin**

In `packages/cli/src/server/create-vite-config.ts`, replace the i18n plugin import:

Change:
```ts
const { createI18nPreviewPlugin } = await import('./vite-plugin-i18n-preview.js')
```
To:
```ts
const { createI18nTransformPlugin } = await import('./vite-plugin-i18n-transform.js')
```

And:
```ts
i18nPlugin = createI18nPreviewPlugin({ manifest, screenFilePaths })
```
To:
```ts
i18nPlugin = createI18nTransformPlugin({ manifest, screenFilePaths })
```

- [ ] **Step 3: Delete old i18n plugin and TextReplacer**

```bash
rm packages/cli/src/server/vite-plugin-i18n-preview.ts
rm packages/runtime/src/TextReplacer.tsx
```

- [ ] **Step 4: Build and verify**

Run: `pnpm build`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(i18n): rewrite i18n as Vite transform with __pt() — no reload, no DOM mutation"
```

---

## Chunk 4: Pipeline Integration

### Task 8: Wire view analyzer + universal mock into pipeline

**Files:**
- Modify: `packages/cli/src/spec/spec-pipeline-orchestrator.ts`

This is the largest change. The pipeline currently uses `classifyHook()` at lines 149 and 520, and `generateMockFileForImportPath()` at line 394 with pattern-specific templates. Replace both with the view analyzer and universal mock.

- [ ] **Step 1: Add view analyzer import and passthrough list**

At the top of `spec-pipeline-orchestrator.ts`, add:

```ts
import { analyzeView, type HookSource } from '../analyzer/view-analyzer.js'
import { generateUniversalMock } from '../generator/universal-mock.js'

const PASSTHROUGH_PACKAGES = new Set([
  'react-router-dom',
  'react-hook-form',
  'react-i18next',
  '@tanstack/react-router',
  'next/router',
  'next/navigation',
])
```

- [ ] **Step 2: Replace classifyHook usage at line ~149 (hook filtering)**

Replace the `classifyHook(hook.name, hook.importPath) !== 'data'` check with:

```ts
PASSTHROUGH_PACKAGES.has(hook.importPath)
```

- [ ] **Step 3: Replace classifyHook usage at line ~520 (context hook detection)**

Replace the `classifyHook` call in `detectContextHooks` with the same passthrough check.

- [ ] **Step 4: Replace generateMockFileForImportPath with universal mock**

Replace the body of `generateMockFileForImportPath()` to call `generateUniversalMock()` for each hook, using the ViewShape data to determine `returnStyle` and `hasStaticGetState`.

- [ ] **Step 5: Build and run tests**

```bash
pnpm build
cd packages/cli && npx vitest run --reporter verbose
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(pipeline): replace hook classification with view analyzer + universal mock"
```

---

### Task 9: Integration test with booking app

- [ ] **Step 1: Run preview against booking app**

```bash
cd ~/Desktop/booking/client
node ~/Desktop/preview-tool/packages/cli/dist/index.js dev --cwd . --specs ../.specs
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:6100 and check:
1. scr-home renders without crashes
2. scr-login renders (was blank before)
3. scr-appointment-list renders with state switching
4. Language toggle (EN/DE) works without page reload
5. Font scale slider works
6. Network mode (offline/slow-3g) switches region states

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve integration issues from view-first migration"
```

---

## Chunk 5: Cleanup

### Task 10: Remove dead code

- [ ] **Step 1: Remove hook-classifier import from pipeline**

Remove `import { classifyHook } from '../lib/hook-classifier.js'` from `spec-pipeline-orchestrator.ts`.

- [ ] **Step 2: Verify no other files import hook-classifier**

```bash
grep -r "hook-classifier" packages/cli/src/ --include="*.ts"
```

If no other imports found, the file can stay (it's small, well-documented, and may be useful as reference). Mark it with a deprecation comment.

- [ ] **Step 3: Run full test suite**

```bash
cd packages/cli && npx vitest run --reporter verbose
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove hook-classifier usage from pipeline"
```

---

### Task 11: Update existing tests

- [ ] **Step 1: Fix computeRegionData.test.ts import path**

The test imports from `../ScreenRenderer.ts` but the file is `.tsx`. Fix the import.

- [ ] **Step 2: Run all tests**

```bash
cd packages/cli && npx vitest run --reporter verbose
```

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: fix import paths and update tests for view-first migration"
```

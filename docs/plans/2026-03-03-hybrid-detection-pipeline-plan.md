# Hybrid Detection Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current regex+AST+heuristic detection pipeline with a 4-stage hybrid architecture (Discover → Fast AST Facts → Batch LLM Understanding → Simplified Codegen) that's 3-5x faster and detects 85-90% of regions/states/flows (up from 50-60%).

**Architecture:** Stage 2 (fact collector) uses a single shared ts-morph Project with parallel per-screen extraction — no regex, no heuristics. Stage 3 sends all facts + source to Claude Code in one batch call, getting back regions, state machines, flows, and hook→region bindings. Stage 4 does direct mapping from LLM output to generated files. A template library provides fallback when LLM is unavailable.

**Tech Stack:** TypeScript, ts-morph (shared Project), Zod (schema validation), Claude Code CLI (batch LLM), pnpm workspace monorepo.

**Design doc:** `docs/plans/2026-03-03-hybrid-detection-pipeline-design.md`

---

## Strategy: Build Alongside, Then Swap

New modules are built next to existing code. The old pipeline stays functional until Phase D swaps `generateAll()` to the new pipeline. This prevents breaking changes during development.

```
Phase A: New fact collector     (packages/cli/src/analyzer/collect-facts.ts)
Phase B: LLM understanding      (packages/cli/src/analyzer/understand-screens.ts)
Phase C: Simplified codegen      (packages/cli/src/generator/generate-from-analysis.ts)
Phase D: Pipeline swap + cleanup (packages/cli/src/generator/index.ts rewrite)
```

---

## Phase A: Fast AST Fact Collection

### Task 1: Define ScreenFacts type

**Files:**
- Modify: `packages/cli/src/analyzer/types.ts`
- Test: `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

**Step 1: Write the type definitions**

Add to `packages/cli/src/analyzer/types.ts`:

```typescript
// === Stage 2: AST Fact Collection ===

export interface HookFact {
  /** Hook function name as called: 'useQuery', 'useAuth' */
  name: string
  /** Full import path: '@tanstack/react-query', '../hooks/useAuth' */
  importPath: string
  /** Raw argument source text: ["{ queryKey: ['users'] }", "options"] */
  arguments: string[]
  /** Destructured return: 'const { data, isLoading }' or undefined */
  returnVariable?: string
}

export interface ComponentFact {
  /** Component name: 'DataTable', 'Button' */
  name: string
  /** Import path: '@/components/DataTable' */
  importPath: string
  /** Raw prop names passed: ['data', 'onSubmit', 'loading'] */
  props: string[]
  /** Child component names */
  children: string[]
}

export interface ConditionalFact {
  /** Raw condition text: 'isLoading', 'data.length > 0' */
  condition: string
  /** Component names in true branch */
  trueBranch: string[]
  /** Component names in false branch */
  falseBranch: string[]
}

export interface NavigationFact {
  /** Target route or expression: '/booking', '`/details/${id}`' */
  target: string
  /** Description of trigger: 'onClick on Button "Book Now"', '<Link to=...>' */
  trigger: string
}

export interface ScreenFacts {
  route: string
  filePath: string
  exportName?: string
  sourceCode: string
  hooks: HookFact[]
  components: ComponentFact[]
  conditionals: ConditionalFact[]
  navigation: NavigationFact[]
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/analyzer/types.ts
git commit -m "feat(analyzer): add ScreenFacts type for AST fact collection"
```

---

### Task 2: Build fact collector — hook extraction

**Files:**
- Create: `packages/cli/src/analyzer/collect-facts.ts`
- Create: `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

**Step 1: Write the failing test**

Create `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractHookFacts } from '../collect-facts.js'
import { Project, SyntaxKind } from 'ts-morph'

function createSourceFile(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: 4, strict: true },
  })
  return project.createSourceFile('test.tsx', code)
}

describe('extractHookFacts', () => {
  it('extracts useQuery with queryKey', () => {
    const sf = createSourceFile(`
      import { useQuery } from '@tanstack/react-query'
      function Screen() {
        const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
        return <div>{data}</div>
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toEqual([
      {
        name: 'useQuery',
        importPath: '@tanstack/react-query',
        arguments: ["{ queryKey: ['users'], queryFn: fetchUsers }"],
        returnVariable: '{ data, isLoading }',
      },
    ])
  })

  it('extracts useAppLiveQuery with sectionId string', () => {
    const sf = createSourceFile(`
      import { useAppLiveQuery } from '@/hooks/use-app-live-query'
      function Screen() {
        const result = useAppLiveQuery(q => q, 'service-grid')
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].name).toBe('useAppLiveQuery')
    expect(hooks[0].importPath).toBe('@/hooks/use-app-live-query')
    expect(hooks[0].arguments).toEqual(['q => q', "'service-grid'"])
  })

  it('extracts Zustand store hook', () => {
    const sf = createSourceFile(`
      import { useAuthStore } from '@/stores/auth'
      function Screen() {
        const user = useAuthStore(s => s.user)
        return <div>{user.name}</div>
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].name).toBe('useAuthStore')
    expect(hooks[0].importPath).toBe('@/stores/auth')
  })

  it('extracts useContext call', () => {
    const sf = createSourceFile(`
      import { useContext } from 'react'
      import { AuthContext } from '../context/auth'
      function Screen() {
        const auth = useContext(AuthContext)
        return <div>{auth.user}</div>
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toEqual([
      {
        name: 'useContext',
        importPath: 'react',
        arguments: ['AuthContext'],
        returnVariable: 'auth',
      },
    ])
  })

  it('handles aliased imports', () => {
    const sf = createSourceFile(`
      import { useQuery as useCustomQuery } from '@tanstack/react-query'
      function Screen() {
        const data = useCustomQuery({ queryKey: ['items'] })
        return <div />
      }
    `)
    const hooks = extractHookFacts(sf)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].name).toBe('useCustomQuery')
    expect(hooks[0].importPath).toBe('@tanstack/react-query')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/cli/src/analyzer/collect-facts.ts`:

```typescript
import { type SourceFile, SyntaxKind, type CallExpression, type Node } from 'ts-morph'
import type { HookFact } from './types.js'

/**
 * Extract all hook call facts from a source file using AST.
 * No pattern matching — just collects raw call data.
 */
export function extractHookFacts(sourceFile: SourceFile): HookFact[] {
  const hooks: HookFact[] = []

  // Build import map: localName → importPath
  const importMap = new Map<string, string>()
  for (const decl of sourceFile.getImportDeclarations()) {
    const modulePath = decl.getModuleSpecifierValue()
    for (const named of decl.getNamedImports()) {
      importMap.set(named.getName(), modulePath)
      const alias = named.getAliasNode()
      if (alias) {
        importMap.delete(named.getName())
        importMap.set(alias.getText(), modulePath)
      }
    }
    const defaultImport = decl.getDefaultImport()
    if (defaultImport) {
      importMap.set(defaultImport.getText(), modulePath)
    }
  }

  // Find all call expressions that are hook calls (start with 'use')
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

  for (const call of calls) {
    const expr = call.getExpression()
    const name = expr.getText()

    // Only process hook calls (useXxx pattern)
    if (!name.startsWith('use') || !importMap.has(name)) continue

    const importPath = importMap.get(name)!
    const args = call.getArguments().map((arg) => arg.getText())

    // Extract return variable from parent
    const returnVariable = extractReturnVariable(call)

    hooks.push({
      name,
      importPath,
      arguments: args,
      ...(returnVariable ? { returnVariable } : {}),
    })
  }

  return hooks
}

function extractReturnVariable(call: CallExpression): string | undefined {
  const parent = call.getParent()
  if (!parent) return undefined

  // const { data, isLoading } = useQuery(...)
  // const result = useQuery(...)
  if (parent.isKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = parent.getNameNode()
    return nameNode.getText()
  }

  return undefined
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/collect-facts.ts packages/cli/src/analyzer/__tests__/collect-facts.test.ts
git commit -m "feat(analyzer): add hook fact extraction via AST"
```

---

### Task 3: Build fact collector — component, conditional, navigation extraction

**Files:**
- Modify: `packages/cli/src/analyzer/collect-facts.ts`
- Modify: `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

**Step 1: Write failing tests for component extraction**

Add to `collect-facts.test.ts`:

```typescript
import { extractComponentFacts, extractConditionalFacts, extractNavigationFacts } from '../collect-facts.js'

describe('extractComponentFacts', () => {
  it('extracts components with props and children', () => {
    const sf = createSourceFile(`
      import { DataTable } from '@/components/DataTable'
      import { Button } from '@/components/Button'
      function Screen() {
        return (
          <DataTable data={items} loading={isLoading}>
            <Button onClick={handleClick}>Submit</Button>
          </DataTable>
        )
      }
    `)
    const components = extractComponentFacts(sf)
    expect(components).toEqual([
      {
        name: 'DataTable',
        importPath: '@/components/DataTable',
        props: ['data', 'loading'],
        children: ['Button'],
      },
      {
        name: 'Button',
        importPath: '@/components/Button',
        props: ['onClick'],
        children: [],
      },
    ])
  })
})

describe('extractConditionalFacts', () => {
  it('extracts ternary JSX conditionals', () => {
    const sf = createSourceFile(`
      function Screen({ isLoading, data }) {
        return (
          <div>
            {isLoading ? <Spinner /> : <DataTable data={data} />}
          </div>
        )
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    expect(conditionals).toHaveLength(1)
    expect(conditionals[0].condition).toBe('isLoading')
    expect(conditionals[0].trueBranch).toContain('Spinner')
    expect(conditionals[0].falseBranch).toContain('DataTable')
  })

  it('extracts logical AND JSX conditionals', () => {
    const sf = createSourceFile(`
      function Screen({ error }) {
        return (
          <div>
            {error && <ErrorMessage message={error} />}
          </div>
        )
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    expect(conditionals).toHaveLength(1)
    expect(conditionals[0].condition).toBe('error')
    expect(conditionals[0].trueBranch).toContain('ErrorMessage')
  })
})

describe('extractNavigationFacts', () => {
  it('extracts navigate() calls', () => {
    const sf = createSourceFile(`
      import { useNavigate } from 'react-router-dom'
      function Screen() {
        const navigate = useNavigate()
        return <button onClick={() => navigate('/booking')}>Book</button>
      }
    `)
    const nav = extractNavigationFacts(sf)
    expect(nav).toHaveLength(1)
    expect(nav[0].target).toBe("'/booking'")
  })

  it('extracts Link components', () => {
    const sf = createSourceFile(`
      import { Link } from 'react-router-dom'
      function Screen() {
        return <Link to="/details">View Details</Link>
      }
    `)
    const nav = extractNavigationFacts(sf)
    expect(nav).toHaveLength(1)
    expect(nav[0].target).toContain('/details')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts`
Expected: FAIL — functions not exported

**Step 3: Implement component, conditional, and navigation extraction**

Add to `collect-facts.ts`:

```typescript
import type { HookFact, ComponentFact, ConditionalFact, NavigationFact } from './types.js'

/**
 * Extract component usage facts from JSX tree.
 */
export function extractComponentFacts(sourceFile: SourceFile): ComponentFact[] {
  const components: ComponentFact[] = []

  // Build import map for components (PascalCase)
  const importMap = new Map<string, string>()
  for (const decl of sourceFile.getImportDeclarations()) {
    const modulePath = decl.getModuleSpecifierValue()
    for (const named of decl.getNamedImports()) {
      const localName = named.getAliasNode()?.getText() ?? named.getName()
      if (/^[A-Z]/.test(localName)) {
        importMap.set(localName, modulePath)
      }
    }
    const defaultImport = decl.getDefaultImport()
    if (defaultImport && /^[A-Z]/.test(defaultImport.getText())) {
      importMap.set(defaultImport.getText(), modulePath)
    }
  }

  // Walk JSX elements
  const jsxElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
  const jsxSelfClosing = sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)

  const seen = new Set<string>()

  for (const el of [...jsxElements, ...jsxSelfClosing]) {
    const tagName = el.getTagNameNode().getText()
    if (!importMap.has(tagName) || seen.has(tagName)) continue
    seen.add(tagName)

    const props = el.getAttributes()
      .filter((a) => a.isKind(SyntaxKind.JsxAttribute))
      .map((a) => a.asKindOrThrow(SyntaxKind.JsxAttribute).getNameNode().getText())

    // Find children (for opening elements, look at parent JsxElement)
    const children: string[] = []
    if (el.isKind(SyntaxKind.JsxOpeningElement)) {
      const parentJsx = el.getParent()
      if (parentJsx?.isKind(SyntaxKind.JsxElement)) {
        for (const child of parentJsx.getJsxChildren()) {
          if (child.isKind(SyntaxKind.JsxElement)) {
            const childTag = child.getOpeningElement().getTagNameNode().getText()
            if (/^[A-Z]/.test(childTag)) children.push(childTag)
          } else if (child.isKind(SyntaxKind.JsxSelfClosingElement)) {
            const childTag = child.getTagNameNode().getText()
            if (/^[A-Z]/.test(childTag)) children.push(childTag)
          }
        }
      }
    }

    components.push({
      name: tagName,
      importPath: importMap.get(tagName)!,
      props,
      children,
    })
  }

  return components
}

/**
 * Extract conditional rendering facts from JSX.
 * Detects ternary expressions and logical AND/OR patterns.
 */
export function extractConditionalFacts(sourceFile: SourceFile): ConditionalFact[] {
  const conditionals: ConditionalFact[] = []

  // Ternary: condition ? <A /> : <B />
  const ternaries = sourceFile.getDescendantsOfKind(SyntaxKind.ConditionalExpression)
  for (const ternary of ternaries) {
    const whenTrue = ternary.getWhenTrue()
    const whenFalse = ternary.getWhenFalse()

    // Only process if at least one branch has JSX
    const trueComponents = collectComponentNames(whenTrue)
    const falseComponents = collectComponentNames(whenFalse)

    if (trueComponents.length > 0 || falseComponents.length > 0) {
      conditionals.push({
        condition: ternary.getCondition().getText(),
        trueBranch: trueComponents,
        falseBranch: falseComponents,
      })
    }
  }

  // Logical AND: condition && <Component />
  const binaryExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)
  for (const binary of binaryExpressions) {
    const operator = binary.getOperatorToken().getText()
    if (operator !== '&&') continue

    const right = binary.getRight()
    const rightComponents = collectComponentNames(right)

    if (rightComponents.length > 0) {
      conditionals.push({
        condition: binary.getLeft().getText(),
        trueBranch: rightComponents,
        falseBranch: [],
      })
    }
  }

  return conditionals
}

/**
 * Extract navigation-related facts.
 * Detects navigate() calls, router.push(), Link components, and a href.
 */
export function extractNavigationFacts(sourceFile: SourceFile): NavigationFact[] {
  const navigation: NavigationFact[] = []

  // Pattern 1: navigate('/path') or router.push('/path')
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
  for (const call of calls) {
    const text = call.getExpression().getText()
    if (text === 'navigate' || text.endsWith('.push') || text.endsWith('.navigate')) {
      const args = call.getArguments()
      if (args.length > 0) {
        navigation.push({
          target: args[0].getText(),
          trigger: `${text}() call`,
        })
      }
    }
  }

  // Pattern 2: <Link to="/path"> or <a href="/path">
  const jsxElements = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ]
  for (const el of jsxElements) {
    const tagName = el.getTagNameNode().getText()
    if (tagName !== 'Link' && tagName !== 'a') continue

    const attrs = el.getAttributes()
    for (const attr of attrs) {
      if (!attr.isKind(SyntaxKind.JsxAttribute)) continue
      const name = attr.getNameNode().getText()
      if (name === 'to' || name === 'href') {
        const init = attr.getInitializer()
        if (init) {
          navigation.push({
            target: init.getText().replace(/^[{"]|[}"]$/g, ''),
            trigger: `<${tagName} ${name}=...>`,
          })
        }
      }
    }
  }

  return navigation
}

function collectComponentNames(node: Node): string[] {
  const names: string[] = []

  const jsxElements = node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
  for (const el of jsxElements) {
    const tag = el.getTagNameNode().getText()
    if (/^[A-Z]/.test(tag)) names.push(tag)
  }

  const selfClosing = node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
  for (const el of selfClosing) {
    const tag = el.getTagNameNode().getText()
    if (/^[A-Z]/.test(tag)) names.push(tag)
  }

  // Also check if node itself is JSX
  if (node.isKind(SyntaxKind.JsxSelfClosingElement)) {
    const tag = node.getTagNameNode().getText()
    if (/^[A-Z]/.test(tag)) names.push(tag)
  }

  return [...new Set(names)]
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/collect-facts.ts packages/cli/src/analyzer/__tests__/collect-facts.test.ts
git commit -m "feat(analyzer): add component, conditional, navigation fact extraction"
```

---

### Task 4: Build collectAllFacts() orchestrator with shared Project

**Files:**
- Modify: `packages/cli/src/analyzer/collect-facts.ts`
- Modify: `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

**Step 1: Write failing test**

Add to `collect-facts.test.ts`:

```typescript
import { collectAllFacts } from '../collect-facts.js'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('collectAllFacts', () => {
  const testDir = join(tmpdir(), 'collect-facts-test-' + Date.now())

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true })
    writeFileSync(join(testDir, 'ScreenA.tsx'), `
      import { useQuery } from '@tanstack/react-query'
      export default function ScreenA() {
        const { data } = useQuery({ queryKey: ['users'] })
        return <div>{data}</div>
      }
    `)
    writeFileSync(join(testDir, 'ScreenB.tsx'), `
      import { useAuthStore } from '@/stores/auth'
      export default function ScreenB() {
        const user = useAuthStore(s => s.user)
        return <div>{user.name}</div>
      }
    `)
  })

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('collects facts from multiple screens in parallel with shared Project', async () => {
    const screens = [
      { filePath: join(testDir, 'ScreenA.tsx'), route: '/screen-a', exportName: undefined },
      { filePath: join(testDir, 'ScreenB.tsx'), route: '/screen-b', exportName: undefined },
    ]

    const facts = await collectAllFacts(screens)

    expect(facts).toHaveLength(2)
    expect(facts[0].route).toBe('/screen-a')
    expect(facts[0].hooks).toHaveLength(1)
    expect(facts[0].hooks[0].name).toBe('useQuery')

    expect(facts[1].route).toBe('/screen-b')
    expect(facts[1].hooks).toHaveLength(1)
    expect(facts[1].hooks[0].name).toBe('useAuthStore')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts`
Expected: FAIL — collectAllFacts not exported

**Step 3: Implement collectAllFacts**

Add to `collect-facts.ts`:

```typescript
import { Project } from 'ts-morph'
import { readFile } from 'node:fs/promises'
import type { ScreenFacts } from './types.js'

interface ScreenInput {
  filePath: string
  route: string
  exportName?: string
}

/**
 * Collect facts from all screens using a single shared ts-morph Project.
 * Runs extraction in parallel across screens.
 */
export async function collectAllFacts(screens: ScreenInput[]): Promise<ScreenFacts[]> {
  // Single shared Project — avoids creating compiler per file
  const project = new Project({
    tsConfigFilePath: undefined,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, jsx: 4 },
  })

  // Add all files at once
  for (const screen of screens) {
    project.addSourceFileAtPath(screen.filePath)
  }

  // Extract facts in parallel
  const results = await Promise.all(
    screens.map(async (screen) => {
      const sourceFile = project.getSourceFileOrThrow(screen.filePath)
      const sourceCode = await readFile(screen.filePath, 'utf-8')

      return {
        route: screen.route,
        filePath: screen.filePath,
        exportName: screen.exportName,
        sourceCode,
        hooks: extractHookFacts(sourceFile),
        components: extractComponentFacts(sourceFile),
        conditionals: extractConditionalFacts(sourceFile),
        navigation: extractNavigationFacts(sourceFile),
      } satisfies ScreenFacts
    })
  )

  return results
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/collect-facts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/collect-facts.ts packages/cli/src/analyzer/__tests__/collect-facts.test.ts
git commit -m "feat(analyzer): add collectAllFacts orchestrator with shared ts-morph Project"
```

---

## Phase B: LLM Understanding

### Task 5: Define ScreenAnalysis output schema with Zod

**Files:**
- Create: `packages/cli/src/llm/schemas/screen-analysis.ts`
- Create: `packages/cli/src/llm/schemas/__tests__/screen-analysis.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/llm/schemas/__tests__/screen-analysis.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ScreenAnalysisSchema, type ScreenAnalysisOutput } from '../screen-analysis.js'

describe('ScreenAnalysisSchema', () => {
  it('validates a complete screen analysis', () => {
    const input: ScreenAnalysisOutput = {
      route: '/booking',
      regions: [
        {
          key: 'service-list',
          label: 'Service List',
          type: 'list',
          hookBindings: ['useQuery:services'],
          states: {
            populated: {
              label: 'Populated',
              mockData: { data: [{ id: '1', name: 'Haircut' }] },
            },
            loading: {
              label: 'Loading',
              mockData: { _loading: true },
            },
            empty: {
              label: 'Empty',
              mockData: { data: [] },
            },
          },
          defaultState: 'populated',
        },
      ],
      flows: [
        {
          trigger: { selector: 'button', text: 'Book Now' },
          action: 'navigate',
          target: '/booking/confirm',
        },
      ],
    }

    const result = ScreenAnalysisSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects missing required fields', () => {
    const result = ScreenAnalysisSchema.safeParse({ route: '/x' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid region type', () => {
    const result = ScreenAnalysisSchema.safeParse({
      route: '/x',
      regions: [{ key: 'a', label: 'A', type: 'invalid', hookBindings: [], states: {}, defaultState: 'x' }],
      flows: [],
    })
    expect(result.success).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/llm/schemas/__tests__/screen-analysis.test.ts`
Expected: FAIL

**Step 3: Implement the Zod schema**

Create `packages/cli/src/llm/schemas/screen-analysis.ts`:

```typescript
import { z } from 'zod'

const RegionStateSchema = z.object({
  label: z.string(),
  mockData: z.record(z.string(), z.unknown()),
})

const RegionSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['list', 'detail', 'form', 'status', 'auth', 'media', 'custom']),
  hookBindings: z.array(z.string()),
  states: z.record(z.string(), RegionStateSchema),
  defaultState: z.string(),
  isList: z.boolean().optional(),
  mockItems: z.array(z.unknown()).optional(),
  defaultCount: z.number().optional(),
})

const FlowTriggerSchema = z.object({
  selector: z.string(),
  text: z.string().optional(),
  ariaLabel: z.string().optional(),
  nth: z.number().optional(),
})

const FlowSchema = z.object({
  trigger: FlowTriggerSchema,
  action: z.enum(['navigate', 'setState', 'setRegionState']),
  target: z.string(),
  targetRegion: z.string().optional(),
})

export const ScreenAnalysisSchema = z.object({
  route: z.string(),
  regions: z.array(RegionSchema),
  flows: z.array(FlowSchema),
})

export type ScreenAnalysisOutput = z.infer<typeof ScreenAnalysisSchema>
export type RegionOutput = z.infer<typeof RegionSchema>
export type FlowOutput = z.infer<typeof FlowSchema>
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/llm/schemas/__tests__/screen-analysis.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/llm/schemas/screen-analysis.ts packages/cli/src/llm/schemas/__tests__/screen-analysis.test.ts
git commit -m "feat(llm): add ScreenAnalysis Zod schema for LLM output validation"
```

---

### Task 6: Build batch LLM prompt for semantic understanding

**Files:**
- Create: `packages/cli/src/llm/prompts/understand-screens.ts`

**Step 1: Write the prompt builder**

Create `packages/cli/src/llm/prompts/understand-screens.ts`:

```typescript
import type { ScreenFacts } from '../../analyzer/types.js'

/**
 * Build a single batch prompt that sends all screen facts to Claude Code
 * and asks for semantic understanding: regions, state machines, flows.
 */
export function buildUnderstandScreensPrompt(screenFacts: ScreenFacts[]): string {
  const screenSections = screenFacts.map((facts) => {
    const hooksSection = facts.hooks.length > 0
      ? `Hooks called:\n${facts.hooks.map((h) => `  - ${h.name}(${h.arguments.join(', ')}) from "${h.importPath}"${h.returnVariable ? ` → ${h.returnVariable}` : ''}`).join('\n')}`
      : 'No hooks detected.'

    const componentsSection = facts.components.length > 0
      ? `Components used:\n${facts.components.map((c) => `  - <${c.name} ${c.props.join(' ')} /> from "${c.importPath}"${c.children.length > 0 ? ` children: [${c.children.join(', ')}]` : ''}`).join('\n')}`
      : 'No imported components.'

    const conditionalsSection = facts.conditionals.length > 0
      ? `Conditional rendering:\n${facts.conditionals.map((c) => `  - if (${c.condition}) → [${c.trueBranch.join(', ')}]${c.falseBranch.length > 0 ? ` else → [${c.falseBranch.join(', ')}]` : ''}`).join('\n')}`
      : 'No conditional rendering.'

    const navSection = facts.navigation.length > 0
      ? `Navigation:\n${facts.navigation.map((n) => `  - ${n.trigger} → ${n.target}`).join('\n')}`
      : 'No navigation detected.'

    return `
### Screen: ${facts.route}
File: ${facts.filePath}

${hooksSection}

${componentsSection}

${conditionalsSection}

${navSection}

Source code:
\`\`\`tsx
${facts.sourceCode}
\`\`\`
`
  }).join('\n---\n')

  return `You are analyzing React screens for a preview tool. For each screen below, identify:

1. **Regions**: Distinct UI sections that display data from different sources. Each region has:
   - A unique key (kebab-case, e.g., "service-list", "user-profile")
   - A human-readable label
   - A type: list, detail, form, status, auth, media, or custom
   - hookBindings: which hooks feed this region (format: "hookName:identifier")
   - states: the different states this region can be in, with mock data for each
   - For list regions: include isList=true, mockItems (10+ items), defaultCount=3

2. **Flows**: User interactions that navigate to other screens or change region state.
   - trigger: CSS selector + optional text match for the interactive element
   - action: "navigate" (go to another screen), "setState" (change region), or "setRegionState"
   - target: the route (for navigate) or state name (for setState)

Rules:
- Every data-fetching hook MUST be bound to a region
- Every region MUST have at least: a "populated" state and a "loading" state
- List regions should also have an "empty" state
- Forms should have: idle, submitting, success, error states
- Auth regions should have: authenticated, unauthenticated states
- Generate realistic mock data (not generic "Item 1", "Item 2")
- Detect ALL clickable elements that navigate or change state

Return a JSON array where each element matches this schema:
{
  "route": string,
  "regions": [{ key, label, type, hookBindings, states: { [stateName]: { label, mockData } }, defaultState, isList?, mockItems?, defaultCount? }],
  "flows": [{ trigger: { selector, text?, ariaLabel? }, action, target, targetRegion? }]
}

Return ONLY valid JSON. No markdown, no explanation.

---

${screenSections}`
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/llm/prompts/understand-screens.ts
git commit -m "feat(llm): add batch prompt for screen semantic understanding"
```

---

### Task 7: Build template fallback for when LLM is unavailable

**Files:**
- Create: `packages/cli/src/analyzer/template-fallback.ts`
- Create: `packages/cli/src/analyzer/__tests__/template-fallback.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/analyzer/__tests__/template-fallback.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildFromTemplates } from '../template-fallback.js'
import type { ScreenFacts } from '../types.js'

describe('buildFromTemplates', () => {
  it('maps useQuery to list region with loading/populated/empty/error states', () => {
    const facts: ScreenFacts = {
      route: '/users',
      filePath: '/app/users.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['users'] }"] },
      ],
      components: [],
      conditionals: [],
      navigation: [],
    }

    const result = buildFromTemplates(facts)

    expect(result.regions).toHaveLength(1)
    expect(result.regions[0].key).toBe('users')
    expect(result.regions[0].type).toBe('list')
    expect(Object.keys(result.regions[0].states)).toEqual(
      expect.arrayContaining(['populated', 'loading', 'empty', 'error'])
    )
  })

  it('maps useAuthStore to auth region', () => {
    const facts: ScreenFacts = {
      route: '/profile',
      filePath: '/app/profile.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useAuthStore', importPath: '@/stores/auth', arguments: ['s => s.user'] },
      ],
      components: [],
      conditionals: [],
      navigation: [],
    }

    const result = buildFromTemplates(facts)

    expect(result.regions).toHaveLength(1)
    expect(result.regions[0].type).toBe('auth')
    expect(Object.keys(result.regions[0].states)).toEqual(
      expect.arrayContaining(['authenticated', 'unauthenticated'])
    )
  })

  it('extracts navigation flows', () => {
    const facts: ScreenFacts = {
      route: '/home',
      filePath: '/app/home.tsx',
      sourceCode: '',
      hooks: [],
      components: [],
      conditionals: [],
      navigation: [
        { target: "'/booking'", trigger: 'navigate() call' },
      ],
    }

    const result = buildFromTemplates(facts)

    expect(result.flows).toHaveLength(1)
    expect(result.flows[0].action).toBe('navigate')
    expect(result.flows[0].target).toBe('/booking')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/template-fallback.test.ts`
Expected: FAIL

**Step 3: Implement template fallback**

Create `packages/cli/src/analyzer/template-fallback.ts`:

```typescript
import type { ScreenFacts } from './types.js'
import type { ScreenAnalysisOutput } from '../llm/schemas/screen-analysis.js'
import { formatLabel } from '../lib/format-label.js'

interface HookTemplate {
  pattern: (hookName: string, importPath: string) => boolean
  regionType: ScreenAnalysisOutput['regions'][0]['type']
  states: (label: string) => ScreenAnalysisOutput['regions'][0]['states']
  deriveKey: (hookName: string, args: string[]) => string
}

const HOOK_TEMPLATES: HookTemplate[] = [
  {
    // React Query / SWR / data fetching
    pattern: (name) => /^use(Query|SWR|Fetch|AppLiveQuery|LiveQuery)$/i.test(name),
    regionType: 'list',
    states: (label) => ({
      populated: { label: 'Populated', mockData: { data: [{ id: '1', name: `${label} 1` }, { id: '2', name: `${label} 2` }, { id: '3', name: `${label} 3` }] } },
      loading: { label: 'Loading', mockData: { _loading: true } },
      empty: { label: 'Empty', mockData: { data: [] } },
      error: { label: 'Error', mockData: { _error: true, message: `Failed to load ${label}` } },
    }),
    deriveKey: (_name, args) => {
      // Try to extract queryKey first element
      const keyMatch = args.join(',').match(/queryKey\s*:\s*\[\s*['"]([^'"]+)['"]/)
      if (keyMatch) return keyMatch[1]
      // Try last string arg (sectionId pattern)
      const lastStringArg = args.findLast((a) => /^['"]/.test(a.trim()))
      if (lastStringArg) return lastStringArg.replace(/['"]/g, '')
      return 'data'
    },
  },
  {
    // Auth stores
    pattern: (name, path) => /auth/i.test(name) || /auth/i.test(path),
    regionType: 'auth',
    states: (label) => ({
      authenticated: { label: 'Authenticated', mockData: { user: { id: '1', name: 'Test User', email: 'user@test.com' }, isAuthenticated: true } },
      unauthenticated: { label: 'Unauthenticated', mockData: { user: null, isAuthenticated: false } },
    }),
    deriveKey: () => 'auth',
  },
  {
    // Zustand stores (non-auth)
    pattern: (name) => /^use\w+Store$/.test(name),
    regionType: 'status',
    states: (label) => ({
      populated: { label: 'Populated', mockData: { data: { id: '1', name: label } } },
      loading: { label: 'Loading', mockData: { _loading: true } },
      error: { label: 'Error', mockData: { _error: true, message: `Failed to load ${label}` } },
    }),
    deriveKey: (name) => name.replace(/^use/, '').replace(/Store$/, '').replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''),
  },
  {
    // useContext
    pattern: (name) => name === 'useContext',
    regionType: 'status',
    states: (label) => ({
      active: { label: 'Active', mockData: { value: label } },
      inactive: { label: 'Inactive', mockData: { value: null } },
    }),
    deriveKey: (_name, args) => {
      const contextName = args[0]?.replace(/Context$/, '') ?? 'context'
      return contextName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
    },
  },
]

/**
 * Build ScreenAnalysis from facts using template patterns.
 * Used as fallback when LLM is unavailable.
 */
export function buildFromTemplates(facts: ScreenFacts): ScreenAnalysisOutput {
  const regions: ScreenAnalysisOutput['regions'] = []

  for (const hook of facts.hooks) {
    const template = HOOK_TEMPLATES.find((t) => t.pattern(hook.name, hook.importPath))
    if (!template) continue

    const key = template.deriveKey(hook.name, hook.arguments)
    // Skip if we already have a region with this key
    if (regions.some((r) => r.key === key)) continue

    const label = formatLabel(key)
    regions.push({
      key,
      label,
      type: template.regionType,
      hookBindings: [`${hook.name}:${key}`],
      states: template.states(label),
      defaultState: Object.keys(template.states(label))[0],
    })
  }

  // Convert navigation facts to flows
  const flows: ScreenAnalysisOutput['flows'] = facts.navigation.map((nav) => ({
    trigger: { selector: 'button', text: nav.trigger },
    action: 'navigate' as const,
    target: nav.target.replace(/['"]/g, ''),
  }))

  return { route: facts.route, regions, flows }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/analyzer/__tests__/template-fallback.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/template-fallback.ts packages/cli/src/analyzer/__tests__/template-fallback.test.ts
git commit -m "feat(analyzer): add template fallback for screen analysis without LLM"
```

---

### Task 8: Build understandScreens() orchestrator

**Files:**
- Create: `packages/cli/src/analyzer/understand-screens.ts`

**Step 1: Implement the orchestrator**

This calls the LLM with the batch prompt, validates output, and falls back to templates.

Create `packages/cli/src/analyzer/understand-screens.ts`:

```typescript
import chalk from 'chalk'
import { callLLMBatch, callLLM } from '../llm/index.js'
import { buildUnderstandScreensPrompt } from '../llm/prompts/understand-screens.js'
import { ScreenAnalysisSchema, type ScreenAnalysisOutput } from '../llm/schemas/screen-analysis.js'
import { buildFromTemplates } from './template-fallback.js'
import type { ScreenFacts } from './types.js'
import type { LLMConfig } from '../lib/config.js'
import { z } from 'zod'

const BatchOutputSchema = z.array(ScreenAnalysisSchema)

/**
 * Stage 3: Understand screens semantically.
 *
 * Sends all screen facts to Claude Code in one batch call.
 * Returns ScreenAnalysis per screen with regions, state machines, and flows.
 * Falls back to template library if LLM unavailable or fails.
 */
export async function understandScreens(
  screenFacts: ScreenFacts[],
  llmConfig: LLMConfig,
): Promise<ScreenAnalysisOutput[]> {
  if (llmConfig.provider === 'none') {
    console.log(chalk.dim('  LLM disabled, using template fallback'))
    return screenFacts.map(buildFromTemplates)
  }

  try {
    console.log(chalk.dim('  Sending batch to LLM for semantic analysis...'))
    const prompt = buildUnderstandScreensPrompt(screenFacts)

    // Try batch call first (claude-code)
    let raw = await callLLMBatch(prompt, llmConfig, {
      temperature: 0.2,
      maxTokens: 32768,
      jsonMode: true,
    })

    // Fall back to single call if batch unavailable
    if (!raw) {
      raw = await callLLM(prompt, llmConfig, {
        temperature: 0.2,
        maxTokens: 32768,
        jsonMode: true,
      })
    }

    if (!raw) {
      console.log(chalk.dim('  LLM returned null, using template fallback'))
      return screenFacts.map(buildFromTemplates)
    }

    // Parse and validate
    const parsed = BatchOutputSchema.safeParse(raw)
    if (parsed.success) {
      console.log(chalk.dim(`  LLM analysis validated: ${parsed.data.length} screen(s)`))

      // Fill in any missing screens with template fallback
      const resultMap = new Map(parsed.data.map((s) => [s.route, s]))
      return screenFacts.map((facts) =>
        resultMap.get(facts.route) ?? buildFromTemplates(facts)
      )
    }

    // Try parsing as object with screen keys (alternative format)
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      const results: ScreenAnalysisOutput[] = []
      const obj = raw as Record<string, unknown>

      for (const facts of screenFacts) {
        const screenData = obj[facts.route] ?? obj[facts.filePath]
        if (screenData) {
          const singleParsed = ScreenAnalysisSchema.safeParse(screenData)
          if (singleParsed.success) {
            results.push(singleParsed.data)
            continue
          }
        }
        results.push(buildFromTemplates(facts))
      }

      console.log(chalk.dim(`  LLM analysis (object format): ${results.length} screen(s)`))
      return results
    }

    console.log(chalk.dim('  LLM output failed validation, using template fallback'))
    return screenFacts.map(buildFromTemplates)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.dim(`  LLM analysis failed: ${message}, using template fallback`))
    return screenFacts.map(buildFromTemplates)
  }
}
```

**Step 2: Commit**

```bash
git add packages/cli/src/analyzer/understand-screens.ts
git commit -m "feat(analyzer): add understandScreens orchestrator with LLM + template fallback"
```

---

## Phase C: Simplified Code Generation

### Task 9: Build generateFromAnalysis() — model + controller from ScreenAnalysis

**Files:**
- Create: `packages/cli/src/generator/generate-from-analysis.ts`
- Create: `packages/cli/src/generator/__tests__/generate-from-analysis.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/generator/__tests__/generate-from-analysis.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { analysisToModel, analysisToController } from '../generate-from-analysis.js'
import type { ScreenAnalysisOutput } from '../../llm/schemas/screen-analysis.js'

const sampleAnalysis: ScreenAnalysisOutput = {
  route: '/booking',
  regions: [
    {
      key: 'service-list',
      label: 'Service List',
      type: 'list',
      hookBindings: ['useQuery:services'],
      states: {
        populated: { label: 'Populated', mockData: { data: [{ id: '1', name: 'Haircut' }] } },
        loading: { label: 'Loading', mockData: { _loading: true } },
        empty: { label: 'Empty', mockData: { data: [] } },
      },
      defaultState: 'populated',
      isList: true,
      mockItems: Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), name: `Service ${i + 1}` })),
      defaultCount: 3,
    },
  ],
  flows: [
    {
      trigger: { selector: 'button', text: 'Book Now' },
      action: 'navigate',
      target: '/booking/confirm',
    },
    {
      trigger: { selector: 'button', text: 'Show Loading' },
      action: 'setRegionState',
      target: 'loading',
      targetRegion: 'service-list',
    },
  ],
}

describe('analysisToModel', () => {
  it('converts ScreenAnalysis regions to ModelOutput format', () => {
    const model = analysisToModel(sampleAnalysis)

    expect(model.regions['service-list']).toBeDefined()
    expect(model.regions['service-list'].label).toBe('Service List')
    expect(model.regions['service-list'].states.populated).toEqual({ data: [{ id: '1', name: 'Haircut' }] })
    expect(model.regions['service-list'].states.loading).toEqual({ _loading: true })
    expect(model.regions['service-list'].defaultState).toBe('populated')
    expect(model.regions['service-list'].hookMapping).toEqual({
      type: 'query-hook',
      hookName: 'useQuery',
      identifier: 'service-list',
      importPath: '',
    })
  })
})

describe('analysisToController', () => {
  it('converts ScreenAnalysis flows to ControllerOutput format', () => {
    const controller = analysisToController(sampleAnalysis)

    expect(controller.flows).toHaveLength(2)
    expect(controller.flows[0]).toEqual({
      trigger: { selector: 'button', text: 'Book Now' },
      navigate: '/booking/confirm',
    })
    expect(controller.flows[1]).toEqual({
      trigger: { selector: 'button', text: 'Show Loading' },
      setRegionState: { region: 'service-list', state: 'loading' },
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-from-analysis.test.ts`
Expected: FAIL

**Step 3: Implement the converters**

Create `packages/cli/src/generator/generate-from-analysis.ts`:

```typescript
import type { ScreenAnalysisOutput } from '../llm/schemas/screen-analysis.js'
import type { ModelOutput, ControllerOutput, FlowActionV2, HookMappingType } from '../analyzer/types.js'

/**
 * Convert ScreenAnalysis regions to the existing ModelOutput format.
 * Direct mapping — no heuristics or enrichment needed.
 */
export function analysisToModel(analysis: ScreenAnalysisOutput): ModelOutput {
  const regions: ModelOutput['regions'] = {}

  for (const region of analysis.regions) {
    // Extract hook mapping from hookBindings
    const hookMapping = deriveHookMapping(region)

    // Convert states: { stateName: { label, mockData } } → { stateName: mockData }
    const states: Record<string, Record<string, unknown>> = {}
    for (const [stateName, stateValue] of Object.entries(region.states)) {
      states[stateName] = stateValue.mockData
    }

    regions[region.key] = {
      label: region.label,
      component: 'Screen',
      componentPath: '',
      states,
      defaultState: region.defaultState,
      ...(hookMapping ? { hookMapping } : {}),
      ...(region.isList ? { isList: true } : {}),
      ...(region.mockItems ? { mockItems: region.mockItems } : {}),
      ...(region.defaultCount ? { defaultCount: region.defaultCount } : {}),
    }
  }

  return { regions }
}

/**
 * Convert ScreenAnalysis flows to the existing ControllerOutput format.
 */
export function analysisToController(analysis: ScreenAnalysisOutput): ControllerOutput {
  const flows: FlowActionV2[] = analysis.flows.map((flow) => {
    const base: FlowActionV2 = {
      trigger: {
        selector: flow.trigger.selector,
        ...(flow.trigger.text ? { text: flow.trigger.text } : {}),
        ...(flow.trigger.ariaLabel ? { ariaLabel: flow.trigger.ariaLabel } : {}),
      },
    }

    switch (flow.action) {
      case 'navigate':
        return { ...base, navigate: flow.target }
      case 'setRegionState':
        return {
          ...base,
          setRegionState: {
            region: flow.targetRegion ?? '',
            state: flow.target,
          },
        }
      case 'setState':
        return { ...base, navigate: flow.target }
      default:
        return base
    }
  })

  return {
    flows,
    componentStates: {},
    journeys: [],
  }
}

function deriveHookMapping(
  region: ScreenAnalysisOutput['regions'][0],
): ModelOutput['regions'][string]['hookMapping'] | undefined {
  if (region.hookBindings.length === 0) return undefined

  // Parse "hookName:identifier" format
  const [binding] = region.hookBindings
  const colonIndex = binding.indexOf(':')
  const hookName = colonIndex > 0 ? binding.slice(0, colonIndex) : binding
  const identifier = colonIndex > 0 ? binding.slice(colonIndex + 1) : region.key

  const type = inferHookMappingType(hookName, region.type)

  return {
    type,
    hookName,
    identifier: region.key,
    importPath: '',
  }
}

function inferHookMappingType(hookName: string, regionType: string): HookMappingType {
  if (/query|swr|fetch/i.test(hookName)) return 'query-hook'
  if (/store/i.test(hookName)) return 'store'
  if (hookName === 'useContext') return 'context'
  if (/livequry|applivequery/i.test(hookName)) return 'custom-hook'
  if (regionType === 'auth') return 'store'
  return 'unknown'
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-from-analysis.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/generator/generate-from-analysis.ts packages/cli/src/generator/__tests__/generate-from-analysis.test.ts
git commit -m "feat(generator): add analysisToModel and analysisToController converters"
```

---

### Task 10: Build simplified mock hook generation

**Files:**
- Create: `packages/cli/src/generator/generate-mock-from-analysis.ts`
- Create: `packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts`

**Step 1: Write failing test**

Create `packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateMockModules } from '../generate-mock-from-analysis.js'
import type { ScreenFacts } from '../../analyzer/types.js'
import type { ScreenAnalysisOutput } from '../../llm/schemas/screen-analysis.js'

describe('generateMockModules', () => {
  it('generates mock hooks with direct region key mapping', () => {
    const facts: ScreenFacts[] = [{
      route: '/booking',
      filePath: '/app/booking.tsx',
      sourceCode: '',
      hooks: [
        { name: 'useQuery', importPath: '@tanstack/react-query', arguments: ["{ queryKey: ['services'] }"] },
        { name: 'useAuthStore', importPath: '@/stores/auth', arguments: ['s => s.user'] },
      ],
      components: [],
      conditionals: [],
      navigation: [],
    }]

    const analyses: ScreenAnalysisOutput[] = [{
      route: '/booking',
      regions: [
        {
          key: 'service-list',
          label: 'Service List',
          type: 'list',
          hookBindings: ['useQuery:services'],
          states: { populated: { label: 'P', mockData: {} } },
          defaultState: 'populated',
        },
        {
          key: 'auth',
          label: 'Auth',
          type: 'auth',
          hookBindings: ['useAuthStore:auth'],
          states: { authenticated: { label: 'A', mockData: {} } },
          defaultState: 'authenticated',
        },
      ],
      flows: [],
    }]

    const result = generateMockModules(facts, analyses)

    // Should have 2 mock files
    expect(result.mockFiles.size).toBe(2)
    expect(result.mockFiles.has('@tanstack/react-query')).toBe(true)
    expect(result.mockFiles.has('@/stores/auth')).toBe(true)

    // useQuery mock should reference 'service-list' region directly
    const queryMock = result.mockFiles.get('@tanstack/react-query')!
    expect(queryMock).toContain("useRegionDataForHook('service-list')")

    // useAuthStore mock should reference 'auth' region directly
    const authMock = result.mockFiles.get('@/stores/auth')!
    expect(authMock).toContain("useRegionDataForHook('auth')")

    // Alias manifest should map imports to mock files
    expect(result.aliasManifest['@tanstack/react-query']).toBeDefined()
    expect(result.aliasManifest['@/stores/auth']).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-mock-from-analysis.test.ts`
Expected: FAIL

**Step 3: Implement simplified mock generation**

Create `packages/cli/src/generator/generate-mock-from-analysis.ts`:

```typescript
import type { ScreenFacts, HookFact } from '../analyzer/types.js'
import type { ScreenAnalysisOutput } from '../llm/schemas/screen-analysis.js'

interface MockGenerationResult {
  /** Map from importPath → generated mock file content */
  mockFiles: Map<string, string>
  /** Map from importPath → relative mock file path */
  aliasManifest: Record<string, string>
}

/**
 * Generate mock modules with direct region key mapping.
 *
 * Unlike the old approach (regex-derived sectionIds + multi-strategy matching),
 * each mock hook knows exactly which region it maps to from the LLM analysis.
 */
export function generateMockModules(
  allFacts: ScreenFacts[],
  allAnalyses: ScreenAnalysisOutput[],
): MockGenerationResult {
  // Build hook→region mapping from all analyses
  const hookToRegion = new Map<string, string>() // "importPath::hookName" → regionKey
  const analysisMap = new Map(allAnalyses.map((a) => [a.route, a]))

  for (const facts of allFacts) {
    const analysis = analysisMap.get(facts.route)
    if (!analysis) continue

    for (const region of analysis.regions) {
      for (const binding of region.hookBindings) {
        const hookName = binding.split(':')[0]
        // Find matching hook in facts to get importPath
        const hook = facts.hooks.find((h) => h.name === hookName)
        if (hook) {
          hookToRegion.set(`${hook.importPath}::${hook.name}`, region.key)
        }
      }
    }
  }

  // Group hooks by importPath (dedup by name)
  const hooksByImport = new Map<string, HookFact[]>()
  for (const facts of allFacts) {
    for (const hook of facts.hooks) {
      const existing = hooksByImport.get(hook.importPath) ?? []
      if (!existing.some((h) => h.name === hook.name)) {
        existing.push(hook)
      }
      hooksByImport.set(hook.importPath, existing)
    }
  }

  const mockFiles = new Map<string, string>()
  const aliasManifest: Record<string, string> = {}

  for (const [importPath, hooks] of hooksByImport) {
    const safeName = toSafeMockName(importPath)
    const code = buildMockFileContent(hooks, importPath, hookToRegion)
    mockFiles.set(importPath, code)
    aliasManifest[importPath] = `./mocks/${safeName}.ts`
  }

  return { mockFiles, aliasManifest }
}

function buildMockFileContent(
  hooks: HookFact[],
  importPath: string,
  hookToRegion: Map<string, string>,
): string {
  const lines: string[] = [
    "// Auto-generated by @preview-tool/cli — do not edit manually",
    "import { useRegionDataForHook } from '@preview-tool/runtime'",
    '',
    'const DEFAULT_STATE = { data: undefined, isLoading: true, isError: false, isReady: false }',
    '',
    'function resolveFromState(stateData: Record<string, unknown>) {',
    '  if (stateData._loading) return { data: undefined, isLoading: true, isError: false, isReady: false }',
    '  if (stateData._error) return { data: undefined, isLoading: false, isError: true, isReady: false, error: stateData.message }',
    '  return { data: stateData.data ?? stateData, isLoading: false, isError: false, isReady: true }',
    '}',
    '',
  ]

  for (const hook of hooks) {
    const regionKey = hookToRegion.get(`${importPath}::${hook.name}`)

    if (regionKey) {
      // Direct region key mapping — the core simplification
      lines.push(
        `export function ${hook.name}(..._args: unknown[]) {`,
        `  const contextData = useRegionDataForHook('${regionKey}')`,
        '  if (contextData) return resolveFromState(contextData)',
        '  return DEFAULT_STATE',
        '}',
        '',
      )
    } else {
      // Unmapped hook — return default state
      lines.push(
        `export function ${hook.name}(..._args: unknown[]) {`,
        '  return DEFAULT_STATE',
        '}',
        '',
      )
    }
  }

  return lines.join('\n')
}

function toSafeMockName(importPath: string): string {
  return importPath
    .replace(/^@\//, '')
    .replace(/\//g, '--')
    .replace(/[^a-zA-Z0-9\-_]/g, '_')
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/generator/__tests__/generate-mock-from-analysis.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/generator/generate-mock-from-analysis.ts packages/cli/src/generator/__tests__/generate-mock-from-analysis.test.ts
git commit -m "feat(generator): add simplified mock generation with direct region key mapping"
```

---

## Phase D: Pipeline Swap + Cleanup

### Task 11: Rewrite generateAll() to use new 4-stage pipeline

**Files:**
- Modify: `packages/cli/src/generator/index.ts`

**Step 1: Add new pipeline function alongside existing**

Add a new export `generateAllV2()` to `packages/cli/src/generator/index.ts` that uses the new pipeline. Keep `generateAll()` unchanged for now.

```typescript
import { collectAllFacts } from '../analyzer/collect-facts.js'
import { understandScreens } from '../analyzer/understand-screens.js'
import { analysisToModel, analysisToController } from './generate-from-analysis.js'
import { generateMockModules } from './generate-mock-from-analysis.js'

export async function generateAllV2(
  cwd: string,
  config: PreviewConfig,
): Promise<GenerateResult> {
  const previewDir = join(cwd, PREVIEW_DIR)
  const screensDir = join(previewDir, 'screens')
  const mocksDir = join(previewDir, 'mocks')
  const overridesDir = join(previewDir, 'overrides')

  await mkdir(screensDir, { recursive: true })
  await mkdir(mocksDir, { recursive: true })
  await mkdir(overridesDir, { recursive: true })

  // Stage 1: Discover screens
  console.log(chalk.dim('Stage 1: Discovering screens...'))
  const screens = await discoverScreens(cwd, config.screenGlob)
  console.log(chalk.dim(`  Found ${screens.length} screen(s)`))

  if (screens.length === 0) {
    return { screensFound: 0, viewsGenerated: 0, modelsGenerated: 0, controllersGenerated: 0, adaptersGenerated: 0, overridesSkipped: 0, mocksGenerated: 0 }
  }

  // Stage 2: Collect facts (parallel, shared ts-morph Project)
  console.log(chalk.dim('Stage 2: Collecting screen facts...'))
  const screenInputs = screens.map((s) => ({
    filePath: s.filePath,
    route: s.route,
    exportName: s.exportName,
  }))
  const allFacts = await collectAllFacts(screenInputs)
  console.log(chalk.dim(`  Collected facts for ${allFacts.length} screen(s)`))

  // Stage 3: LLM understanding (one batch call)
  console.log(chalk.dim('Stage 3: Analyzing screens...'))
  const allAnalyses = await understandScreens(allFacts, config.llm)
  console.log(chalk.dim(`  Analyzed ${allAnalyses.length} screen(s)`))

  // Stage 4: Generate files
  console.log(chalk.dim('Stage 4: Generating files...'))
  let viewsGenerated = 0, modelsGenerated = 0, controllersGenerated = 0, adaptersGenerated = 0, overridesSkipped = 0

  const analysisMap = new Map(allAnalyses.map((a) => [a.route, a]))

  for (const screen of screens) {
    const safeName = routeToFolderName(screen.route)
    const screenOutDir = join(screensDir, safeName)
    const overrideScreenDir = join(overridesDir, safeName)
    await mkdir(screenOutDir, { recursive: true })

    const analysis = analysisMap.get(screen.route)
    if (!analysis) continue

    // View (keep existing approach)
    let viewTree: ViewTree | null = null
    try {
      viewTree = analyzeViewTree(screen)
    } catch { /* fallback */ }

    if (viewTree) {
      await writeFile(join(screenOutDir, 'view.ts'), generateViewFileContent(viewTree), 'utf-8')
    } else {
      await writeFile(join(screenOutDir, 'view.ts'), buildPlaceholderView(screen), 'utf-8')
    }
    viewsGenerated++

    // Model (direct from analysis)
    const hasModelOverride = existsSync(join(overrideScreenDir, 'model.ts'))
    if (!hasModelOverride) {
      const model = analysisToModel(analysis)
      const modelMeta = {
        route: screen.route,
        pattern: screen.pattern,
        filePath: relative(cwd, screen.filePath).split('\\').join('/'),
      }
      await writeFile(join(screenOutDir, 'model.ts'), generateModelFileContent(model, modelMeta), 'utf-8')
      modelsGenerated++
    } else {
      overridesSkipped++
    }

    // Controller (direct from analysis)
    const hasControllerOverride = existsSync(join(overrideScreenDir, 'controller.ts'))
    if (!hasControllerOverride) {
      const controller = analysisToController(analysis)
      await writeFile(join(screenOutDir, 'controller.ts'), generateControllerFileContent(controller), 'utf-8')
      controllersGenerated++
    } else {
      overridesSkipped++
    }

    // Adapter
    await writeFile(join(screenOutDir, 'adapter.tsx'), buildAdapterContent(screen, screenOutDir), 'utf-8')
    adaptersGenerated++
  }

  // Mock modules (simplified, direct region keys)
  const { mockFiles, aliasManifest } = generateMockModules(allFacts, allAnalyses)

  for (const [importPath, code] of mockFiles) {
    const safeName = toSafeMockName(importPath)
    await writeFile(join(mocksDir, `${safeName}.ts`), code, 'utf-8')
    console.log(chalk.dim(`  Mock: ${importPath} → mocks/${safeName}.ts`))
  }

  await writeFile(join(previewDir, 'alias-manifest.json'), JSON.stringify(aliasManifest, null, 2), 'utf-8')

  return {
    screensFound: screens.length,
    viewsGenerated,
    modelsGenerated,
    controllersGenerated,
    adaptersGenerated,
    overridesSkipped,
    mocksGenerated: mockFiles.size,
  }
}
```

**Step 2: Swap generateAll to use V2**

Replace the body of `generateAll()` with a call to `generateAllV2()`, keeping the same signature for backward compatibility:

```typescript
export async function generateAll(
  cwd: string,
  config: PreviewConfig,
  devToolConfig?: DevToolConfig | null,
): Promise<GenerateResult> {
  return generateAllV2(cwd, config)
}
```

**Step 3: Commit**

```bash
git add packages/cli/src/generator/index.ts
git commit -m "feat(generator): rewrite generateAll with new 4-stage pipeline"
```

---

### Task 12: Simplify runtime useRegionDataForHook

**Files:**
- Modify: `packages/runtime/src/RegionDataContext.tsx`

**Step 1: Simplify the hook**

The new mock hooks call `useRegionDataForHook('region-key')` with a simple string (the exact region key). The multi-strategy matching is no longer needed for new pipelines, but we keep backward compatibility.

Modify `RegionDataContext.tsx` — add a fast path for direct region key lookup:

```typescript
export function useRegionDataForHook(
  hookTypeOrRegionKey: string,
  identifier?: unknown,
): Record<string, unknown> | null {
  const ctx = useContext(RegionDataContext)
  if (!ctx) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[preview-tool] RegionDataContext is null — RegionDataProvider may not be mounted')
    }
    return null
  }

  const { regions, regionData } = ctx

  // Fast path: single-argument call with direct region key (new pipeline)
  if (identifier === undefined && regionData[hookTypeOrRegionKey]) {
    return (regionData[hookTypeOrRegionKey].stateData as Record<string, unknown>) ?? null
  }

  // Legacy path: hookType + identifier (old pipeline, backward compat)
  // ... keep existing Strategy 1/2/3 code ...
}
```

**Step 2: Commit**

```bash
git add packages/runtime/src/RegionDataContext.tsx
git commit -m "feat(runtime): add fast-path region key lookup in useRegionDataForHook"
```

---

### Task 13: Delete old code

**Files to clean up:**
- `packages/cli/src/analyzer/analyze-hooks.ts` — keep file but mark deprecated (tests may still reference)
- `packages/cli/src/generator/index.ts` — remove `enrichModelWithHookMapping()`, `buildHeuristicModel()`, `extractSectionIds()`, `buildStateData()`, `dataPropsToRegion()`, `buildHeuristicController()`, `tryLLMGeneration()`, `retryWithCorrection()`

**Step 1: Remove dead code from generator/index.ts**

Delete the following functions (they are no longer called by `generateAllV2`):
- `enrichModelWithHookMapping` (lines 608-687)
- `buildHeuristicModel` (lines 507-596)
- `buildHeuristicController` (lines 689-718)
- `extractSectionIds` (lines 725-762)
- `buildStateData` (lines 768-786)
- `dataPropsToRegion` (lines 798-858)
- `tryLLMGeneration` (lines 396-456)
- `retryWithCorrection` (lines 458-501)

Keep: `buildAdapterContent`, `buildPlaceholderView`, `routeToFolderName`, `toSafeMockName`, `deriveScreenName`, `toRelativeImport`, `GenerateResult` type.

**Step 2: Remove unused imports**

Remove imports no longer needed:
- `analyzeScreen` from analyze-component
- `analyzeHooks` from analyze-hooks
- `generateMockHook` from generate-mock-hooks
- All `generateMock*Store` imports from generate-mock-stores
- `ModelOutputSchema`, `ControllerOutputSchema`
- `buildGenerateMCPrompt`, `buildBatchGenerateMCPrompt`

**Step 3: Commit**

```bash
git add packages/cli/src/generator/index.ts
git commit -m "refactor(generator): remove old heuristic/regex pipeline code"
```

---

### Task 14: Integration test

**Files:**
- Modify: `packages/cli/src/__tests__/integration/booking-app.test.ts` (or run `pnpm test`)

**Step 1: Run the full integration test**

Run: `pnpm test`

This builds the CLI and runs `generate` against the sample-app test fixture. Verify:
- Screens are discovered
- Models have regions with state machines
- Controllers have flows
- Mock hooks are generated with direct region keys
- Alias manifest maps all imports

**Step 2: Fix any issues found**

If tests fail, fix the specific issues. Common things to check:
- Import paths in generated files
- Region key format matches between mock hooks and models
- Adapter template still works with new model format

**Step 3: Final commit**

```bash
git add -A
git commit -m "test: verify hybrid pipeline integration with sample-app"
```

---

## Task Summary

| Task | Phase | Description | Est. |
|------|-------|-------------|------|
| 1 | A | Define ScreenFacts type | 2 min |
| 2 | A | Hook fact extraction via AST | 10 min |
| 3 | A | Component, conditional, navigation extraction | 15 min |
| 4 | A | collectAllFacts() with shared Project | 10 min |
| 5 | B | ScreenAnalysis Zod schema | 5 min |
| 6 | B | Batch LLM prompt | 5 min |
| 7 | B | Template fallback | 10 min |
| 8 | B | understandScreens() orchestrator | 5 min |
| 9 | C | analysisToModel + analysisToController | 10 min |
| 10 | C | Simplified mock generation | 10 min |
| 11 | D | Rewrite generateAll() | 15 min |
| 12 | D | Simplify runtime useRegionDataForHook | 5 min |
| 13 | D | Delete old code | 10 min |
| 14 | D | Integration test | 10 min |

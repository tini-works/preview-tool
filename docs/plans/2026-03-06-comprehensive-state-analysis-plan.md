# Comprehensive State Analysis Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the analyzer to discover ALL visual states — from `useState`, `useRef`, derived variables, and function flows — not just external hooks.

**Architecture:** Extend `collect-facts.ts` with 3 new extractors (`extractLocalStateFacts`, `extractDerivedVarFacts`, `extractFunctionFacts`), add a unified `deriveAllStates()` to `derive-states.ts` that maps ALL data sources to regions, and update `template-fallback.ts` to produce regions from local state + derived vars and flows from functions. Downstream generators need minimal changes (new `HookMappingType` values, optional `branches` on flows).

**Tech Stack:** TypeScript, ts-morph (AST), Vitest, Zod schemas.

**Test command:** `npx vitest run packages/cli/src/analyzer/__tests__/`

---

## Task 1: Add new fact types to `analyzer/types.ts`

**Files:**
- Modify: `packages/cli/src/analyzer/types.ts`

**Step 1: Add LocalStateFact, DerivedVarFact, FunctionFact interfaces**

Add after the existing `NavigationFact` interface (line 214), before `ScreenFacts`:

```typescript
export interface LocalStateFact {
  /** Variable name: 'showPassword', 'formData' */
  name: string
  /** Which React hook: 'useState' or 'useRef' */
  hook: 'useState' | 'useRef'
  /** Setter function name for useState: 'setShowPassword' */
  setter?: string
  /** Initial value source text: 'false', '{email: "", password: ""}' */
  initialValue: string
  /** Inferred type: 'boolean' | 'string' | 'number' | 'object' | 'array' | 'null' | 'unknown' */
  valueType: string
}

export interface DerivedVarFact {
  /** Variable name: 'registrationSuccess' */
  name: string
  /** Source expression: 'searchParams.get("registered") === "true"' */
  expression: string
  /** Which variable it derives from: 'searchParams' */
  sourceVariable?: string
  /** Inferred type: 'boolean' | 'string' | 'unknown' */
  valueType: string
}

export interface FunctionTrigger {
  /** JSX element tag or selector: 'form', 'button', 'Input' */
  element: string
  /** Event handler name: 'onSubmit', 'onClick', 'onChange' */
  event: string
  /** Element id attribute if present */
  elementId?: string
}

export interface FunctionFact {
  /** Function name: 'handleSubmit', 'handleChange', '__inline_setShowPassword' */
  name: string
  /** Declaration kind */
  kind: 'function' | 'arrow' | 'useCallback'
  /** JSX event bindings that trigger this function */
  triggers: FunctionTrigger[]
  /** State setter calls inside: ['setFieldErrors', 'setFormData'] */
  settersCalled: string[]
  /** Navigation calls inside: ['navigate(redirectTo)'] */
  navigationCalls: string[]
  /** External function calls (from hooks): ['login', 'clearError'] */
  externalCalls: string[]
}
```

**Step 2: Extend ScreenFacts with new fields**

Change the `ScreenFacts` interface to add 3 new arrays:

```typescript
export interface ScreenFacts {
  route: string
  filePath: string
  exportName?: string
  sourceCode: string
  hooks: HookFact[]
  components: ComponentFact[]
  conditionals: ConditionalFact[]
  navigation: NavigationFact[]
  localState: LocalStateFact[]
  derivedVars: DerivedVarFact[]
  functions: FunctionFact[]
}
```

**Step 3: Add new HookMappingType values**

Change line 139:

```typescript
export type HookMappingType = 'query-hook' | 'custom-hook' | 'store' | 'context' | 'prop' | 'local-state' | 'derived-var' | 'router-param' | 'unknown'
```

**Step 4: Add optional branches to FlowOutput schema**

In `packages/cli/src/llm/schemas/screen-analysis.ts`, add a `branches` field to `FlowSchema`:

```typescript
const FlowBranchSchema = z.object({
  condition: z.string(),
  navigate: z.string().optional(),
  setRegionState: z.object({
    region: z.string(),
    state: z.string(),
  }).optional(),
})

const FlowSchema = z.object({
  trigger: FlowTriggerSchema,
  action: z.enum(['navigate', 'setState', 'setRegionState']),
  target: z.string(),
  targetRegion: z.string().optional(),
  branches: z.array(FlowBranchSchema).optional(),
})
```

Also add `'local-state'` and `'derived-var'` to the region type enum in `RegionSchema`:

```typescript
type: z.enum(['list', 'detail', 'form', 'status', 'auth', 'media', 'custom', 'local-state', 'derived-var']),
```

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/types.ts packages/cli/src/llm/schemas/screen-analysis.ts
git commit -m "feat: add LocalStateFact, DerivedVarFact, FunctionFact types and schema extensions"
```

---

## Task 2: Implement `extractLocalStateFacts()`

**Files:**
- Test: `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`
- Modify: `packages/cli/src/analyzer/collect-facts.ts`

**Step 1: Write the failing tests**

Add to `collect-facts.test.ts` — import `extractLocalStateFacts` and add:

```typescript
describe('extractLocalStateFacts', () => {
  it('extracts useState with boolean initial value', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [showPassword, setShowPassword] = useState(false)
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toEqual({
      name: 'showPassword',
      hook: 'useState',
      setter: 'setShowPassword',
      initialValue: 'false',
      valueType: 'boolean',
    })
  })

  it('extracts useState with object initial value', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [formData, setFormData] = useState({ email: '', password: '' })
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(1)
    expect(facts[0].name).toBe('formData')
    expect(facts[0].setter).toBe('setFormData')
    expect(facts[0].valueType).toBe('object')
  })

  it('extracts useState with empty object', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [errors, setErrors] = useState({})
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(1)
    expect(facts[0].valueType).toBe('object')
  })

  it('extracts useRef', () => {
    const sf = createSourceFile(`
      import { useRef } from 'react'
      function Screen() {
        const inputRef = useRef(null)
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toEqual({
      name: 'inputRef',
      hook: 'useRef',
      initialValue: 'null',
      valueType: 'null',
    })
  })

  it('extracts multiple useState calls in order', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [name, setName] = useState('')
        const [count, setCount] = useState(0)
        const [items, setItems] = useState([])
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(3)
    expect(facts[0]).toMatchObject({ name: 'name', valueType: 'string' })
    expect(facts[1]).toMatchObject({ name: 'count', valueType: 'number' })
    expect(facts[2]).toMatchObject({ name: 'items', valueType: 'array' })
  })

  it('skips useState not imported from react', () => {
    const sf = createSourceFile(`
      import { useState } from './custom-hooks'
      function Screen() {
        const [val, setVal] = useState(false)
        return <div />
      }
    `)
    const facts = extractLocalStateFacts(sf)
    expect(facts).toHaveLength(0)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

Expected: FAIL — `extractLocalStateFacts` is not exported.

**Step 3: Implement extractLocalStateFacts**

Add to `collect-facts.ts` — import `LocalStateFact` from types, add helper + extractor:

```typescript
import type {
  HookFact,
  ComponentFact,
  ConditionalFact,
  NavigationFact,
  LocalStateFact,
  ScreenFacts,
} from './types.js'

// --- Local state extraction ---

function inferValueType(text: string): string {
  if (text === 'true' || text === 'false') return 'boolean'
  if (text === 'null') return 'null'
  if (text === 'undefined') return 'null'
  if (/^['"]/.test(text)) return 'string'
  if (/^-?\d/.test(text)) return 'number'
  if (text.startsWith('[')) return 'array'
  if (text.startsWith('{')) return 'object'
  return 'unknown'
}

/**
 * Extract useState() and useRef() facts from a source file.
 * Captures variable name, setter, initial value, and inferred type.
 */
export function extractLocalStateFacts(sourceFile: SourceFile): LocalStateFact[] {
  const facts: LocalStateFact[] = []

  // Build import map to verify useState/useRef come from 'react'
  const importMap = new Map<string, string>()
  for (const decl of sourceFile.getImportDeclarations()) {
    const modulePath = decl.getModuleSpecifierValue()
    for (const named of decl.getNamedImports()) {
      const alias = named.getAliasNode()
      const localName = alias ? alias.getText() : named.getName()
      importMap.set(localName, modulePath)
    }
  }

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().getText()
    if (callee !== 'useState' && callee !== 'useRef') continue
    if (importMap.get(callee) !== 'react') continue

    const parent = call.getParent()
    if (!parent || !parent.isKind(SyntaxKind.VariableDeclaration)) continue

    const nameNode = parent.getNameNode()
    const args = call.getArguments()
    const initialValue = args.length > 0 ? args[0].getText() : 'undefined'
    const valueType = inferValueType(initialValue)

    if (callee === 'useState' && nameNode.isKind(SyntaxKind.ArrayBindingPattern)) {
      const elements = nameNode.getElements()
      const varName = elements[0]?.getNameNode().getText()
      const setterName = elements.length > 1 ? elements[1]?.getNameNode().getText() : undefined
      if (varName) {
        facts.push({
          name: varName,
          hook: 'useState',
          ...(setterName ? { setter: setterName } : {}),
          initialValue,
          valueType,
        })
      }
    } else if (callee === 'useRef') {
      const varName = nameNode.getText()
      facts.push({
        name: varName,
        hook: 'useRef',
        initialValue,
        valueType,
      })
    }
  }

  return facts
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/collect-facts.ts packages/cli/src/analyzer/__tests__/collect-facts.test.ts
git commit -m "feat: add extractLocalStateFacts for useState/useRef detection"
```

---

## Task 3: Implement `extractDerivedVarFacts()`

**Files:**
- Test: `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`
- Modify: `packages/cli/src/analyzer/collect-facts.ts`

**Step 1: Write the failing tests**

```typescript
describe('extractDerivedVarFacts', () => {
  it('extracts const variable used in a conditional', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const registrationSuccess = searchParams.get('registered') === 'true'
        return <div>{registrationSuccess && <span>Success</span>}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    const hookVarNames = new Set<string>()
    const localStateNames = new Set<string>()
    const facts = extractDerivedVarFacts(sf, conditionals, hookVarNames, localStateNames)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({
      name: 'registrationSuccess',
      valueType: 'boolean',
    })
    expect(facts[0].expression).toContain('searchParams.get')
  })

  it('resolves sourceVariable from expression', () => {
    const sf = createSourceFile(`
      function Screen() {
        const isReady = data.length > 0
        return <div>{isReady && <span>Ready</span>}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    const facts = extractDerivedVarFacts(sf, conditionals, new Set(), new Set())
    expect(facts).toHaveLength(1)
    expect(facts[0].sourceVariable).toBe('data')
  })

  it('skips variables already tracked by hooks or local state', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [isOpen, setIsOpen] = useState(false)
        return <div>{isOpen && <span>Open</span>}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    const localStateNames = new Set(['isOpen'])
    const facts = extractDerivedVarFacts(sf, conditionals, new Set(), localStateNames)
    expect(facts).toHaveLength(0)
  })

  it('skips variables not used in any conditional', () => {
    const sf = createSourceFile(`
      function Screen() {
        const greeting = 'Hello'
        return <div>{greeting}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    const facts = extractDerivedVarFacts(sf, conditionals, new Set(), new Set())
    expect(facts).toHaveLength(0)
  })

  it('infers boolean type from comparison expressions', () => {
    const sf = createSourceFile(`
      function Screen() {
        const hasItems = items.length > 0
        return <div>{hasItems && <span>Items</span>}</div>
      }
    `)
    const conditionals = extractConditionalFacts(sf)
    const facts = extractDerivedVarFacts(sf, conditionals, new Set(), new Set())
    expect(facts[0].valueType).toBe('boolean')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

Expected: FAIL — `extractDerivedVarFacts` is not exported.

**Step 3: Implement extractDerivedVarFacts**

Add to `collect-facts.ts`:

```typescript
import type {
  HookFact,
  ComponentFact,
  ConditionalFact,
  NavigationFact,
  LocalStateFact,
  DerivedVarFact,
  ScreenFacts,
} from './types.js'

// --- Derived variable extraction ---

function inferExpressionType(expr: string): string {
  // Comparisons produce booleans
  if (/===|!==|==|!=|>=|<=|>|</.test(expr)) return 'boolean'
  // Negation
  if (expr.trim().startsWith('!')) return 'boolean'
  // Boolean literals
  if (expr.trim() === 'true' || expr.trim() === 'false') return 'boolean'
  // String literals
  if (/^['"]/.test(expr.trim())) return 'string'
  // Number literals
  if (/^-?\d/.test(expr.trim())) return 'number'
  return 'unknown'
}

function extractSourceVariable(expr: string): string | undefined {
  const match = expr.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/)
  return match ? match[1] : undefined
}

/**
 * Extract derived variables (const/let) that appear in JSX conditionals.
 * Skips variables already tracked by hooks or local state.
 */
export function extractDerivedVarFacts(
  sourceFile: SourceFile,
  conditionals: ConditionalFact[],
  hookVarNames: Set<string>,
  localStateNames: Set<string>,
): DerivedVarFact[] {
  const facts: DerivedVarFact[] = []

  // Collect all condition variable names from conditionals
  const conditionVarNames = new Set<string>()
  for (const cond of conditionals) {
    const match = cond.condition.trim().replace(/^!/, '').match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/)
    if (match) conditionVarNames.add(match[1])
  }

  // Find all variable declarations in the file
  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = decl.getNameNode()
    // Only simple identifiers (not destructuring patterns)
    if (!nameNode.isKind(SyntaxKind.Identifier)) continue

    const name = nameNode.getText()

    // Skip if already tracked
    if (hookVarNames.has(name) || localStateNames.has(name)) continue

    // Skip if not used in any conditional
    if (!conditionVarNames.has(name)) continue

    const initializer = decl.getInitializer()
    if (!initializer) continue

    const expression = initializer.getText()
    const sourceVariable = extractSourceVariable(expression)
    const valueType = inferExpressionType(expression)

    facts.push({
      name,
      expression,
      ...(sourceVariable ? { sourceVariable } : {}),
      valueType,
    })
  }

  return facts
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/collect-facts.ts packages/cli/src/analyzer/__tests__/collect-facts.test.ts
git commit -m "feat: add extractDerivedVarFacts for conditional-driven variable detection"
```

---

## Task 4: Implement `extractFunctionFacts()`

**Files:**
- Test: `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`
- Modify: `packages/cli/src/analyzer/collect-facts.ts`

**Step 1: Write the failing tests**

```typescript
describe('extractFunctionFacts', () => {
  it('extracts named function with onSubmit trigger', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [data, setData] = useState('')
        function handleSubmit(e: any) {
          setData('submitted')
        }
        return <form onSubmit={handleSubmit}><button>Go</button></form>
      }
    `)
    const setterNames = new Set(['setData'])
    const externalFnNames = new Set<string>()
    const facts = extractFunctionFacts(sf, setterNames, externalFnNames)
    expect(facts).toHaveLength(1)
    expect(facts[0].name).toBe('handleSubmit')
    expect(facts[0].kind).toBe('function')
    expect(facts[0].triggers).toEqual([{ element: 'form', event: 'onSubmit' }])
    expect(facts[0].settersCalled).toContain('setData')
  })

  it('extracts arrow function with onClick trigger', () => {
    const sf = createSourceFile(`
      function Screen() {
        const handleClick = () => { navigate('/home') }
        return <button onClick={handleClick}>Go</button>
      }
    `)
    const facts = extractFunctionFacts(sf, new Set(), new Set())
    expect(facts).toHaveLength(1)
    expect(facts[0].name).toBe('handleClick')
    expect(facts[0].kind).toBe('arrow')
    expect(facts[0].navigationCalls).toContain('navigate(\'/home\')')
  })

  it('detects inline arrow toggling a setter', () => {
    const sf = createSourceFile(`
      import { useState } from 'react'
      function Screen() {
        const [show, setShow] = useState(false)
        return <button onClick={() => setShow(prev => !prev)}>Toggle</button>
      }
    `)
    const setterNames = new Set(['setShow'])
    const facts = extractFunctionFacts(sf, setterNames, new Set())
    const inlineFact = facts.find(f => f.name.startsWith('__inline_'))
    expect(inlineFact).toBeDefined()
    expect(inlineFact!.settersCalled).toContain('setShow')
    expect(inlineFact!.triggers).toEqual([{ element: 'button', event: 'onClick' }])
  })

  it('detects external function calls from hooks', () => {
    const sf = createSourceFile(`
      function Screen() {
        function handleSubmit() {
          login(email, password)
          clearError()
        }
        return <form onSubmit={handleSubmit}><button>Go</button></form>
      }
    `)
    const externalFnNames = new Set(['login', 'clearError'])
    const facts = extractFunctionFacts(sf, new Set(), externalFnNames)
    expect(facts[0].externalCalls).toEqual(expect.arrayContaining(['login', 'clearError']))
  })

  it('skips functions with no JSX triggers', () => {
    const sf = createSourceFile(`
      function Screen() {
        function helperFn() { return 42 }
        return <div>{helperFn()}</div>
      }
    `)
    const facts = extractFunctionFacts(sf, new Set(), new Set())
    expect(facts).toHaveLength(0)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

Expected: FAIL — `extractFunctionFacts` is not exported.

**Step 3: Implement extractFunctionFacts**

Add to `collect-facts.ts`:

```typescript
import type {
  HookFact,
  ComponentFact,
  ConditionalFact,
  NavigationFact,
  LocalStateFact,
  DerivedVarFact,
  FunctionFact,
  FunctionTrigger,
  ScreenFacts,
} from './types.js'

// --- Function extraction ---

/**
 * Extract function facts: named functions, arrow functions, and useCallback
 * with their JSX event bindings and internal effects.
 */
export function extractFunctionFacts(
  sourceFile: SourceFile,
  setterNames: Set<string>,
  externalFnNames: Set<string>,
): FunctionFact[] {
  const facts: FunctionFact[] = []
  const fnNameToFact = new Map<string, FunctionFact>()

  // --- Collect named function declarations ---
  for (const fn of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = fn.getName()
    if (!name) continue
    const body = fn.getBody()
    if (!body) continue

    const { settersCalled, navigationCalls, externalCalls } = scanFunctionBody(body, setterNames, externalFnNames)

    const fact: FunctionFact = {
      name,
      kind: 'function',
      triggers: [],
      settersCalled,
      navigationCalls,
      externalCalls,
    }
    fnNameToFact.set(name, fact)
  }

  // --- Collect arrow function variable declarations ---
  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = decl.getNameNode()
    if (!nameNode.isKind(SyntaxKind.Identifier)) continue
    const name = nameNode.getText()

    const init = decl.getInitializer()
    if (!init) continue

    // Arrow function or useCallback wrapping arrow
    const isArrow = init.isKind(SyntaxKind.ArrowFunction)
    const isCallback = init.isKind(SyntaxKind.CallExpression) && init.getExpression().getText() === 'useCallback'

    if (!isArrow && !isCallback) continue

    const body = isArrow ? init : init.getArguments()[0]
    if (!body) continue

    const { settersCalled, navigationCalls, externalCalls } = scanFunctionBody(body, setterNames, externalFnNames)

    const fact: FunctionFact = {
      name,
      kind: isCallback ? 'useCallback' : 'arrow',
      triggers: [],
      settersCalled,
      navigationCalls,
      externalCalls,
    }
    fnNameToFact.set(name, fact)
  }

  // --- Scan JSX event attributes to find triggers ---
  const EVENT_ATTRS = ['onClick', 'onSubmit', 'onChange', 'onBlur', 'onFocus', 'onKeyDown', 'onKeyUp']

  const jsxElements = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ]

  for (const el of jsxElements) {
    const tagName = el.getTagNameNode().getText()
    const attrs = el.getDescendantsOfKind(SyntaxKind.JsxAttribute)

    for (const attr of attrs) {
      const attrName = attr.getNameNode().getText()
      if (!EVENT_ATTRS.includes(attrName)) continue

      const init = attr.getInitializer()
      if (!init) continue

      // JsxExpression: onClick={handleSubmit} or onClick={() => ...}
      const exprNode = init.isKind(SyntaxKind.JsxExpression)
        ? init.getExpression()
        : undefined
      if (!exprNode) continue

      const exprText = exprNode.getText()

      // Direct reference: onClick={handleSubmit}
      if (fnNameToFact.has(exprText)) {
        const trigger: FunctionTrigger = { element: tagName, event: attrName }
        const idAttr = findJsxAttribute(el, 'id')
        if (idAttr) trigger.elementId = stripQuotes(idAttr)
        fnNameToFact.get(exprText)!.triggers.push(trigger)
        continue
      }

      // Inline arrow: onClick={() => setShow(prev => !prev)}
      if (exprNode.isKind(SyntaxKind.ArrowFunction)) {
        const { settersCalled, navigationCalls, externalCalls } = scanFunctionBody(exprNode, setterNames, externalFnNames)
        if (settersCalled.length === 0 && navigationCalls.length === 0 && externalCalls.length === 0) continue

        const inlineName = settersCalled.length > 0
          ? `__inline_${settersCalled[0]}`
          : `__inline_${tagName}_${attrName}`

        const trigger: FunctionTrigger = { element: tagName, event: attrName }
        const idAttr = findJsxAttribute(el, 'id')
        if (idAttr) trigger.elementId = stripQuotes(idAttr)

        // Check if we already have this inline fact
        if (fnNameToFact.has(inlineName)) {
          fnNameToFact.get(inlineName)!.triggers.push(trigger)
        } else {
          const fact: FunctionFact = {
            name: inlineName,
            kind: 'arrow',
            triggers: [trigger],
            settersCalled,
            navigationCalls,
            externalCalls,
          }
          fnNameToFact.set(inlineName, fact)
        }
      }
    }
  }

  // Only return functions that have at least one trigger
  for (const fact of fnNameToFact.values()) {
    if (fact.triggers.length > 0) {
      facts.push(fact)
    }
  }

  return facts
}

function scanFunctionBody(
  node: Node,
  setterNames: Set<string>,
  externalFnNames: Set<string>,
): { settersCalled: string[]; navigationCalls: string[]; externalCalls: string[] } {
  const settersCalled: string[] = []
  const navigationCalls: string[] = []
  const externalCalls: string[] = []

  for (const call of node.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().getText()

    if (setterNames.has(callee)) {
      if (!settersCalled.includes(callee)) settersCalled.push(callee)
    } else if (callee === 'navigate' || callee.endsWith('.push') || callee.endsWith('.navigate')) {
      const args = call.getArguments()
      const argText = args.length > 0 ? args[0].getText() : ''
      navigationCalls.push(`${callee}(${argText})`)
    } else if (externalFnNames.has(callee)) {
      if (!externalCalls.includes(callee)) externalCalls.push(callee)
    }
  }

  return { settersCalled, navigationCalls, externalCalls }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/collect-facts.ts packages/cli/src/analyzer/__tests__/collect-facts.test.ts
git commit -m "feat: add extractFunctionFacts for event handler and flow detection"
```

---

## Task 5: Wire new extractors into `collectAllFacts()`

**Files:**
- Test: `packages/cli/src/analyzer/__tests__/collect-facts.test.ts`
- Modify: `packages/cli/src/analyzer/collect-facts.ts`

**Step 1: Write the failing test**

Update the existing `collectAllFacts` test to verify new fields are present:

```typescript
it('includes localState, derivedVars, and functions in collected facts', async () => {
  const testDirNew = join(tmpdir(), 'collect-facts-new-' + Date.now())
  mkdirSync(testDirNew, { recursive: true })
  writeFileSync(join(testDirNew, 'LoginPage.tsx'), `
    import { useState } from 'react'
    import { useAuthStore } from '@/stores/auth-store'
    function LoginPage() {
      const { login, isLoading, error, clearError } = useAuthStore()
      const [showPassword, setShowPassword] = useState(false)
      const registrationSuccess = searchParams.get('registered') === 'true'
      function handleSubmit(e: any) {
        login(email, password)
      }
      return (
        <div>
          {registrationSuccess && <span>Success</span>}
          {error && <span>Error</span>}
          {isLoading ? <span>Loading</span> : <span>Ready</span>}
          <form onSubmit={handleSubmit}>
            <button onClick={() => setShowPassword(p => !p)}>Toggle</button>
          </form>
        </div>
      )
    }
  `)

  const screens = [{ filePath: join(testDirNew, 'LoginPage.tsx'), route: '/login' }]
  const facts = await collectAllFacts(screens)

  expect(facts[0].localState).toHaveLength(1)
  expect(facts[0].localState[0].name).toBe('showPassword')

  expect(facts[0].derivedVars).toHaveLength(1)
  expect(facts[0].derivedVars[0].name).toBe('registrationSuccess')

  expect(facts[0].functions.length).toBeGreaterThanOrEqual(1)
  expect(facts[0].functions.find(f => f.name === 'handleSubmit')).toBeDefined()

  rmSync(testDirNew, { recursive: true, force: true })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

Expected: FAIL — `localState`, `derivedVars`, `functions` undefined on result.

**Step 3: Update collectAllFacts to call new extractors**

In `collectAllFacts`, update the mapping function:

```typescript
export async function collectAllFacts(screens: ScreenInput[]): Promise<ScreenFacts[]> {
  const project = new Project({
    useInMemoryFileSystem: false,
    tsConfigFilePath: undefined,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, jsx: 4 },
  })

  for (const screen of screens) {
    project.addSourceFileAtPath(screen.filePath)
  }

  const results = await Promise.all(
    screens.map(async (screen) => {
      const sourceFile = project.getSourceFileOrThrow(screen.filePath)
      const sourceCode = await readFile(screen.filePath, 'utf-8')

      // Existing extractors
      const hooks = extractHookFacts(sourceFile)
      const components = extractComponentFacts(sourceFile)
      const conditionals = extractConditionalFacts(sourceFile)
      const navigation = extractNavigationFacts(sourceFile)

      // New extractors
      const localState = extractLocalStateFacts(sourceFile)

      // Build sets for derived var filtering
      const hookVarNames = new Set<string>()
      for (const h of hooks) {
        if (h.destructuredFields) {
          for (const f of h.destructuredFields) hookVarNames.add(f)
        }
        if (h.returnVariable && !h.returnVariable.startsWith('{')) {
          hookVarNames.add(h.returnVariable)
        }
      }
      const localStateNames = new Set(localState.map(ls => ls.name))

      const derivedVars = extractDerivedVarFacts(sourceFile, conditionals, hookVarNames, localStateNames)

      // Build sets for function scanning
      const setterNames = new Set(localState.filter(ls => ls.setter).map(ls => ls.setter!))
      const externalFnNames = new Set<string>()
      for (const h of hooks) {
        if (h.destructuredFields) {
          for (const f of h.destructuredFields) {
            // Classify as function using same heuristic as derive-states
            if (/^(set|clear|handle|on|toggle|fetch|submit|reset|open|close)[A-Z]/.test(f) ||
                ['login', 'logout', 'register'].includes(f)) {
              externalFnNames.add(f)
            }
          }
        }
      }

      const functions = extractFunctionFacts(sourceFile, setterNames, externalFnNames)

      return {
        route: screen.route,
        filePath: screen.filePath,
        ...(screen.exportName ? { exportName: screen.exportName } : {}),
        sourceCode,
        hooks,
        components,
        conditionals,
        navigation,
        localState,
        derivedVars,
        functions,
      }
    }),
  )

  return results
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/collect-facts.test.ts`

Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/collect-facts.ts packages/cli/src/analyzer/__tests__/collect-facts.test.ts
git commit -m "feat: wire new extractors into collectAllFacts orchestrator"
```

---

## Task 6: Implement `deriveAllStates()` in `derive-states.ts`

**Files:**
- Test: `packages/cli/src/analyzer/__tests__/derive-states.test.ts`
- Modify: `packages/cli/src/analyzer/derive-states.ts`

**Step 1: Write the failing tests**

Add new tests for `deriveAllStates`:

```typescript
import {
  classifyDestructuredFields,
  parseCondition,
  findConditionalsForHook,
  deriveStatesFromFacts,
  deriveAllStates,
} from '../derive-states.js'
import type { HookFact, ConditionalFact, LocalStateFact, DerivedVarFact } from '../types.js'

describe('deriveAllStates', () => {
  it('creates regions from external hooks, local state, and derived vars', () => {
    const hooks: HookFact[] = [{
      name: 'useAuthStore',
      importPath: '@/stores/auth-store',
      arguments: [],
      destructuredFields: ['login', 'isLoading', 'error', 'clearError'],
    }]
    const localState: LocalStateFact[] = [
      { name: 'showPassword', hook: 'useState', setter: 'setShowPassword', initialValue: 'false', valueType: 'boolean' },
      { name: 'fieldErrors', hook: 'useState', setter: 'setFieldErrors', initialValue: '{}', valueType: 'object' },
    ]
    const derivedVars: DerivedVarFact[] = [
      { name: 'registrationSuccess', expression: 'searchParams.get("registered") === "true"', sourceVariable: 'searchParams', valueType: 'boolean' },
    ]
    const conditionals: ConditionalFact[] = [
      { condition: 'isLoading', trueBranch: ['Spinner'], falseBranch: [] },
      { condition: 'error', trueBranch: ['ErrorBanner'], falseBranch: [] },
      { condition: 'registrationSuccess', trueBranch: ['SuccessBanner'], falseBranch: [] },
      { condition: 'fieldErrors.email', trueBranch: [], falseBranch: [] },
      { condition: 'showPassword', trueBranch: ['EyeOff'], falseBranch: ['Eye'] },
    ]

    const result = deriveAllStates({ hooks, localState, derivedVars, conditionals })

    // Should have regions for: auth-store, show-password, field-errors, registration-success
    expect(result.has('auth-store')).toBe(true)
    expect(result.has('show-password')).toBe(true)
    expect(result.has('field-errors')).toBe(true)
    expect(result.has('registration-success')).toBe(true)
  })

  it('derives boolean useState states as hidden/visible', () => {
    const result = deriveAllStates({
      hooks: [],
      localState: [{ name: 'showPassword', hook: 'useState', setter: 'setShowPassword', initialValue: 'false', valueType: 'boolean' }],
      derivedVars: [],
      conditionals: [{ condition: 'showPassword', trueBranch: ['EyeOff'], falseBranch: ['Eye'] }],
    })

    const region = result.get('show-password')
    expect(region).toBeDefined()
    expect(region!.states).toHaveProperty('default')
    expect(region!.states).toHaveProperty('active')
    expect(region!.states['default'].mockData).toEqual({ showPassword: false })
    expect(region!.states['active'].mockData).toEqual({ showPassword: true })
  })

  it('derives object useState states as default/populated', () => {
    const result = deriveAllStates({
      hooks: [],
      localState: [{ name: 'fieldErrors', hook: 'useState', setter: 'setFieldErrors', initialValue: '{}', valueType: 'object' }],
      derivedVars: [],
      conditionals: [{ condition: 'fieldErrors.email', trueBranch: [], falseBranch: [] }],
    })

    const region = result.get('field-errors')
    expect(region).toBeDefined()
    expect(region!.states).toHaveProperty('default')
    expect(region!.states).toHaveProperty('populated')
  })

  it('derives derived var states as default/active', () => {
    const result = deriveAllStates({
      hooks: [],
      localState: [],
      derivedVars: [{ name: 'registrationSuccess', expression: 'x === "true"', valueType: 'boolean' }],
      conditionals: [{ condition: 'registrationSuccess', trueBranch: ['Banner'], falseBranch: [] }],
    })

    const region = result.get('registration-success')
    expect(region).toBeDefined()
    expect(region!.states['default'].mockData).toEqual({ registrationSuccess: false })
    expect(region!.states['active'].mockData).toEqual({ registrationSuccess: true })
  })

  it('skips local state not used in any conditional', () => {
    const result = deriveAllStates({
      hooks: [],
      localState: [{ name: 'formData', hook: 'useState', setter: 'setFormData', initialValue: '{}', valueType: 'object' }],
      derivedVars: [],
      conditionals: [],
    })

    expect(result.has('form-data')).toBe(false)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/derive-states.test.ts`

Expected: FAIL — `deriveAllStates` is not exported.

**Step 3: Implement deriveAllStates**

Add to `derive-states.ts`:

```typescript
import type { HookFact, ConditionalFact, RegionState, LocalStateFact, DerivedVarFact } from './types.js'

// Add at the end of the file:

// ---------------------------------------------------------------------------
// 2. Unified state derivation across ALL data sources
// ---------------------------------------------------------------------------

function camelToKebab(name: string): string {
  return name
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
}

interface VariableSource {
  source: 'hook' | 'local-state' | 'derived-var'
  regionKey: string
  fieldName: string
}

export interface DerivedRegion {
  source: 'hook' | 'local-state' | 'derived-var'
  label: string
  states: Record<string, RegionState>
  defaultState: string
  hookName?: string
}

export interface DeriveAllStatesInput {
  hooks: HookFact[]
  localState: LocalStateFact[]
  derivedVars: DerivedVarFact[]
  conditionals: ConditionalFact[]
}

export function deriveAllStates(
  input: DeriveAllStatesInput,
): Map<string, DerivedRegion> {
  const { hooks, localState, derivedVars, conditionals } = input
  const regions = new Map<string, DerivedRegion>()

  // --- Build variable → source map ---
  const varMap = new Map<string, VariableSource>()

  // External hooks: destructured fields map to hook region
  for (const hook of hooks) {
    if (!hook.destructuredFields) continue
    const regionKey = camelToKebab(hook.name.replace(/^use/, ''))
    for (const field of hook.destructuredFields) {
      varMap.set(field, { source: 'hook', regionKey, fieldName: field })
    }
  }

  // Local state: variable name maps to its own region
  for (const ls of localState) {
    const regionKey = camelToKebab(ls.name)
    varMap.set(ls.name, { source: 'local-state', regionKey, fieldName: ls.name })
  }

  // Derived vars: variable name maps to its own region
  for (const dv of derivedVars) {
    const regionKey = camelToKebab(dv.name)
    varMap.set(dv.name, { source: 'derived-var', regionKey, fieldName: dv.name })
  }

  // --- Match each conditional to its source ---
  const regionConditionals = new Map<string, ConditionalFact[]>()

  for (const cond of conditionals) {
    const parsed = parseCondition(cond.condition)
    if (!parsed) continue
    const source = varMap.get(parsed.fieldName)
    if (!source) continue

    if (!regionConditionals.has(source.regionKey)) {
      regionConditionals.set(source.regionKey, [])
    }
    regionConditionals.get(source.regionKey)!.push(cond)
  }

  // --- Build regions for external hooks (existing logic) ---
  const seenHookRegions = new Set<string>()
  for (const hook of hooks) {
    if (!hook.destructuredFields || hook.destructuredFields.length === 0) continue
    const regionKey = camelToKebab(hook.name.replace(/^use/, ''))
    if (seenHookRegions.has(regionKey)) continue
    seenHookRegions.add(regionKey)

    const matchingConds = regionConditionals.get(regionKey) ?? []
    if (matchingConds.length === 0) continue

    const { dataFields, functionFields } = classifyDestructuredFields(hook.destructuredFields)
    const states = deriveStatesFromFacts({
      label: regionKey,
      dataFields,
      functionFields,
      conditionals: matchingConds,
    })

    regions.set(regionKey, {
      source: 'hook',
      label: regionKey,
      states,
      defaultState: 'default',
      hookName: hook.name,
    })
  }

  // --- Build regions for local state ---
  for (const ls of localState) {
    const regionKey = camelToKebab(ls.name)
    const matchingConds = regionConditionals.get(regionKey)
    if (!matchingConds || matchingConds.length === 0) continue

    const states: Record<string, RegionState> = {}

    if (ls.valueType === 'boolean') {
      states['default'] = { label: `${regionKey} default`, mockData: { [ls.name]: false } }
      states['active'] = { label: `${regionKey} active`, mockData: { [ls.name]: true } }
    } else if (ls.valueType === 'object') {
      states['default'] = { label: `${regionKey} default`, mockData: { [ls.name]: {} } }
      states['populated'] = { label: `${regionKey} populated`, mockData: { [ls.name]: { field: 'value' } } }
    } else if (ls.valueType === 'array') {
      states['default'] = { label: `${regionKey} default`, mockData: { [ls.name]: [] } }
      states['populated'] = { label: `${regionKey} populated`, mockData: { [ls.name]: [{ id: '1' }] } }
    } else if (ls.valueType === 'string') {
      states['default'] = { label: `${regionKey} default`, mockData: { [ls.name]: '' } }
      states['filled'] = { label: `${regionKey} filled`, mockData: { [ls.name]: 'sample text' } }
    } else if (ls.valueType === 'null') {
      states['default'] = { label: `${regionKey} default`, mockData: { [ls.name]: null } }
      states['present'] = { label: `${regionKey} present`, mockData: { [ls.name]: 'value' } }
    } else {
      states['default'] = { label: `${regionKey} default`, mockData: { [ls.name]: null } }
      states['active'] = { label: `${regionKey} active`, mockData: { [ls.name]: true } }
    }

    regions.set(regionKey, {
      source: 'local-state',
      label: regionKey,
      states,
      defaultState: 'default',
    })
  }

  // --- Build regions for derived variables ---
  for (const dv of derivedVars) {
    const regionKey = camelToKebab(dv.name)
    const matchingConds = regionConditionals.get(regionKey)
    if (!matchingConds || matchingConds.length === 0) continue

    const falsy = dv.valueType === 'boolean' ? false : null
    const truthy = dv.valueType === 'boolean' ? true : `${dv.name}-value`

    const states: Record<string, RegionState> = {
      'default': { label: `${regionKey} default`, mockData: { [dv.name]: falsy } },
      'active': { label: `${regionKey} active`, mockData: { [dv.name]: truthy } },
    }

    regions.set(regionKey, {
      source: 'derived-var',
      label: regionKey,
      states,
      defaultState: 'default',
    })
  }

  return regions
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/derive-states.test.ts`

Expected: ALL PASS (old + new tests)

**Step 5: Commit**

```bash
git add packages/cli/src/analyzer/derive-states.ts packages/cli/src/analyzer/__tests__/derive-states.test.ts
git commit -m "feat: add deriveAllStates for unified state derivation across all sources"
```

---

## Task 7: Update `buildFromTemplates()` to use new facts

**Files:**
- Test: `packages/cli/src/analyzer/__tests__/template-fallback.test.ts`
- Modify: `packages/cli/src/analyzer/template-fallback.ts`

**Step 1: Write the failing tests**

Add new tests and update `ScreenFacts` objects to include new fields:

```typescript
it('creates local-state regions from useState with conditionals', () => {
  const facts: ScreenFacts = {
    route: '/login',
    filePath: '/app/login.tsx',
    sourceCode: '',
    hooks: [],
    components: [], conditionals: [
      { condition: 'showPassword', trueBranch: ['EyeOff'], falseBranch: ['Eye'] },
    ],
    navigation: [],
    localState: [
      { name: 'showPassword', hook: 'useState', setter: 'setShowPassword', initialValue: 'false', valueType: 'boolean' },
    ],
    derivedVars: [],
    functions: [],
  }
  const result = buildFromTemplates(facts)
  const region = result.regions.find(r => r.key === 'show-password')
  expect(region).toBeDefined()
  expect(region!.type).toBe('local-state')
  expect(Object.keys(region!.states)).toContain('default')
  expect(Object.keys(region!.states)).toContain('active')
})

it('creates derived-var regions from conditional-driven variables', () => {
  const facts: ScreenFacts = {
    route: '/login',
    filePath: '/app/login.tsx',
    sourceCode: '',
    hooks: [],
    components: [], conditionals: [
      { condition: 'registrationSuccess', trueBranch: ['Banner'], falseBranch: [] },
    ],
    navigation: [],
    localState: [],
    derivedVars: [
      { name: 'registrationSuccess', expression: 'x === "true"', sourceVariable: 'searchParams', valueType: 'boolean' },
    ],
    functions: [],
  }
  const result = buildFromTemplates(facts)
  const region = result.regions.find(r => r.key === 'registration-success')
  expect(region).toBeDefined()
  expect(region!.type).toBe('derived-var')
})

it('generates flows from FunctionFacts', () => {
  const facts: ScreenFacts = {
    route: '/login',
    filePath: '/app/login.tsx',
    sourceCode: '',
    hooks: [],
    components: [], conditionals: [],
    navigation: [],
    localState: [],
    derivedVars: [],
    functions: [
      {
        name: 'handleSubmit',
        kind: 'function',
        triggers: [{ element: 'form', event: 'onSubmit' }],
        settersCalled: ['setFieldErrors'],
        navigationCalls: ['navigate(redirectTo)'],
        externalCalls: ['login'],
      },
      {
        name: '__inline_setShowPassword',
        kind: 'arrow',
        triggers: [{ element: 'button', event: 'onClick' }],
        settersCalled: ['setShowPassword'],
        navigationCalls: [],
        externalCalls: [],
      },
    ],
  }
  const result = buildFromTemplates(facts)

  // Should have flows for handleSubmit + toggle + no navigation flows (navigation is empty)
  expect(result.flows.length).toBeGreaterThanOrEqual(2)

  const submitFlow = result.flows.find(f => f.trigger.selector === 'form')
  expect(submitFlow).toBeDefined()

  const toggleFlow = result.flows.find(f =>
    f.action === 'setRegionState' && f.targetRegion === 'show-password'
  )
  expect(toggleFlow).toBeDefined()
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/template-fallback.test.ts`

Expected: FAIL — new fields missing on ScreenFacts, no local-state regions produced.

**Step 3: Update existing test facts to include new fields**

Add default empty arrays to ALL existing test `ScreenFacts` objects in `template-fallback.test.ts`:

For every existing `facts: ScreenFacts = { ... }`, add:
```typescript
localState: [], derivedVars: [], functions: [],
```

**Step 4: Update buildFromTemplates to include new regions and flows**

In `template-fallback.ts`, import and use `deriveAllStates`:

```typescript
import { classifyDestructuredFields, findConditionalsForHook, deriveStatesFromFacts, deriveAllStates } from './derive-states.js'
import type { LocalStateFact, DerivedVarFact, FunctionFact } from './types.js'
```

At the end of `buildFromTemplates`, after the existing hook loop and before `const flows = ...`:

```typescript
  // --- New: regions from local state and derived vars ---
  const unifiedRegions = deriveAllStates({
    hooks: facts.hooks,
    localState: facts.localState ?? [],
    derivedVars: facts.derivedVars ?? [],
    conditionals: facts.conditionals,
  })

  for (const [key, derived] of unifiedRegions) {
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    if (derived.source === 'local-state' || derived.source === 'derived-var') {
      const label = formatLabel(key)
      const stateNames = Object.keys(derived.states)
      const defaultState = stateNames.includes('default') ? 'default' : stateNames[0]

      regions.push({
        key,
        label,
        type: derived.source as 'local-state' | 'derived-var',
        hookBindings: [],
        states: derived.states,
        defaultState,
      })
    }
  }

  // --- Flows from functions ---
  const functionFlows = buildFunctionFlows(facts.functions ?? [])
  const navigationFlows = navigationToFlows(facts)
  const flows = [...functionFlows, ...navigationFlows]
```

Add the `buildFunctionFlows` helper:

```typescript
function buildFunctionFlows(functions: FunctionFact[]): FlowOutput[] {
  const flows: FlowOutput[] = []

  for (const fn of functions) {
    for (const trigger of fn.triggers) {
      // Toggle pattern: inline setter for a boolean
      if (fn.name.startsWith('__inline_') && fn.settersCalled.length === 1) {
        const setterName = fn.settersCalled[0]
        // Convert setter to region key: setShowPassword → show-password
        const varName = setterName.replace(/^set/, '')
        const regionKey = varName.charAt(0).toLowerCase() + varName.slice(1)
        const kebabKey = regionKey.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')

        flows.push({
          trigger: { selector: trigger.element, text: `${trigger.event}:${fn.name}` },
          action: 'setRegionState',
          target: 'active',
          targetRegion: kebabKey,
        })
        continue
      }

      // Named function: general flow
      const flow: FlowOutput = {
        trigger: { selector: trigger.element, text: `${trigger.event}:${fn.name}` },
        action: fn.navigationCalls.length > 0 ? 'navigate' : 'setState',
        target: fn.navigationCalls.length > 0
          ? fn.navigationCalls[0].replace(/^navigate\(/, '').replace(/\)$/, '').replace(/['"]/g, '')
          : fn.name,
      }
      flows.push(flow)
    }
  }

  return flows
}
```

Then replace the old `const flows = navigationToFlows(facts)` line with the combined flows.

**Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/cli/src/analyzer/__tests__/template-fallback.test.ts`

Expected: ALL PASS (old + new)

**Step 6: Commit**

```bash
git add packages/cli/src/analyzer/template-fallback.ts packages/cli/src/analyzer/__tests__/template-fallback.test.ts
git commit -m "feat: buildFromTemplates produces regions from local state, derived vars, and function flows"
```

---

## Task 8: Update downstream generators

**Files:**
- Modify: `packages/cli/src/generator/generate-from-analysis.ts`
- Modify: `packages/cli/src/llm/schemas/screen-analysis.ts` (already done in Task 1)

**Step 1: Add new HookMappingType inference**

In `generate-from-analysis.ts`, update `inferHookMappingType`:

```typescript
export function inferHookMappingType(hookName: string): HookMappingType {
  const lower = hookName.toLowerCase()

  if (
    lower === 'usequery' ||
    lower === 'useswr' ||
    lower === 'usefetch' ||
    (lower.includes('query') && !lower.includes('livequery'))
  ) {
    return 'query-hook'
  }

  if (lower.endsWith('store') || /^use\w+Store$/.test(hookName)) {
    return 'store'
  }

  if (lower === 'usecontext') {
    return 'context'
  }

  if (lower.includes('livequery')) {
    return 'custom-hook'
  }

  // New: local-state and derived-var don't go through hook inference
  // They're set directly in template-fallback, but handle gracefully
  if (lower === 'usestate' || lower === 'useref') {
    return 'local-state'
  }

  return 'unknown'
}
```

**Step 2: Build and run integration test**

Run: `pnpm build && pnpm test`

Expected: Build succeeds, generates output for sample-app.

**Step 3: Commit**

```bash
git add packages/cli/src/generator/generate-from-analysis.ts
git commit -m "feat: add local-state and derived-var to HookMappingType inference"
```

---

## Task 9: Integration test against booking project

**Step 1: Run generate against booking project**

```bash
cd ~/Desktop/booking/client && node /Users/loclam/Desktop/preview-tool/packages/cli/dist/index.js generate
```

Expected: Should now show more than 1 mock module, and LoginPage model.ts should contain regions for `show-password`, `field-errors`, and `registration-success` in addition to `auth-store`.

**Step 2: Verify LoginPage model.ts**

Read `~/Desktop/booking/client/.preview/screens/LoginPage/model.ts` and verify:
- `auth-store` region with states: default, loading, error
- `show-password` region with states: default, active
- `field-errors` region with states: default, populated
- `registration-success` region with states: default, active

**Step 3: Verify LoginPage controller.ts**

Read `~/Desktop/booking/client/.preview/screens/LoginPage/controller.ts` and verify:
- Flow for `handleSubmit` with `form` trigger
- Flow for toggle `setShowPassword` with `button` trigger
- Flow for `<Link to="/register">`

**Step 4: Run all unit tests**

```bash
npx vitest run packages/cli/src/analyzer/__tests__/
```

Expected: ALL PASS

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: comprehensive state analysis — Phase 1 complete

Analyzer now discovers all visual states from useState, useRef,
derived variables, and function flows. LoginPage goes from 3/6
detected states to 6/6."
```

import { type SourceFile, SyntaxKind, type CallExpression, type Node, Project } from 'ts-morph'
import { readFile } from 'node:fs/promises'
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

/**
 * Extract all hook call facts from a source file using AST.
 * No pattern matching — just collects raw call data.
 */
export function extractHookFacts(sourceFile: SourceFile): HookFact[] {
  const hooks: HookFact[] = []

  // Build import map: localName → importPath
  // and export name map: localName → originalExportName
  // e.g. `import { useAppLiveQuery as useLiveQuery }` → localName="useLiveQuery", originalName="useAppLiveQuery"
  const importMap = new Map<string, string>()
  const exportNameMap = new Map<string, string>()
  for (const decl of sourceFile.getImportDeclarations()) {
    const modulePath = decl.getModuleSpecifierValue()
    for (const named of decl.getNamedImports()) {
      const alias = named.getAliasNode()
      const originalName = named.getName()
      const localName = alias ? alias.getText() : originalName
      importMap.set(localName, modulePath)
      exportNameMap.set(localName, originalName)
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
    const localName = expr.getText()

    // Only process hook calls (useXxx pattern)
    if (!localName.startsWith('use') || !importMap.has(localName)) continue

    const importPath = importMap.get(localName)!
    // Use the original export name (not the local alias) so generated mocks
    // export the correct name that other consumers of the module expect.
    const name = exportNameMap.get(localName) ?? localName
    const args = call.getArguments().map((arg) => arg.getText())
    const { variable: returnVariable, destructuredFields } = extractReturnInfo(call)

    hooks.push({
      name,
      importPath,
      arguments: args,
      ...(returnVariable ? { returnVariable } : {}),
      ...(destructuredFields ? { destructuredFields } : {}),
    })
  }

  return hooks
}

interface ReturnInfo {
  variable?: string
  destructuredFields?: string[]
}

function extractReturnInfo(call: CallExpression): ReturnInfo {
  const parent = call.getParent()
  if (!parent) return {}

  if (parent.isKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = parent.getNameNode()
    const text = nameNode.getText()

    // Object destructuring: const { login, isLoading, error } = useStore()
    if (nameNode.isKind(SyntaxKind.ObjectBindingPattern)) {
      const fields = nameNode.getElements().map((el) => {
        // For renamed bindings like { error: storeError }, use the property name (error)
        const propertyName = el.getPropertyNameNode()
        return propertyName ? propertyName.getText() : el.getNameNode().getText()
      })
      return { variable: text, destructuredFields: fields }
    }

    return { variable: text }
  }

  return {}
}

// --- Import map builder (shared utility) ---

function buildImportMap(sourceFile: SourceFile): Map<string, string> {
  const importMap = new Map<string, string>()
  for (const decl of sourceFile.getImportDeclarations()) {
    const modulePath = decl.getModuleSpecifierValue()
    for (const named of decl.getNamedImports()) {
      const alias = named.getAliasNode()
      const localName = alias ? alias.getText() : named.getName()
      importMap.set(localName, modulePath)
    }
    const defaultImport = decl.getDefaultImport()
    if (defaultImport) {
      importMap.set(defaultImport.getText(), modulePath)
    }
  }
  return importMap
}

// --- Local state extraction (useState / useRef) ---

function inferValueType(text: string): string {
  const trimmed = text.trim()

  if (trimmed === 'true' || trimmed === 'false') return 'boolean'
  if (trimmed === 'null') return 'null'
  if (trimmed === 'undefined') return 'undefined'
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'number'
  if (trimmed.startsWith("'") || trimmed.startsWith('"') || trimmed.startsWith('`')) return 'string'
  if (trimmed.startsWith('[')) return 'array'
  if (trimmed.startsWith('{')) return 'object'

  return 'unknown'
}

/**
 * Extract local state facts from useState and useRef calls.
 * Only captures calls imported from 'react'.
 */
export function extractLocalStateFacts(sourceFile: SourceFile): LocalStateFact[] {
  const importMap = buildImportMap(sourceFile)
  const facts: LocalStateFact[] = []

  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

  for (const call of calls) {
    const calleeName = call.getExpression().getText()

    if (calleeName !== 'useState' && calleeName !== 'useRef') continue

    // Verify the hook is imported from 'react'
    const importPath = importMap.get(calleeName)
    if (importPath !== 'react') continue

    const args = call.getArguments()
    const initialValue = args.length > 0 ? args[0].getText() : 'undefined'
    const valueType = inferValueType(initialValue)

    const parent = call.getParent()
    if (!parent || !parent.isKind(SyntaxKind.VariableDeclaration)) continue

    const nameNode = parent.getNameNode()

    if (calleeName === 'useState') {
      // useState must use array destructuring: const [name, setter] = useState(...)
      if (!nameNode.isKind(SyntaxKind.ArrayBindingPattern)) continue

      const elements = nameNode.getElements()
      const stateName = elements.length > 0 ? elements[0].getText() : 'unknown'
      const setter = elements.length > 1 ? elements[1].getText() : undefined

      facts.push({
        name: stateName,
        hook: 'useState',
        ...(setter ? { setter } : {}),
        initialValue,
        valueType,
      })
    } else {
      // useRef uses simple identifier: const ref = useRef(...)
      const refName = nameNode.getText()

      facts.push({
        name: refName,
        hook: 'useRef',
        initialValue,
        valueType,
      })
    }
  }

  return facts
}

// --- Derived variable extraction ---

/**
 * Infer the type of a value from the shape of its expression text.
 * Comparisons and negations produce booleans; literals map to their type.
 */
function inferExpressionType(expr: string): string {
  const trimmed = expr.trim()

  // Comparison operators → boolean
  if (
    trimmed.includes('===') ||
    trimmed.includes('!==') ||
    trimmed.includes('==') ||
    trimmed.includes('!=') ||
    trimmed.includes('>=') ||
    trimmed.includes('<=') ||
    trimmed.includes('>') ||
    trimmed.includes('<')
  ) {
    return 'boolean'
  }

  // Negation → boolean
  if (trimmed.startsWith('!')) return 'boolean'

  // Delegate to the literal type inferrer for simple values
  return inferValueType(trimmed)
}

/**
 * Extract the first identifier (root variable name) from an expression.
 * e.g. "data.length > 0" → "data", "searchParams.get('x')" → "searchParams"
 */
function extractSourceVariable(expr: string): string | undefined {
  const match = expr.trim().match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/)
  return match ? match[1] : undefined
}

/**
 * Extract derived variable facts: const declarations whose names appear in
 * conditional conditions. Skips variables already tracked as hook returns
 * or local state.
 */
export function extractDerivedVarFacts(
  sourceFile: SourceFile,
  conditionals: ConditionalFact[],
  hookVarNames: Set<string>,
  localStateNames: Set<string>,
): DerivedVarFact[] {
  // Collect all variable names referenced in conditional conditions
  const conditionalVarNames = new Set<string>()
  for (const cond of conditionals) {
    // Extract identifiers from the condition text
    const identifiers = cond.condition.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g)
    if (identifiers) {
      for (const id of identifiers) {
        conditionalVarNames.add(id)
      }
    }
  }

  const facts: DerivedVarFact[] = []

  // Walk all variable declarations
  const declarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)

  for (const decl of declarations) {
    const nameNode = decl.getNameNode()

    // Only process simple Identifier name nodes (not destructuring patterns)
    if (!nameNode.isKind(SyntaxKind.Identifier)) continue

    const name = nameNode.getText()

    // Skip if already tracked by hooks or local state
    if (hookVarNames.has(name) || localStateNames.has(name)) continue

    // Skip if not used in any conditional
    if (!conditionalVarNames.has(name)) continue

    // Must have an initializer expression
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

// --- Component extraction ---

function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name)
}

/**
 * Extract component facts from JSX usage in a source file.
 * Finds imported PascalCase components with their props and children.
 */
export function extractComponentFacts(sourceFile: SourceFile): ComponentFact[] {
  const importMap = buildImportMap(sourceFile)
  const seen = new Set<string>()
  const components: ComponentFact[] = []

  // Process JsxOpeningElement (paired tags like <Foo>...</Foo>)
  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    const tagName = el.getTagNameNode().getText()
    if (!isPascalCase(tagName) || seen.has(tagName)) continue
    if (!importMap.has(tagName)) continue

    seen.add(tagName)

    const props = el.getAttributes()
      .filter((attr) => attr.isKind(SyntaxKind.JsxAttribute))
      .map((attr) => attr.getNameNode().getText())

    // Find child components inside the parent JsxElement
    const jsxElement = el.getParent()
    const children: string[] = []
    if (jsxElement && jsxElement.isKind(SyntaxKind.JsxElement)) {
      for (const child of jsxElement.getJsxChildren()) {
        if (child.isKind(SyntaxKind.JsxElement)) {
          const childTag = child.getOpeningElement().getTagNameNode().getText()
          if (isPascalCase(childTag)) {
            children.push(childTag)
          }
        } else if (child.isKind(SyntaxKind.JsxSelfClosingElement)) {
          const childTag = child.getTagNameNode().getText()
          if (isPascalCase(childTag)) {
            children.push(childTag)
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

  // Process JsxSelfClosingElement (like <Foo />)
  for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    const tagName = el.getTagNameNode().getText()
    if (!isPascalCase(tagName) || seen.has(tagName)) continue
    if (!importMap.has(tagName)) continue

    seen.add(tagName)

    const props = el.getAttributes()
      .filter((attr) => attr.isKind(SyntaxKind.JsxAttribute))
      .map((attr) => attr.getNameNode().getText())

    components.push({
      name: tagName,
      importPath: importMap.get(tagName)!,
      props,
      children: [],
    })
  }

  return components
}

// --- Conditional extraction ---

function containsJsx(node: Node): boolean {
  if (
    node.isKind(SyntaxKind.JsxElement) ||
    node.isKind(SyntaxKind.JsxSelfClosingElement) ||
    node.isKind(SyntaxKind.JsxFragment)
  ) {
    return true
  }
  return node.getChildren().some(containsJsx)
}

function extractComponentNamesFromNode(node: Node): string[] {
  const names: string[] = []

  if (node.isKind(SyntaxKind.JsxSelfClosingElement)) {
    const tag = node.getTagNameNode().getText()
    if (isPascalCase(tag)) names.push(tag)
  } else if (node.isKind(SyntaxKind.JsxElement)) {
    const tag = node.getOpeningElement().getTagNameNode().getText()
    if (isPascalCase(tag)) names.push(tag)
  }

  // Recurse into children for nested components
  for (const child of node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    const tag = child.getTagNameNode().getText()
    if (isPascalCase(tag)) names.push(tag)
  }
  for (const child of node.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    const tag = child.getTagNameNode().getText()
    if (isPascalCase(tag)) names.push(tag)
  }

  return [...new Set(names)]
}

/**
 * Extract conditional rendering facts from JSX ternaries and logical AND.
 * Only captures conditionals where at least one branch contains JSX.
 */
export function extractConditionalFacts(sourceFile: SourceFile): ConditionalFact[] {
  const conditionals: ConditionalFact[] = []

  // Ternary: condition ? <A /> : <B />
  for (const ternary of sourceFile.getDescendantsOfKind(SyntaxKind.ConditionalExpression)) {
    const whenTrue = ternary.getWhenTrue()
    const whenFalse = ternary.getWhenFalse()

    if (!containsJsx(whenTrue) && !containsJsx(whenFalse)) continue

    const condition = ternary.getCondition().getText()
    const trueBranch = extractComponentNamesFromNode(whenTrue)
    const falseBranch = extractComponentNamesFromNode(whenFalse)

    conditionals.push({ condition, trueBranch, falseBranch })
  }

  // Logical AND: condition && <Component />
  for (const binary of sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    const opToken = binary.getOperatorToken()
    if (opToken.getKind() !== SyntaxKind.AmpersandAmpersandToken) continue

    const right = binary.getRight()
    if (!containsJsx(right)) continue

    const condition = binary.getLeft().getText()
    const trueBranch = extractComponentNamesFromNode(right)

    conditionals.push({ condition, trueBranch, falseBranch: [] })
  }

  return conditionals
}

// --- Navigation extraction ---

/**
 * Extract navigation facts: navigate() calls, router.push(), <Link>, <a> elements.
 */
export function extractNavigationFacts(sourceFile: SourceFile): NavigationFact[] {
  const navigation: NavigationFact[] = []

  // Detect navigate() and router.push() calls
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression()
    const text = expr.getText()

    const isNavigateCall =
      text === 'navigate' ||
      text.endsWith('.push') ||
      text.endsWith('.navigate')

    if (!isNavigateCall) continue

    const args = call.getArguments()
    if (args.length === 0) continue

    const target = args[0].getText()
    navigation.push({
      target: stripQuotes(target),
      trigger: `${text}(${target})`,
    })
  }

  // Detect <Link to="..."> and <a href="...">
  const jsxElements = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ]

  for (const el of jsxElements) {
    const tagName = el.getTagNameNode().getText()

    if (tagName === 'Link' || tagName === 'NavLink') {
      const toProp = findJsxAttribute(el, 'to')
      if (toProp) {
        navigation.push({
          target: stripQuotes(toProp),
          trigger: `<${tagName} to="${stripQuotes(toProp)}">`,
        })
      }
    }

    if (tagName === 'a') {
      const hrefProp = findJsxAttribute(el, 'href')
      if (hrefProp) {
        navigation.push({
          target: stripQuotes(hrefProp),
          trigger: `<a href="${stripQuotes(hrefProp)}">`,
        })
      }
    }
  }

  return navigation
}

function findJsxAttribute(
  el: Node,
  attrName: string,
): string | undefined {
  const attrs = el.getDescendantsOfKind(SyntaxKind.JsxAttribute)
  for (const attr of attrs) {
    if (attr.getNameNode().getText() === attrName) {
      const init = attr.getInitializer()
      if (init) {
        return init.getText()
      }
    }
  }
  return undefined
}

function stripQuotes(value: string): string {
  // Remove surrounding quotes: "foo" -> foo, 'foo' -> foo
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

// --- Function fact extraction (event handlers, flows) ---

const EVENT_ATTRIBUTES = new Set([
  'onClick', 'onSubmit', 'onChange', 'onBlur', 'onFocus', 'onKeyDown', 'onKeyUp',
])

/**
 * Walk a function body and classify call expressions into setters, navigation, and external calls.
 */
function scanFunctionBody(
  node: Node,
  setterNames: Set<string>,
  externalFnNames: Set<string>,
): { settersCalled: string[]; navigationCalls: string[]; externalCalls: string[] } {
  const settersCalled = new Set<string>()
  const navigationCalls = new Set<string>()
  const externalCalls = new Set<string>()

  for (const call of node.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression().getText()

    if (setterNames.has(callee)) {
      settersCalled.add(callee)
      continue
    }

    if (
      callee === 'navigate' ||
      callee.endsWith('.push') ||
      callee.endsWith('.navigate')
    ) {
      const args = call.getArguments()
      const firstArg = args.length > 0 ? args[0].getText() : ''
      navigationCalls.add(`${callee}(${firstArg})`)
      continue
    }

    if (externalFnNames.has(callee)) {
      externalCalls.add(callee)
    }
  }

  return {
    settersCalled: [...settersCalled],
    navigationCalls: [...navigationCalls],
    externalCalls: [...externalCalls],
  }
}

/**
 * Determine the tag name for a JSX element that contains an event attribute.
 * Works with both JsxOpeningElement and JsxSelfClosingElement.
 */
function getJsxTagName(el: Node): string {
  if (el.isKind(SyntaxKind.JsxOpeningElement) || el.isKind(SyntaxKind.JsxSelfClosingElement)) {
    return el.getChildAtIndex(1)?.getText() ?? 'unknown'
  }
  return 'unknown'
}

/**
 * Extract function facts: event handler functions and their JSX bindings.
 * Only returns functions that have at least one JSX trigger (onClick, onSubmit, etc.).
 */
export function extractFunctionFacts(
  sourceFile: SourceFile,
  setterNames: Set<string>,
  externalFnNames: Set<string>,
): FunctionFact[] {
  // Step 1: Collect all named functions and arrow variable declarations
  const fnMap = new Map<string, { kind: FunctionFact['kind']; body: Node }>()

  // Named function declarations
  for (const fn of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = fn.getName()
    if (!name) continue
    // Skip the top-level component function (the Screen function)
    // We only want inner functions
    const body = fn.getBody()
    if (!body) continue
    fnMap.set(name, { kind: 'function', body })
  }

  // Arrow function variable declarations: const handleClick = () => { ... }
  // Also detect useCallback: const handleClick = useCallback(() => { ... }, [])
  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = decl.getNameNode()
    if (!nameNode.isKind(SyntaxKind.Identifier)) continue
    const name = nameNode.getText()
    const init = decl.getInitializer()
    if (!init) continue

    if (init.isKind(SyntaxKind.ArrowFunction)) {
      fnMap.set(name, { kind: 'arrow', body: init })
    } else if (init.isKind(SyntaxKind.CallExpression)) {
      const calleeName = init.getExpression().getText()
      if (calleeName === 'useCallback') {
        const cbArg = init.getArguments()[0]
        if (cbArg && cbArg.isKind(SyntaxKind.ArrowFunction)) {
          fnMap.set(name, { kind: 'useCallback', body: cbArg })
        }
      }
    }
  }

  // Step 2: Scan JSX elements for event attributes and build trigger map
  // triggerMap: fnName -> FunctionTrigger[]
  const triggerMap = new Map<string, FunctionTrigger[]>()
  // inlineFacts: facts for inline arrow functions in JSX attributes
  const inlineFacts: FunctionFact[] = []

  const jsxElements = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
  ]

  for (const el of jsxElements) {
    const tagName = el.isKind(SyntaxKind.JsxOpeningElement)
      ? el.getTagNameNode().getText()
      : el.isKind(SyntaxKind.JsxSelfClosingElement)
        ? el.getTagNameNode().getText()
        : 'unknown'

    const attrs = el.getDescendantsOfKind(SyntaxKind.JsxAttribute)
    for (const attr of attrs) {
      const attrName = attr.getNameNode().getText()
      if (!EVENT_ATTRIBUTES.has(attrName)) continue

      const initializer = attr.getInitializer()
      if (!initializer) continue

      // JsxExpression: {handleSubmit} or {() => ...}
      if (initializer.isKind(SyntaxKind.JsxExpression)) {
        const expression = initializer.getExpression()
        if (!expression) continue

        // Reference to a named function: onClick={handleClick}
        if (expression.isKind(SyntaxKind.Identifier)) {
          const refName = expression.getText()
          if (fnMap.has(refName)) {
            const triggers = triggerMap.get(refName) ?? []
            triggers.push({ element: tagName, event: attrName })
            triggerMap.set(refName, triggers)
          }
        }
        // Inline arrow function: onClick={() => setShow(!show)}
        else if (expression.isKind(SyntaxKind.ArrowFunction)) {
          const scanResult = scanFunctionBody(expression, setterNames, externalFnNames)
          const firstSetter = scanResult.settersCalled[0]
          const inlineName = firstSetter
            ? `__inline_${firstSetter}`
            : `__inline_${tagName}_${attrName}`

          inlineFacts.push({
            name: inlineName,
            kind: 'arrow',
            triggers: [{ element: tagName, event: attrName }],
            ...scanResult,
          })
        }
      }
    }
  }

  // Step 3: Build final facts — only functions with triggers
  const facts: FunctionFact[] = []

  for (const [name, { kind, body }] of fnMap) {
    const triggers = triggerMap.get(name)
    if (!triggers || triggers.length === 0) continue

    const scanResult = scanFunctionBody(body, setterNames, externalFnNames)
    facts.push({
      name,
      kind,
      triggers,
      ...scanResult,
    })
  }

  // Add inline facts
  for (const inline of inlineFacts) {
    facts.push(inline)
  }

  return facts
}

// --- collectAllFacts orchestrator ---

export interface ScreenInput {
  filePath: string
  route: string
  exportName?: string
}

/**
 * Collects all facts from multiple screens using a shared ts-morph Project.
 * Creates one Project, adds all files, then extracts facts in parallel.
 */
export async function collectAllFacts(screens: ScreenInput[]): Promise<ScreenFacts[]> {
  const project = new Project({
    useInMemoryFileSystem: false,
    tsConfigFilePath: undefined,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strict: true, jsx: 4 },
  })

  // Add all screen files to the shared project
  for (const screen of screens) {
    project.addSourceFileAtPath(screen.filePath)
  }

  // Extract facts in parallel
  const results = await Promise.all(
    screens.map(async (screen) => {
      const sourceFile = project.getSourceFileOrThrow(screen.filePath)
      const sourceCode = await readFile(screen.filePath, 'utf-8')

      const hooks = extractHookFacts(sourceFile)
      const components = extractComponentFacts(sourceFile)
      const conditionals = extractConditionalFacts(sourceFile)
      const navigation = extractNavigationFacts(sourceFile)

      return {
        route: screen.route,
        filePath: screen.filePath,
        ...(screen.exportName ? { exportName: screen.exportName } : {}),
        sourceCode,
        hooks,
        components,
        conditionals,
        navigation,
      }
    }),
  )

  return results
}


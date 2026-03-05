import { type SourceFile, SyntaxKind, type CallExpression, type Node, Project } from 'ts-morph'
import { readFile } from 'node:fs/promises'
import type {
  HookFact,
  ComponentFact,
  ConditionalFact,
  NavigationFact,
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

  if (parent.isKind(SyntaxKind.VariableDeclaration)) {
    return parent.getNameNode().getText()
  }

  return undefined
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


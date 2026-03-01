import { Project, SyntaxKind, type Node, type SourceFile } from 'ts-morph'
import type {
  DiscoveredScreen,
  PropDefinition,
  ViewNode,
  ViewTree,
} from './types.js'

// ---------------------------------------------------------------------------
// Import classification
// ---------------------------------------------------------------------------

type ImportSource = 'ui' | 'block' | 'local' | 'external'

interface ImportInfo {
  source: ImportSource
  importPath: string
}

function classifyImport(moduleSpecifier: string): ImportSource {
  if (
    moduleSpecifier.includes('/components/ui/') ||
    moduleSpecifier.includes('/ui/')
  ) {
    return 'ui'
  }
  if (moduleSpecifier.includes('/blocks/')) {
    return 'block'
  }
  if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('@/')) {
    return 'local'
  }
  return 'external'
}

function buildImportMap(sourceFile: SourceFile): Map<string, ImportInfo> {
  const importMap = new Map<string, ImportInfo>()

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue()
    const source = classifyImport(moduleSpecifier)

    // Named imports: import { Button, Card } from '...'
    for (const namedImport of importDecl.getNamedImports()) {
      const name = namedImport.getAliasNode()?.getText() ?? namedImport.getName()
      importMap.set(name, { source, importPath: moduleSpecifier })
    }

    // Default import: import Card from '...'
    const defaultImport = importDecl.getDefaultImport()
    if (defaultImport) {
      importMap.set(defaultImport.getText(), {
        source,
        importPath: moduleSpecifier,
      })
    }

    // Namespace import: import * as Icons from '...'
    const namespaceImport = importDecl.getNamespaceImport()
    if (namespaceImport) {
      importMap.set(namespaceImport.getText(), {
        source,
        importPath: moduleSpecifier,
      })
    }
  }

  return importMap
}

// ---------------------------------------------------------------------------
// Export detection & data props
// ---------------------------------------------------------------------------

interface ExportInfo {
  exportType: 'default' | 'named'
  exportName?: string
  dataProps: PropDefinition[]
}

function findExportInfo(
  sourceFile: SourceFile,
  screen: DiscoveredScreen
): ExportInfo {
  // Try default export first
  const defaultExportSymbol = sourceFile.getDefaultExportSymbol()
  if (defaultExportSymbol) {
    const declarations = defaultExportSymbol.getDeclarations()
    if (declarations.length > 0) {
      const dataProps = extractDataPropsFromDeclaration(
        declarations[0],
        sourceFile
      )
      return { exportType: 'default', dataProps }
    }
  }

  // Try named export
  if (screen.exportName) {
    const funcDecl = sourceFile.getFunction(screen.exportName)
    if (funcDecl) {
      const dataProps = extractPropsFromParameters(
        funcDecl.getParameters(),
        sourceFile
      )
      return {
        exportType: 'named',
        exportName: screen.exportName,
        dataProps,
      }
    }

    const varDecl = sourceFile.getVariableDeclaration(screen.exportName)
    if (varDecl) {
      const init = varDecl.getInitializer()
      const arrowFunc = init?.asKind(SyntaxKind.ArrowFunction)
      if (arrowFunc) {
        const dataProps = extractPropsFromParameters(
          arrowFunc.getParameters(),
          sourceFile
        )
        return {
          exportType: 'named',
          exportName: screen.exportName,
          dataProps,
        }
      }
    }
  }

  return { exportType: 'default', dataProps: [] }
}

function extractDataPropsFromDeclaration(
  decl: Node,
  sourceFile: SourceFile
): PropDefinition[] {
  const funcDecl = decl.asKind(SyntaxKind.FunctionDeclaration)
  if (funcDecl) {
    return extractPropsFromParameters(funcDecl.getParameters(), sourceFile)
  }

  const varDecl = decl.asKind(SyntaxKind.VariableDeclaration)
  if (varDecl) {
    const init = varDecl.getInitializer()
    const arrowFunc = init?.asKind(SyntaxKind.ArrowFunction)
    if (arrowFunc) {
      return extractPropsFromParameters(arrowFunc.getParameters(), sourceFile)
    }
  }

  return []
}

function extractPropsFromParameters(
  params: { getType(): import('ts-morph').Type }[],
  sourceFile: SourceFile
): PropDefinition[] {
  const results: PropDefinition[] = []

  for (const param of params) {
    const paramType = param.getType()
    const properties = paramType.getProperties()

    for (const prop of properties) {
      const propType = prop.getTypeAtLocation(sourceFile)
      const isOptional = prop.isOptional()
      results.push({
        name: prop.getName(),
        type: propType.getText(),
        required: !isOptional,
      })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// JSX tree walking
// ---------------------------------------------------------------------------

function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name)
}

function extractJsxAttributeProps(
  attributes: Node[]
): PropDefinition[] {
  const props: PropDefinition[] = []

  for (const attr of attributes) {
    const jsxAttr = attr.asKind(SyntaxKind.JsxAttribute)
    if (!jsxAttr) continue

    const nameNode = jsxAttr.getNameNode()
    const name = nameNode.getText()

    const initializer = jsxAttr.getInitializer()
    let type = 'unknown'
    let defaultValue: string | undefined

    if (!initializer) {
      // Boolean shorthand: <Button disabled /> means disabled={true}
      type = 'boolean'
      defaultValue = 'true'
    } else if (initializer.getKind() === SyntaxKind.StringLiteral) {
      type = 'string'
      defaultValue = initializer.getText()
    } else if (initializer.getKind() === SyntaxKind.JsxExpression) {
      const expression = initializer
        .asKind(SyntaxKind.JsxExpression)
        ?.getExpression()
      if (expression) {
        type = inferExpressionType(expression)
        defaultValue = expression.getText()
      }
    }

    props.push({
      name,
      type,
      required: true,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    })
  }

  return props
}

function inferExpressionType(expression: Node): string {
  switch (expression.getKind()) {
    case SyntaxKind.TrueKeyword:
    case SyntaxKind.FalseKeyword:
      return 'boolean'
    case SyntaxKind.NumericLiteral:
      return 'number'
    case SyntaxKind.StringLiteral:
    case SyntaxKind.TemplateExpression:
    case SyntaxKind.NoSubstitutionTemplateLiteral:
      return 'string'
    case SyntaxKind.ArrayLiteralExpression:
      return 'array'
    case SyntaxKind.ObjectLiteralExpression:
      return 'object'
    case SyntaxKind.ArrowFunction:
    case SyntaxKind.FunctionExpression:
      return 'function'
    default:
      return 'expression'
  }
}

function getTagName(node: Node): string | null {
  const jsxElement = node.asKind(SyntaxKind.JsxElement)
  if (jsxElement) {
    return jsxElement.getOpeningElement().getTagNameNode().getText()
  }

  const jsxSelfClosing = node.asKind(SyntaxKind.JsxSelfClosingElement)
  if (jsxSelfClosing) {
    return jsxSelfClosing.getTagNameNode().getText()
  }

  return null
}

function getJsxAttributes(node: Node): Node[] {
  const jsxElement = node.asKind(SyntaxKind.JsxElement)
  if (jsxElement) {
    return jsxElement.getOpeningElement().getAttributes()
  }

  const jsxSelfClosing = node.asKind(SyntaxKind.JsxSelfClosingElement)
  if (jsxSelfClosing) {
    return jsxSelfClosing.getAttributes()
  }

  return []
}

function getJsxChildren(node: Node): Node[] {
  const jsxElement = node.asKind(SyntaxKind.JsxElement)
  if (jsxElement) {
    return jsxElement.getJsxChildren()
  }

  // JsxSelfClosingElement has no children
  return []
}

function walkJsxNode(
  node: Node,
  importMap: Map<string, ImportInfo>
): ViewNode[] {
  const results: ViewNode[] = []

  try {
    const tagName = getTagName(node)

    if (tagName && isPascalCase(tagName)) {
      // This is a component node — build a ViewNode for it
      const importInfo = importMap.get(tagName) ?? {
        source: 'local' as ImportSource,
        importPath: '',
      }

      const attributes = getJsxAttributes(node)
      const props = extractJsxAttributeProps(attributes)

      // Recurse into children to find nested components
      const children: ViewNode[] = []
      for (const child of getJsxChildren(node)) {
        children.push(...walkJsxNode(child, importMap))
      }

      results.push({
        component: tagName,
        source: importInfo.source,
        importPath: importInfo.importPath,
        props,
        children,
      })
    } else {
      // Not a PascalCase component (HTML element, fragment, expression, text)
      // — recurse into children/descendants to find nested components
      const childNodes = getJsxChildren(node)
      if (childNodes.length > 0) {
        // This is a JsxElement with lowercase tag — walk its children
        for (const child of childNodes) {
          results.push(...walkJsxNode(child, importMap))
        }
      } else {
        // Could be a JsxExpression or JsxFragment — search descendants
        const descendants = node.getDescendantsOfKind(SyntaxKind.JsxElement)
        const selfClosingDescendants = node.getDescendantsOfKind(
          SyntaxKind.JsxSelfClosingElement
        )

        // Collect only top-level JSX elements (not nested inside another)
        const topLevel = filterTopLevelJsx(
          [...descendants, ...selfClosingDescendants],
          node
        )

        for (const desc of topLevel) {
          results.push(...walkJsxNode(desc, importMap))
        }
      }
    }
  } catch {
    // Skip nodes that cause parsing issues
  }

  return results
}

/**
 * From a list of JSX nodes, keep only those that are direct JSX children
 * within the parent — i.e., filter out nodes nested inside another JSX
 * element that is also in the list.
 */
function filterTopLevelJsx(nodes: Node[], parent: Node): Node[] {
  const nodeSet = new Set(nodes)
  return nodes.filter((node) => {
    let current = node.getParent()
    while (current && current !== parent) {
      if (
        (current.getKind() === SyntaxKind.JsxElement ||
          current.getKind() === SyntaxKind.JsxSelfClosingElement) &&
        nodeSet.has(current)
      ) {
        return false
      }
      current = current.getParent()
    }
    return true
  })
}

function findReturnedJsx(sourceFile: SourceFile): Node[] {
  const returnStatements = sourceFile.getDescendantsOfKind(
    SyntaxKind.ReturnStatement
  )

  const jsxRoots: Node[] = []

  for (const ret of returnStatements) {
    // Check for JsxElement, JsxSelfClosingElement, JsxFragment, or
    // parenthesized expression containing JSX
    const expression = ret.getExpression()
    if (!expression) continue

    const jsxNodes = collectJsxRoots(expression)
    jsxRoots.push(...jsxNodes)
  }

  return jsxRoots
}

function collectJsxRoots(node: Node): Node[] {
  const kind = node.getKind()

  if (
    kind === SyntaxKind.JsxElement ||
    kind === SyntaxKind.JsxSelfClosingElement
  ) {
    return [node]
  }

  if (kind === SyntaxKind.JsxFragment) {
    // Walk fragment children
    const fragment = node.asKind(SyntaxKind.JsxFragment)
    if (fragment) {
      const results: Node[] = []
      for (const child of fragment.getJsxChildren()) {
        results.push(...collectJsxRoots(child))
      }
      return results
    }
  }

  if (kind === SyntaxKind.ParenthesizedExpression) {
    const inner = node.asKind(SyntaxKind.ParenthesizedExpression)
    const expression = inner?.getExpression()
    if (expression) {
      return collectJsxRoots(expression)
    }
  }

  // For conditional expressions, collect from both branches
  if (kind === SyntaxKind.ConditionalExpression) {
    const cond = node.asKind(SyntaxKind.ConditionalExpression)
    if (cond) {
      return [
        ...collectJsxRoots(cond.getWhenTrue()),
        ...collectJsxRoots(cond.getWhenFalse()),
      ]
    }
  }

  return []
}

// ---------------------------------------------------------------------------
// Screen name derivation
// ---------------------------------------------------------------------------

function deriveScreenName(filePath: string): string {
  // Extract meaningful name from file path
  // e.g. /src/screens/booking/search/index.tsx → BookingSearch
  const parts = filePath.split('/')
  const segments: string[] = []

  let inScreens = false
  for (const part of parts) {
    if (part === 'screens' || part === 'pages') {
      inScreens = true
      continue
    }
    if (inScreens && part !== 'index.tsx' && part !== 'view.tsx' && part !== 'View.tsx') {
      segments.push(part)
    }
  }

  if (segments.length === 0) {
    // Fallback: use the directory name
    const dirIndex = parts.lastIndexOf('index.tsx')
    if (dirIndex > 0) {
      segments.push(parts[dirIndex - 1] ?? 'Screen')
    } else {
      segments.push('Screen')
    }
  }

  return segments
    .map((s) =>
      s
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('')
    )
    .join('')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeViewTree(screen: DiscoveredScreen): ViewTree {
  const filePath = screen.viewFile ?? screen.filePath

  const project = new Project({
    tsConfigFilePath: undefined,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      strict: true,
      jsx: 4, // JsxEmit.ReactJSX
    },
  })

  const sourceFile = project.addSourceFileAtPath(filePath)

  // Step 1: Build import map
  const importMap = buildImportMap(sourceFile)

  // Step 2: Find export info and data props
  const exportInfo = findExportInfo(sourceFile, screen)

  // Step 3: Walk JSX tree
  const jsxRoots = findReturnedJsx(sourceFile)
  const tree: ViewNode[] = []

  for (const root of jsxRoots) {
    tree.push(...walkJsxNode(root, importMap))
  }

  // Step 4: Assemble ViewTree
  const screenName =
    exportInfo.exportName ?? deriveScreenName(filePath)

  return {
    screenName,
    filePath,
    exportType: exportInfo.exportType,
    ...(exportInfo.exportName ? { exportName: exportInfo.exportName } : {}),
    dataProps: exportInfo.dataProps,
    tree,
  }
}

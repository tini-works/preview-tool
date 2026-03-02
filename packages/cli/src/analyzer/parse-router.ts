import { glob } from 'glob'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { Project, SyntaxKind, type SourceFile, type Node } from 'ts-morph'
import type { RouterRoute } from './types.js'

/**
 * Scan a project for react-router files and extract route-to-component mappings.
 */
export async function parseRouterRoutes(cwd: string): Promise<RouterRoute[]> {
  const candidates = await findRouterFiles(cwd)

  if (candidates.length === 0) {
    return []
  }

  const routes: RouterRoute[] = []

  for (const filePath of candidates) {
    const content = readFileSync(filePath, 'utf-8')
    const project = new Project({ useInMemoryFileSystem: true })
    const sourceFile = project.createSourceFile('temp.tsx', content)

    const importMap = buildImportMap(sourceFile)

    const browserRouterRoutes = extractCreateBrowserRouterRoutes(sourceFile, importMap)
    const jsxRoutes = extractJsxRoutes(sourceFile, importMap)

    const allParsed = [...browserRouterRoutes, ...jsxRoutes]

    for (const parsed of allParsed) {
      const resolved = resolveComponentFile(
        cwd,
        dirname(filePath),
        parsed.importPath,
        importMap
      )

      if (resolved) {
        routes.push({
          path: parsed.path,
          componentFile: relative(cwd, resolved),
          componentName: parsed.componentName,
        })
      }
    }
  }

  return deduplicateRoutes(routes)
}

interface ParsedRoute {
  readonly path: string
  readonly componentName: string
  readonly importPath: string
}

/**
 * Find files that contain router patterns.
 */
async function findRouterFiles(cwd: string): Promise<string[]> {
  const files = await glob('src/**/*.{tsx,ts,jsx,js}', {
    cwd,
    absolute: true,
    ignore: ['**/node_modules/**', '**/__tests__/**'],
  })

  const routerPatterns = [
    'createBrowserRouter',
    'createHashRouter',
    '<Route',
    '<Routes',
  ]

  const results: string[] = []

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8')
      const hasRouter = routerPatterns.some((pattern) => content.includes(pattern))
      if (hasRouter) {
        results.push(file)
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results
}

/**
 * Build a map of imported identifiers to their module paths.
 * e.g. { Dashboard: './screens/Dashboard', Settings: './screens/Settings' }
 */
function buildImportMap(sourceFile: SourceFile): Map<string, string> {
  const importMap = new Map<string, string>()

  for (const decl of sourceFile.getImportDeclarations()) {
    const modulePath = decl.getModuleSpecifierValue()

    const defaultImport = decl.getDefaultImport()
    if (defaultImport) {
      importMap.set(defaultImport.getText(), modulePath)
    }

    for (const named of decl.getNamedImports()) {
      const alias = named.getAliasNode()
      const name = alias ? alias.getText() : named.getName()
      importMap.set(name, modulePath)
    }
  }

  return importMap
}

/**
 * Strategy 1: Extract routes from createBrowserRouter / createHashRouter calls.
 * Handles: createBrowserRouter([{ path: '/', element: <Component /> }])
 */
function extractCreateBrowserRouterRoutes(
  sourceFile: SourceFile,
  importMap: Map<string, string>
): ParsedRoute[] {
  const routes: ParsedRoute[] = []

  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

  for (const call of callExpressions) {
    const callee = call.getExpression().getText()
    if (callee !== 'createBrowserRouter' && callee !== 'createHashRouter') {
      continue
    }

    const args = call.getArguments()
    if (args.length === 0) continue

    const firstArg = args[0]
    if (!firstArg || firstArg.getKind() !== SyntaxKind.ArrayLiteralExpression) continue

    const arrayLiteral = firstArg.asKindOrThrow(SyntaxKind.ArrayLiteralExpression)

    for (const element of arrayLiteral.getElements()) {
      if (element.getKind() !== SyntaxKind.ObjectLiteralExpression) continue

      const obj = element.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
      const parsed = extractRouteFromObjectLiteral(obj, importMap)
      if (parsed) {
        routes.push(parsed)
      }
    }
  }

  return routes
}

/**
 * Extract path and component from a route object literal.
 */
function extractRouteFromObjectLiteral(
  obj: Node,
  importMap: Map<string, string>
): ParsedRoute | null {
  const objLiteral = obj.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)

  let path: string | null = null
  let componentName: string | null = null

  for (const prop of objLiteral.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue

    const assignment = prop.asKindOrThrow(SyntaxKind.PropertyAssignment)
    const name = assignment.getName()

    if (name === 'path') {
      const initializer = assignment.getInitializer()
      if (initializer && initializer.getKind() === SyntaxKind.StringLiteral) {
        path = initializer.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
      }
    }

    if (name === 'element') {
      const initializer = assignment.getInitializer()
      if (initializer) {
        componentName = extractComponentNameFromJsx(initializer)
      }
    }
  }

  if (path !== null && componentName !== null) {
    const importPath = importMap.get(componentName) ?? ''
    return { path, componentName, importPath }
  }

  return null
}

/**
 * Strategy 2: Extract routes from JSX <Route> elements.
 * Handles: <Route path="/" element={<Component />} />
 */
function extractJsxRoutes(
  sourceFile: SourceFile,
  importMap: Map<string, string>
): ParsedRoute[] {
  const routes: ParsedRoute[] = []

  const jsxElements = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement),
  ]

  for (const element of jsxElements) {
    const tagName = getJsxTagName(element)
    if (tagName !== 'Route') continue

    const attributes = getJsxAttributes(element)

    const pathAttr = attributes.get('path')
    const elementAttr = attributes.get('element')

    if (!pathAttr) continue

    const componentName = elementAttr
      ? extractComponentNameFromJsxString(elementAttr)
      : null

    if (pathAttr && componentName) {
      const importPath = importMap.get(componentName) ?? ''
      routes.push({ path: pathAttr, componentName, importPath })
    }
  }

  return routes
}

/**
 * Get the tag name of a JSX element.
 */
function getJsxTagName(node: Node): string {
  if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
    const selfClosing = node.asKindOrThrow(SyntaxKind.JsxSelfClosingElement)
    return selfClosing.getTagNameNode().getText()
  }

  if (node.getKind() === SyntaxKind.JsxElement) {
    const jsxElement = node.asKindOrThrow(SyntaxKind.JsxElement)
    return jsxElement.getOpeningElement().getTagNameNode().getText()
  }

  return ''
}

/**
 * Get JSX attributes as a name->value map.
 */
function getJsxAttributes(node: Node): Map<string, string> {
  const attrs = new Map<string, string>()

  let attributes: Node[] = []

  if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
    const selfClosing = node.asKindOrThrow(SyntaxKind.JsxSelfClosingElement)
    attributes = selfClosing.getAttributes()
  } else if (node.getKind() === SyntaxKind.JsxElement) {
    const jsxElement = node.asKindOrThrow(SyntaxKind.JsxElement)
    attributes = jsxElement.getOpeningElement().getAttributes()
  }

  for (const attr of attributes) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue

    const jsxAttr = attr.asKindOrThrow(SyntaxKind.JsxAttribute)
    const name = jsxAttr.getNameNode().getText()
    const initializer = jsxAttr.getInitializer()

    if (!initializer) continue

    if (initializer.getKind() === SyntaxKind.StringLiteral) {
      attrs.set(name, initializer.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue())
    } else if (initializer.getKind() === SyntaxKind.JsxExpression) {
      attrs.set(name, initializer.getText())
    }
  }

  return attrs
}

/**
 * Extract component name from a JSX expression node.
 * e.g. <Dashboard /> -> "Dashboard"
 */
function extractComponentNameFromJsx(node: Node): string | null {
  const selfClosing = node.getFirstDescendantByKind(SyntaxKind.JsxSelfClosingElement)
  if (selfClosing) {
    return selfClosing.getTagNameNode().getText()
  }

  const jsxElement = node.getFirstDescendantByKind(SyntaxKind.JsxElement)
  if (jsxElement) {
    return jsxElement.getOpeningElement().getTagNameNode().getText()
  }

  // Check if the node itself is JSX
  if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
    return node.asKindOrThrow(SyntaxKind.JsxSelfClosingElement).getTagNameNode().getText()
  }

  return null
}

/**
 * Extract component name from a JSX expression string like {<Component />}
 */
function extractComponentNameFromJsxString(value: string): string | null {
  const match = value.match(/<(\w+)/)
  return match ? match[1] ?? null : null
}

/**
 * Resolve an import path to an actual file on disk.
 * Handles: .tsx, .ts, /index.tsx, /index.ts extensions, and @/ alias -> src/
 */
function resolveComponentFile(
  cwd: string,
  fromDir: string,
  importPath: string,
  _importMap: Map<string, string>
): string | null {
  if (!importPath) return null

  // Handle @/ alias -> src/
  const resolvedImport = importPath.startsWith('@/')
    ? importPath.replace('@/', 'src/')
    : importPath

  // If the path is relative, resolve from the file's directory
  const basePath = resolvedImport.startsWith('.')
    ? join(fromDir, resolvedImport)
    : join(cwd, resolvedImport)

  const extensions = ['.tsx', '.ts', '.jsx', '.js']

  // Try direct file with extensions
  for (const ext of extensions) {
    const candidate = basePath + ext
    if (existsSync(candidate)) return candidate
  }

  // Try exact path (already has extension)
  if (existsSync(basePath)) return basePath

  // Try index files inside directory
  for (const ext of extensions) {
    const candidate = join(basePath, `index${ext}`)
    if (existsSync(candidate)) return candidate
  }

  return null
}

/**
 * Remove duplicate routes (same file path).
 */
function deduplicateRoutes(routes: RouterRoute[]): RouterRoute[] {
  const seen = new Set<string>()
  const result: RouterRoute[] = []

  for (const route of routes) {
    const key = `${route.path}:${route.componentFile}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(route)
    }
  }

  return result
}

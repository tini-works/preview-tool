/**
 * Vite plugin that transforms useState → usePreviewState in screen files.
 *
 * Uses ts-morph AST (not regex) to find exact useState CallExpressions
 * and replace them. This prevents the import-mangling bugs that regex had.
 *
 * The transform happens at Vite serve time (in memory). Source files on disk
 * are never modified.
 */

import { Project, SyntaxKind } from 'ts-morph'

/**
 * Transform useState calls to usePreviewState using AST.
 * Returns the transformed code, or null if no changes were made.
 */
export function transformUseState(code: string, fileName: string): string | null {
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile(fileName, code)

  // Find all useState call expressions
  const useStateCalls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression()
    const text = expr.getText()
    return text === 'useState' || text === 'React.useState'
  })

  if (useStateCalls.length === 0) return null

  // Check each call: must be in `const [varName, setter] = useState(init)` pattern
  let hasReplacements = false

  for (const call of useStateCalls) {
    const parent = call.getParent()
    if (!parent?.isKind(SyntaxKind.VariableDeclaration)) continue

    const nameNode = parent.getNameNode()
    if (!nameNode.isKind(SyntaxKind.ArrayBindingPattern)) continue

    const elements = nameNode.getElements()
    if (elements.length < 1) continue

    const firstEl = elements[0]
    if (!firstEl.isKind(SyntaxKind.BindingElement)) continue

    const varName = firstEl.getName()

    // Get the initialValue argument text
    const args = call.getArguments()
    const initialValue = args.length > 0 ? args[0].getText() : 'undefined'

    // Replace: useState(init) → usePreviewState('varName', init)
    // Strip any generic type params: useState<Type>(init) → usePreviewState('varName', init)
    call.replaceWithText(`usePreviewState('${varName}', ${initialValue})`)
    hasReplacements = true
  }

  if (!hasReplacements) return null

  // Add the import if not already present
  const hasImport = sf.getImportDeclarations().some((decl) => {
    return decl.getModuleSpecifierValue() === '@preview-tool/runtime' &&
      decl.getNamedImports().some((n) => n.getName() === 'usePreviewState')
  })

  if (!hasImport) {
    // Check if there's already a @preview-tool/runtime import to extend
    const existingRuntimeImport = sf.getImportDeclarations().find((decl) =>
      decl.getModuleSpecifierValue() === '@preview-tool/runtime'
    )

    if (existingRuntimeImport) {
      existingRuntimeImport.addNamedImport('usePreviewState')
    } else {
      sf.addImportDeclaration({
        namedImports: ['usePreviewState'],
        moduleSpecifier: '@preview-tool/runtime',
      })
    }
  }

  return sf.getFullText()
}

/**
 * Create a Vite plugin that applies the transform to screen source files.
 */
export function createPreviewStatePlugin(screenFilePaths: readonly string[]) {
  const screenSet = new Set(screenFilePaths)

  return {
    name: 'preview-state-transform',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const cleanId = id.replace(/[?#].*$/, '')
      if (!screenSet.has(cleanId)) return undefined
      if (!cleanId.endsWith('.tsx') && !cleanId.endsWith('.jsx')) return undefined

      const transformed = transformUseState(code, cleanId)
      if (!transformed) return undefined

      return { code: transformed, map: null }
    },
  }
}

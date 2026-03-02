import { Project, SyntaxKind } from 'ts-morph'
import type { ExtractedHook } from './types.js'

const REACT_BUILT_IN_HOOKS = new Set([
  'useState',
  'useEffect',
  'useCallback',
  'useMemo',
  'useRef',
  'useReducer',
  'useContext',
  'useLayoutEffect',
  'useImperativeHandle',
  'useDebugValue',
  'useDeferredValue',
  'useTransition',
  'useId',
  'useSyncExternalStore',
  'useInsertionEffect',
  'useOptimistic',
  'useActionState',
  'useFormStatus',
])

const PROJECT_LOCAL_PREFIXES = ['@/', '~/', './', '../', 'src/']

function isProjectLocal(importPath: string): boolean {
  return PROJECT_LOCAL_PREFIXES.some((prefix) => importPath.startsWith(prefix))
}

function stripQuotes(text: string): string {
  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith('`') && text.endsWith('`'))
  ) {
    return text.slice(1, -1)
  }
  return text
}

export function extractHooks(
  source: string,
  filePath: string,
): readonly ExtractedHook[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
      jsx: 4, // JsxEmit.ReactJSX
    },
  })

  const sourceFile = project.createSourceFile(filePath, source)

  // Build import map: identifier → module path
  const importMap = new Map<string, string>()
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue()
    const defaultImport = importDecl.getDefaultImport()
    if (defaultImport) {
      importMap.set(defaultImport.getText(), moduleSpecifier)
    }
    for (const named of importDecl.getNamedImports()) {
      const name = named.getAliasNode()?.getText() ?? named.getName()
      importMap.set(name, moduleSpecifier)
    }
    const namespaceImport = importDecl.getNamespaceImport()
    if (namespaceImport) {
      importMap.set(namespaceImport.getText(), moduleSpecifier)
    }
  }

  // Find all hook call expressions
  const hooks: ExtractedHook[] = []

  for (const callExpr of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expression = callExpr.getExpression()
    let hookName: string | null = null

    if (expression.getKind() === SyntaxKind.Identifier) {
      const name = expression.getText()
      if (name.startsWith('use')) {
        hookName = name
      }
    } else if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expression.asKindOrThrow(
        SyntaxKind.PropertyAccessExpression,
      )
      const memberName = propAccess.getName()
      if (memberName.startsWith('use')) {
        hookName = memberName
      }
    }

    if (hookName === null) {
      continue
    }

    if (REACT_BUILT_IN_HOOKS.has(hookName)) {
      continue
    }

    const importPath = importMap.get(hookName) ?? 'unknown'

    const callArgs = callExpr.getArguments().map((arg) => {
      const text = arg.getText()
      return stripQuotes(text)
    })

    hooks.push({
      hookName,
      importPath,
      callArgs,
      isProjectLocal: isProjectLocal(importPath),
    })
  }

  return hooks
}

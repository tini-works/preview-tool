import { type SourceFile, SyntaxKind, type CallExpression } from 'ts-morph'
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
      const alias = named.getAliasNode()
      const localName = alias ? alias.getText() : named.getName()
      importMap.set(localName, modulePath)
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

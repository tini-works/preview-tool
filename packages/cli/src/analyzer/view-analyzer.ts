// packages/cli/src/analyzer/view-analyzer.ts
import { SyntaxKind, type SourceFile, type Node } from 'ts-morph'

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
  // but NOT inside a JsxAttribute (event handlers, props)
  let parent = node.getParent()
  while (parent) {
    if (parent.isKind(SyntaxKind.JsxAttribute)) return false
    if (parent.isKind(SyntaxKind.JsxExpression)) {
      // Make sure this JsxExpression is not inside a JsxAttribute
      const exprParent = parent.getParent()
      if (exprParent?.isKind(SyntaxKind.JsxAttribute)) return false
      return true
    }
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

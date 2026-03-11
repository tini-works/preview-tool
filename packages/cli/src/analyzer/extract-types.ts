import { type CallExpression, type Type, type TypeChecker, type Symbol as TsSymbol, type Node, SyntaxKind } from 'ts-morph'
import type { TypeShapeInfo } from './types.js'
import { inferLeafValue } from './infer-shape.js'

// ---------------------------------------------------------------------------
// Hook return type extraction
// ---------------------------------------------------------------------------

/**
 * Resolve the return type of a hook call expression using the TypeChecker.
 * Works for any hook: custom hooks, store hooks, query hooks.
 *
 * For Zustand selector pattern `useStore((s) => s.field)`, resolves the
 * type of `s.field` from the store's state type.
 */
export function extractHookReturnType(
  call: CallExpression,
  typeChecker: TypeChecker,
): TypeShapeInfo | null {
  try {
    const type = typeChecker.getTypeAtLocation(call)
    return serializeType(type, typeChecker, 0, call)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// useState<T> generic type extraction
// ---------------------------------------------------------------------------

/**
 * For `useState<MaintenanceState>(null)`, extract and serialize `T`.
 * Falls back to inferring from the initializer if no explicit generic.
 */
export function extractUseStateType(
  call: CallExpression,
  typeChecker: TypeChecker,
): TypeShapeInfo | null {
  try {
    // Check for explicit type argument: useState<SomeType>(...)
    const typeArgs = call.getTypeArguments()
    if (typeArgs.length > 0) {
      const typeNode = typeArgs[0]
      const resolvedType = typeChecker.getTypeAtLocation(typeNode)
      return serializeType(resolvedType, typeChecker)
    }

    // No explicit generic — try to infer from the call's return type
    // useState returns [T, Dispatch<SetStateAction<T>>]
    const returnType = typeChecker.getTypeAtLocation(call)
    if (returnType.isTuple()) {
      const tupleTypes = returnType.getTupleElements()
      if (tupleTypes.length > 0) {
        return serializeType(tupleTypes[0], typeChecker)
      }
    }

    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Store selector type extraction
// ---------------------------------------------------------------------------

/**
 * For `useStore((s) => s.field)`, resolve the full store state type
 * by examining the parameter type of the selector callback.
 * Also tries to resolve from the hook's call signature if the parameter type is 'any'.
 */
export function extractStoreSelectorType(
  call: CallExpression,
  typeChecker: TypeChecker,
): TypeShapeInfo | null {
  try {
    const args = call.getArguments()
    if (args.length === 0) return null

    const firstArg = args[0]
    // Check for arrow function / function expression: (s) => s.field
    if (
      firstArg.isKind(SyntaxKind.ArrowFunction) ||
      firstArg.isKind(SyntaxKind.FunctionExpression)
    ) {
      const params = firstArg.getParameters()
      if (params.length > 0) {
        const paramType = typeChecker.getTypeAtLocation(params[0])
        // If the parameter type is resolvable, use it
        if (!isUnresolvable(paramType)) {
          return serializeType(paramType, typeChecker)
        }
      }
    }

    // Fallback: try to resolve from the hook function's signature
    // For useStore(selector), the store function's first parameter type
    // is typically (selector: (state: StoreState) => T) => T
    const calleeType = typeChecker.getTypeAtLocation(call.getExpression())
    const callSigs = calleeType.getCallSignatures()
    if (callSigs.length > 0) {
      const firstParam = callSigs[0].getParameters()[0]
      if (firstParam) {
        const paramType = typeChecker.getTypeAtLocation(firstParam.getDeclarations()[0])
        // paramType should be the selector function type: (state: StoreState) => T
        const selectorCallSigs = paramType.getCallSignatures()
        if (selectorCallSigs.length > 0) {
          const stateParam = selectorCallSigs[0].getParameters()[0]
          if (stateParam) {
            const stateType = typeChecker.getTypeAtLocation(stateParam.getDeclarations()[0])
            if (!isUnresolvable(stateType)) {
              return serializeType(stateType, typeChecker)
            }
          }
        }
      }
    }

    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Core serialization: Type → TypeShapeInfo
// ---------------------------------------------------------------------------

const MAX_DEPTH = 4

function serializeType(
  type: Type,
  typeChecker: TypeChecker,
  depth: number = 0,
  contextNode?: Node,
): TypeShapeInfo | null {
  if (depth > MAX_DEPTH) return null

  // Skip unresolvable types
  if (isUnresolvable(type)) {
    return { shape: {}, confidence: 'none', methods: [], properties: [] }
  }

  // Handle union types at the top level: pick the most informative non-null branch
  if (type.isUnion()) {
    const nonNullTypes = type.getUnionTypes().filter(
      (t) => !t.isNull() && !t.isUndefined(),
    )
    if (nonNullTypes.length === 0) {
      return { shape: {}, confidence: 'none', methods: [], properties: [] }
    }
    // Prefer object types in the union
    const objectType = nonNullTypes.find((t) => t.isObject() && !t.isArray())
    const bestType = objectType ?? nonNullTypes[0]
    return serializeType(bestType, typeChecker, depth, contextNode)
  }

  const properties: string[] = []
  const methods: string[] = []
  const shape: Record<string, unknown> = {}
  let hasPartial = false

  // Get apparent properties (works for interfaces, type aliases, classes)
  const apparentType = type.getApparentType()
  const symbols = apparentType.getProperties()

  for (const sym of symbols) {
    const name = sym.getName()

    // Skip internal/private properties
    if (name.startsWith('_') || name.startsWith('$')) continue

    // Skip inherited Object.prototype methods
    if (isBuiltinObjectMethod(name)) continue

    const memberType = getMemberType(sym, typeChecker, contextNode)
    if (!memberType) {
      hasPartial = true
      continue
    }

    if (isCallableType(memberType)) {
      methods.push(name)
    } else {
      properties.push(name)
      const value = serializeValueType(memberType, typeChecker, name, depth + 1, contextNode)
      if (value !== undefined) {
        shape[name] = value
      } else {
        hasPartial = true
      }
    }
  }

  // If we got nothing meaningful, confidence is 'none'
  if (properties.length === 0 && methods.length === 0) {
    return { shape: {}, confidence: 'none', methods: [], properties: [] }
  }

  // Methods-only objects (no data properties) get 'none' confidence so callers
  // fall back to leaf inference rather than using an empty shape
  if (properties.length === 0) {
    return { shape: {}, confidence: 'none', methods, properties: [] }
  }

  const confidence = hasPartial ? 'partial' : 'full'
  return { shape, confidence, methods, properties }
}

// ---------------------------------------------------------------------------
// Value serialization helpers
// ---------------------------------------------------------------------------

function serializeValueType(
  type: Type,
  typeChecker: TypeChecker,
  fieldName: string,
  depth: number,
  contextNode?: Node,
): unknown {
  if (depth > MAX_DEPTH) return undefined

  // Handle union types — pick the non-null/undefined branch
  if (type.isUnion()) {
    const nonNullTypes = type.getUnionTypes().filter(
      (t) => !t.isNull() && !t.isUndefined(),
    )
    if (nonNullTypes.length === 0) return null
    if (nonNullTypes.length === 1) {
      return serializeValueType(nonNullTypes[0], typeChecker, fieldName, depth, contextNode)
    }
    // Multiple non-null types — try the first object type, or fallback to leaf
    const objectType = nonNullTypes.find((t) => t.isObject() && !t.isArray())
    if (objectType) {
      return serializeValueType(objectType, typeChecker, fieldName, depth, contextNode)
    }
    return serializeValueType(nonNullTypes[0], typeChecker, fieldName, depth, contextNode)
  }

  // Primitives
  if (type.isString() || type.isStringLiteral()) {
    return inferLeafValue(fieldName) ?? 'sample'
  }
  if (type.isNumber() || type.isNumberLiteral()) {
    const leaf = inferLeafValue(fieldName)
    return typeof leaf === 'number' ? leaf : 0
  }
  if (type.isBoolean() || type.isBooleanLiteral()) {
    return false
  }

  // Enum-like literal types
  if (type.isEnumLiteral()) {
    return type.getLiteralValue() ?? 'default'
  }

  // Array types
  if (type.isArray()) {
    const elementType = type.getArrayElementType()
    if (elementType) {
      const elementValue = serializeValueType(elementType, typeChecker, fieldName, depth + 1, contextNode)
      if (elementValue !== undefined && typeof elementValue === 'object' && elementValue !== null) {
        return [elementValue]
      }
      return []
    }
    return []
  }

  // Tuple types
  if (type.isTuple()) {
    return []
  }

  // Date type — return ISO string
  const sym = type.getSymbol()
  const typeName = sym?.getName()
  if (typeName === 'Date') return '2026-01-01T00:00:00Z'

  // Object types — recurse
  if (type.isObject()) {
    const nested = serializeType(type, typeChecker, depth, contextNode)
    if (nested && nested.confidence !== 'none') {
      return nested.shape
    }
    // Methods-only objects (like Date) already handled above; fallback to leaf inference
    return inferLeafValue(fieldName)
  }

  // Fallback to leaf inference
  return inferLeafValue(fieldName)
}

// ---------------------------------------------------------------------------
// Type classification helpers
// ---------------------------------------------------------------------------

function isUnresolvable(type: Type): boolean {
  const text = type.getText()
  return (
    text === 'any' ||
    text === 'unknown' ||
    text === 'never' ||
    text === 'void'
  )
}

function isCallableType(type: Type): boolean {
  return type.getCallSignatures().length > 0
}

function getMemberType(sym: TsSymbol, typeChecker: TypeChecker, contextNode?: Node): Type | null {
  try {
    // When a contextNode is available, use getTypeOfSymbolAtLocation which
    // preserves generic instantiation (e.g. TData → Employee[] in UseQueryResult<Employee[]>).
    // Without it, getTypeAtLocation(declaration) resolves to the uninstantiated generic parameter.
    if (contextNode) {
      return typeChecker.getTypeOfSymbolAtLocation(sym, contextNode)
    }
    const decls = sym.getDeclarations()
    if (decls.length > 0) {
      return typeChecker.getTypeAtLocation(decls[0])
    }
    return null
  } catch {
    return null
  }
}

const BUILTIN_OBJECT_METHODS = new Set([
  'constructor', 'toString', 'valueOf', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
])

function isBuiltinObjectMethod(name: string): boolean {
  return BUILTIN_OBJECT_METHODS.has(name)
}

import { Project, SyntaxKind, type SourceFile, type PropertySignature } from 'ts-morph'
import { generateMockValue, generateMockArray } from './mock-generator.js'
import type {
  DiscoveredScreen,
  ScreenAnalysis,
  AnalyzedRegion,
  AnalyzedFlow,
} from './types.js'

/**
 * Analyzes a discovered screen and extracts regions and flows.
 * Uses ts-morph to parse the TypeScript AST.
 */
export function analyzeScreen(screen: DiscoveredScreen): ScreenAnalysis {
  const project = new Project({
    tsConfigFilePath: undefined,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      strict: true,
      jsx: 4, // JsxEmit.ReactJSX
    },
  })

  if (screen.pattern === 'mvc' && screen.modelFile) {
    return analyzeMvcScreen(project, screen)
  }

  return analyzeMonolithicScreen(project, screen)
}

function analyzeMvcScreen(
  project: Project,
  screen: DiscoveredScreen
): ScreenAnalysis {
  const regions: Record<string, AnalyzedRegion> = {}
  const flows: AnalyzedFlow[] = []

  if (!screen.modelFile) {
    return { screen, regions, flows }
  }

  const sourceFile = project.addSourceFileAtPath(screen.modelFile)
  analyzeInterfacesAndTypes(sourceFile, regions)

  return { screen, regions, flows }
}

function analyzeMonolithicScreen(
  project: Project,
  screen: DiscoveredScreen
): ScreenAnalysis {
  const regions: Record<string, AnalyzedRegion> = {}
  const flows: AnalyzedFlow[] = []

  const sourceFile = project.addSourceFileAtPath(screen.filePath)

  // Strategy 1: Find the data prop type of the default export component
  const dataTypeRegions = analyzeDataPropType(project, sourceFile, screen)
  if (Object.keys(dataTypeRegions).length > 0) {
    Object.assign(regions, dataTypeRegions)
  }

  // Strategy 2: Find useState calls (for screens that manage their own state)
  if (Object.keys(regions).length === 0) {
    const useStateCalls = findUseStateCalls(sourceFile)
    for (const stateCall of useStateCalls) {
      const region = inferRegionFromState(stateCall)
      if (region) {
        regions[region.key] = region
      }
    }
  }

  // Find navigation flows
  const navigationFlows = findNavigationFlows(sourceFile)
  flows.push(...navigationFlows)

  return { screen, regions, flows }
}

/**
 * Analyzes the default export component's `data` prop type.
 * Follows type references to find the full interface definition.
 * E.g.: `export default function Screen({ data }: { data: ProfileData })`
 *   → resolves ProfileData → generates regions from its properties.
 */
function analyzeDataPropType(
  project: Project,
  sourceFile: SourceFile,
  screen: DiscoveredScreen
): Record<string, AnalyzedRegion> {
  const regions: Record<string, AnalyzedRegion> = {}

  // Find default export function
  const defaultExport = sourceFile.getDefaultExportSymbol()
  if (!defaultExport) return regions

  const declarations = defaultExport.getDeclarations()
  if (declarations.length === 0) return regions

  const decl = declarations[0]

  // Look for the function parameters
  let parameterTypes: { name: string; typeText: string }[] = []

  // Check if it's a function declaration
  const funcDecl = decl.asKind(SyntaxKind.FunctionDeclaration)
  if (funcDecl) {
    parameterTypes = extractDataPropPropertiesFromParams(funcDecl.getParameters(), sourceFile)
  }

  // Check if it's a variable declaration (arrow function export)
  if (parameterTypes.length === 0) {
    const varDecl = decl.asKind(SyntaxKind.VariableDeclaration)
    if (varDecl) {
      const init = varDecl.getInitializer()
      const arrowFunc = init?.asKind(SyntaxKind.ArrowFunction)
      if (arrowFunc) {
        parameterTypes = extractDataPropPropertiesFromParams(arrowFunc.getParameters(), sourceFile)
      }
    }
  }

  for (const { name, typeText } of parameterTypes) {
    const region = inferRegionFromProperty(name, typeText)
    if (region) {
      regions[region.key] = region
    }
  }

  return regions
}

function extractDataPropPropertiesFromParams(
  params: { getType(): import('ts-morph').Type }[],
  sourceFile: SourceFile,
): { name: string; typeText: string }[] {
  const results: { name: string; typeText: string }[] = []

  for (const param of params) {
    const paramType = param.getType()
    const props = paramType.getProperties()

    // Look for `data` property in the destructured parameter
    const dataProp = props.find(p => p.getName() === 'data')
    if (!dataProp) continue

    // Get the type of the `data` property
    const dataType = dataProp.getTypeAtLocation(sourceFile)

    // Get the data type's properties (e.g. ProfileData { isLoading, user, ... })
    const dataProps = dataType.getProperties()
    for (const dp of dataProps) {
      const propType = dp.getTypeAtLocation(sourceFile)
      results.push({ name: dp.getName(), typeText: propType.getText() })
    }
  }

  return results
}

/**
 * Analyze interfaces and type aliases in a source file.
 */
function analyzeInterfacesAndTypes(
  sourceFile: SourceFile,
  regions: Record<string, AnalyzedRegion>
): void {
  const interfaces = sourceFile.getInterfaces()

  for (const iface of interfaces) {
    const properties = iface.getProperties()
    for (const prop of properties) {
      const propName = prop.getName()
      const propType = prop.getType()
      const typeText = propType.getText()
      const region = inferRegionFromProperty(propName, typeText)
      if (region) {
        regions[region.key] = region
      }
    }
  }

  const typeAliases = sourceFile.getTypeAliases()
  for (const alias of typeAliases) {
    const typeNode = alias.getTypeNode()
    if (typeNode && typeNode.getKind() === SyntaxKind.TypeLiteral) {
      const properties = typeNode.getDescendantsOfKind(SyntaxKind.PropertySignature)
      for (const prop of properties) {
        const propName = prop.getName()
        const typeText = prop.getType().getText()
        const region = inferRegionFromProperty(propName, typeText)
        if (region) {
          regions[region.key] = region
        }
      }
    }
  }
}

interface UseStateInfo {
  name: string
  type: string
  initialValue: string
}

function findUseStateCalls(sourceFile: SourceFile): UseStateInfo[] {
  const results: UseStateInfo[] = []

  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

  for (const call of callExpressions) {
    const expression = call.getExpression()
    if (expression.getText() !== 'useState') continue

    const parent = call.getParent()
    if (!parent) continue

    const grandParent = parent.getParent()
    if (!grandParent) continue

    const arrayBinding = grandParent.getFirstDescendantByKind(
      SyntaxKind.ArrayBindingPattern
    )

    let name = 'unknown'
    if (arrayBinding) {
      const elements = arrayBinding.getElements()
      if (elements.length > 0) {
        name = elements[0].getText()
      }
    }

    const typeArgs = call.getTypeArguments()
    let type = 'unknown'
    if (typeArgs.length > 0) {
      type = typeArgs[0].getText()
    } else {
      const args = call.getArguments()
      if (args.length > 0) {
        const argText = args[0].getText()
        type = inferTypeFromValue(argText)
      }
    }

    const args = call.getArguments()
    const initialValue = args.length > 0 ? args[0].getText() : 'undefined'

    results.push({ name, type, initialValue })
  }

  return results
}

function findNavigationFlows(sourceFile: SourceFile): AnalyzedFlow[] {
  const flows: AnalyzedFlow[] = []

  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

  for (const call of callExpressions) {
    const expression = call.getExpression()
    const text = expression.getText()

    if (text === 'navigate' || text.endsWith('.navigate') || text === 'router.push') {
      const args = call.getArguments()
      if (args.length > 0) {
        const target = args[0].getText().replace(/['"]/g, '')

        const ancestor = findClickHandlerAncestor(call)
        const trigger = ancestor ?? `Navigate to ${target}`

        flows.push({
          trigger,
          navigate: target,
        })
      }
    }
  }

  return flows
}

function findClickHandlerAncestor(node: { getParent(): unknown }): string | null {
  let current = node.getParent() as { getKind?(): number; getText?(): string; getParent?(): unknown } | null

  let depth = 0
  while (current && depth < 10) {
    if (current.getKind?.() === SyntaxKind.JsxAttribute) {
      const text = current.getText?.() ?? ''
      if (text.startsWith('onClick')) {
        return 'Button:Click'
      }
    }
    current = current.getParent?.() as typeof current
    depth++
  }
  return null
}

function inferRegionFromProperty(
  propName: string,
  typeText: string,
): AnalyzedRegion | null {
  const label = formatLabel(propName)

  // Boolean properties → toggle region
  if (typeText === 'boolean') {
    return {
      key: propName,
      label,
      states: {
        enabled: { [propName]: true },
        disabled: { [propName]: false },
      },
      defaultState: 'enabled',
    }
  }

  // Array properties → list region
  if (typeText.endsWith('[]') || typeText.startsWith('Array<')) {
    const mockItems = generateMockArray(propName, 10)
    return {
      key: propName,
      label,
      states: {
        populated: { [propName]: mockItems.slice(0, 3) },
        empty: { [propName]: [] },
      },
      defaultState: 'populated',
      isList: true,
      defaultCount: 3,
      mockItems,
    }
  }

  // Nullable/optional properties → present/absent region
  if (typeText.includes('null') || typeText.includes('undefined')) {
    const baseType = typeText
      .replace(/\s*\|\s*null/g, '')
      .replace(/\s*\|\s*undefined/g, '')
      .trim()
    return {
      key: propName,
      label,
      states: {
        present: { [propName]: generateMockValue(propName, baseType) },
        absent: { [propName]: null },
      },
      defaultState: 'present',
    }
  }

  // String/number — simple value region
  if (typeText === 'string' || typeText === 'number') {
    return {
      key: propName,
      label,
      states: {
        default: { [propName]: generateMockValue(propName, typeText) },
      },
      defaultState: 'default',
    }
  }

  // Complex object types — generate mock with default state
  if (!typeText.startsWith('(') && typeText !== 'unknown') {
    return {
      key: propName,
      label,
      states: {
        default: { [propName]: generateMockValue(propName, typeText) },
      },
      defaultState: 'default',
    }
  }

  return null
}

function inferRegionFromState(stateInfo: UseStateInfo): AnalyzedRegion | null {
  const { name, type, initialValue } = stateInfo
  const label = formatLabel(name)

  if (name.startsWith('is') || name.startsWith('has') || type === 'boolean') {
    return {
      key: name,
      label,
      states: {
        true: { [name]: true },
        false: { [name]: false },
      },
      defaultState: initialValue === 'true' ? 'true' : 'false',
    }
  }

  if (type.endsWith('[]') || initialValue === '[]') {
    const mockItems = generateMockArray(name, 10)
    return {
      key: name,
      label,
      states: {
        populated: { [name]: mockItems.slice(0, 3) },
        empty: { [name]: [] },
      },
      defaultState: 'populated',
      isList: true,
      defaultCount: 3,
      mockItems,
    }
  }

  if (initialValue === 'null' || initialValue === 'undefined') {
    return {
      key: name,
      label,
      states: {
        present: { [name]: generateMockValue(name, type) },
        absent: { [name]: null },
      },
      defaultState: 'absent',
    }
  }

  return null
}

function inferTypeFromValue(value: string): string {
  if (value === 'true' || value === 'false') return 'boolean'
  if (value === 'null') return 'null'
  if (value === 'undefined') return 'undefined'
  if (value === '[]') return 'unknown[]'
  if (value.startsWith("'") || value.startsWith('"') || value.startsWith('`')) return 'string'
  if (/^\d+(\.\d+)?$/.test(value)) return 'number'
  if (value.startsWith('{')) return 'object'
  return 'unknown'
}

function formatLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

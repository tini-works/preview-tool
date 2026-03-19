/**
 * Auto-discovery: find source files for screens when code-map is empty,
 * and auto-generate mockData when states have no data.
 *
 * Runs during the pipeline — user only needs to declare screen IDs and state names.
 * The tool figures out source files and mock data from the component code.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Project, SyntaxKind } from 'ts-morph'
import type { SpecManifestScreen, SpecCodeMap } from './types.js'

// ---------------------------------------------------------------------------
// Source file auto-discovery
// ---------------------------------------------------------------------------

/**
 * Auto-discover source files for screens when code-map is empty.
 * Scans src/routes/ and src/pages/ for files matching screen IDs.
 */
export function autoDiscoverSourceFiles(
  screens: SpecManifestScreen[],
  cwd: string,
  existingCodeMap: SpecCodeMap,
): SpecCodeMap {
  // If code-map already has entries, use it
  if (Object.keys(existingCodeMap).length > 0) return existingCodeMap

  const discovered: SpecCodeMap = {}
  const searchDirs = ['src/routes', 'src/pages', 'src/views']
  const allFiles: string[] = []

  for (const dir of searchDirs) {
    const absDir = join(cwd, dir)
    if (!existsSync(absDir)) continue
    collectTsxFiles(absDir, dir, allFiles)
  }

  for (const screen of screens) {
    if (screen.sourceFile) continue // already has a source file

    // Try matching by screen ID → file name
    // scr-home → index.tsx, home.tsx, HomePage.tsx
    // scr-room-display → room.$roomId.tsx, room-display.tsx, RoomDisplay.tsx
    // scr-admin-oauth → admin.oauth.tsx, admin-oauth.tsx, AdminOAuth.tsx
    const slug = screen.id.replace(/^scr-/, '')
    const match = findBestMatch(slug, allFiles)
    if (match) {
      discovered[screen.id] = match
    }
  }

  return discovered
}

function collectTsxFiles(dir: string, prefix: string, results: string[], maxDepth = 3): void {
  if (maxDepth <= 0) return
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const relPath = `${prefix}/${entry.name}`
      if (entry.isDirectory()) {
        collectTsxFiles(join(dir, entry.name), relPath, results, maxDepth - 1)
      } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
        results.push(relPath)
      }
    }
  } catch { /* permission error */ }
}

function findBestMatch(slug: string, files: string[]): string | null {
  // Normalize slug: scr-admin-oauth → admin-oauth, scr-scr-home → scr-home or home
  const normalized = slug.replace(/^scr-/, '')

  // Strategy 1: exact file name match (kebab-case)
  for (const file of files) {
    const name = fileNameWithoutExt(file)
    if (name === normalized) return file
    if (name === slug) return file
  }

  // Strategy 2: TanStack Router dot notation (admin-oauth → admin.oauth)
  const dotNotation = normalized.replace(/-/g, '.')
  for (const file of files) {
    const name = fileNameWithoutExt(file)
    if (name === dotNotation) return file
    if (name.startsWith(dotNotation + '.')) return file // admin.oauth.index
  }

  // Strategy 3: index.tsx in matching directory
  if (normalized === 'home' || normalized === 'index') {
    for (const file of files) {
      if (file.endsWith('/index.tsx')) return file
    }
  }

  // Strategy 4: route with param (room-display → room.$roomId)
  for (const file of files) {
    const name = fileNameWithoutExt(file)
    // Remove param parts: room.$roomId → room
    const base = name.replace(/\.\$\w+/g, '')
    if (base === normalized || base === dotNotation) return file
  }

  // Strategy 5: PascalCase match (home → Home, room-display → RoomDisplay)
  const pascal = normalized.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())
  for (const file of files) {
    const name = fileNameWithoutExt(file)
    if (name === pascal || name === pascal + 'Page') return file
  }

  return null
}

function fileNameWithoutExt(filePath: string): string {
  const name = filePath.split('/').pop() ?? ''
  return name.replace(/\.tsx?$/, '')
}

// ---------------------------------------------------------------------------
// MockData auto-generation
// ---------------------------------------------------------------------------

/**
 * Auto-generate mockData for states that don't have any.
 * Reads the component source to find hooks and useState variables,
 * then creates appropriate values per state name.
 */
export function autoGenerateMockData(
  screen: SpecManifestScreen,
  cwd: string,
): Record<string, Record<string, unknown>> {
  if (!screen.sourceFile) return screen.stateData

  // If any state already has mockData, keep it as-is
  const hasExistingMockData = Object.values(screen.stateData).some(
    (data) => Object.keys(data).length > 0
  )
  if (hasExistingMockData) return screen.stateData

  // Read and analyze the component
  const absPath = join(cwd, screen.sourceFile)
  if (!existsSync(absPath)) return screen.stateData

  let sourceCode: string
  try {
    sourceCode = readFileSync(absPath, 'utf-8')
  } catch {
    return screen.stateData
  }

  // Extract useState variables and hook return fields
  const stateVars = extractStateVars(sourceCode, absPath)
  if (stateVars.length === 0) return screen.stateData

  // Generate mockData per state
  const result: Record<string, Record<string, unknown>> = {}
  for (const stateName of screen.states) {
    result[stateName] = generateStateData(stateName, stateVars)
  }

  return result
}

interface StateVar {
  name: string
  initialValue: unknown
  type: 'boolean' | 'string' | 'number' | 'array' | 'object' | 'null' | 'unknown'
}

function extractStateVars(code: string, filePath: string): StateVar[] {
  const vars: StateVar[] = []

  try {
    const project = new Project({ useInMemoryFileSystem: true })
    const sf = project.createSourceFile(filePath, code)

    // Find useState calls: const [name, setter] = useState(init)
    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
      const text = call.getExpression().getText()
      return text === 'useState' || text === 'React.useState'
    })

    for (const call of calls) {
      const parent = call.getParent()
      if (!parent?.isKind(SyntaxKind.VariableDeclaration)) continue
      const nameNode = parent.getNameNode()
      if (!nameNode.isKind(SyntaxKind.ArrayBindingPattern)) continue
      const elements = nameNode.getElements()
      if (elements.length < 1) continue
      const firstEl = elements[0]
      if (!firstEl.isKind(SyntaxKind.BindingElement)) continue

      const varName = firstEl.getName()
      const args = call.getArguments()
      const initText = args.length > 0 ? args[0].getText() : 'undefined'
      const { value, type } = parseInitialValue(initText)

      vars.push({ name: varName, initialValue: value, type })
    }

    // Find hook destructured fields: const { data, isLoading } = useHook()
    const hookCalls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
      const text = call.getExpression().getText()
      return /^use[A-Z]/.test(text) && text !== 'useState' && text !== 'useEffect' &&
        text !== 'useCallback' && text !== 'useRef' && text !== 'useMemo'
    })

    for (const call of hookCalls) {
      const parent = call.getParent()
      if (!parent?.isKind(SyntaxKind.VariableDeclaration)) continue
      const nameNode = parent.getNameNode()
      if (!nameNode.isKind(SyntaxKind.ObjectBindingPattern)) continue

      for (const el of nameNode.getElements()) {
        if (!el.isKind(SyntaxKind.BindingElement)) continue
        const fieldName = el.getName()
        // Infer type from name
        const type = inferTypeFromName(fieldName)
        vars.push({ name: fieldName, initialValue: getDefaultForType(type), type })
      }
    }
  } catch {
    // AST parsing failed — return empty
  }

  return vars
}

function parseInitialValue(text: string): { value: unknown; type: StateVar['type'] } {
  if (text === 'false') return { value: false, type: 'boolean' }
  if (text === 'true') return { value: true, type: 'boolean' }
  if (text === 'null') return { value: null, type: 'null' }
  if (text === 'undefined') return { value: null, type: 'null' }
  if (text === '[]') return { value: [], type: 'array' }
  if (text === '{}') return { value: {}, type: 'object' }
  if (text === "''") return { value: '', type: 'string' }
  if (text === '""') return { value: '', type: 'string' }
  if (text === '0') return { value: 0, type: 'number' }
  const num = Number(text)
  if (!Number.isNaN(num)) return { value: num, type: 'number' }
  if (text.startsWith('{')) return { value: {}, type: 'object' }
  if (text.startsWith("'") || text.startsWith('"')) {
    return { value: text.slice(1, -1), type: 'string' }
  }
  return { value: null, type: 'unknown' }
}

function inferTypeFromName(name: string): StateVar['type'] {
  if (/^(is|has|show|can|should|was|did|are|will)/.test(name)) return 'boolean'
  if (/loading|submitting|saving|fetching/i.test(name)) return 'boolean'
  if (/error|message/i.test(name)) return 'string'
  if (/count|total|page|index|size|length/i.test(name)) return 'number'
  if (/items|list|rooms|data|results|entries/i.test(name)) return 'array'
  return 'unknown'
}

function getDefaultForType(type: StateVar['type']): unknown {
  switch (type) {
    case 'boolean': return false
    case 'string': return ''
    case 'number': return 0
    case 'array': return []
    case 'object': return {}
    case 'null': return null
    case 'unknown': return null
  }
}

/**
 * Generate mock data for a specific state, varying values based on state name.
 */
function generateStateData(
  stateName: string,
  vars: StateVar[],
): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  const lower = stateName.toLowerCase()

  for (const v of vars) {
    if (lower === 'loading' || lower === 'submitting' || lower === 'saving') {
      data[v.name] = generateForLoading(v)
    } else if (lower === 'error' || lower === 'server-error') {
      data[v.name] = generateForError(v)
    } else if (lower === 'empty') {
      data[v.name] = generateForEmpty(v)
    } else {
      // default / loaded / populated / any other state → full data
      data[v.name] = generateForLoaded(v)
    }
  }

  return data
}

function generateForLoading(v: StateVar): unknown {
  if (v.name === 'isLoading' || v.name === 'loading') return true
  if (v.name === 'isSubmitting' || v.name === 'submitting') return true
  if (v.name === 'isSaving' || v.name === 'saving') return true
  if (v.type === 'boolean' && /^is/.test(v.name)) return v.name.toLowerCase().includes('loading')
  if (v.type === 'array') return []
  if (v.name === 'error' || v.name === 'isError') return v.type === 'boolean' ? false : null
  return v.initialValue
}

function generateForError(v: StateVar): unknown {
  if (v.name === 'isLoading' || v.name === 'loading') return false
  if (v.name === 'error') return 'Ein Fehler ist aufgetreten'
  if (v.name === 'isError') return true
  if (v.type === 'array') return []
  return v.initialValue
}

function generateForEmpty(v: StateVar): unknown {
  if (v.name === 'isLoading' || v.name === 'loading') return false
  if (v.type === 'array') return []
  if (v.name === 'error' || v.name === 'isError') return v.type === 'boolean' ? false : null
  return v.initialValue
}

function generateForLoaded(v: StateVar): unknown {
  if (v.name === 'isLoading' || v.name === 'loading') return false
  if (v.name === 'isError') return false
  if (v.name === 'error') return v.type === 'boolean' ? false : null
  if (v.type === 'array') return [{ id: '1', name: 'Sample Item 1' }, { id: '2', name: 'Sample Item 2' }]
  return v.initialValue
}

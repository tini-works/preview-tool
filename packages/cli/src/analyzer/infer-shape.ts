import type { PropertyChainFact } from './types.js'

/**
 * Given a set of property chains for a variable, produce a nested mock object.
 *
 * Examples:
 * - `doctor.name` → `{ name: 'Sample Name' }`
 * - `doctor.specialties[0].name` → `{ specialties: [{ name: 'Sample Name' }] }`
 * - `appointments.length` → `[]` (`.length` implies array at root)
 * - `config.enabled` → `{ enabled: false }`
 */
export function inferMockShape(chains: PropertyChainFact[]): unknown {
  if (chains.length === 0) return {}

  const rootVariable = chains[0].rootVariable

  // Check if the root itself is an array (has .length, .map, .filter, etc.)
  const isRootArray = chains.some((c) => {
    const afterRoot = c.chain.slice(rootVariable.length + 1)
    return /^(length|map|filter|forEach|find|some|every|reduce|flatMap|includes|indexOf)$/.test(afterRoot)
  })

  if (isRootArray) {
    // Build item shape from chains that go deeper (e.g. items[0].name)
    const itemChains = chains
      .map((c) => {
        const match = c.chain.match(new RegExp(`^${escapeRegex(rootVariable)}\\[\\d+\\]\\.(.+)$`))
        return match ? match[1] : null
      })
      .filter((s): s is string => s !== null)

    if (itemChains.length > 0) {
      const itemShape = buildShapeFromPaths(itemChains)
      return [itemShape]
    }
    return []
  }

  // Build object shape from property paths after the root variable
  const paths = chains
    .map((c) => {
      const afterRoot = c.chain.slice(rootVariable.length + 1)
      return afterRoot || null
    })
    .filter((s): s is string => s !== null && s.length > 0)

  if (paths.length === 0) return {}

  return buildShapeFromPaths(paths)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a nested object from a list of dot-separated property paths.
 * Handles array indexing (e.g. specialties[0].name).
 */
function buildShapeFromPaths(paths: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const path of paths) {
    setNestedValue(result, path)
  }

  return result
}

function setNestedValue(obj: Record<string, unknown>, path: string): void {
  const segments = parsePath(path)
  if (segments.length === 0) return

  let current: Record<string, unknown> = obj

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const isLast = i === segments.length - 1

    if (seg.type === 'property') {
      if (isLast) {
        // Only set leaf value if not already set (don't overwrite nested objects)
        if (!(seg.name in current) || current[seg.name] === undefined) {
          current[seg.name] = inferLeafValue(seg.name)
        }
      } else {
        const nextSeg = segments[i + 1]
        if (nextSeg && nextSeg.type === 'index') {
          // Next segment is array access — ensure current[seg.name] is an array
          if (!Array.isArray(current[seg.name])) {
            current[seg.name] = [{}]
          }
        } else {
          // Ensure nested object exists
          if (typeof current[seg.name] !== 'object' || current[seg.name] === null || Array.isArray(current[seg.name])) {
            current[seg.name] = {}
          }
        }
        current = current[seg.name] as Record<string, unknown>
      }
    } else if (seg.type === 'index') {
      // We're inside an array — work with the first element
      if (Array.isArray(current)) {
        if (current.length === 0) current.push({})
        current = current[0] as Record<string, unknown>
      }
    }
  }
}

interface PathSegment {
  type: 'property' | 'index'
  name: string
}

function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = []
  // Split on dots, but handle array bracket notation
  const parts = path.split(/\./)

  for (const part of parts) {
    // Check for array index: 'specialties[0]'
    const bracketMatch = part.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\[(\d+)\]$/)
    if (bracketMatch) {
      segments.push({ type: 'property', name: bracketMatch[1] })
      segments.push({ type: 'index', name: bracketMatch[2] })
    } else if (/^\[\d+\]$/.test(part)) {
      segments.push({ type: 'index', name: part.slice(1, -1) })
    } else if (part) {
      segments.push({ type: 'property', name: part })
    }
  }

  return segments
}

/**
 * Infer a sensible default value for a leaf property based on naming heuristics.
 */
export function inferLeafValue(name: string): unknown {
  const lower = name.toLowerCase()

  // .length implies the parent is an array — handled at a higher level
  if (lower === 'length') return undefined // signal: parent should be array

  // Boolean patterns
  if (/^(is|has|can|should|was|did|will)[A-Z]/.test(name) ||
      /^(enabled|disabled|active|visible|loading|checked|selected|open|closed|valid|invalid|required|optional|editable|readonly|hidden|expanded|collapsed)$/.test(lower)) {
    return false
  }

  // Email
  if (lower.includes('email')) return 'user@example.com'

  // Name
  if (lower === 'name' || lower.endsWith('name') || lower === 'title' || lower === 'label') return 'Sample Name'

  // ID
  if (lower === 'id' || lower.endsWith('id') || lower.endsWith('Id')) return '1'

  // URL / image
  if (lower.includes('url') || lower.includes('image') || lower.includes('avatar') || lower.includes('src') || lower.includes('href')) {
    return 'https://example.com/image.png'
  }

  // Date / time
  if (lower.includes('date') || lower.includes('time') || lower.endsWith('at') || lower.endsWith('At') ||
      lower === 'start' || lower === 'end' || lower === 'from' || lower === 'to') {
    return '2026-01-01T00:00:00Z'
  }

  // Count / amount / number
  if (lower.includes('count') || lower.includes('total') || lower.includes('amount') || lower.includes('price') || lower.includes('quantity') || lower.includes('number') || lower.includes('size') || lower.includes('index')) {
    return 0
  }

  // Description / text / message
  if (lower.includes('description') || lower.includes('message') || lower.includes('text') || lower.includes('content') || lower.includes('body') || lower.includes('summary')) {
    return 'Sample text'
  }

  // Phone
  if (lower.includes('phone') || lower.includes('tel')) return '+1234567890'

  // Address
  if (lower.includes('address') || lower.includes('street') || lower.includes('city') || lower.includes('country') || lower.includes('zip') || lower.includes('postal')) {
    return 'Sample Address'
  }

  // Color
  if (lower.includes('color') || lower.includes('colour')) return '#000000'

  // Type / kind / status / role
  if (lower === 'type' || lower === 'kind' || lower === 'status' || lower === 'role' || lower === 'state' || lower === 'category') {
    return 'default'
  }

  return 'sample'
}

/**
 * Post-process a shape to convert `.length` signals into arrays.
 * If a property path ends in `.length`, the parent property should be an array.
 */
export function postProcessShape(shape: Record<string, unknown>, chains: PropertyChainFact[]): Record<string, unknown> {
  const result = { ...shape }

  for (const chain of chains) {
    const afterRoot = chain.chain.slice(chain.rootVariable.length + 1)
    if (!afterRoot) continue

    if (afterRoot === 'length') {
      // Root itself should be an array — handled by inferMockShape
      continue
    }

    // Check for nested .length (e.g. doctor.appointments.length)
    if (afterRoot.endsWith('.length')) {
      const parentPath = afterRoot.slice(0, -'.length'.length)
      setAsArray(result, parentPath)
    }
  }

  return result
}

function setAsArray(obj: Record<string, unknown>, path: string): void {
  const segments = path.split('.')
  let current: Record<string, unknown> = obj

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]
    if (typeof current[seg] !== 'object' || current[seg] === null) {
      current[seg] = {}
    }
    current = current[seg] as Record<string, unknown>
  }

  const lastSeg = segments[segments.length - 1]
  // Convert to array if not already
  if (!Array.isArray(current[lastSeg])) {
    const existing = current[lastSeg]
    if (typeof existing === 'object' && existing !== null) {
      current[lastSeg] = [existing]
    } else {
      current[lastSeg] = []
    }
  }
}

/**
 * Convenience wrapper: infer shape + post-process for a given variable's chains.
 */
export function inferMockShapeForVariable(
  variableName: string,
  allChains: PropertyChainFact[],
): unknown {
  const chains = allChains.filter((c) => c.rootVariable === variableName)
  if (chains.length === 0) return {}

  const shape = inferMockShape(chains)

  if (typeof shape === 'object' && shape !== null && !Array.isArray(shape)) {
    return postProcessShape(shape as Record<string, unknown>, chains)
  }

  return shape
}

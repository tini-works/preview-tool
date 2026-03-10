import type { HookFact, LocalStateFact, TypeShapeInfo } from './types.js'
import { callClaudeCode } from '../llm/claude-code.js'

// ---------------------------------------------------------------------------
// LLM enrichment for unresolved types (Phase 3)
// ---------------------------------------------------------------------------

/**
 * Enriches hook and local state facts with LLM-inferred type shapes
 * when static analysis (TypeChecker + heuristics) fails to resolve them.
 *
 * Only runs when:
 * 1. The fact has resolvedType.confidence === 'none' or no resolvedType at all
 * 2. There's enough source context to make a useful query
 */
export async function enrichUnresolvedTypes(
  hooks: HookFact[],
  localState: LocalStateFact[],
  sourceCode: string,
): Promise<void> {

  // Collect unresolved hooks
  const unresolvedHooks = hooks.filter(
    (h) => !h.resolvedType || h.resolvedType.confidence === 'none',
  )

  // Collect unresolved local state
  const unresolvedState = localState.filter(
    (ls) => ls.hook === 'useState' && ls.valueType === 'null' &&
      (!ls.resolvedType || ls.resolvedType.confidence === 'none'),
  )

  if (unresolvedHooks.length === 0 && unresolvedState.length === 0) return

  // Build a single prompt for all unresolved items to minimize API calls
  const items: string[] = []

  for (const hook of unresolvedHooks) {
    items.push(
      `Hook: ${hook.name}(${hook.arguments.join(', ')})` +
      (hook.destructuredFields ? ` → { ${hook.destructuredFields.join(', ')} }` : ''),
    )
  }

  for (const ls of unresolvedState) {
    items.push(`useState: const [${ls.name}, ${ls.setter ?? '_'}] = useState<???>(${ls.initialValue})`)
  }

  const prompt = buildEnrichmentPrompt(items, sourceCode)

  try {
    const result = await callClaudeCode(prompt, {
      systemPrompt: 'You are a TypeScript type inference assistant. Respond only with valid JSON.',
    })

    if (!result || typeof result !== 'object') return

    const typeMap = result as Record<string, TypeShapeRecord>

    // Apply inferred types back to hooks
    for (const hook of unresolvedHooks) {
      const key = hook.name
      const inferred = typeMap[key]
      if (inferred && typeof inferred === 'object') {
        hook.resolvedType = parseInferredType(inferred)
      }
    }

    // Apply inferred types back to local state
    for (const ls of unresolvedState) {
      const key = ls.name
      const inferred = typeMap[key]
      if (inferred && typeof inferred === 'object') {
        ls.resolvedType = parseInferredType(inferred)
      }
    }
  } catch {
    // LLM enrichment is best-effort — failures are silently ignored
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TypeShapeRecord {
  properties?: Record<string, unknown>
  methods?: string[]
}

function buildEnrichmentPrompt(items: string[], sourceCode: string): string {
  // Truncate source code to keep prompt manageable
  const truncatedSource = sourceCode.length > 3000
    ? sourceCode.slice(0, 3000) + '\n// ... truncated'
    : sourceCode

  return `Given this React component source code:

\`\`\`tsx
${truncatedSource}
\`\`\`

For each of the following hooks/state variables, infer the TypeScript return type shape.
Return a JSON object where each key is the hook/variable name, and the value is an object with:
- "properties": Record<string, mock_value> (data fields with sensible mock values)
- "methods": string[] (function/method names)

Items to resolve:
${items.map((item) => `- ${item}`).join('\n')}

Respond with ONLY valid JSON, no explanation.`
}

function parseInferredType(record: TypeShapeRecord): TypeShapeInfo {
  const shape = record.properties ?? {}
  const methods = record.methods ?? []
  const properties = Object.keys(shape)

  return {
    shape: shape as Record<string, unknown>,
    confidence: properties.length > 0 || methods.length > 0 ? 'partial' : 'none',
    methods,
    properties,
  }
}

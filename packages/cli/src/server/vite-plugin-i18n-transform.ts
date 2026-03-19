/**
 * Vite plugin that transforms hardcoded JSX strings for i18n preview.
 *
 * Uses ts-morph AST (not regex) to find exact string literals in JSX
 * and wrap them with __pt() calls. Same approach as usePreviewState transform.
 *
 * The transform happens at Vite serve time (in memory). Source files on disk
 * are never modified.
 *
 * __pt() reads the active language from the Zustand store synchronously.
 * A useDevToolsStore subscription hook is injected into the component for
 * React re-render reactivity when language changes.
 */

import { Project, SyntaxKind } from 'ts-morph'
import type { SpecManifest } from '../spec/types.js'

interface I18nTransformOptions {
  manifest: SpecManifest
  screenFilePaths: string[]
}

/**
 * Build a set of all translatable source strings from all screen specs.
 */
function buildTranslatableStrings(manifest: SpecManifest): Set<string> {
  const strings = new Set<string>()
  for (const screen of manifest.screens) {
    if (!screen.translations) continue
    for (const entries of Object.values(screen.translations)) {
      for (const key of Object.keys(entries as Record<string, unknown>)) {
        strings.add(key)
      }
    }
  }
  return strings
}

/**
 * Build the full translation index for the __pt runtime function.
 */
function buildTranslationIndex(manifest: SpecManifest): Record<string, Record<string, string>> {
  const index: Record<string, Record<string, string>> = {}
  for (const screen of manifest.screens) {
    if (!screen.translations) continue
    for (const [lang, entries] of Object.entries(screen.translations)) {
      for (const [sourceText, translated] of Object.entries(entries as Record<string, unknown>)) {
        if (typeof translated !== 'string') continue
        if (!index[sourceText]) index[sourceText] = {}
        index[sourceText][lang] = translated
      }
    }
  }
  return index
}

const TRANSLATABLE_PROPS = new Set(['placeholder', 'title', 'aria-label', 'alt'])

/**
 * Transform a source file: wrap translatable strings with __pt() calls.
 * Returns transformed code or null if no changes.
 */
export function transformI18n(
  code: string,
  fileName: string,
  translatableStrings: Set<string>,
  translationIndex: Record<string, Record<string, string>>,
): string | null {
  const project = new Project({ useInMemoryFileSystem: true })
  const sf = project.createSourceFile(fileName, code)

  let hasReplacements = false

  // 1. Find JSX text nodes that match translatable strings
  const jsxTexts = sf.getDescendantsOfKind(SyntaxKind.JsxText)
  for (const textNode of jsxTexts) {
    const text = textNode.getText().trim()
    if (!text || !translatableStrings.has(text)) continue

    // Replace: SomeText → {__pt("SomeText")}
    const leading = textNode.getText().match(/^(\s*)/)?.[1] ?? ''
    const trailing = textNode.getText().match(/(\s*)$/)?.[1] ?? ''
    textNode.replaceWithText(`${leading}{__pt("${text}")}${trailing}`)
    hasReplacements = true
  }

  // 2. Find string literal props (placeholder, title, aria-label, alt)
  const jsxAttrs = sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)
  for (const attr of jsxAttrs) {
    const propName = attr.getNameNode().getText()
    if (!TRANSLATABLE_PROPS.has(propName)) continue

    const init = attr.getInitializer()
    if (!init?.isKind(SyntaxKind.StringLiteral)) continue

    const value = init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
    if (!translatableStrings.has(value)) continue

    // Replace: placeholder="text" → placeholder={__pt("text")}
    init.replaceWithText(`{__pt("${value}")}`)
    hasReplacements = true
  }

  // 3. Find string literals in JSX expressions (ternaries, variables)
  const stringLiterals = sf.getDescendantsOfKind(SyntaxKind.StringLiteral)
  for (const literal of stringLiterals) {
    const value = literal.getLiteralValue()
    if (!translatableStrings.has(value)) continue

    // Skip if inside an import declaration
    if (literal.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) continue
    // Skip if it's a JSX attribute value (already handled above)
    if (literal.getParent()?.isKind(SyntaxKind.JsxAttribute)) continue
    // Skip if it's inside __pt() already (from a previous pass)
    const parentCall = literal.getFirstAncestorByKind(SyntaxKind.CallExpression)
    if (parentCall?.getExpression().getText() === '__pt') continue

    // Only transform if inside JSX context or in a variable used in JSX
    const inJsx = literal.getFirstAncestorByKind(SyntaxKind.JsxExpression) !== undefined
    const inTernary = literal.getFirstAncestorByKind(SyntaxKind.ConditionalExpression) !== undefined
    if (!inJsx && !inTernary) continue

    literal.replaceWithText(`__pt("${value}")`)
    hasReplacements = true
  }

  if (!hasReplacements) return null

  // Inject __pt function and language subscription
  const indexJson = JSON.stringify(translationIndex)

  // Add import for useDevToolsStore
  const hasStoreImport = sf.getImportDeclarations().some((decl) =>
    decl.getModuleSpecifierValue() === '@preview-tool/runtime' &&
    decl.getNamedImports().some((n) => n.getName() === 'useDevToolsStore')
  )

  if (!hasStoreImport) {
    const existingImport = sf.getImportDeclarations().find((decl) =>
      decl.getModuleSpecifierValue() === '@preview-tool/runtime'
    )
    if (existingImport) {
      existingImport.addNamedImport('useDevToolsStore')
    } else {
      sf.addImportDeclaration({
        namedImports: ['useDevToolsStore'],
        moduleSpecifier: '@preview-tool/runtime',
      })
    }
  }

  // Get the transformed code and prepend __pt function
  const transformed = sf.getFullText()
  const ptFunction = `const __ptIdx = ${indexJson};
function __pt(s) { return __ptIdx[s]?.[useDevToolsStore.getState().language] ?? s; }
`

  // Inject language subscription inside the first exported function component
  let result = ptFunction + transformed
  const componentMatch = result.match(/(export\s+function\s+\w+\s*\([^)]*\)\s*\{)/)
  if (componentMatch) {
    result = result.replace(
      componentMatch[1],
      `${componentMatch[1]}\n  const __lang = useDevToolsStore((s) => s.language);`
    )
  }

  return result
}

/**
 * Create a Vite plugin that applies the i18n transform to screen files.
 */
export function createI18nTransformPlugin(options: I18nTransformOptions) {
  const translatableStrings = buildTranslatableStrings(options.manifest)
  if (translatableStrings.size === 0) return null

  const translationIndex = buildTranslationIndex(options.manifest)
  const screenSet = new Set(options.screenFilePaths)

  return {
    name: 'preview-i18n-transform',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const cleanId = id.replace(/[?#].*$/, '')
      if (!screenSet.has(cleanId)) return undefined
      if (!cleanId.endsWith('.tsx') && !cleanId.endsWith('.jsx')) return undefined

      const transformed = transformI18n(code, cleanId, translatableStrings, translationIndex)
      if (!transformed) return undefined

      return { code: transformed, map: null }
    },
  }
}

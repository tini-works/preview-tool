import type { SpecManifest } from '../spec/types.js'

interface I18nTransformOptions {
  manifest: SpecManifest
  screenFilePaths: string[]
}

/**
 * Vite plugin for preview i18n. Transforms hardcoded JSX strings into
 * __pt() calls that read the active language from the Zustand store.
 *
 * No page reload. No DOM mutation. React re-renders naturally.
 */
export function createI18nTransformPlugin(options: I18nTransformOptions) {
  // Build a set of all translatable strings from all screen specs
  const translatableStrings = new Set<string>()
  const translationIndex: Record<string, Record<string, string>> = {}

  for (const screen of options.manifest.screens) {
    if (!screen.translations) continue
    for (const [lang, entries] of Object.entries(screen.translations)) {
      for (const [sourceText, translated] of Object.entries(entries as Record<string, unknown>)) {
        if (typeof translated !== 'string') continue
        translatableStrings.add(sourceText)
        if (!translationIndex[sourceText]) translationIndex[sourceText] = {}
        translationIndex[sourceText][lang] = translated
      }
    }
  }

  if (translatableStrings.size === 0) return null

  const screenFiles = new Set(options.screenFilePaths)

  return {
    name: 'preview-i18n-transform',
    enforce: 'pre' as const,

    transform(code: string, id: string) {
      if (!screenFiles.has(id)) return null
      if (!id.endsWith('.tsx') && !id.endsWith('.jsx')) return null

      let transformed = code
      let hasReplacements = false

      for (const sourceText of translatableStrings) {
        const escaped = sourceText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

        // Replace JSX text content: >Termin buchen< → >{__pt("Termin buchen")}<
        const jsxTextRegex = new RegExp(`(>\\s*)${escaped}(\\s*<)`, 'g')
        transformed = transformed.replace(jsxTextRegex, (_, before, after) => {
          hasReplacements = true
          return `${before}{__pt("${sourceText}")}${after}`
        })

        // Replace string literal props: placeholder="text" → placeholder={__pt("text")}
        const propRegex = new RegExp(`((?:placeholder|title|aria-label|alt)=)(["'])${escaped}\\2`, 'g')
        transformed = transformed.replace(propRegex, (_, prefix) => {
          hasReplacements = true
          return `${prefix}{__pt("${sourceText}")}`
        })

        // Replace string literals in expressions: 'text' or "text" in ternaries, variables
        // Negative lookbehind: skip strings already inside __pt("...")
        const quotedRegex = new RegExp(`(?<!__pt\\()(['"])${escaped}\\1`, 'g')
        transformed = transformed.replace(quotedRegex, (_match, _quote) => {
          hasReplacements = true
          return `__pt("${sourceText}")`
        })
      }

      if (!hasReplacements) return null

      // Inject __pt function and language subscription at the top of the file
      const injection = `
import { useDevToolsStore as __useDevToolsStore } from '@preview-tool/runtime';
const __ptIndex = ${JSON.stringify(translationIndex)};
function __pt(s) { const l = __useDevToolsStore.getState().language; return __ptIndex[s]?.[l] ?? s; }
`
      // Inject useDevToolsStore subscription inside each component for reactivity
      // Find the first function component and inject const __lang = ...
      const componentMatch = transformed.match(/(export\s+function\s+\w+\s*\([^)]*\)\s*\{)/)
      if (componentMatch) {
        transformed = transformed.replace(
          componentMatch[1],
          `${componentMatch[1]}\n  const __lang = __useDevToolsStore((s) => s.language);`
        )
      }

      return { code: injection + transformed, map: null }
    },
  }
}

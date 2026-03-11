import { resolve, relative } from 'node:path'
import { existsSync } from 'node:fs'
import { loadSpecs } from '../spec/spec-loader.js'
import { generateMockCode, generateAliasManifest } from '../spec/spec-to-mocks.js'
import { specToScreenEntry } from '../spec/spec-to-model.js'
import type { SpecManifest, SpecManifestScreen } from '../spec/types.js'

const VIRTUAL_MANIFEST = 'virtual:spec-manifest'
const VIRTUAL_MOCK_PREFIX = 'virtual:spec-mock:'
const RESOLVED_PREFIX = '\0'

interface SpecPreviewOptions {
  specsDir: string
  cwd: string
}

/** Minimal Vite Plugin interface — avoids depending on vite package. */
interface VitePlugin {
  name: string
  enforce?: 'pre' | 'post'
  buildStart?: () => Promise<void>
  resolveId?: (id: string) => string | undefined
  load?: (id: string) => string | undefined
  configureServer?: (server: any) => void
}

/**
 * Normalize sourceFile paths from code-map to be relative to cwd.
 * Handles monorepos where code-map paths are relative to the repo root
 * but cwd points to a sub-package (e.g., packages/web/).
 */
function normalizeSourceFiles(screens: SpecManifestScreen[], specsDir: string, cwd: string): SpecManifestScreen[] {
  return screens.map((screen) => {
    if (!screen.sourceFile) return screen

    // Already absolute — make relative to cwd
    if (screen.sourceFile.startsWith('/')) {
      return { ...screen, sourceFile: relative(cwd, screen.sourceFile) }
    }

    // If the path resolves directly from cwd, keep it
    if (existsSync(resolve(cwd, screen.sourceFile))) {
      return screen
    }

    // Try resolving from specsDir parent (monorepo root) and make relative to cwd
    const fromSpecsRoot = resolve(specsDir, '..', screen.sourceFile)
    if (existsSync(fromSpecsRoot)) {
      return { ...screen, sourceFile: relative(cwd, fromSpecsRoot) }
    }

    return screen
  })
}

export function createSpecPreviewPlugin(options: SpecPreviewOptions): VitePlugin {
  let manifest: SpecManifest = { screens: [], flows: [] }
  let aliasManifest: Record<string, string> = {}

  return {
    name: 'spec-preview',
    enforce: 'pre',

    async buildStart() {
      manifest = await loadSpecs(options.specsDir)
      manifest = { ...manifest, screens: normalizeSourceFiles(manifest.screens, options.specsDir, options.cwd) }
      aliasManifest = generateAliasManifest(manifest.screens)
    },

    resolveId(id: string) {
      if (id === VIRTUAL_MANIFEST) {
        return RESOLVED_PREFIX + VIRTUAL_MANIFEST
      }
      if (id.startsWith(VIRTUAL_MOCK_PREFIX)) {
        return RESOLVED_PREFIX + id
      }
      if (aliasManifest[id]) {
        return RESOLVED_PREFIX + aliasManifest[id]
      }
      return undefined
    },

    load(id: string) {
      if (id === RESOLVED_PREFIX + VIRTUAL_MANIFEST) {
        const screenEntries = manifest.screens.map((s) => specToScreenEntry(s))
        return `export const screens = ${JSON.stringify(manifest.screens, null, 2)};
export const flows = ${JSON.stringify(manifest.flows, null, 2)};
export const screenEntries = ${JSON.stringify(screenEntries, null, 2)};`
      }

      if (id.startsWith(RESOLVED_PREFIX + VIRTUAL_MOCK_PREFIX)) {
        const modulePath = id.slice((RESOLVED_PREFIX + VIRTUAL_MOCK_PREFIX).length)
        for (const screen of manifest.screens) {
          for (const dep of screen.dataDeps) {
            if (dep.module === modulePath) {
              return generateMockCode(screen, dep)
            }
          }
        }
        return `// No spec found for module: ${modulePath}`
      }

      return undefined
    },

    configureServer(server: any) {
      server.watcher.add(options.specsDir)
      server.watcher.on('change', async (file: string) => {
        if (file.startsWith(options.specsDir)) {
          manifest = await loadSpecs(options.specsDir)
          manifest = { ...manifest, screens: normalizeSourceFiles(manifest.screens, options.specsDir, options.cwd) }
          aliasManifest = generateAliasManifest(manifest.screens)
          const mod = server.moduleGraph.getModuleById(
            RESOLVED_PREFIX + VIRTUAL_MANIFEST
          )
          if (mod) {
            server.moduleGraph.invalidateModule(mod)
            server.ws.send({ type: 'full-reload' })
          }
        }
      })
    },
  }
}

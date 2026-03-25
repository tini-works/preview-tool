import { resolve, relative } from 'node:path'
import { existsSync } from 'node:fs'
import { loadSpecs } from '../spec/spec-loader.js'
import { specToScreenEntry } from '../spec/spec-to-model.js'
import { runSpecPipeline, type EnrichedScreen } from '../spec/spec-pipeline-orchestrator.js'
import type { SpecManifest, SpecManifestScreen } from '../spec/types.js'

const VIRTUAL_MANIFEST = 'virtual:spec-manifest'
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

/**
 * Build screenEntries using enriched per-hook regions when available,
 * falling back to the original specToScreenEntry for non-enriched screens.
 */
function buildScreenEntries(
  manifest: SpecManifest,
  enrichedScreens: EnrichedScreen[],
) {
  const enrichedMap = new Map(enrichedScreens.map((s) => [s.id, s]))

  return manifest.screens.map((s) => {
    const enriched = enrichedMap.get(s.id)
    if (enriched && Object.keys(enriched.enrichedRegions).length > 0) {
      const regions = { ...enriched.enrichedRegions }
      if (s.translations) {
        for (const regionKey of Object.keys(regions)) {
          regions[regionKey] = { ...regions[regionKey], translations: s.translations }
        }
      }
      return {
        route: s.id,
        regions,
        ...(s.sourceFile ? { sourceFile: s.sourceFile } : {}),
        ...(s.routeParams ? { routeParams: s.routeParams } : {}),
      }
    }
    return specToScreenEntry(s)
  })
}

interface PluginState {
  manifest: SpecManifest
  enrichedScreens: EnrichedScreen[]
}

export function createSpecPreviewPlugin(options: SpecPreviewOptions): VitePlugin {
  // Single state object swapped atomically on each reload to avoid inconsistent
  // reads where manifest and enrichedScreens belong to different load cycles.
  let state: PluginState = { manifest: { screens: [], flows: [] }, enrichedScreens: [] }

  return {
    name: 'spec-preview',
    enforce: 'pre',

    async buildStart() {
      let manifest = await loadSpecs(options.specsDir, options.cwd)
      manifest = { ...manifest, screens: normalizeSourceFiles(manifest.screens, options.specsDir, options.cwd) }
      // Run pipeline to get enriched regions (mock files already written by dev command)
      let enrichedScreens: EnrichedScreen[] = []
      try {
        const result = await runSpecPipeline(manifest.screens, options.cwd, options.specsDir)
        enrichedScreens = result.enrichedScreens
      } catch (err) {
        console.warn('[preview-tool] Spec pipeline failed during build, falling back to basic mode:', err)
      }
      // Atomic swap: both manifest and enrichedScreens are committed together
      state = { manifest, enrichedScreens }
    },

    resolveId(id: string) {
      if (id === VIRTUAL_MANIFEST) {
        return RESOLVED_PREFIX + VIRTUAL_MANIFEST
      }
      // Mock module resolution removed — mocks are now physical files
      // resolved via alias-manifest.json in create-vite-config.ts
      return undefined
    },

    load(id: string) {
      if (id === RESOLVED_PREFIX + VIRTUAL_MANIFEST) {
        const { manifest, enrichedScreens } = state
        const screenEntries = buildScreenEntries(manifest, enrichedScreens)
        return `export const screens = ${JSON.stringify(manifest.screens, null, 2)};
export const flows = ${JSON.stringify(manifest.flows, null, 2)};
export const screenEntries = ${JSON.stringify(screenEntries, null, 2)};`
      }

      return undefined
    },

    configureServer(server: any) {
      server.watcher.add(options.specsDir)
      server.watcher.on('change', async (file: string) => {
        if (file.startsWith(options.specsDir)) {
          let manifest = await loadSpecs(options.specsDir, options.cwd)
          manifest = { ...manifest, screens: normalizeSourceFiles(manifest.screens, options.specsDir, options.cwd) }
          let enrichedScreens: EnrichedScreen[] = []
          try {
            const result = await runSpecPipeline(manifest.screens, options.cwd, options.specsDir)
            enrichedScreens = result.enrichedScreens
          } catch (err) {
            console.warn('[preview-tool] Spec pipeline failed during reload, falling back to basic mode:', err)
          }
          // Atomic swap: replace state in a single assignment so load() never
          // sees a partially-updated combination of old manifest + new enrichedScreens.
          state = { manifest, enrichedScreens }
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

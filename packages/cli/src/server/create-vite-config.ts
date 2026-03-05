import { join, dirname } from 'node:path'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { PreviewConfig } from '../lib/config.js'
import { PREVIEW_DIR } from '../lib/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve the @preview-tool/runtime package root.
 */
function resolveRuntimePath(): string {
  const require = createRequire(import.meta.url)
  const runtimeEntry = require.resolve('@preview-tool/runtime')
  let dir = dirname(runtimeEntry)
  for (let i = 0; i < 5; i++) {
    try {
      require.resolve(join(dir, 'package.json'))
      return dir
    } catch {
      dir = dirname(dir)
    }
  }
  return dirname(runtimeEntry)
}

/**
 * Creates a Vite InlineConfig for the preview dev server.
 */
export async function createViteConfig(
  cwd: string,
  config: PreviewConfig
): Promise<Record<string, unknown>> {
  const previewDir = join(cwd, PREVIEW_DIR)
  const runtimeRoot = resolveRuntimePath()

  // Dynamically import the React plugin from host project
  let reactPlugin: unknown = null
  try {
    const require = createRequire(join(cwd, 'package.json'))
    const reactPluginFactory = require('@vitejs/plugin-react')
    const factory = reactPluginFactory.default ?? reactPluginFactory
    reactPlugin = factory()
  } catch {
    console.warn('Warning: @vitejs/plugin-react not found. Install it in your project.')
  }

  // Try to load host project's Tailwind CSS v4 vite plugin
  let tailwindPlugin: unknown = null
  try {
    const require = createRequire(join(cwd, 'package.json'))
    const tailwindcss = require('@tailwindcss/vite')
    const factory = tailwindcss.default ?? tailwindcss
    tailwindPlugin = factory()
  } catch {
    // Tailwind CSS v4 vite plugin not available
  }

  const plugins = [
    ...(tailwindPlugin ? [tailwindPlugin] : []),
    ...(reactPlugin ? [reactPlugin] : []),
  ]

  // Deduplicate React — force all imports to resolve to the host project's copy.
  // Without this, the runtime and host app load separate React instances,
  // causing "Cannot read properties of null (reading 'useMemo')" errors.
  const hostRequire = createRequire(join(cwd, 'package.json'))
  const reactPath = dirname(hostRequire.resolve('react/package.json'))
  const reactDomPath = dirname(hostRequire.resolve('react-dom/package.json'))

  // Load alias manifest for mock hook redirection
  const mockAliasEntries: Array<{ find: string | RegExp; replacement: string }> = []
  const realModuleEntries: Array<{ find: string; replacement: string }> = []
  try {
    const aliasManifestPath = join(previewDir, 'alias-manifest.json')
    const raw = readFileSync(aliasManifestPath, 'utf-8')
    const manifest = JSON.parse(raw) as Record<string, string>
    for (const [importPath, mockPath] of Object.entries(manifest)) {
      mockAliasEntries.push({ find: importPath, replacement: join(previewDir, mockPath) })

      // For npm packages, add a __real: alias so mocks can re-export original exports
      // without triggering circular alias resolution.
      // Resolve to the package root (not the CJS entry) so Vite picks the ESM entry
      // via the package.json "module" or "exports" field — same pattern as React dedup above.
      if (!importPath.startsWith('.') && !importPath.startsWith('@/') && !importPath.startsWith('~/')) {
        try {
          const pkgRoot = dirname(hostRequire.resolve(importPath + '/package.json'))
          realModuleEntries.push({ find: `__real:${importPath}`, replacement: pkgRoot })
        } catch {
          // Package not resolvable — mock will work without re-exports
        }
      }
    }
  } catch {
    // No alias manifest — no mock hooks
  }

  // Use array format to guarantee ordering: __real: aliases first (for mock re-exports),
  // then mock aliases, then React deduplication, then general @/ alias last.
  const aliasArray = [
    // 0. Real module aliases (used by mocks to re-export non-hook exports)
    ...realModuleEntries,
    // 1. Mock aliases (redirect imports to mock files)
    ...mockAliasEntries,
    // 2. React deduplication
    { find: 'react', replacement: reactPath },
    { find: 'react-dom', replacement: reactDomPath },
    // 3. Runtime and host aliases
    { find: '@preview-tool/runtime', replacement: join(runtimeRoot, 'src', 'index.ts') },
    { find: '@host', replacement: join(cwd, 'src') },
    { find: '@preview', replacement: previewDir },
    // 4. General @/ alias (must be last — catches anything not matched above)
    { find: '@/', replacement: join(cwd, 'src') + '/' },
    { find: '@', replacement: join(cwd, 'src') },
  ]

  return {
    root: previewDir,
    server: {
      port: config.port,
      open: true,
      fs: {
        allow: [cwd, runtimeRoot, previewDir],
      },
    },
    resolve: {
      alias: aliasArray,
      dedupe: ['react', 'react-dom'],
    },
    plugins,
    optimizeDeps: {
      include: ['react', 'react-dom', 'zustand'],
    },
  }
}

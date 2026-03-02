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
  let mockAliases: Record<string, string> = {}
  try {
    const aliasManifestPath = join(previewDir, 'alias-manifest.json')
    const raw = readFileSync(aliasManifestPath, 'utf-8')
    const manifest = JSON.parse(raw) as Record<string, string>
    for (const [importPath, mockPath] of Object.entries(manifest)) {
      mockAliases[importPath] = join(cwd, mockPath)
    }
  } catch {
    // No alias manifest — no mock hooks
  }

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
      alias: {
        // Mock hook aliases (must come before general @ alias)
        ...mockAliases,
        // React deduplication
        'react': reactPath,
        'react-dom': reactDomPath,
        // Runtime and host aliases
        '@preview-tool/runtime': join(runtimeRoot, 'src', 'index.ts'),
        '@host': join(cwd, 'src'),
        '@preview': previewDir,
        '@/': join(cwd, 'src') + '/',
        '@': join(cwd, 'src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    plugins,
    optimizeDeps: {
      include: ['react', 'react-dom', 'zustand'],
    },
  }
}

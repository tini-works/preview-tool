import { join, dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { PreviewConfig } from '../lib/config.js'
import { PREVIEW_DIR } from '../lib/config.js'
const __dirname = dirname(fileURLToPath(import.meta.url))

// Browser-safe shim for node:async_hooks.
// Packages like @tanstack/react-start import AsyncLocalStorage which is Node-only.
// Vite externalises it to a Proxy that throws on `new`, crashing the preview.
const ASYNC_HOOKS_SHIM = `\
class AsyncLocalStorage {
  constructor() { this._store = undefined }
  getStore() { return this._store }
  run(store, callback, ...args) {
    const prev = this._store
    this._store = store
    try { return callback(...args) }
    finally { this._store = prev }
  }
  enterWith(store) { this._store = store }
  disable() { this._store = undefined }
}
class AsyncResource {
  constructor() {}
  runInAsyncScope(fn, thisArg, ...args) { return fn.apply(thisArg, args) }
  emitDestroy() {}
  asyncId() { return 0 }
  triggerAsyncId() { return 0 }
}
export { AsyncLocalStorage, AsyncResource }
export default { AsyncLocalStorage, AsyncResource }
`

/**
 * Write browser-safe shims for Node.js built-ins into .preview/shims/.
 * Returns alias entries that redirect `node:X` → the physical shim file.
 * Using resolve.alias (not a plugin) ensures esbuild pre-bundling picks it up.
 */
function writeNodeShims(previewDir: string, cwd: string): Array<{ find: string; replacement: string }> {
  const shimsDir = join(previewDir, 'shims')
  if (!existsSync(shimsDir)) mkdirSync(shimsDir, { recursive: true })

  const shimPath = join(shimsDir, 'async-hooks.mjs')

  // Check if shim content changed — if so, clear Vite's dep cache
  let existing = ''
  try { existing = readFileSync(shimPath, 'utf-8') } catch { /* first run */ }
  writeFileSync(shimPath, ASYNC_HOOKS_SHIM, 'utf-8')
  if (existing && existing !== ASYNC_HOOKS_SHIM) {
    const viteCacheDir = join(cwd, 'node_modules', '.vite')
    if (existsSync(viteCacheDir)) {
      rmSync(viteCacheDir, { recursive: true, force: true })
    }
  }

  return [
    { find: 'node:async_hooks', replacement: shimPath },
    { find: 'async_hooks', replacement: shimPath },
  ]
}

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

  // Spec-driven preview plugin (when specsDir is configured)
  let specPlugin: unknown = null
  if (config.specsDir) {
    const { createSpecPreviewPlugin } = await import('./vite-plugin-spec-preview.js')
    specPlugin = createSpecPreviewPlugin({ specsDir: config.specsDir, cwd })
  }

  // Zero source transforms — screen files are loaded as-is.
  // All mocking happens via Vite aliases (hook → mock file) and
  // the global fetch interceptor (in main.tsx).
  const plugins = [
    ...(specPlugin ? [specPlugin] : []),
    ...(tailwindPlugin ? [tailwindPlugin] : []),
    ...(reactPlugin ? [reactPlugin] : []),
  ]

  // React shim: overrides useState/useEffect for preview mode.
  // The shim re-exports everything from real React but intercepts useState/useEffect
  // for screen components (activated by the screen wrapper in main.tsx).
  const hostRequire = createRequire(join(cwd, 'package.json'))
  const reactPath = dirname(hostRequire.resolve('react/package.json'))
  const reactDomPath = dirname(hostRequire.resolve('react-dom/package.json'))
  const reactShimPath = join(previewDir, 'shims', 'react-preview.ts')

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
      } else {
        // Local import — resolve __real: to the actual source file so mocks can
        // re-export non-hook symbols (e.g. ToastContext, DevToolsWrapper).
        let realPath: string
        if (importPath.startsWith('@/')) {
          realPath = join(cwd, 'src', importPath.slice(2))
        } else if (importPath.startsWith('~/')) {
          realPath = join(cwd, 'src', importPath.slice(2))
        } else {
          realPath = join(cwd, importPath)
        }
        realModuleEntries.push({ find: `__real:${importPath}`, replacement: realPath })
      }
    }
  } catch {
    // No alias manifest — no mock hooks
  }

  // Write browser-safe shims for Node.js built-ins (e.g. node:async_hooks)
  const nodeShimAliases = writeNodeShims(previewDir, cwd)

  // Use array format to guarantee ordering: shims first, then __real: aliases,
  // then mock aliases, then React deduplication, then general @/ alias last.
  const aliasArray = [
    // Node.js built-in shims (must be first so esbuild pre-bundling picks them up)
    ...nodeShimAliases,
    // 0. Real module aliases (used by mocks to re-export non-hook exports)
    ...realModuleEntries,
    // 1. Mock aliases (redirect imports to mock files)
    ...mockAliasEntries,
    // 2. React shim (overrides useState/useEffect for screen components)
    //    __real:react points to the actual React package for the shim to re-export
    //    Exact match (/^react$/) so react/jsx-runtime etc. still resolve to real React
    { find: '__real:react', replacement: reactPath },
    { find: /^react$/, replacement: existsSync(reactShimPath) ? reactShimPath : reactPath },
    { find: 'react-dom', replacement: reactDomPath },
    // 3. Runtime and host aliases
    { find: '@preview-tool/runtime', replacement: join(runtimeRoot, 'src', 'index.ts') },
    { find: '@host', replacement: join(cwd, 'src') },
    { find: '@preview', replacement: previewDir },
    // 4. General path aliases (must be last — catches anything not matched above)
    { find: '~/', replacement: join(cwd, 'src') + '/' },
    { find: '@/', replacement: join(cwd, 'src') + '/' },
    { find: '@', replacement: join(cwd, 'src') },
  ]

  // Only include packages that the host project actually depends on
  const optimizeDepsInclude = ['react', 'react-dom']
  try {
    const hostPkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'))
    const allDeps = { ...hostPkg.dependencies, ...hostPkg.devDependencies }
    if (allDeps['zustand']) optimizeDepsInclude.push('zustand')
  } catch {
    // package.json unreadable — stick with react/react-dom
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
      alias: aliasArray,
      dedupe: ['react', 'react-dom'],
    },
    plugins,
    optimizeDeps: {
      include: optimizeDepsInclude,
    },
  }
}

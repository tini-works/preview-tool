import { join, dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { PreviewConfig } from '../lib/config.js'
import { PREVIEW_DIR } from '../lib/config.js'
import { createPreviewStatePlugin } from './vite-plugin-preview-state.js'
import { readProjectAliases } from '../resolver/read-project-aliases.js'
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

  // Load screen source paths for useState transform
  const screenFilePaths: string[] = []
  try {
    const raw = readFileSync(join(previewDir, 'screen-source-paths.json'), 'utf-8')
    screenFilePaths.push(...JSON.parse(raw))
  } catch { /* no paths */ }

  const previewStatePlugin = screenFilePaths.length > 0
    ? createPreviewStatePlugin(screenFilePaths)
    : null

  // i18n transform: wraps translatable JSX strings with __pt() calls (AST-based)
  let i18nPlugin: unknown = null
  if (config.specsDir && screenFilePaths.length > 0) {
    const { loadSpecs } = await import('../spec/spec-loader.js')
    const { createI18nTransformPlugin } = await import('./vite-plugin-i18n-transform.js')
    const manifest = await loadSpecs(config.specsDir)
    const hasTranslations = manifest.screens.some((s) => s.translations && Object.keys(s.translations).length > 0)
    if (hasTranslations) {
      i18nPlugin = createI18nTransformPlugin({ manifest, screenFilePaths })
    }
  }

  // Plugins: spec manifest, useState (AST), i18n (AST), tailwind, react
  const plugins = [
    ...(specPlugin ? [specPlugin] : []),
    ...(previewStatePlugin ? [previewStatePlugin] : []),
    ...(i18nPlugin ? [i18nPlugin] : []),
    ...(tailwindPlugin ? [tailwindPlugin] : []),
    ...(reactPlugin ? [reactPlugin] : []),
  ]

  // React shim: overrides useState/useEffect for preview mode.
  // The shim re-exports everything from real React but intercepts useState/useEffect
  // for screen components (activated by the screen wrapper in main.tsx).
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
      } else {
        // Local import — resolve __real: to the actual source file so mocks can
        // re-export non-hook symbols (e.g. ToastContext, DevToolsWrapper).
        const realPath = resolveLocalImportPath(importPath, cwd)
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
    // 2. React deduplication
    { find: 'react', replacement: reactPath },
    { find: 'react-dom', replacement: reactDomPath },
    // 3. Runtime and host aliases
    { find: '@preview-tool/runtime', replacement: join(runtimeRoot, 'src', 'index.ts') },
    { find: '@host', replacement: join(cwd, 'src') },
    { find: '@preview', replacement: previewDir },
    // 4. Project path aliases from tsconfig.json (longest-find-first, falling back to src/)
    ...buildProjectAliases(cwd),
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

  const workspaceRoot = findWorkspaceRoot(cwd)

  return {
    root: previewDir,
    server: {
      port: config.port,
      open: true,
      fs: {
        allow: [cwd, runtimeRoot, previewDir, ...(workspaceRoot ? [workspaceRoot] : [])],
      },
    },
    resolve: {
      alias: aliasArray,
      dedupe: ['react', 'react-dom'],
    },
    define: loadHostEnvDefines(cwd),
    plugins,
    optimizeDeps: {
      include: optimizeDepsInclude,
      // Exclude react from pre-bundling when React shim is active.
      // Pre-bundling caches react to .vite/deps/react.js which bypasses
      // the resolveId plugin. Excluding it forces fresh resolution per request.
    },
  }
}

/**
 * Resolves a local import path (e.g. @/, ~/, or relative) to an absolute path,
 * consulting tsconfig aliases first before falling back to hardcoded defaults.
 */
function resolveLocalImportPath(importPath: string, cwd: string): string {
  const aliases = readProjectAliases(cwd)
  for (const { find, replacement } of aliases) {
    if (importPath.startsWith(find)) {
      return replacement + importPath.slice(find.length)
    }
  }
  // Fallback: old hardcoded behavior
  if (importPath.startsWith('@/')) return join(cwd, 'src', importPath.slice(2))
  if (importPath.startsWith('~/')) return join(cwd, 'src', importPath.slice(2))
  return join(cwd, importPath)
}

/**
 * Reads VITE_* environment variables from the host project's .env files and
 * returns a Vite `define` map so import.meta.env.VITE_* resolves in the preview.
 * Files are read in order: .env, .env.local, .env.development, .env.development.local
 * (later files override earlier ones — same as Vite's own loading order).
 */
export function loadHostEnvDefines(cwd: string): Record<string, string> {
  const defines: Record<string, string> = {}
  const envFiles = ['.env', '.env.local', '.env.development', '.env.development.local']
  for (const file of envFiles) {
    const envPath = join(cwd, file)
    if (!existsSync(envPath)) continue
    try {
      const lines = readFileSync(envPath, 'utf-8').split('\n')
      for (const line of lines) {
        const match = line.match(/^(VITE_\w+)\s*=\s*(.*)$/)
        if (match) {
          defines[`import.meta.env.${match[1]}`] = JSON.stringify(match[2].trim())
        }
      }
    } catch {
      // unreadable — skip
    }
  }
  return defines
}

/**
 * Walks up from cwd to find the nearest package.json that declares workspaces.
 * Returns the directory path, or null if no workspace root is found.
 */
export function findWorkspaceRoot(cwd: string): string | null {
  let dir = dirname(cwd)
  while (dir !== dirname(dir)) {
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
        if (pkg['workspaces']) return dir
      } catch { /* ignore */ }
    }
    dir = dirname(dir)
  }
  return null
}

/**
 * Returns project-specific path aliases from tsconfig.json paths.
 *
 * If the project defines ANY paths in tsconfig.json, ALL of those paths are
 * returned — we trust the project's own configuration and don't mix in
 * defaults. Projects that use ~/ must have it in their tsconfig.
 *
 * Falls back to the conventional @/ + ~/ → src/ mapping ONLY when tsconfig
 * has no paths at all (e.g. a plain CRA project). This preserves backwards
 * compatibility for projects that rely on the old hardcoded defaults.
 */
function buildProjectAliases(cwd: string): Array<{ find: string; replacement: string }> {
  const fromTsconfig = readProjectAliases(cwd)
  if (fromTsconfig.length > 0) return fromTsconfig
  // Fallback: used only when tsconfig has no paths section
  return [
    { find: '~/', replacement: join(cwd, 'src') + '/' },
    { find: '@/', replacement: join(cwd, 'src') + '/' },
    { find: '@',  replacement: join(cwd, 'src') },
  ]
}

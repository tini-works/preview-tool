import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { PREVIEW_DIR } from '../lib/config.js'
import type { PreviewConfig } from '../lib/config.js'
import { loadSpecs } from '../spec/spec-loader.js'

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
 * Dynamically detect the host project's CSS entry point.
 * Priority: explicit override > Tailwind CSS file > any @import CSS > null.
 */
export function detectCssEntry(cwd: string, explicitEntry?: string): string | null {
  if (explicitEntry) {
    return existsSync(join(cwd, explicitEntry)) ? explicitEntry : null
  }

  const cssFiles = collectCssFiles(join(cwd, 'src'), 'src')
  if (cssFiles.length === 0) return null

  for (const cssPath of cssFiles) {
    const head = readHead(join(cwd, cssPath), 10)
    if (/@import\s+['"]tailwindcss['"]/.test(head) || /@tailwind\s+base/.test(head)) {
      return cssPath
    }
  }

  for (const cssPath of cssFiles) {
    const head = readHead(join(cwd, cssPath), 10)
    if (/@import\s/.test(head)) {
      return cssPath
    }
  }

  return null
}

function collectCssFiles(dir: string, prefix: string, maxFiles = 20): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (results.length >= maxFiles) break
      if (entry.name === 'node_modules' || entry.name === '.preview') continue

      const fullPath = join(dir, entry.name)
      const relPath = `${prefix}/${entry.name}`

      if (entry.isDirectory()) {
        results.push(...collectCssFiles(fullPath, relPath, maxFiles - results.length))
      } else if (entry.name.endsWith('.css')) {
        results.push(relPath)
      }
    }
  } catch {
    // Permission errors, etc.
  }
  return results
}

function readHead(filePath: string, lines: number): string {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return content.split('\n').slice(0, lines).join('\n')
  } catch {
    return ''
  }
}

/**
 * Build a map of screen file name → useState variable names.
 * Used by the preview override to match variables by call order.
 * Key is the file name without extension (e.g., "AppointmentListPage").
 */
function buildStateVarMapByFileName(
  screens: SpecScreenImport[],
  stateVars: Record<string, string[]>
): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [absPath, vars] of Object.entries(stateVars)) {
    // Extract file name without extension
    const fileName = absPath.split('/').pop()?.replace(/\.[jt]sx?$/, '') ?? ''
    if (fileName && vars.length > 0) {
      result[fileName] = vars
    }
  }
  return result
}

export interface SpecScreenImport {
  id: string
  sourceFile: string | null
  exportType: 'default' | 'named' | 'tanstack-route'
  exportName?: string
}

/**
 * Detect how a source file exports its component.
 * Returns 'tanstack-route' for TanStack Router file routes,
 * 'named' for named exports, 'default' for default exports.
 */
export function detectExportType(filePath: string): { type: 'default' | 'named' | 'tanstack-route'; name?: string } {
  let source: string
  try {
    source = readFileSync(filePath, 'utf-8')
  } catch {
    return { type: 'default' }
  }

  // TanStack Router file-based routes
  if (/createFileRoute|createLazyFileRoute/.test(source)) {
    return { type: 'tanstack-route' }
  }

  // Default export
  if (/export\s+default\s/.test(source)) {
    return { type: 'default' }
  }

  // Named export: export function Name or export const Name
  const namedMatch = source.match(/export\s+(?:function|const)\s+([A-Z]\w*)/)
  if (namedMatch) {
    return { type: 'named', name: namedMatch[1] }
  }

  return { type: 'default' }
}

/**
 * Generates the index.html, main.tsx, and preview.css entry files.
 */
export async function generateEntryFiles(
  cwd: string,
  config: PreviewConfig,
  screenStateVars?: Record<string, string[]>,
): Promise<void> {
  const previewDir = join(cwd, PREVIEW_DIR)
  await mkdir(previewDir, { recursive: true })

  await writeFile(
    join(previewDir, 'index.html'),
    generateIndexHtml(config.title),
    'utf-8'
  )

  // Detect host project CSS file
  const hostCssPath = detectCssEntry(cwd, config.cssEntry)

  // Generate a wrapper CSS that imports host CSS + adds @source for runtime
  const runtimeRoot = resolveRuntimePath()
  const runtimeSrcRelative = relative(previewDir, join(runtimeRoot, 'src'))
  const hostSrcRelative = relative(previewDir, join(cwd, 'src'))

  await writeFile(
    join(previewDir, 'preview.css'),
    generatePreviewCss(hostCssPath, hostSrcRelative, runtimeSrcRelative),
    'utf-8'
  )

  if (config.specsDir) {
    const manifest = await loadSpecs(config.specsDir)
    // Normalize sourceFile paths for monorepos and detect export types
    const specsRoot = resolve(config.specsDir, '..')
    const screens: SpecScreenImport[] = manifest.screens.map((s) => {
      if (!s.sourceFile) return { id: s.id, sourceFile: null, exportType: 'default' as const }

      // Resolve actual file path
      let resolvedSourceFile = s.sourceFile
      if (!existsSync(resolve(cwd, s.sourceFile))) {
        const fromRoot = resolve(specsRoot, s.sourceFile)
        if (existsSync(fromRoot)) {
          resolvedSourceFile = relative(cwd, fromRoot)
        }
      }

      const absPath = resolve(cwd, resolvedSourceFile)
      const exportInfo = detectExportType(absPath)

      return {
        id: s.id,
        sourceFile: resolvedSourceFile,
        exportType: exportInfo.type,
        exportName: exportInfo.name,
      }
    })
    await writeFile(join(previewDir, 'main.tsx'), generateSpecMainTsx(screens, screenStateVars), 'utf-8')
  } else {
    await writeFile(join(previewDir, 'main.tsx'), generateMainTsx(), 'utf-8')
  }
}

function generateIndexHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <script>
      // Shim Node.js globals for server-side code pulled into browser bundle
      window.process = window.process || { env: {}, argv: [], version: '' };
      window.global = window.global || globalThis;
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
`
}

function generatePreviewCss(
  hostCssPath: string | null,
  hostSrcRelative: string,
  runtimeSrcRelative: string
): string {
  const lines: string[] = [
    '/* Auto-generated by @preview-tool/cli — do not edit manually */',
  ]

  if (hostCssPath) {
    // Import the host project's CSS (which includes @import "tailwindcss")
    lines.push(`@import "${hostSrcRelative}/${hostCssPath.replace('src/', '')}";`)
  }

  // Tell Tailwind CSS v4 to also scan the runtime package and host src for classes
  lines.push(`@source "${runtimeSrcRelative}";`)
  lines.push(`@source "${hostSrcRelative}";`)

  return lines.join('\n') + '\n'
}

function generateMainTsx(): string {
  return `// Auto-generated by @preview-tool/cli — do not edit manually
import React from 'react'
import { createRoot } from 'react-dom/client'
import { PreviewShell, registerFlows } from '@preview-tool/runtime'
import type { ScreenEntry, AnyFlowAction } from '@preview-tool/runtime'
import { Wrapper } from './wrapper'
import './preview.css'

// Global fetch interceptor — prevents real network requests in preview mode.
const __realFetch = window.fetch
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('/') || url.includes('localhost:6100') || url.includes('/@')) {
    return __realFetch(input, init)
  }
  console.debug('[preview-tool] Intercepted fetch:', url)
  return new Response(JSON.stringify({ success: true, data: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Auto-discover from per-screen folders
const screenModules = import.meta.glob('./screens/*/adapter.tsx')
const modelModules = import.meta.glob('./screens/*/model.ts', { eager: true }) as Record<
  string,
  { meta: { route: string }; regions: Record<string, unknown> }
>
const controllerModules = import.meta.glob('./screens/*/controller.ts', { eager: true }) as Record<
  string,
  { flows?: readonly AnyFlowAction[] }
>

// Auto-discover user overrides
const overrideModelModules = import.meta.glob('./overrides/*/model.ts', { eager: true }) as Record<
  string,
  { regions?: Record<string, unknown> }
>
const overrideControllerModules = import.meta.glob('./overrides/*/controller.ts', { eager: true }) as Record<
  string,
  { flows?: readonly AnyFlowAction[] }
>

/**
 * Merge override regions into the base model data.
 * Override regions replace base regions entirely.
 */
function mergeOverrides(
  base: { regions: Record<string, unknown> },
  override: { regions?: Record<string, unknown> } | undefined
): { regions: Record<string, unknown> } {
  if (!override) return base
  return {
    regions: override.regions ?? base.regions,
  }
}

// Build screen entries by matching adapter path to model path via folder name
const entries: ScreenEntry[] = []

for (const [adapterPath, importFn] of Object.entries(screenModules)) {
  const parts = adapterPath.split('/')
  const folderName = parts[parts.length - 2] ?? ''
  const modelPath = \`./screens/\${folderName}/model.ts\`
  const controllerPath = \`./screens/\${folderName}/controller.ts\`
  const overrideModelPath = \`./overrides/\${folderName}/model.ts\`

  const model = modelModules[modelPath]
  if (!model) continue

  const override = overrideModelModules[overrideModelPath]
  const merged = mergeOverrides(model, override)

  entries.push({
    route: model.meta.route,
    module: () => (importFn as any)().catch((err: any) => {
      console.error('[preview-tool] Failed to load screen:', err)
      throw err
    }),
    regions: merged.regions as ScreenEntry['regions'],
  })

  // Register flow actions from controller (override takes precedence)
  const overrideControllerPath = \`./overrides/\${folderName}/controller.ts\`
  const controller = overrideControllerModules[overrideControllerPath] ?? controllerModules[controllerPath]
  if (controller?.flows && controller.flows.length > 0) {
    registerFlows(model.meta.route, controller.flows)
  }
}

// Render
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <Wrapper>
        <PreviewShell screens={entries} />
      </Wrapper>
    </React.StrictMode>
  )
}
`
}

export function generateSpecMainTsx(screens: SpecScreenImport[], screenStateVars?: Record<string, string[]>): string {
  // Generate static import map so Vite can resolve paths at compile time
  const importEntries = screens
    .filter((s) => s.sourceFile)
    .map((s) => {
      const importPath = `'../${s.sourceFile}'`
      switch (s.exportType) {
        case 'tanstack-route':
          return `  '${s.id}': () => import(${importPath}).then(m => ({ default: m.Route.options.component })),`
        case 'named':
          return `  '${s.id}': () => import(${importPath}).then(m => ({ default: m.${s.exportName} })),`
        default:
          return `  '${s.id}': () => import(${importPath}),`
      }
    })
    .join('\n')

  return `// Auto-generated by @preview-tool/cli — spec-driven mode
import React from 'react'
import { createRoot } from 'react-dom/client'
import { PreviewShell } from '@preview-tool/runtime'
import type { ScreenEntry } from '@preview-tool/runtime'
import { Wrapper } from './wrapper'
import { screenEntries } from 'virtual:spec-manifest'
import './preview.css'

// Static import map — Vite resolves these at compile time
const screenModules: Record<string, () => Promise<any>> = {
${importEntries}
}

// Build screen entries from spec manifest
const entries: ScreenEntry[] = screenEntries.map((entry: any) => ({
  route: entry.route,
  module: screenModules[entry.route] ?? (() => Promise.resolve({ default: () => null })),
  regions: entry.regions,
}))

// ---------------------------------------------------------------------------
// Preview overrides — control component state without modifying source code.
//
// 1. React.useState override: returns mock data from region state machine
//    based on the variable name (matched by call order within each component)
// 2. React.useEffect override: no-op for screen components (all data comes
//    from mock state, no side effects needed)
// 3. Global fetch interceptor: catches any direct fetch() calls
//
// These overrides are ONLY in this generated file. Production code is untouched.
// ---------------------------------------------------------------------------
import { useDevToolsStore, getScreenEntries } from '@preview-tool/runtime'

// useState variable map: screen file name → ordered variable names
// Generated by the spec pipeline from AST analysis of each screen component
const __stateVarMap: Record<string, string[]> = ${JSON.stringify(buildStateVarMapByFileName(screens, screenStateVars ?? {}))}

// Read merged region mock data for the active screen + state
function __getRegionMockData(): Record<string, unknown> {
  const store = useDevToolsStore.getState()
  const route = store.selectedRoute
  if (!route) return {}
  const screenEntries = getScreenEntries()
  const entry = screenEntries.find((e: any) => e.route === route)
  if (!entry?.regions) return {}
  let merged: Record<string, unknown> = {}
  for (const [key, region] of Object.entries(entry.regions as Record<string, any>)) {
    const activeState = store.regionStates[key] ?? region.defaultState
    const stateData = region.states[activeState] ?? region.states[region.defaultState] ?? {}
    merged = { ...merged, ...stateData }
  }
  return merged
}

// Override React.useState for screen components
// Tracks call index per render to match variables by order
let __useStateIndex = 0
let __useStateActive = false
let __useStateVars: string[] = []
const __originalUseState = React.useState
;(React as any).useState = function __previewUseState(initialValue: any) {
  if (!__useStateActive || __useStateVars.length === 0) {
    return __originalUseState(initialValue)
  }
  const varName = __useStateVars[__useStateIndex] ?? null
  __useStateIndex++
  const regionData = __getRegionMockData()
  // If region data has a value for this variable, use it; otherwise use initial
  const mockValue = (varName && varName in regionData) ? regionData[varName] : initialValue
  // Return controlled state: value from region, setter is a no-op
  // (sidebar controls the value, not the component)
  return [mockValue, () => {}]
}

// Override React.useEffect — no-op for screen components
// All data comes from mock state, no side effects (fetch, timers) needed
const __originalUseEffect = React.useEffect
;(React as any).useEffect = function __previewUseEffect(cb: any, deps?: any) {
  if (__useStateActive) return // screen component — skip
  return __originalUseEffect(cb, deps) // library component — run normally
}

// Wrap screen imports to activate/deactivate overrides during render
for (const [route, importFn] of Object.entries(screenModules)) {
  screenModules[route] = async () => {
    const mod = await importFn()
    if (!mod.default) return mod
    const OriginalComponent = mod.default
    // Find useState var names for this screen
    const matchingVars = Object.entries(__stateVarMap).find(([path]) =>
      route.includes(path.split('/').pop()?.replace(/\\.tsx?$/, '') ?? '__none__')
    )
    const varNames = matchingVars?.[1] ?? []
    // Return a wrapper that activates overrides during render
    return {
      default: function PreviewScreenWrapper(props: any) {
        __useStateActive = true
        __useStateIndex = 0
        __useStateVars = varNames
        try {
          const result = React.createElement(OriginalComponent, props)
          return result
        } finally {
          __useStateActive = false
        }
      }
    }
  }
}

// Global fetch interceptor — catches direct fetch() calls (not via mocked api client)
const __realFetch = window.fetch
window.fetch = async (input: any, init: any) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('/') || url.includes('localhost:6100') || url.includes('/@')) {
    return __realFetch(input, init)
  }
  return new Response(JSON.stringify({ success: true, data: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Render
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <Wrapper>
        <PreviewShell screens={entries} />
      </Wrapper>
    </React.StrictMode>
  )
}
`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

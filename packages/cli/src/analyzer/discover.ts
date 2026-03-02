import { glob } from 'glob'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

// TODO: Rework discover.ts for v2 DiscoveredScreen shape (Phase 2)
// Using a local legacy type until this module is rewritten.
interface LegacyDiscoveredScreen {
  filePath: string
  route: string
  pattern: 'mvc' | 'props' | 'hooks' | 'monolithic'
  viewFile?: string
  modelFile?: string
  controllerFile?: string
  exportName?: string
}

const EXCLUDED_DIRS = ['_shared', '_test-helpers', 'node_modules', '__tests__']

export async function discoverScreens(
  cwd: string,
  screenGlob: string
): Promise<LegacyDiscoveredScreen[]> {
  const matches = await glob(screenGlob, {
    cwd,
    absolute: false,
    posix: true,
  })

  const screens: LegacyDiscoveredScreen[] = []

  for (const match of matches) {
    // Filter out excluded directories
    const parts = match.split('/')
    if (parts.some((part) => EXCLUDED_DIRS.includes(part))) {
      continue
    }

    // For non-index files, check if they look like pages
    if (!match.endsWith('/index.tsx') && !match.endsWith('index.tsx')) {
      const fileName = parts[parts.length - 1]
      if (!fileName) continue
      if (!fileName.endsWith('.tsx')) continue

      // Skip known non-page files
      const baseName = fileName.replace('.tsx', '')
      const skipFiles = ['App', 'main', 'layout', 'routes', 'router']
      if (skipFiles.includes(baseName)) continue

      // Skip files in component directories (not page directories)
      const parentDir = parts[parts.length - 2] ?? ''
      const componentDirs = ['components', 'ui', 'hooks', 'lib', 'utils', 'stores', 'types']
      if (componentDirs.includes(parentDir)) continue
    }

    const absolutePath = join(cwd, match)
    const screenDir = dirname(absolutePath)
    const route = deriveRoute(cwd, match)
    const pattern = detectPattern(screenDir)

    const screen: LegacyDiscoveredScreen = {
      filePath: absolutePath,
      route,
      pattern: pattern.type,
    }

    if (pattern.viewFile) {
      screen.viewFile = pattern.viewFile
    }
    if (pattern.modelFile) {
      screen.modelFile = pattern.modelFile
    }
    if (pattern.controllerFile) {
      screen.controllerFile = pattern.controllerFile
    }

    // Detect named vs default export
    const exportName = detectExportName(absolutePath)
    if (exportName) {
      screen.exportName = exportName
    }

    screens.push(screen)
  }

  return screens
}

function deriveRoute(cwd: string, filePath: string): string {
  // Strip common prefixes
  let route = filePath

  // Remove src/screens/ or src/ prefix
  const prefixes = ['src/screens/', 'src/pages/', 'src/']
  for (const prefix of prefixes) {
    if (route.startsWith(prefix)) {
      route = route.slice(prefix.length)
      break
    }
  }

  // Remove /index.tsx or .tsx suffix
  route = route.replace(/\/index\.tsx$/, '').replace(/\.tsx$/, '')

  // Map 'home' to root
  if (route === 'home' || route === '/home') {
    route = '/'
  }

  // Ensure leading slash
  if (!route.startsWith('/')) {
    route = '/' + route
  }

  return route
}

interface DetectedPattern {
  type: 'mvc' | 'props' | 'hooks' | 'monolithic'
  viewFile?: string
  modelFile?: string
  controllerFile?: string
}

/**
 * Reads a source file and detects whether it uses named or default export.
 * Returns the named export identifier (e.g. 'BookingPage') or undefined for default exports.
 */
function detectExportName(filePath: string): string | undefined {
  try {
    const source = readFileSync(filePath, 'utf-8')

    // Check for default export first — if present, no named import needed
    if (/export\s+default\s+/.test(source)) {
      return undefined
    }

    // Match named function export: export function FooPage()
    const funcMatch = source.match(/export\s+function\s+(\w+)\s*\(/)
    if (funcMatch) {
      return funcMatch[1]
    }

    // Match named const export: export const FooPage =
    const constMatch = source.match(/export\s+const\s+(\w+)\s*=/)
    if (constMatch) {
      return constMatch[1]
    }

    return undefined
  } catch {
    return undefined
  }
}

function detectPattern(screenDir: string): DetectedPattern {
  const hasView = existsSync(join(screenDir, 'view.tsx')) ||
    existsSync(join(screenDir, 'View.tsx'))
  const hasModel = existsSync(join(screenDir, 'model.ts')) ||
    existsSync(join(screenDir, 'Model.ts'))
  const hasController = existsSync(join(screenDir, 'controller.ts')) ||
    existsSync(join(screenDir, 'Controller.ts'))

  if (hasView && hasModel) {
    return {
      type: 'mvc',
      viewFile: existsSync(join(screenDir, 'view.tsx'))
        ? join(screenDir, 'view.tsx')
        : join(screenDir, 'View.tsx'),
      modelFile: existsSync(join(screenDir, 'model.ts'))
        ? join(screenDir, 'model.ts')
        : join(screenDir, 'Model.ts'),
      controllerFile: hasController
        ? (existsSync(join(screenDir, 'controller.ts'))
            ? join(screenDir, 'controller.ts')
            : join(screenDir, 'Controller.ts'))
        : undefined,
    }
  }

  return { type: 'monolithic' }
}

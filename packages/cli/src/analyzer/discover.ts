import { glob } from 'glob'
import { existsSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import type { DiscoveredScreen } from './types.js'

const EXCLUDED_DIRS = ['_shared', '_test-helpers', 'node_modules', '__tests__']

export async function discoverScreens(
  cwd: string,
  screenGlob: string
): Promise<DiscoveredScreen[]> {
  const matches = await glob(screenGlob, {
    cwd,
    absolute: false,
    posix: true,
  })

  const screens: DiscoveredScreen[] = []

  for (const match of matches) {
    // Filter out excluded directories
    const parts = match.split('/')
    if (parts.some((part) => EXCLUDED_DIRS.includes(part))) {
      continue
    }

    // Only process index.tsx files as screens
    if (!match.endsWith('/index.tsx') && !match.endsWith('index.tsx')) {
      // For non-index files, treat them as standalone screens
      // but skip files that look like sub-components (PascalCase in deeper dirs)
      const fileName = parts[parts.length - 1]
      if (!fileName) continue

      // Skip non-tsx files
      if (!fileName.endsWith('.tsx')) continue

      // Skip files that start with uppercase (likely sub-components)
      if (fileName[0] === fileName[0]?.toUpperCase() && fileName[0] !== fileName[0]?.toLowerCase()) {
        continue
      }
    }

    const absolutePath = join(cwd, match)
    const screenDir = dirname(absolutePath)
    const route = deriveRoute(cwd, match)
    const pattern = detectPattern(screenDir)

    const screen: DiscoveredScreen = {
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

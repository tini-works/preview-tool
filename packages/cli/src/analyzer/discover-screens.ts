import { glob } from 'glob'
import { readFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { parseRouterRoutes } from './parse-router.js'
import { scoreFile } from './score-file.js'
import type { DiscoveredScreen, RouterRoute } from './types.js'

const SCREEN_SCORE_THRESHOLD = 30

const EXCLUDED_DIRECTORIES = [
  'node_modules',
  '__tests__',
  'components',
  'ui',
  'hooks',
  'lib',
  'utils',
  'stores',
  'types',
  'styles',
  'assets',
  'constants',
  'config',
  '.preview',
]

/**
 * Discover screens in a React project using multi-signal analysis.
 *
 * 1. Parse router routes for definitive route-based screens (score=100)
 * 2. Glob all candidate .tsx/.jsx files
 * 3. Score each file using heuristic signals
 * 4. Filter by threshold, deduplicate, and sort by score
 */
export async function discoverScreens(
  cwd: string
): Promise<DiscoveredScreen[]> {
  const routerRoutes = await parseRouterRoutes(cwd)
  const routerScreens = buildRouterScreens(cwd, routerRoutes)
  const routeReferencedFiles = routerRoutes.map((r) => r.componentFile)

  const candidateFiles = await findCandidateFiles(cwd)
  const heuristicScreens = scoreCandidates(cwd, candidateFiles, routeReferencedFiles)

  const allScreens = [...routerScreens, ...heuristicScreens]
  const deduplicated = deduplicateByFile(allScreens)

  return deduplicated.sort((a, b) => b.score - a.score)
}

/**
 * Convert router routes into DiscoveredScreen entries with max score.
 */
function buildRouterScreens(
  cwd: string,
  routes: readonly RouterRoute[]
): DiscoveredScreen[] {
  return routes.map((route) => ({
    name: route.componentName,
    path: route.path,
    file: route.componentFile,
    score: 100,
    source: 'router' as const,
  }))
}

/**
 * Find all candidate .tsx/.jsx files, excluding non-screen directories.
 */
async function findCandidateFiles(cwd: string): Promise<string[]> {
  const excludePatterns = EXCLUDED_DIRECTORIES.map(
    (dir) => `**/${dir}/**`
  )

  return glob('src/**/*.{tsx,jsx}', {
    cwd,
    absolute: true,
    ignore: excludePatterns,
  })
}

/**
 * Score candidate files and return those above the threshold as screens.
 */
function scoreCandidates(
  cwd: string,
  files: readonly string[],
  routeReferencedFiles: readonly string[]
): DiscoveredScreen[] {
  const screens: DiscoveredScreen[] = []

  for (const absolutePath of files) {
    const relativePath = relative(cwd, absolutePath)

    let content: string
    try {
      content = readFileSync(absolutePath, 'utf-8')
    } catch {
      continue
    }

    const score = scoreFile(relativePath, content, routeReferencedFiles)

    if (score < SCREEN_SCORE_THRESHOLD) {
      continue
    }

    const name = deriveScreenName(relativePath)
    const path = deriveRoutePath(relativePath)

    screens.push({
      name,
      path,
      file: relativePath,
      score,
      source: score >= 50 ? 'convention' : 'heuristic',
    })
  }

  return screens
}

/**
 * Derive a PascalCase screen name from a file path.
 *
 * - For index.tsx files, use the parent directory name
 * - For other files, use the file name without extension
 * - Convert to PascalCase
 */
function deriveScreenName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const fileName = basename(normalized).replace(/\.(tsx|jsx|ts|js)$/, '')

  if (fileName === 'index') {
    const parentDir = basename(dirname(normalized))
    return toPascalCase(parentDir)
  }

  return toPascalCase(fileName)
}

/**
 * Derive a route path from a file path.
 *
 * Strips common prefixes (src/screens/, src/pages/, src/views/, src/routes/, src/)
 * and file suffixes (index.tsx, .tsx).
 */
function deriveRoutePath(filePath: string): string {
  let route = filePath.replace(/\\/g, '/')

  const prefixes = [
    'src/screens/',
    'src/pages/',
    'src/views/',
    'src/routes/',
    'src/',
  ]

  for (const prefix of prefixes) {
    if (route.startsWith(prefix)) {
      route = route.slice(prefix.length)
      break
    }
  }

  // Remove /index.tsx or .tsx suffix
  route = route.replace(/\/index\.(tsx|jsx)$/, '').replace(/\.(tsx|jsx)$/, '')

  // Ensure leading slash
  if (!route.startsWith('/')) {
    route = '/' + route
  }

  // Map common home patterns to root
  if (route === '/home' || route === '/Home' || route === '/index') {
    route = '/'
  }

  return route
}

/**
 * Convert a string to PascalCase.
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, char: string | undefined) =>
      char ? char.toUpperCase() : ''
    )
    .replace(/^(.)/, (_, char: string) => char.toUpperCase())
}

/**
 * Deduplicate screens by file path, keeping the highest-scored entry.
 */
function deduplicateByFile(screens: readonly DiscoveredScreen[]): DiscoveredScreen[] {
  const byFile = new Map<string, DiscoveredScreen>()

  for (const screen of screens) {
    const existing = byFile.get(screen.file)
    if (!existing || screen.score > existing.score) {
      byFile.set(screen.file, screen)
    }
  }

  return Array.from(byFile.values())
}

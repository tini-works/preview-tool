import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { glob } from 'glob'

export interface DevToolSectionDef {
  id: string
  label: string
  states: string[]
}

export interface DevToolPageDef {
  route: string
  sections: DevToolSectionDef[]
}

export interface DevToolConfig {
  storePath: string
  pages: DevToolPageDef[]
}

export interface DetectedFramework {
  name: 'react' | 'vue' | 'svelte' | 'unknown'
  bundler: 'vite' | 'webpack' | 'next' | 'unknown'
  pagePattern: string
  providers: string[]
  devToolStorePath: string | null
  devToolConfig: DevToolConfig | null
}

const KNOWN_PROVIDERS = [
  '@tanstack/react-query',
  'react-router-dom',
  'react-i18next',
  '@chakra-ui/react',
  '@mui/material',
  '@emotion/react',
  'styled-components',
  'zustand',
  'redux',
  '@reduxjs/toolkit',
] as const

const PAGE_PATTERNS = [
  { dir: 'src/pages', glob: 'src/pages/**/*.tsx' },
  { dir: 'src/screens', glob: 'src/screens/**/index.tsx' },
  { dir: 'src/app', glob: 'src/app/**/page.tsx' },
  { dir: 'pages', glob: 'pages/**/*.tsx' },
  { dir: 'app', glob: 'app/**/page.tsx' },
] as const

export async function detectFramework(cwd: string): Promise<DetectedFramework> {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json found in ${cwd}`)
  }

  const raw = await readFile(pkgPath, 'utf-8')
  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    scripts?: Record<string, string>
  }

  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }

  const name = detectFrameworkName(allDeps)
  const bundler = detectBundler(allDeps, cwd)
  const pagePattern = await detectPagePattern(cwd)
  const providers = KNOWN_PROVIDERS.filter((p) => p in allDeps)
  const devToolStorePath = await detectDevToolStore(cwd)
  const devToolConfig = devToolStorePath
    ? await parseDevToolConfig(cwd, devToolStorePath)
    : null

  return { name, bundler, pagePattern, providers: [...providers], devToolStorePath, devToolConfig }
}

function detectFrameworkName(deps: Record<string, string>): DetectedFramework['name'] {
  if ('react' in deps || 'react-dom' in deps) return 'react'
  if ('vue' in deps) return 'vue'
  if ('svelte' in deps) return 'svelte'
  return 'unknown'
}

function detectBundler(deps: Record<string, string>, cwd: string): DetectedFramework['bundler'] {
  if ('next' in deps) return 'next'
  if ('vite' in deps || existsSync(join(cwd, 'vite.config.ts')) || existsSync(join(cwd, 'vite.config.js'))) return 'vite'
  if ('webpack' in deps) return 'webpack'
  return 'unknown'
}

async function detectPagePattern(cwd: string): Promise<string> {
  for (const pattern of PAGE_PATTERNS) {
    if (existsSync(join(cwd, pattern.dir))) {
      const matches = await glob(pattern.glob, { cwd, absolute: false })
      if (matches.length > 0) {
        return pattern.glob
      }
    }
  }
  return 'src/**/*.tsx'
}

const DEV_TOOL_STORE_GLOBS = [
  'src/**/devtool*store*.ts',
  'src/**/devtool*store*.tsx',
  'src/**/dev-tool*store*.ts',
  'src/**/dev-tool*store*.tsx',
] as const

/**
 * Parse the devtool config file adjacent to the store.
 * Extracts page→section mappings by looking for structured section definitions.
 */
async function parseDevToolConfig(
  cwd: string,
  storePath: string,
): Promise<DevToolConfig | null> {
  const storeDir = dirname(join(cwd, storePath))

  // Look for config file in same directory as store
  const configCandidates = ['config.ts', 'config.tsx', 'sections.ts', 'constants.ts']
  for (const candidate of configCandidates) {
    const configPath = join(storeDir, candidate)
    if (!existsSync(configPath)) continue

    try {
      const content = await readFile(configPath, 'utf-8')
      const pages = extractPageDefs(content)
      if (pages.length > 0) {
        return { storePath, pages }
      }
    } catch {
      // Config file unreadable, skip
    }
  }
  return null
}

/**
 * Extract page definitions from devtool config source code.
 * First extracts individual section defs, then groups them by route.
 */
function extractPageDefs(source: string): DevToolPageDef[] {
  // Step 1: Find all section objects: { id: '...', label: '...', states: [...] }
  const sectionRe = /\{\s*id:\s*['"]([^'"]+)['"]\s*,\s*label:\s*['"]([^'"]+)['"][^}]*?states:\s*\[([^\]]*)\][^}]*\}/g
  const allSections: Array<{ id: string; label: string; states: string[]; index: number }> = []
  let sectionMatch: RegExpExecArray | null

  while ((sectionMatch = sectionRe.exec(source)) !== null) {
    const statesStr = sectionMatch[3]
    const states = [...statesStr.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    allSections.push({
      id: sectionMatch[1],
      label: sectionMatch[2],
      states,
      index: sectionMatch.index,
    })
  }

  if (allSections.length === 0) return []

  // Step 2: Find all route definitions and their position in source
  const pathRe = /path:\s*['"]([^'"]+)['"]/g
  const routes: Array<{ route: string; index: number }> = []
  let pathMatch: RegExpExecArray | null

  while ((pathMatch = pathRe.exec(source)) !== null) {
    routes.push({ route: pathMatch[1], index: pathMatch.index })
  }

  // Step 3: Assign sections to the nearest preceding route
  const pages: DevToolPageDef[] = []
  for (const routeDef of routes) {
    const nextRouteIndex = routes.find((r) => r.index > routeDef.index)?.index ?? source.length
    const sections = allSections
      .filter((s) => s.index > routeDef.index && s.index < nextRouteIndex)
      .map(({ id, label, states }) => ({ id, label, states }))

    if (sections.length > 0) {
      pages.push({ route: routeDef.route, sections })
    }
  }

  return pages
}

async function detectDevToolStore(cwd: string): Promise<string | null> {
  for (const pattern of DEV_TOOL_STORE_GLOBS) {
    const matches = await glob(pattern, { cwd, absolute: false })
    for (const match of matches) {
      try {
        const content = await readFile(join(cwd, match), 'utf-8')
        // Verify it's a Zustand store with setSectionState
        // Match both create( and create<Type>( patterns
        if (/create[<(]/.test(content) && content.includes('setSectionState')) {
          return match
        }
      } catch {
        // File unreadable, skip
      }
    }
  }
  return null
}

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { glob } from 'glob'

export interface DetectedFramework {
  name: 'react' | 'vue' | 'svelte' | 'unknown'
  bundler: 'vite' | 'webpack' | 'next' | 'unknown'
  pagePattern: string
  providers: string[]
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

  return { name, bundler, pagePattern, providers: [...providers] }
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

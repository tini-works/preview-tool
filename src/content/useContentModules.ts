import { useMemo } from 'react'
import type { ComponentType } from 'react'

interface ContentModule {
  default: ComponentType
  frontmatter?: {
    type?: 'region' | 'screen' | 'flow'
    states?: Record<string, { description?: string }>
    [key: string]: unknown
  }
}

export interface ContentEntry {
  route: string
  module: () => Promise<ContentModule>
  frontmatter?: ContentModule['frontmatter']
}

// Vite eager-loads frontmatter, lazy-loads the component
const mdxModules = import.meta.glob<ContentModule>(
  '/content/**/*.mdx'
)

// Eager import for frontmatter only (if available)
const mdxFrontmatters = import.meta.glob<ContentModule>(
  '/content/**/*.mdx',
  { eager: true }
)

function filePathToRoute(filePath: string): string {
  return filePath
    .replace(/^\/content/, '')
    .replace(/\.mdx$/, '')
    .replace(/\/index$/, '/')
}

export function useContentModules(): ContentEntry[] {
  return useMemo(() => {
    return Object.entries(mdxModules).map(([filePath, loader]) => ({
      route: filePathToRoute(filePath),
      module: loader,
      frontmatter: mdxFrontmatters[filePath]?.frontmatter,
    }))
  }, [])
}

export function useContentRoutes(): string[] {
  const modules = useContentModules()
  return useMemo(() => modules.map((m) => m.route), [modules])
}

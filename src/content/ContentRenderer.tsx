import { useEffect, useState, type ComponentType } from 'react'
import { VariantProvider } from '@/content/Variant'
import { mdxComponents } from '@/content/mdx-components'
import { useContentModules } from '@/content/useContentModules'
import { MDXProvider } from '@mdx-js/react'

interface ContentRendererProps {
  route: string | null
  activeState: string | null
}

interface LoadedState {
  route: string
  Component: ComponentType
}

export function ContentRenderer({ route, activeState }: ContentRendererProps) {
  const modules = useContentModules()
  const [loaded, setLoaded] = useState<LoadedState | null>(null)

  useEffect(() => {
    if (!route) return

    const entry = modules.find((m) => m.route === route)
    if (!entry) return

    let cancelled = false
    entry.module().then((mod) => {
      if (!cancelled) {
        setLoaded({ route, Component: mod.default })
      }
    })

    return () => {
      cancelled = true
    }
  }, [route, modules])

  if (!route) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-neutral-400">
        <p>Select a content file to preview</p>
      </div>
    )
  }

  const entry = modules.find((m) => m.route === route)
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-neutral-400">
        <p>Content not found: {route}</p>
      </div>
    )
  }

  if (!loaded || loaded.route !== route) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-neutral-400">
        Loading...
      </div>
    )
  }

  const { Component } = loaded

  return (
    <MDXProvider components={mdxComponents}>
      <VariantProvider activeState={activeState}>
        <div className="p-4">
          <Component />
        </div>
      </VariantProvider>
    </MDXProvider>
  )
}

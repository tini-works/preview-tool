import { Suspense, lazy, useMemo } from 'react'
import { VariantProvider } from '@/content/Variant'
import { mdxComponents } from '@/content/mdx-components'
import { useContentModules } from '@/content/useContentModules'
import { MDXProvider } from '@mdx-js/react'

interface ContentRendererProps {
  route: string | null
  activeState: string | null
}

export function ContentRenderer({ route, activeState }: ContentRendererProps) {
  const modules = useContentModules()

  const MdxComponent = useMemo(() => {
    if (!route) return null
    const entry = modules.find((m) => m.route === route)
    if (!entry) return null
    return lazy(async () => {
      const mod = await entry.module()
      return { default: mod.default }
    })
  }, [route, modules])

  if (!route) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-neutral-400">
        <p>Select a content file to preview</p>
      </div>
    )
  }

  if (!MdxComponent) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-neutral-400">
        <p>Content not found: {route}</p>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center p-8 text-neutral-400">
          Loading...
        </div>
      }
    >
      <MDXProvider components={mdxComponents}>
        <VariantProvider activeState={activeState}>
          <div className="p-4">
            <MdxComponent />
          </div>
        </VariantProvider>
      </MDXProvider>
    </Suspense>
  )
}

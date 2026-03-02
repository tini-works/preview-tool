import { useEffect, useState, type ComponentType } from 'react'
import { FlowProvider } from './flow/FlowProvider.tsx'
import { NetworkSimulationLayer } from './devtools/NetworkSimulationLayer.tsx'
import { ScreenErrorBoundary } from './ErrorBoundary.tsx'
import { useDevToolsStore } from './store/useDevToolsStore.ts'
import { getScreenEntries } from './ScreenRegistry.ts'
import type { ScreenModule } from './types.ts'

interface ScreenRendererProps {
  route: string | null
}

interface LoadedScreen {
  route: string
  Component: ComponentType
}

export function ScreenRenderer({ route }: ScreenRendererProps) {
  const modules = getScreenEntries()
  const fontScale = useDevToolsStore((s) => s.fontScale)
  const [loaded, setLoaded] = useState<LoadedScreen | null>(null)

  useEffect(() => {
    if (!route) return

    const entry = modules.find((m) => m.route === route)
    if (!entry) return

    let cancelled = false
    entry.module().then((mod: ScreenModule) => {
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
        <p>Select a screen to preview</p>
      </div>
    )
  }

  const entry = modules.find((m) => m.route === route)
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-neutral-400">
        <p>Screen not found: {route}</p>
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
    <NetworkSimulationLayer key={route}>
      <div style={{ zoom: fontScale }} className="h-full">
        <ScreenErrorBoundary key={route}>
          <FlowProvider>
            <Component />
          </FlowProvider>
        </ScreenErrorBoundary>
      </div>
    </NetworkSimulationLayer>
  )
}

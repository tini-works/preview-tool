import { useEffect, useState, type ComponentType } from 'react'
import { FlowProvider } from './flow/FlowProvider.tsx'
import { NetworkSimulationLayer } from './devtools/NetworkSimulationLayer.tsx'
import { ScreenErrorBoundary } from './ErrorBoundary.tsx'
import { useDevToolsStore } from './store/useDevToolsStore.ts'
import { getScreenEntries } from './ScreenRegistry.ts'
import type { ScreenModule, RegionsMap, FlagDefinition, RegionDataMap } from './types.ts'

export function resolveFlags(
  definitions: Record<string, FlagDefinition> | undefined,
  overrides: Record<string, boolean>
): Record<string, boolean> {
  if (!definitions) return {}
  const resolved: Record<string, boolean> = {}
  for (const [key, def] of Object.entries(definitions)) {
    resolved[key] = overrides[key] ?? def.default
  }
  return resolved
}

export function assembleRegionData(
  regions: RegionsMap,
  regionStates: Record<string, string>,
  regionListCounts: Record<string, number>
): Record<string, unknown> {
  let data: Record<string, unknown> = {}

  for (const [key, region] of Object.entries(regions)) {
    const activeState = regionStates[key] ?? region.defaultState
    const stateData = region.states[activeState] ?? region.states[region.defaultState] ?? {}
    data = { ...data, ...stateData }

    if (region.isList && region.mockItems) {
      const listField = Object.keys(stateData).find(
        (k) => Array.isArray(stateData[k])
      )
      if (listField) {
        const count = regionListCounts[key] ?? region.defaultCount ?? region.mockItems.length
        data = { ...data, [listField]: region.mockItems.slice(0, count) }
      }
    }
  }

  return data
}

export function computeRegionData(
  regions: RegionsMap,
  regionStates: Record<string, string>,
  regionListCounts: Record<string, number>
): RegionDataMap {
  const result: RegionDataMap = {}

  for (const [key, region] of Object.entries(regions)) {
    const activeState = regionStates[key] ?? region.defaultState
    let stateData = { ...(region.states[activeState] ?? region.states[region.defaultState] ?? {}) }

    if (region.isList && region.mockItems) {
      const listField = Object.keys(stateData).find((k) => Array.isArray(stateData[k]))
      if (listField) {
        const count = regionListCounts[key] ?? region.defaultCount ?? region.mockItems.length
        stateData = { ...stateData, [listField]: region.mockItems.slice(0, count) }
      }
    }

    result[key] = { activeState, stateData }
  }

  return result
}

interface ScreenRendererProps {
  route: string | null
}

interface LoadedScreen {
  route: string
  Component: ComponentType<{ regionData?: RegionDataMap; flags?: Record<string, boolean> }>
}

export function ScreenRenderer({ route }: ScreenRendererProps) {
  const modules = getScreenEntries()
  const fontScale = useDevToolsStore((s) => s.fontScale)
  const featureFlags = useDevToolsStore((s) => s.featureFlags)
  const regionStates = useDevToolsStore((s) => s.regionStates)
  const regionListCounts = useDevToolsStore((s) => s.regionListCounts)
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
  const regions = entry.regions
  const resolvedFlags = resolveFlags(entry.flags, featureFlags)
  const regionData = regions
    ? computeRegionData(regions, regionStates, regionListCounts)
    : {}

  return (
    <NetworkSimulationLayer key={route}>
      <div style={{ zoom: fontScale }} className="h-full">
        <ScreenErrorBoundary key={route}>
          <FlowProvider>
            <Component regionData={regionData} flags={resolvedFlags} />
          </FlowProvider>
        </ScreenErrorBoundary>
      </div>
    </NetworkSimulationLayer>
  )
}

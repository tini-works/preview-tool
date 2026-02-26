import { useEffect, useState, type ComponentType } from 'react'
import { FlowProvider } from '@/flow/FlowProvider'
import { NetworkSimulationLayer } from '@/devtools/NetworkSimulationLayer'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { useScreenModules } from '@/screens/useScreenModules'
import type { ScreenModule, RegionsMap, FlagDefinition } from '@/screens/types'

function resolveFlags(
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

function assembleRegionData(
  regions: RegionsMap,
  regionStates: Record<string, string>,
  regionListCounts: Record<string, number>
): Record<string, unknown> {
  let data: Record<string, unknown> = {}

  for (const [key, region] of Object.entries(regions)) {
    const activeState = regionStates[key] ?? region.defaultState
    const stateData = region.states[activeState] ?? region.states[region.defaultState] ?? {}
    data = { ...data, ...stateData }

    if (region.isList && regionListCounts[key] != null && region.mockItems) {
      const listField = Object.keys(stateData).find(
        (k) => Array.isArray(stateData[k])
      )
      if (listField) {
        data = { ...data, [listField]: region.mockItems.slice(0, regionListCounts[key]) }
      }
    }
  }

  return data
}

interface ScreenRendererProps {
  route: string | null
  activeState: string | null
}

interface LoadedScreen {
  route: string
  Component: ComponentType<{ data: unknown; flags?: Record<string, boolean> }>
}

export function ScreenRenderer({ route, activeState }: ScreenRendererProps) {
  const modules = useScreenModules()
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
  let data: Record<string, unknown>

  if (regions && Object.keys(regions).length > 0) {
    // Region-based path
    data = assembleRegionData(regions, regionStates, regionListCounts)
  } else {
    // Legacy scenario path
    const scenarios = entry.scenarios
    const scenarioKeys = Object.keys(scenarios)
    const activeScenario =
      activeState && scenarios[activeState]
        ? scenarios[activeState]
        : scenarioKeys.length > 0
          ? scenarios[scenarioKeys[0]]
          : null
    data = (activeScenario?.data as Record<string, unknown>) ?? {}
  }

  return (
    <NetworkSimulationLayer key={route}>
      <div style={{ zoom: fontScale }} className="h-full">
        <FlowProvider>
          <Component data={data} flags={resolvedFlags} />
        </FlowProvider>
      </div>
    </NetworkSimulationLayer>
  )
}

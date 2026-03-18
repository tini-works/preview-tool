import { useEffect, useRef, type ReactNode } from 'react'
import { WifiOff, Wifi } from 'lucide-react'
import { useDevToolsStore, type NetworkMode } from '../store/useDevToolsStore.ts'
import { getScreenEntries } from '../ScreenRegistry.ts'

interface NetworkSimulationLayerProps {
  children: ReactNode
}

export function NetworkSimulationLayer({ children }: NetworkSimulationLayerProps) {
  const networkMode = useDevToolsStore((s) => s.networkMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const setRegionState = useDevToolsStore((s) => s.setRegionState)
  const previousModeRef = useRef<NetworkMode>('online')
  const savedStatesRef = useRef<Record<string, string>>({})

  const modules = getScreenEntries()
  const currentModule = modules.find((m) => m.route === selectedRoute)
  const regions = currentModule?.regions

  // Track regionStates via subscription to avoid re-triggering the effect
  const regionStatesRef = useRef(useDevToolsStore.getState().regionStates)
  useEffect(() => {
    return useDevToolsStore.subscribe((state) => {
      regionStatesRef.current = state.regionStates
    })
  }, [])

  useEffect(() => {
    if (!regions) return

    const prevMode = previousModeRef.current
    previousModeRef.current = networkMode

    // Skip if mode didn't actually change
    if (prevMode === networkMode) return

    if (networkMode === 'offline') {
      // Save current region states before forcing error
      savedStatesRef.current = { ...regionStatesRef.current }
      for (const [key, region] of Object.entries(regions)) {
        if ('error' in region.states) {
          setRegionState(key, 'error')
        }
      }
    } else if (networkMode === 'slow-3g') {
      // Save current states and briefly show loading
      savedStatesRef.current = { ...regionStatesRef.current }
      for (const [key, region] of Object.entries(regions)) {
        if ('loading' in region.states) {
          setRegionState(key, 'loading')
        }
      }
      // Restore to saved states after simulated delay
      const saved = { ...savedStatesRef.current }
      const timer = setTimeout(() => {
        for (const [key, region] of Object.entries(regions)) {
          setRegionState(key, saved[key] ?? region.defaultState)
        }
      }, 1500)
      return () => clearTimeout(timer)
    } else if (networkMode === 'online') {
      // Restore previously saved states
      const saved = savedStatesRef.current
      for (const [key, region] of Object.entries(regions)) {
        setRegionState(key, saved[key] ?? region.defaultState)
      }
    }
  }, [networkMode, regions, setRegionState])

  return (
    <div className="relative h-full">
      {networkMode === 'offline' && (
        <div className="flex items-center justify-center gap-1.5 bg-red-50 px-3 py-1">
          <WifiOff className="size-3 text-red-500" />
          <span className="text-xs font-medium text-red-600">No Connection</span>
        </div>
      )}
      {networkMode === 'slow-3g' && (
        <div className="flex items-center justify-center gap-1.5 bg-amber-50 px-3 py-1">
          <Wifi className="size-3 text-amber-500" />
          <span className="text-xs font-medium text-amber-600">Slow 3G</span>
        </div>
      )}
      {children}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { CatalogPanel } from '@/devtools/CatalogPanel'
import { InspectorPanel } from '@/devtools/InspectorPanel'
import { PlayModeOverlay } from '@/devtools/PlayModeOverlay'
import { DeviceFrame } from '@/preview/DeviceFrame'
import { ScreenRenderer } from '@/screens/ScreenRenderer'
import { useScreenModules } from '@/screens/useScreenModules'
import { getDevice } from '@/preview/device-frames'

function App() {
  const activeDevice = useDevToolsStore((s) => s.activeDevice)
  const osMode = useDevToolsStore((s) => s.osMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const selectedState = useDevToolsStore((s) => s.selectedState)
  const setSelectedState = useDevToolsStore((s) => s.setSelectedState)
  const responsiveWidth = useDevToolsStore((s) => s.responsiveWidth)
  const responsiveHeight = useDevToolsStore((s) => s.responsiveHeight)
  const setResponsiveSize = useDevToolsStore((s) => s.setResponsiveSize)
  const playMode = useDevToolsStore((s) => s.playMode)

  const modules = useScreenModules()
  const prevRouteRef = useRef<string | null>(null)

  // Auto-select the first state when navigating to a new route
  useEffect(() => {
    if (selectedRoute === prevRouteRef.current) return
    prevRouteRef.current = selectedRoute

    if (!selectedRoute) return

    const mod = modules.find((m) => m.route === selectedRoute)
    if (!mod) return

    // Region-based screens don't use selectedState
    const hasRegions = mod.regions && Object.keys(mod.regions).length > 0
    if (hasRegions) {
      setSelectedState(null)
      return
    }

    // Legacy: auto-select first scenario
    const scenarioKeys = Object.keys(mod.scenarios)
    const firstState = scenarioKeys.length > 0 ? scenarioKeys[0] : null
    setSelectedState(firstState)
  }, [selectedRoute, modules, setSelectedState])

  const device = getDevice(activeDevice)

  return (
    <div className="flex h-svh bg-neutral-100">
      {!playMode && <CatalogPanel />}

      <div className="flex flex-1 flex-col overflow-hidden">
        <DeviceFrame
          device={device}
          osMode={osMode}
          responsiveWidth={responsiveWidth}
          responsiveHeight={responsiveHeight}
          onResponsiveResize={setResponsiveSize}
        >
          <ScreenRenderer
            route={selectedRoute}
            activeState={selectedState}
          />
        </DeviceFrame>
      </div>

      {!playMode && <InspectorPanel />}
      {playMode && <PlayModeOverlay />}
    </div>
  )
}

export default App

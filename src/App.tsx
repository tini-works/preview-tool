import { useEffect, useRef } from 'react'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { CatalogPanel } from '@/devtools/CatalogPanel'
import { InspectorPanel } from '@/devtools/InspectorPanel'
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

  const modules = useScreenModules()
  const prevRouteRef = useRef<string | null>(null)

  // Auto-select the first state when navigating to a new route
  useEffect(() => {
    if (selectedRoute === prevRouteRef.current) return
    prevRouteRef.current = selectedRoute

    if (!selectedRoute) return

    const mod = modules.find((m) => m.route === selectedRoute)
    const scenarioKeys = mod ? Object.keys(mod.scenarios) : []
    const firstState = scenarioKeys.length > 0 ? scenarioKeys[0] : null
    setSelectedState(firstState)
  }, [selectedRoute, modules, setSelectedState])

  const device = getDevice(activeDevice)

  return (
    <div className="flex h-svh bg-neutral-100">
      <CatalogPanel />

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

      <InspectorPanel />
    </div>
  )
}

export default App

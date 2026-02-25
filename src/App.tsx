import { useEffect, useRef } from 'react'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { CatalogPanel } from '@/devtools/CatalogPanel'
import { InspectorPanel } from '@/devtools/InspectorPanel'
import { DeviceFrame } from '@/preview/DeviceFrame'
import { ContentRenderer } from '@/content/ContentRenderer'
import { useContentModules } from '@/content/useContentModules'
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

  const modules = useContentModules()
  const prevRouteRef = useRef<string | null>(null)

  // Auto-select the first state when navigating to a new route
  useEffect(() => {
    if (selectedRoute === prevRouteRef.current) return
    prevRouteRef.current = selectedRoute

    if (!selectedRoute) return

    const mod = modules.find((m) => m.route === selectedRoute)
    const states = mod?.frontmatter?.states
    const firstState = states ? Object.keys(states)[0] ?? null : null
    setSelectedState(firstState)
  }, [selectedRoute, modules, setSelectedState])

  const device = getDevice(activeDevice)

  return (
    <div className="flex h-svh bg-neutral-100">
      {/* Left: Catalog */}
      <CatalogPanel />

      {/* Center: Device preview */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <DeviceFrame
          device={device}
          osMode={osMode}
          responsiveWidth={responsiveWidth}
          responsiveHeight={responsiveHeight}
          onResponsiveResize={setResponsiveSize}
        >
          <ContentRenderer
            route={selectedRoute}
            activeState={selectedState}
          />
        </DeviceFrame>
      </div>

      {/* Right: Inspector */}
      <InspectorPanel />
    </div>
  )
}

export default App

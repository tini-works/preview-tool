import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { CatalogPanel } from '@/devtools/CatalogPanel'
import { InspectorPanel } from '@/devtools/InspectorPanel'
import { DeviceFrame } from '@/preview/DeviceFrame'
import { ContentRenderer } from '@/content/ContentRenderer'
import { getDevice } from '@/preview/device-frames'

function App() {
  const activeDevice = useDevToolsStore((s) => s.activeDevice)
  const osMode = useDevToolsStore((s) => s.osMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const selectedState = useDevToolsStore((s) => s.selectedState)
  const responsiveWidth = useDevToolsStore((s) => s.responsiveWidth)
  const responsiveHeight = useDevToolsStore((s) => s.responsiveHeight)
  const setResponsiveSize = useDevToolsStore((s) => s.setResponsiveSize)

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

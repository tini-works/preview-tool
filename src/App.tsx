import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { CatalogPanel } from '@/devtools/CatalogPanel'
import { InspectorPanel } from '@/devtools/InspectorPanel'
import { PlayModeOverlay } from '@/devtools/PlayModeOverlay'
import { DeviceFrame } from '@/preview/DeviceFrame'
import { ScreenRenderer } from '@/screens/ScreenRenderer'
import { getDevice } from '@/preview/device-frames'

function App() {
  const activeDevice = useDevToolsStore((s) => s.activeDevice)
  const osMode = useDevToolsStore((s) => s.osMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const responsiveWidth = useDevToolsStore((s) => s.responsiveWidth)
  const responsiveHeight = useDevToolsStore((s) => s.responsiveHeight)
  const setResponsiveSize = useDevToolsStore((s) => s.setResponsiveSize)
  const playMode = useDevToolsStore((s) => s.playMode)

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
          <ScreenRenderer route={selectedRoute} />
        </DeviceFrame>
      </div>

      {!playMode && <InspectorPanel />}
      {playMode && <PlayModeOverlay />}
    </div>
  )
}

export default App

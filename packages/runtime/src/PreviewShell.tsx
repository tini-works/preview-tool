import { useMemo } from 'react'
import { useDevToolsStore } from './store/useDevToolsStore.ts'
import { CatalogPanel } from './devtools/CatalogPanel.tsx'
import { InspectorPanel } from './devtools/InspectorPanel.tsx'
import { DeviceFrame } from './preview/DeviceFrame.tsx'
import { ScreenRenderer } from './ScreenRenderer.tsx'
import { getDevice } from './preview/device-frames.ts'
import { registerScreens } from './ScreenRegistry.ts'
import type { ScreenEntry } from './types.ts'

interface PreviewShellProps {
  screens: ScreenEntry[]
  title?: string
  onLanguageChange?: (lang: string) => void
}

export function PreviewShell({ screens, onLanguageChange }: PreviewShellProps) {
  // Register synchronously during render so CatalogPanel/InspectorPanel
  // can read screens on the very first render cycle
  useMemo(() => {
    registerScreens(screens)
  }, [screens])

  const activeDevice = useDevToolsStore((s) => s.activeDevice)
  const osMode = useDevToolsStore((s) => s.osMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const responsiveWidth = useDevToolsStore((s) => s.responsiveWidth)
  const responsiveHeight = useDevToolsStore((s) => s.responsiveHeight)
  const setResponsiveSize = useDevToolsStore((s) => s.setResponsiveSize)

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
          <ScreenRenderer route={selectedRoute} />
        </DeviceFrame>
      </div>

      <InspectorPanel onLanguageChange={onLanguageChange} />
    </div>
  )
}

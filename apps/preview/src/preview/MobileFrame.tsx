import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { DeviceDefinition } from '@/preview/device-frames'
import type { OsMode } from '@/devtools/useDevToolsStore'
import { StatusBar } from '@/preview/StatusBar'
import { HomeIndicator } from '@/preview/HomeIndicator'

interface MobileFrameProps {
  device: DeviceDefinition
  osMode: OsMode
  children: ReactNode
}

export function MobileFrame({ device, osMode, children }: MobileFrameProps) {
  const isDark = osMode === 'dark'

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-[44px] border-[3px]',
        isDark
          ? 'border-neutral-700 bg-neutral-900'
          : 'border-neutral-300 bg-white'
      )}
      style={{ width: device.width, height: device.height }}
    >
      <StatusBar
        osMode={osMode}
        height={device.statusBarHeight}
        showDynamicIsland={device.notch === 'dynamic-island'}
      />

      <div
        className="flex-1 overflow-y-auto"
        data-theme={osMode}
      >
        {children}
      </div>

      {device.homeIndicator && (
        <HomeIndicator osMode={osMode} />
      )}
    </div>
  )
}

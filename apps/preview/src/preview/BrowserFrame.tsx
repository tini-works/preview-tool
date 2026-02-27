import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Globe, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import type { DeviceDefinition } from '@/preview/device-frames'
import type { OsMode } from '@/devtools/useDevToolsStore'

interface BrowserFrameProps {
  device: DeviceDefinition
  osMode: OsMode
  children: ReactNode
}

export function BrowserFrame({ device, osMode, children }: BrowserFrameProps) {
  const isDark = osMode === 'dark'

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border',
        isDark
          ? 'border-neutral-700 bg-neutral-900'
          : 'border-neutral-300 bg-white'
      )}
      style={{ width: device.width, height: device.height }}
    >
      {/* Browser chrome */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 border-b px-3 py-2',
          isDark
            ? 'border-neutral-700 bg-neutral-800'
            : 'border-neutral-200 bg-neutral-100'
        )}
      >
        {/* Traffic lights */}
        <div className="flex gap-1.5">
          <div className="size-3 rounded-full bg-red-400" />
          <div className="size-3 rounded-full bg-yellow-400" />
          <div className="size-3 rounded-full bg-green-400" />
        </div>

        {/* Navigation buttons */}
        <div className={cn('flex gap-1', isDark ? 'text-neutral-400' : 'text-neutral-500')}>
          <ChevronLeft className="size-4" />
          <ChevronRight className="size-4" />
          <RotateCw className="size-3.5" />
        </div>

        {/* Address bar */}
        <div
          className={cn(
            'flex flex-1 items-center gap-2 rounded-md px-3 py-1 text-sm',
            isDark
              ? 'bg-neutral-700 text-neutral-300'
              : 'bg-white text-neutral-600'
          )}
        >
          <Globe className="size-3.5 shrink-0" />
          <span className="truncate">localhost:5173</span>
        </div>
      </div>

      {/* Viewport */}
      <div
        className="flex-1 overflow-y-auto"
        data-theme={osMode}
      >
        {children}
      </div>
    </div>
  )
}

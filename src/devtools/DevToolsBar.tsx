import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDevToolsStore } from '@/devtools/useDevToolsStore'
import { getAllDevices, getDevice, type DeviceType } from '@/preview/device-frames'
import { useContentModules } from '@/content/useContentModules'

export function DevToolsBar() {
  const activeDevice = useDevToolsStore((s) => s.activeDevice)
  const setActiveDevice = useDevToolsStore((s) => s.setActiveDevice)
  const osMode = useDevToolsStore((s) => s.osMode)
  const toggleOsMode = useDevToolsStore((s) => s.toggleOsMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const setSelectedRoute = useDevToolsStore((s) => s.setSelectedRoute)
  const selectedState = useDevToolsStore((s) => s.selectedState)
  const setSelectedState = useDevToolsStore((s) => s.setSelectedState)
  const responsiveWidth = useDevToolsStore((s) => s.responsiveWidth)
  const responsiveHeight = useDevToolsStore((s) => s.responsiveHeight)

  const modules = useContentModules()
  const currentModule = modules.find((m) => m.route === selectedRoute)
  const states = currentModule?.frontmatter?.states
  const stateKeys = states ? Object.keys(states) : []

  const device = getDevice(activeDevice)
  const displayWidth =
    device.category === 'responsive' ? responsiveWidth : device.width
  const displayHeight =
    device.category === 'responsive' ? responsiveHeight : device.height

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2">
      {/* Device selector */}
      <Select
        value={activeDevice}
        onValueChange={(value) => setActiveDevice(value as DeviceType)}
      >
        <SelectTrigger className="w-[180px]">
          <Monitor className="size-4" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {getAllDevices().map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* OS Mode toggle */}
      <Button
        variant="outline"
        size="icon-sm"
        onClick={toggleOsMode}
        title={`Switch to ${osMode === 'light' ? 'dark' : 'light'} mode`}
      >
        {osMode === 'light' ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
      </Button>

      {/* Content route selector */}
      {modules.length > 0 && (
        <Select
          value={selectedRoute ?? ''}
          onValueChange={(value) => setSelectedRoute(value || null)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select content..." />
          </SelectTrigger>
          <SelectContent>
            {modules.map((m) => (
              <SelectItem key={m.route} value={m.route}>
                {m.route}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* State selector (only when content has states) */}
      {stateKeys.length > 0 && (
        <Select
          value={selectedState ?? ''}
          onValueChange={(value) => setSelectedState(value || null)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="State..." />
          </SelectTrigger>
          <SelectContent>
            {stateKeys.map((key) => (
              <SelectItem key={key} value={key}>
                {key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Dimension readout */}
      <span className="font-mono text-xs text-neutral-400">
        {displayWidth} x {displayHeight}
      </span>
    </div>
  )
}

import { Moon, Sun, Monitor, PanelRightClose, PanelRight, Play, Square, RotateCcw } from 'lucide-react'
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
import { useScreenModules } from '@/screens/useScreenModules'

export function InspectorPanel() {
  const activeDevice = useDevToolsStore((s) => s.activeDevice)
  const setActiveDevice = useDevToolsStore((s) => s.setActiveDevice)
  const osMode = useDevToolsStore((s) => s.osMode)
  const toggleOsMode = useDevToolsStore((s) => s.toggleOsMode)
  const selectedRoute = useDevToolsStore((s) => s.selectedRoute)
  const selectedState = useDevToolsStore((s) => s.selectedState)
  const setSelectedState = useDevToolsStore((s) => s.setSelectedState)
  const responsiveWidth = useDevToolsStore((s) => s.responsiveWidth)
  const responsiveHeight = useDevToolsStore((s) => s.responsiveHeight)
  const inspectorCollapsed = useDevToolsStore((s) => s.inspectorCollapsed)
  const toggleInspectorCollapsed = useDevToolsStore(
    (s) => s.toggleInspectorCollapsed
  )
  const playMode = useDevToolsStore((s) => s.playMode)
  const togglePlayMode = useDevToolsStore((s) => s.togglePlayMode)
  const flowHistory = useDevToolsStore((s) => s.flowHistory)
  const resetFlowHistory = useDevToolsStore((s) => s.resetFlowHistory)

  const modules = useScreenModules()
  const currentModule = modules.find((m) => m.route === selectedRoute)
  const scenarios = currentModule?.scenarios
  const stateKeys = scenarios ? Object.keys(scenarios) : []

  const device = getDevice(activeDevice)
  const displayWidth =
    device.category === 'responsive' ? responsiveWidth : device.width
  const displayHeight =
    device.category === 'responsive' ? responsiveHeight : device.height

  if (inspectorCollapsed) {
    return (
      <div className="flex h-full w-10 flex-shrink-0 flex-col border-l border-neutral-200 bg-white">
        <button
          onClick={toggleInspectorCollapsed}
          className="flex h-10 items-center justify-center text-neutral-400 hover:text-neutral-600"
          title="Expand inspector"
        >
          <PanelRight className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full w-72 flex-shrink-0 flex-col border-l border-neutral-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
        <span className="text-xs font-semibold tracking-wider text-neutral-400">
          INSPECTOR
        </span>
        <button
          onClick={toggleInspectorCollapsed}
          className="text-neutral-400 hover:text-neutral-600"
          title="Collapse inspector"
        >
          <PanelRightClose className="size-4" />
        </button>
      </div>

      {/* Play mode toggle */}
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant={playMode ? 'default' : 'outline'}
            size="icon-sm"
            onClick={togglePlayMode}
            title={playMode ? 'Stop play mode' : 'Start play mode'}
          >
            {playMode ? <Square className="size-3" /> : <Play className="size-3" />}
          </Button>
          <span className="text-xs font-medium text-neutral-500">
            {playMode ? 'Playing' : 'Play'}
          </span>
        </div>
        {playMode && flowHistory.length > 0 && (
          <button
            onClick={resetFlowHistory}
            className="text-neutral-400 hover:text-neutral-600"
            title="Reset flow"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex-1 overflow-y-auto">
        {/* Flow breadcrumb (only in play mode with history) */}
        {playMode && flowHistory.length > 0 && (
          <Section title="Flow History">
            <div className="flex flex-col gap-1">
              {flowHistory.map((entry, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-neutral-400">
                  <span className="truncate">{entry.route.split('/').pop()}</span>
                  {entry.state && (
                    <>
                      <span>·</span>
                      <span className="truncate text-neutral-300">{entry.state}</span>
                    </>
                  )}
                </div>
              ))}
              {selectedRoute && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-700">
                  <span className="truncate">{selectedRoute.split('/').pop()}</span>
                  {selectedState && (
                    <>
                      <span>·</span>
                      <span className="truncate text-teal-600">{selectedState}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Device section */}
        <Section title="Device">
          <Select
            value={activeDevice}
            onValueChange={(value) => setActiveDevice(value as DeviceType)}
          >
            <SelectTrigger className="w-full">
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

          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-neutral-400">
              {displayWidth} &times; {displayHeight}
            </span>
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
          </div>
        </Section>

        {/* State section (only when content has states) */}
        {stateKeys.length > 0 && (
          <Section title="States">
            <div className="flex flex-col gap-1">
              {stateKeys.map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedState(key)}
                  className={
                    selectedState === key
                      ? 'rounded-md bg-neutral-900/5 px-2 py-1 text-left text-sm font-medium text-neutral-900'
                      : 'rounded-md px-2 py-1 text-left text-sm text-neutral-600 hover:bg-neutral-50'
                  }
                >
                  {key}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Screen info */}
        {selectedRoute && (
          <Section title="Screen">
            <span className="text-xs text-neutral-400">{selectedRoute}</span>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-neutral-100 px-3 py-3">
      <h3 className="mb-2 text-xs font-medium text-neutral-500">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

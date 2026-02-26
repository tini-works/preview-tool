import { useEffect } from 'react'
import { Moon, Sun, Monitor, PanelRightClose, PanelRight, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDevToolsStore, type NetworkMode } from '@/devtools/useDevToolsStore'
import { getAllDevices, getDevice, type DeviceType } from '@/preview/device-frames'
import { useScreenModules } from '@/screens/useScreenModules'
import i18n from '@/lib/i18n'

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
  const flowHistory = useDevToolsStore((s) => s.flowHistory)
  const resetFlowHistory = useDevToolsStore((s) => s.resetFlowHistory)

  const networkMode = useDevToolsStore((s) => s.networkMode)
  const setNetworkMode = useDevToolsStore((s) => s.setNetworkMode)
  const fontScale = useDevToolsStore((s) => s.fontScale)
  const setFontScale = useDevToolsStore((s) => s.setFontScale)
  const language = useDevToolsStore((s) => s.language)
  const setLanguage = useDevToolsStore((s) => s.setLanguage)
  const featureFlags = useDevToolsStore((s) => s.featureFlags)
  const setFeatureFlag = useDevToolsStore((s) => s.setFeatureFlag)
  const regionStates = useDevToolsStore((s) => s.regionStates)
  const setRegionState = useDevToolsStore((s) => s.setRegionState)
  const regionListCounts = useDevToolsStore((s) => s.regionListCounts)
  const setRegionListCount = useDevToolsStore((s) => s.setRegionListCount)

  const modules = useScreenModules()
  const currentModule = modules.find((m) => m.route === selectedRoute)
  const scenarios = currentModule?.scenarios
  const stateKeys = scenarios ? Object.keys(scenarios) : []
  const currentFlags = currentModule?.flags
  const regions = currentModule?.regions
  const hasRegions = regions && Object.keys(regions).length > 0

  // Sync persisted language with i18n on mount
  useEffect(() => {
    if (language && language !== i18n.language) {
      i18n.changeLanguage(language)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* Controls */}
      <div className="flex-1 overflow-y-auto">
        {/* Flow breadcrumb */}
        {flowHistory.length > 0 && (
          <Section title="Flow History" trailing={
            <button
              onClick={resetFlowHistory}
              className="text-neutral-400 hover:text-neutral-600"
              title="Reset flow"
            >
              <RotateCcw className="size-3.5" />
            </button>
          }>
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

        {/* Region-based controls (when screen exports regions) */}
        {hasRegions && (
          <Section title="Regions">
            <div className="flex flex-col gap-3">
              {Object.entries(regions!).map(([key, region]) => (
                <RegionGroup
                  key={key}
                  regionKey={key}
                  label={region.label}
                  states={region.states}
                  defaultState={region.defaultState}
                  isList={region.isList}
                  mockItems={region.mockItems}
                  activeState={regionStates[key] ?? region.defaultState}
                  listCount={regionListCounts[key]}
                  onStateChange={(state) => setRegionState(key, state)}
                  onListCountChange={(count) => setRegionListCount(key, count)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Legacy state section (only when no regions and screen has scenarios) */}
        {!hasRegions && stateKeys.length > 0 && (
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

        {/* Language section */}
        <Section title="Language">
          <div className="flex gap-1">
            {['en', 'de'].map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  setLanguage(lang)
                  i18n.changeLanguage(lang)
                }}
                className={
                  language === lang
                    ? 'flex-1 rounded-md bg-neutral-900/5 px-2 py-1 text-center text-sm font-medium text-neutral-900'
                    : 'flex-1 rounded-md px-2 py-1 text-center text-sm text-neutral-600 hover:bg-neutral-50'
                }
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </Section>

        {/* Feature Flags section (per-screen) */}
        {currentFlags && Object.keys(currentFlags).length > 0 && (
          <Section title="Feature Flags">
            <div className="flex flex-col gap-2">
              {Object.entries(currentFlags).map(([key, def]) => (
                <div key={key} className="flex items-center justify-between">
                  <Label htmlFor={`flag-${key}`} className="text-xs text-neutral-600">
                    {def.label}
                  </Label>
                  <Switch
                    id={`flag-${key}`}
                    checked={featureFlags[key] ?? def.default}
                    onCheckedChange={(checked) => setFeatureFlag(key, checked)}
                  />
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Network section */}
        <Section title="Network">
          <div className="flex gap-1">
            {([
              { mode: 'online' as NetworkMode, label: 'Online' },
              { mode: 'slow-3g' as NetworkMode, label: 'Slow 3G' },
              { mode: 'offline' as NetworkMode, label: 'Offline' },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setNetworkMode(mode)}
                className={
                  networkMode === mode
                    ? 'flex-1 rounded-md bg-neutral-900/5 px-2 py-1 text-center text-xs font-medium text-neutral-900'
                    : 'flex-1 rounded-md px-2 py-1 text-center text-xs text-neutral-600 hover:bg-neutral-50'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Font Scale section */}
        <Section title="Font Scale">
          <div className="flex flex-col gap-2">
            <Slider
              value={[fontScale]}
              onValueChange={([v]) => setFontScale(v)}
              min={0.75}
              max={2}
              step={0.05}
              className="w-full"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">0.75x</span>
              <span className="font-mono text-xs font-medium text-neutral-700">
                {fontScale.toFixed(2)}x
              </span>
              <span className="text-xs text-neutral-400">2.0x</span>
            </div>
          </div>
        </Section>

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

function RegionGroup({
  regionKey,
  label,
  states,
  defaultState,
  isList,
  mockItems,
  activeState,
  listCount,
  onStateChange,
  onListCountChange,
}: {
  regionKey: string
  label: string
  states: Record<string, Record<string, unknown>>
  defaultState: string
  isList?: boolean
  mockItems?: unknown[]
  activeState: string
  listCount?: number
  onStateChange: (state: string) => void
  onListCountChange: (count: number) => void
}) {
  const stateKeys = Object.keys(states)
  const maxItems = mockItems?.length ?? 0
  const currentCount = listCount ?? maxItems

  // Suppress unused variable warnings for props used only for keying
  void regionKey
  void defaultState

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-600">{label}</span>
        {isList && (
          <span className="text-[10px] text-neutral-400">
            {currentCount} {currentCount === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      {/* State buttons */}
      <div className="flex flex-wrap gap-1">
        {stateKeys.map((key) => (
          <button
            key={key}
            onClick={() => onStateChange(key)}
            className={
              activeState === key
                ? 'rounded-md bg-neutral-900/5 px-2 py-0.5 text-xs font-medium text-neutral-900'
                : 'rounded-md px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50'
            }
          >
            {key}
          </button>
        ))}
      </div>

      {/* List counter (only when isList) */}
      {isList && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onListCountChange(currentCount - 1)}
            disabled={currentCount <= 0}
            className="flex size-6 items-center justify-center rounded border border-neutral-200 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
          >
            &minus;
          </button>
          <input
            type="number"
            value={currentCount}
            onChange={(e) => {
              const val = Number(e.target.value)
              if (!Number.isNaN(val)) onListCountChange(val)
            }}
            min={0}
            max={maxItems}
            className="h-6 w-12 rounded border border-neutral-200 bg-white px-1 text-center text-xs text-neutral-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            onClick={() => onListCountChange(currentCount + 1)}
            disabled={currentCount >= maxItems}
            className="flex size-6 items-center justify-center rounded border border-neutral-200 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  trailing,
  children,
}: {
  title: string
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-neutral-100 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium text-neutral-500">{title}</h3>
        {trailing}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

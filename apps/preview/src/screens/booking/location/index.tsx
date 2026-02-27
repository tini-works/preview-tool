import {
  ScreenHeader,
  Stack,
  Button,
  Divider,
  Input,
  Card,
  Note,
} from '@/components/screen'
import type { BookingLocationData } from './scenarios'

export default function BookingLocationScreen({
  data,
  flags,
}: {
  data: BookingLocationData
  flags?: Record<string, boolean>
}) {
  const { view } = data

  return (
    <>
      <ScreenHeader
        title="Choose location"
        data-flow-target="ScreenHeader:Choose location"
      />

      {view === 'initial' && (
        <Stack gap="md" className="p-4">
          {flags?.showCurrentLocation !== false && (
            <Button
              size="lg"
              className="flex w-full items-center justify-center gap-2"
              data-flow-target="Button:Use current location"
            >
              <span>📍</span> Use current location
            </Button>
          )}

          <Divider label="or enter an address" />
          <Input placeholder="Search address..." />

          {flags?.showRecentLocations !== false && (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400">RECENT LOCATIONS</p>
              <Card className="overflow-hidden p-0">
                <div className="flex items-center gap-3 border-b border-cream-300 px-4 py-3">
                  <span className="text-slate-400">📍</span>
                  <span className="text-sm text-charcoal-500">Friedrichstr. 123, 10117 Berlin</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-slate-400">📍</span>
                  <span className="text-sm text-charcoal-500">Kurfürstendamm 45, 10719 Berlin</span>
                </div>
              </Card>
            </div>
          )}
        </Stack>
      )}

      {view === 'search-results' && (
        <Stack gap="md" className="p-4">
          {flags?.showCurrentLocation !== false && (
            <Button
              size="lg"
              className="flex w-full items-center justify-center gap-2"
              data-flow-target="Button:Use current location"
            >
              <span>📍</span> Use current location
            </Button>
          )}

          <Divider label="or enter an address" />
          <Input placeholder="Search address..." />

          <Card className="overflow-hidden p-0">
            {['Friedrichstr. 123, 10117 Berlin', 'Schönhauser Allee 78, 10439 Berlin', 'Torstr. 220, 10115 Berlin', 'Kantstr. 58, 10627 Berlin'].map((addr) => (
              <div key={addr} className="flex items-center gap-3 border-b border-cream-300 px-4 py-3 last:border-b-0 hover:bg-cream-100">
                <span className="text-slate-400">📍</span>
                <span className="text-sm text-charcoal-500">{addr}</span>
              </div>
            ))}
          </Card>
        </Stack>
      )}

      {view === 'selected' && (
        <Stack gap="md" className="p-4">
          <Note type="success">Location selected</Note>

          <Card className="border-2 border-teal-500 bg-teal-50">
            <div className="flex items-center gap-3">
              <span className="text-teal-500">📍</span>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-charcoal-500">Friedrichstr. 123</span>
                <span className="text-xs text-slate-500">10117 Berlin</span>
              </div>
            </div>
          </Card>

          <Button variant="outline" size="lg" className="w-full">Change location</Button>
        </Stack>
      )}
    </>
  )
}

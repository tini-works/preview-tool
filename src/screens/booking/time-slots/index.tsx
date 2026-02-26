import { ScreenHeader, Stack, Note } from '@/components/screen'
import type { BookingTimeSlotsData } from './scenarios'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const TIMES = ['08–12', '12–14', '14–18']

function SlotCell({ selected }: { selected: boolean }) {
  if (selected) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-md bg-teal-500">
        <span className="text-xs text-white">✓</span>
      </div>
    )
  }
  return <div className="aspect-square rounded-md bg-cream-200" />
}

export default function BookingTimeSlotsScreen({
  data,
  flags,
}: {
  data: BookingTimeSlotsData
  flags?: Record<string, boolean>
}) {
  const { slots, showWarning } = data

  return (
    <>
      <ScreenHeader
        title="Time slots"
        data-flow-target="ScreenHeader:Time slots"
      />

      <Stack gap="md" className="p-4">
        <p className="text-sm text-slate-500">Tap to toggle preferred times</p>

        <div className="grid grid-cols-6 gap-1.5">
          <div />
          {DAYS.map((day) => (
            <span key={day} className="text-center text-xs font-medium text-slate-500">{day}</span>
          ))}

          {TIMES.map((time, rowIdx) => (
            <div key={time} className="col-span-6 grid grid-cols-6 gap-1.5">
              <span className="flex items-center text-xs text-slate-500">{time}</span>
              {slots[rowIdx].map((selected, colIdx) => (
                <SlotCell key={`${rowIdx}-${colIdx}`} selected={selected} />
              ))}
            </div>
          ))}
        </div>

        {flags?.showLegend !== false && (
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-teal-500" /> Selected</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-cream-200" /> Available</span>
          </div>
        )}

        {showWarning && (
          <Note type="warning">
            Only 2 slots selected. More slots increase your chances of finding a match.
          </Note>
        )}
      </Stack>
    </>
  )
}

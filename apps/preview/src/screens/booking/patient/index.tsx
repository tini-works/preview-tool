import {
  ScreenHeader,
  Stack,
  Card,
  Avatar,
  Badge,
} from '@/components/screen'
import type { BookingPatientData } from './scenarios'

export default function BookingPatientScreen({
  data,
  flags,
}: {
  data: BookingPatientData
  flags?: Record<string, boolean>
}) {
  const { selectedPatient } = data
  const isSelf = selectedPatient === 'self'

  return (
    <>
      <ScreenHeader
        title="Book appointment for"
        data-flow-target="ScreenHeader:Book appointment for"
      />

      <Stack gap="md" className="p-4">
        <div className="flex gap-3 overflow-x-auto pb-2">
          <div className="flex flex-col items-center gap-1.5">
            <div className={`flex size-14 items-center justify-center rounded-full border-2 ${isSelf ? 'border-teal-500 bg-teal-50' : 'border-cream-400'}`}>
              <Avatar initials="SM" data-flow-target="Avatar:SM" />
            </div>
            <span className={`text-xs ${isSelf ? 'font-medium text-charcoal-500' : 'text-slate-500'}`}>Me</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className={`flex size-14 items-center justify-center rounded-full border-2 ${!isSelf ? 'border-teal-500 bg-teal-50' : 'border-cream-400'}`}>
              <Avatar initials="MM" variant="secondary" data-flow-target="Avatar:MM" />
            </div>
            <span className={`text-xs ${!isSelf ? 'font-medium text-charcoal-500' : 'text-slate-500'}`}>Max</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex size-14 items-center justify-center rounded-full border-2 border-cream-400">
              <Avatar initials="LM" variant="secondary" />
            </div>
            <span className="text-xs text-slate-500">Lena</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-cream-500">
              <span className="text-lg text-slate-400">+</span>
            </div>
            <span className="text-xs text-slate-400">Add</span>
          </div>
        </div>

        {flags?.showInsurance !== false && (
          <div>
            <p className="mb-2 text-sm font-medium text-charcoal-400">Insurance card</p>
            <Stack gap="sm">
              {isSelf ? (
                <>
                  <Card className="border-2 border-teal-500 bg-teal-50">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-5 items-center justify-center rounded-full border-2 border-teal-500">
                        <span className="size-2.5 rounded-full bg-teal-500" />
                      </span>
                      <div className="flex flex-col gap-1">
                        <Badge>GKV</Badge>
                        <p className="text-sm font-medium text-charcoal-500">Techniker Krankenkasse</p>
                        <p className="text-xs text-slate-500">A123456789</p>
                      </div>
                    </div>
                  </Card>
                  <Card>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-5 items-center justify-center rounded-full border-2 border-slate-300" />
                      <div className="flex flex-col gap-1">
                        <Badge>PKV</Badge>
                        <p className="text-sm font-medium text-charcoal-500">Debeka</p>
                        <p className="text-xs text-slate-500">P987654321</p>
                      </div>
                    </div>
                  </Card>
                </>
              ) : (
                <Card className="border-2 border-teal-500 bg-teal-50">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 items-center justify-center rounded-full border-2 border-teal-500">
                      <span className="size-2.5 rounded-full bg-teal-500" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <Badge>GKV</Badge>
                      <p className="text-sm font-medium text-charcoal-500">AOK Bayern</p>
                      <p className="text-xs text-slate-500">M567890123</p>
                    </div>
                  </div>
                </Card>
              )}
            </Stack>
          </div>
        )}
      </Stack>
    </>
  )
}

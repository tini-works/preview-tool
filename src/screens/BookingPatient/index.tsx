import {
  ScreenHeader,
  Stack,
  Card,
  Avatar,
  Badge,
} from '@/components/screen'
import type { BookingPatientData } from './scenarios'

export default function BookingPatientScreen({ data }: { data: BookingPatientData }) {
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
            <div className={`flex size-14 items-center justify-center rounded-full border-2 ${isSelf ? 'border-teal-500 bg-teal-50' : 'border-neutral-200'}`}>
              <Avatar initials="SM" data-flow-target="Avatar:SM" />
            </div>
            <span className={`text-xs ${isSelf ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}>Me</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className={`flex size-14 items-center justify-center rounded-full border-2 ${!isSelf ? 'border-teal-500 bg-teal-50' : 'border-neutral-200'}`}>
              <Avatar initials="MM" variant="secondary" data-flow-target="Avatar:MM" />
            </div>
            <span className={`text-xs ${!isSelf ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}>Max</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex size-14 items-center justify-center rounded-full border-2 border-neutral-200">
              <Avatar initials="LM" variant="secondary" />
            </div>
            <span className="text-xs text-neutral-500">Lena</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-neutral-300">
              <span className="text-lg text-neutral-400">+</span>
            </div>
            <span className="text-xs text-neutral-400">Add</span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700">Insurance card</p>
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
                      <p className="text-sm font-medium text-neutral-900">Techniker Krankenkasse</p>
                      <p className="text-xs text-neutral-500">A123456789</p>
                    </div>
                  </div>
                </Card>
                <Card>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 items-center justify-center rounded-full border-2 border-neutral-400" />
                    <div className="flex flex-col gap-1">
                      <Badge>PKV</Badge>
                      <p className="text-sm font-medium text-neutral-900">Debeka</p>
                      <p className="text-xs text-neutral-500">P987654321</p>
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
                    <p className="text-sm font-medium text-neutral-900">AOK Bayern</p>
                    <p className="text-xs text-neutral-500">M567890123</p>
                  </div>
                </div>
              </Card>
            )}
          </Stack>
        </div>
      </Stack>
    </>
  )
}

import {
  ScreenHeader,
  Stack,
  Card,
  Avatar,
  ListItem,
  Input,
  Note,
} from '@/components/screen'
import type { BookingDoctorData } from './scenarios'

export default function BookingDoctorScreen({ data }: { data: BookingDoctorData }) {
  const { view } = data

  return (
    <>
      <ScreenHeader
        title="Specialty & Doctor"
        data-flow-target="ScreenHeader:Specialty & Doctor"
      />

      {view === 'browsing' && (
        <Stack gap="md" className="p-4">
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="🩺"
              label="Specialty"
              description="General Practice"
              selected
              data-flow-target="ListItem:Specialty"
            />
          </Card>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">FAVORITED</p>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
                <Avatar initials="AS" data-flow-target="Avatar:AS" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-neutral-900">Dr. Anna Schmidt</span>
                  <span className="text-xs text-neutral-500">General Practice</span>
                </div>
                <span className="text-red-400">♥</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar initials="TW" data-flow-target="Avatar:TW" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-neutral-900">Dr. Thomas Weber</span>
                  <span className="text-xs text-neutral-500">Cardiology</span>
                </div>
                <span className="text-red-400">♥</span>
              </div>
            </Card>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">ALL DOCTORS</p>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
                <div className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-neutral-300">
                  <span className="text-sm text-neutral-400">Any</span>
                </div>
                <span className="text-sm font-medium text-neutral-900">Any available doctor</span>
              </div>
              <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
                <Avatar initials="LB" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-neutral-900">Dr. Lisa Bauer</span>
                  <span className="text-xs text-neutral-500">Dermatology</span>
                </div>
                <span className="text-neutral-300">♡</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <Avatar initials="EK" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-neutral-900">Dr. Emily Klein</span>
                  <span className="text-xs text-neutral-500">General Practice</span>
                </div>
                <span className="text-neutral-300">♡</span>
              </div>
            </Card>
          </div>
        </Stack>
      )}

      {view === 'selected' && (
        <Stack gap="md" className="p-4">
          <Card className="overflow-hidden p-0">
            <ListItem
              icon="🩺"
              label="Specialty"
              description="General Practice"
              selected
              data-flow-target="ListItem:Specialty"
            />
          </Card>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">FAVORITED</p>
            <Card className="overflow-hidden p-0">
              <div className="flex items-center gap-3 rounded-lg border-2 border-teal-500 bg-teal-50 px-4 py-3">
                <Avatar initials="AS" data-flow-target="Avatar:AS" />
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium text-neutral-900">Dr. Anna Schmidt</span>
                  <span className="text-xs text-neutral-500">General Practice</span>
                </div>
                <span className="text-red-400">♥</span>
              </div>
            </Card>
          </div>

          <Note type="success">Dr. Anna Schmidt selected for your appointment.</Note>
        </Stack>
      )}

      {view === 'specialty-drawer' && (
        <>
          <Stack gap="md" className="p-4">
            <Card className="overflow-hidden p-0">
              <ListItem icon="🩺" label="Specialty" description="Tap to change..." />
            </Card>
          </Stack>

          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300" />
            <Input placeholder="Search specialty..." className="mb-3" />
            <Stack gap="sm">
              <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-neutral-50">
                <span className="text-sm text-neutral-900">General Practice</span>
                <span className="text-teal-500">✓</span>
              </div>
              <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-neutral-50">
                <span className="text-sm text-neutral-900">Cardiology</span>
              </div>
              <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-neutral-50">
                <span className="text-sm text-neutral-900">Dermatology</span>
              </div>
              <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-neutral-50">
                <span className="text-sm text-neutral-900">Orthopedics</span>
              </div>
            </Stack>
          </div>
        </>
      )}
    </>
  )
}

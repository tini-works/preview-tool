import {
  ScreenHeader,
  Stack,
  Card,
  ListItem,
  Badge,
  Note,
  Footer,
  Button,
} from '@/components/screen'
import type { BookingAppointmentsData } from './scenarios'

export default function BookingAppointmentsScreen({ data }: { data: BookingAppointmentsData }) {
  const { view } = data

  return (
    <>
      <ScreenHeader title="My Appointments" />

      {view === 'loaded' && (
        <>
          <Stack gap="md" className="p-4">
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">UPCOMING</p>
              <Card className="overflow-hidden p-0">
                <ListItem
                  icon="📅"
                  label="Dr. Anna Schmidt"
                  description="General Practice · Wed, Mar 5 · 10:00 AM"
                  trailing={<Badge variant="success">Confirmed</Badge>}
                />
                <ListItem
                  icon="📅"
                  label="Dr. Thomas Weber"
                  description="Cardiology · Mon, Mar 10 · 2:30 PM"
                  trailing={<Badge variant="warning">Pending</Badge>}
                />
              </Card>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-400">PAST</p>
              <Card className="overflow-hidden p-0">
                <ListItem
                  icon="📅"
                  label="Dr. Lisa Bauer"
                  description="Dermatology · Jan 15, 2026"
                  trailing={<Badge>Completed</Badge>}
                />
                <ListItem
                  icon="📅"
                  label="Dr. Emily Klein"
                  description="General Practice · Dec 8, 2025"
                  trailing={<Badge>Completed</Badge>}
                />
              </Card>
            </div>
          </Stack>

          <Footer>
            <Button
              size="lg"
              className="w-full"
              data-flow-target="Button:Book New Appointment"
            >
              Book New Appointment
            </Button>
          </Footer>
        </>
      )}

      {view === 'empty' && (
        <>
          <Stack gap="md" className="p-4">
            <Note type="info">
              You have no appointments yet. Book your first appointment to get started.
            </Note>
          </Stack>

          <Footer>
            <Button
              size="lg"
              className="w-full"
              data-flow-target="Button:Book New Appointment"
            >
              Book New Appointment
            </Button>
          </Footer>
        </>
      )}

      {view === 'loading' && (
        <>
          <Stack gap="md" className="p-4">
            <p className="text-sm text-neutral-500">Loading your appointments...</p>
          </Stack>

          <Footer>
            <Button
              variant="secondary"
              size="lg"
              className="w-full opacity-50"
              data-flow-target="Button:Book New Appointment"
            >
              Book New Appointment
            </Button>
          </Footer>
        </>
      )}
    </>
  )
}

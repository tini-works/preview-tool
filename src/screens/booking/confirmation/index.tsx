import {
  ScreenHeader,
  Stack,
  Card,
  Avatar,
  Footer,
  Button,
} from '@/components/screen'
import type { BookingConfirmationData } from './scenarios'

export default function BookingConfirmationScreen({ data }: { data: BookingConfirmationData }) {
  const { status } = data

  return (
    <>
      <ScreenHeader title="Booking" />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        {status === 'searching' ? (
          <>
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-teal-100">
              <span className="text-4xl">🔍</span>
            </div>
            <h2 className="mb-2 text-xl font-semibold leading-tight text-charcoal-500">Finding Your Match...</h2>
            <p className="max-w-[280px] text-center text-sm text-slate-500">
              We're searching for the best doctor match based on your preferences and availability.
            </p>
          </>
        ) : (
          <>
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-teal-100">
              <span className="text-4xl">✅</span>
            </div>
            <h2 className="mb-2 text-xl font-semibold leading-tight text-charcoal-500">Match Found!</h2>
            <p className="max-w-[280px] text-center text-sm text-slate-500">
              Dr. Anna Schmidt is available for your appointment.
            </p>
            <Card className="mt-6 w-full max-w-[280px]">
              <div className="flex items-center gap-3">
                <Avatar initials="AS" size="lg" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-charcoal-500">Dr. Anna Schmidt</span>
                  <span className="text-xs text-slate-500">General Practice</span>
                  <span className="text-xs text-teal-600">Wed, Mar 5 · 10:00 AM</span>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      <Footer>
        <Stack gap="sm">
          {status === 'searching' ? (
            <>
              <Button
                size="lg"
                className="w-full"
                data-flow-target="Button:Allow Notifications"
              >
                Allow Notifications
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                data-flow-target="Button:Back to Home"
              >
                Back to Home
              </Button>
            </>
          ) : (
            <>
              <Button
                size="lg"
                className="w-full"
                data-flow-target="Button:Confirm Appointment"
              >
                Confirm Appointment
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                data-flow-target="Button:Back to Home"
              >
                Back to Home
              </Button>
            </>
          )}
        </Stack>
      </Footer>
    </>
  )
}

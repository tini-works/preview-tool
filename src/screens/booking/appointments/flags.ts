import type { FlagDefinition } from '@/screens/types'

export const flags: Record<string, FlagDefinition> = {
  showPastAppointments: { label: 'Past Appointments', default: true },
}

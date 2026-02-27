import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Search for Appointment', navigate: '/booking/appointments', navigateState: 'loaded' },
  { trigger: 'ListItem:Booking type', navigate: '/booking/type', navigateState: 'acute' },
  { trigger: 'ListItem:Book appointment for', navigate: '/booking/patient', navigateState: 'self' },
  { trigger: 'ListItem:Time slots', navigate: '/booking/time-slots', navigateState: 'all-selected' },
  { trigger: 'ListItem:Location', navigate: '/booking/location', navigateState: 'initial' },
  { trigger: 'Button:Search', navigate: '/booking/confirmation', navigateState: 'searching' },
]

import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Button:Confirm Appointment', navigate: '/booking-appointments', navigateState: 'loaded' },
  { trigger: 'Button:Back to Home', navigate: '/booking-search', navigateState: 'empty' },
  { trigger: 'Button:Allow Notifications', setState: 'found' },
]

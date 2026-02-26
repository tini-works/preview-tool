import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Button:Book New Appointment', navigate: '/booking-search', navigateState: 'empty' },
]

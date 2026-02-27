import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'RadioCard:Acute', setState: 'acute' },
  { trigger: 'RadioCard:Prevention', setState: 'prevention' },
  { trigger: 'RadioCard:Follow-up', setState: 'follow-up' },
  { trigger: 'Button:Save', navigate: '/booking/search', navigateState: 'partial' },
  { trigger: 'ScreenHeader:Booking type', navigate: '/booking/search', navigateState: 'empty' },
  { trigger: 'ListItem:Specialty & Doctor', navigate: '/booking/doctor', navigateState: 'browsing' },
]

import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Avatar:AS', setState: 'selected' },
  { trigger: 'Avatar:TW', setState: 'selected' },
  { trigger: 'ListItem:Specialty', setState: 'specialty-drawer' },
  { trigger: 'ScreenHeader:Specialty & Doctor', navigate: '/booking-type', navigateState: 'prevention' },
]

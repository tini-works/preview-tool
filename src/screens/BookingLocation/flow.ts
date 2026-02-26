import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Choose location', navigate: '/booking-search', navigateState: 'partial' },
  { trigger: 'Button:Use current location', setState: 'selected' },
]

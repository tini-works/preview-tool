import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Time slots', navigate: '/booking-search', navigateState: 'partial' },
]

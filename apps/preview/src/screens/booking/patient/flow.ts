import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Book appointment for', navigate: '/booking/search', navigateState: 'partial' },
  { trigger: 'Avatar:MM', setState: 'family' },
  { trigger: 'Avatar:SM', setState: 'self' },
]

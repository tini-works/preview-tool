import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Button:Confirm Redemption', setState: 'success-pickup' },
  { trigger: 'Button:Back to Home', navigate: '/prescription/scan', navigateState: 'idle' },
  { trigger: 'ScreenHeader:Review & Confirm', navigate: '/prescription/location', navigateState: 'pickup-selected' },
]

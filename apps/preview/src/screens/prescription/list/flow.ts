import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Button:Continue', navigate: '/prescription/delivery', navigateState: 'none-selected' },
  { trigger: 'ScreenHeader:Your Prescriptions', navigate: '/prescription/scan', navigateState: 'idle' },
]

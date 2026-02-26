import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'ScreenHeader:Your Prescriptions', navigate: '/prescription-scan', navigateState: 'idle' },
  { trigger: 'Button:Continue', navigate: '/prescription-delivery', navigateState: 'none-selected' },
]

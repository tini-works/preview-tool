import type { FlowAction } from '@/flow/types'

export const actions: FlowAction[] = [
  { trigger: 'Button:Simulate NFC Scan', setState: 'success' },
  { trigger: 'Button:Try Again', setState: 'idle' },
  { trigger: 'ScreenHeader:Redeem Prescription', navigate: '/prescription-list' },
]
